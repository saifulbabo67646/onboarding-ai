"""Model access shared by every research phase: configuration, request
defaults, ``pause_turn`` continuation and structured outputs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any

import anthropic
from anthropic import AsyncAnthropic
from onboard_director import ModelBackend
from onboard_director.backend import open_stream

Message = Any  # anthropic BetaMessage; kept loose so fakes work in tests.

logger = logging.getLogger("onboard.researcher")


class ResearchError(Exception):
    """A research phase could not produce a usable result."""


@dataclass
class ResearchConfig:
    model: str = "claude-opus-5-5"
    # Research runs ahead of time, so it can afford to think harder than a live call.
    effort: str = "high"
    explore_effort: str = "medium"
    max_tokens: int = 64000
    fallbacks: bool = True
    # Documentation phase budget (server-side web tools).
    max_searches: int = 8
    max_fetches: int = 20
    max_continuations: int = 6
    # Exploration phase budget.
    max_explore_turns: int = 80
    max_explore_minutes: float = 15.0
    screenshot_quality: int = 80
    settle_seconds: float = 0.8
    context_trigger_tokens: int = 100_000
    context_keep_tool_uses: int = 20
    # Anthropic-compatible provider (DeepSeek, GLM, a proxy...). None = Anthropic.
    base_url: str | None = None
    api_key: str | None = None
    # Claude on Anthropic's API (full feature set) or a portable backend. None = from model name.
    native: bool | None = None
    keep_screenshots: int = 3

    @property
    def backend(self) -> ModelBackend:
        return ModelBackend(model=self.model, base_url=self.base_url, api_key=self.api_key, native=self.native)

    @property
    def is_native(self) -> bool:
        return self.backend.is_native

    @classmethod
    def from_env(cls) -> "ResearchConfig":
        env = os.environ
        backend = ModelBackend.from_env("RESEARCHER", default_model=cls.model)
        return cls(
            model=backend.model,
            base_url=backend.base_url,
            api_key=backend.api_key,
            native=backend.native,
            effort=env.get("RESEARCHER_EFFORT", cls.effort),
            explore_effort=env.get("RESEARCHER_EXPLORE_EFFORT", cls.explore_effort),
            fallbacks=env.get("RESEARCHER_FALLBACKS", "1") != "0",
            max_explore_minutes=float(env.get("RESEARCHER_EXPLORE_MINUTES", cls.max_explore_minutes)),
        )


def request_params(
    config: ResearchConfig,
    *,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    effort: str | None = None,
    output_format: dict[str, Any] | None = None,
    context_editing: bool = False,
) -> dict[str, Any]:
    betas: list[str] = []
    output_config: dict[str, Any] = {"effort": effort or config.effort}
    if output_format:
        output_config["format"] = output_format
    params: dict[str, Any] = {
        "model": config.model,
        "max_tokens": config.max_tokens,
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "messages": messages,
        "thinking": {"type": "adaptive"},
        "output_config": output_config,
        "cache_control": {"type": "ephemeral"},
    }
    if tools:
        params["tools"] = tools
    if context_editing:
        betas.append("context-management-2025-06-27")
        params["context_management"] = {
            "edits": [
                {
                    "type": "clear_tool_uses_20250919",
                    "trigger": {"type": "input_tokens", "value": config.context_trigger_tokens},
                    "keep": {"type": "tool_uses", "value": config.context_keep_tool_uses},
                    "clear_at_least": {"type": "input_tokens", "value": 20_000},
                }
            ]
        }
    if config.fallbacks:
        betas.append("server-side-fallback-2026-07-01")
        params["fallbacks"] = "default"
    if betas:
        params["betas"] = betas
    return params


async def stream_message(client: AsyncAnthropic, params: dict[str, Any], *, native: bool = True) -> Message:
    """One streamed request (large ``max_tokens`` needs streaming), returning the final message.

    Portable backends get the request reduced to fields every compatible endpoint accepts.
    Research runs unattended for many minutes, so a passing outage is waited out
    instead of costing a whole phase.
    """
    for attempt in range(RETRIES + 1):
        try:
            async with open_stream(client, params, native=native) as stream:
                return await stream.get_final_message()
        except Exception as e:
            if attempt == RETRIES or not _transient(e, native=native):
                raise
            logger.warning("model request failed (attempt %s), retrying: %s", attempt + 1, e)
            await asyncio.sleep(RETRY_DELAY * 2**attempt)
    raise AssertionError("unreachable")


RETRIES = 4
RETRY_DELAY = 5.0


def _transient(error: Exception, *, native: bool) -> bool:
    if isinstance(error, (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError)):
        return True
    # Gateways for other models sometimes reject a valid request for a while
    # ("request_rejected", with no detail) when their upstream routes are down.
    if not native and isinstance(error, anthropic.BadRequestError):
        return "request_rejected" in str(error)
    return False


def check_stop(message: Message, phase: str) -> None:
    if message.stop_reason == "refusal":
        details = getattr(message, "stop_details", None)
        raise ResearchError(f"The model declined the {phase} step ({getattr(details, 'category', None) or 'refusal'}).")


async def run_with_server_tools(
    client: AsyncAnthropic, config: ResearchConfig, params: dict[str, Any], phase: str
) -> list[Message]:
    """Run a request that uses server tools, resuming ``pause_turn`` until the model is done."""
    messages = list(params["messages"])
    responses: list[Message] = []
    for _ in range(config.max_continuations + 1):
        message = await stream_message(client, {**params, "messages": messages}, native=config.is_native)
        check_stop(message, phase)
        responses.append(message)
        if message.stop_reason != "pause_turn":
            return responses
        # The server resumes from the trailing server_tool_use block; no extra user turn.
        messages = [*messages, {"role": "assistant", "content": message.content}]
    return responses


async def structured(
    client: AsyncAnthropic,
    config: ResearchConfig,
    *,
    system: str,
    content: list[dict[str, Any]],
    schema: dict[str, Any],
    phase: str,
) -> dict[str, Any]:
    """A single request whose answer is JSON matching ``schema``.

    Native backends use structured outputs (guaranteed valid). Portable backends
    are asked for JSON in the prompt; the reply is parsed leniently and retried once.
    """
    if config.is_native:
        params = request_params(
            config,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_format={"type": "json_schema", "schema": schema},
        )
        return _parse_json(await _complete(client, params, phase, native=True), phase)

    instruction = (
        "Reply with only one JSON object, no prose and no code fences, that matches this JSON schema "
        "(every listed field is required):\n" + json.dumps(schema)
    )
    messages: list[dict[str, Any]] = [{"role": "user", "content": [*content, {"type": "text", "text": instruction}]}]
    text = ""
    for attempt in range(2):
        params = request_params(config, system=system, messages=messages)
        text = await _complete(client, params, phase, native=False)
        try:
            return _parse_json(text, phase)
        except ResearchError as e:
            if attempt:
                raise
            messages = [
                *messages,
                {"role": "assistant", "content": text or "(empty)"},
                {"role": "user", "content": f"That was not valid JSON ({e}). Reply again with only the JSON object."},
            ]
    raise ResearchError(f"The {phase} step returned invalid JSON.")


async def _complete(client: AsyncAnthropic, params: dict[str, Any], phase: str, *, native: bool) -> str:
    message = await stream_message(client, params, native=native)
    check_stop(message, phase)
    if message.stop_reason == "max_tokens":
        raise ResearchError(f"The {phase} step ran out of output tokens.")
    return "".join(b.text for b in message.content if getattr(b, "type", None) == "text")


def _parse_json(text: str, phase: str) -> dict[str, Any]:
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text.strip())
    start, end = cleaned.find("{"), cleaned.rfind("}")
    try:
        data = json.loads(cleaned[start : end + 1] if start >= 0 and end > start else cleaned)
    except json.JSONDecodeError as e:
        raise ResearchError(f"The {phase} step returned invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ResearchError(f"The {phase} step returned JSON that is not an object.")
    return data


def text_of(messages: list[Message]) -> str:
    return "\n".join(
        b.text for m in messages for b in m.content if getattr(b, "type", None) == "text" and b.text.strip()
    ).strip()
