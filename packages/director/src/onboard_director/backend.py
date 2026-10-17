"""Which model API we talk to, and how to talk to it.

Everything here speaks the Anthropic Messages format, which several providers
also serve (DeepSeek, GLM/Z.ai, proxies, self-hosted gateways). A backend is
*native* when it is Claude on Anthropic's API, where we use the full feature
set: the computer toolset, adaptive thinking, effort, context editing, refusal
fallbacks. For any other backend requests are reduced to the portable core
(model, system, messages, plain tools), the computer is driven through the
portable ``computer`` tool (see :func:`onboard_director.tools.portable_computer_tool`)
and old screenshots are pruned client-side instead of by context editing.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from anthropic import AsyncAnthropic

# Request fields only Anthropic's API understands.
_NATIVE_ONLY_PARAMS = ("betas", "thinking", "output_config", "context_management", "fallbacks", "cache_control")


@dataclass
class ModelBackend:
    model: str = "claude-opus-5-5"
    base_url: str | None = None
    api_key: str | None = None
    # None = decide from the model name (claude-* on the default endpoint).
    native: bool | None = None

    @property
    def is_native(self) -> bool:
        if self.native is not None:
            return self.native
        return self.model.startswith("claude") and not self.base_url

    def client(self) -> AsyncAnthropic:
        return AsyncAnthropic(base_url=self.base_url or None, api_key=self.api_key or None)

    @classmethod
    def from_env(cls, prefix: str, *, default_model: str) -> "ModelBackend":
        """Read ``{prefix}_MODEL``, ``{prefix}_BASE_URL``, ``{prefix}_API_KEY`` and ``{prefix}_NATIVE``."""
        native = os.environ.get(f"{prefix}_NATIVE")
        return cls(
            model=os.environ.get(f"{prefix}_MODEL", default_model),
            base_url=os.environ.get(f"{prefix}_BASE_URL") or None,
            api_key=os.environ.get(f"{prefix}_API_KEY") or None,
            native=None if native in (None, "") else native.lower() in ("1", "true", "yes"),
        )


def portable_params(params: dict[str, Any]) -> dict[str, Any]:
    """Reduce a native request to fields every Anthropic-compatible endpoint accepts."""
    out = {k: v for k, v in params.items() if k not in _NATIVE_ONLY_PARAMS}
    system = out.get("system")
    if isinstance(system, list):
        out["system"] = "\n\n".join(b.get("text", "") for b in system if isinstance(b, dict))
    if "tools" in out:
        tools = []
        for tool in out["tools"]:
            if "type" in tool and tool.get("type") != "custom":
                raise ValueError(f"{tool['type']} is only available on Anthropic's API; use the portable tool instead")
            tools.append({k: v for k, v in tool.items() if k in ("name", "description", "input_schema")})
        out["tools"] = tools
    return out


def open_stream(client: AsyncAnthropic, params: dict[str, Any], *, native: bool):
    """A streaming request, on the beta surface only where its features are used."""
    if native:
        return client.beta.messages.stream(**params)
    return client.messages.stream(**portable_params(params))


def prune_images(messages: list[dict[str, Any]], keep: int) -> None:
    """Replace all but the newest ``keep`` screenshots with a short note, in place.

    Portable backends have no server-side context editing, and every screenshot
    costs ~1-2k tokens, so long sessions would otherwise grow without bound.
    """
    seen = 0
    for message in reversed(messages):
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for i in range(len(content) - 1, -1, -1):
            block = content[i]
            if not isinstance(block, dict):
                continue
            if block.get("type") == "image":
                seen += 1
                if seen > keep:
                    content[i] = {"type": "text", "text": "[older screenshot removed]"}
            elif block.get("type") == "tool_result" and isinstance(block.get("content"), list):
                inner = block["content"]
                for j in range(len(inner) - 1, -1, -1):
                    if isinstance(inner[j], dict) and inner[j].get("type") == "image":
                        seen += 1
                        if seen > keep:
                            inner[j] = {"type": "text", "text": "[older screenshot removed]"}


def hoist_images(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Move images out of tool_result blocks into the user turn that carries them.

    Anthropic's API reads images inside tool results; compatible endpoints often
    only read them as top-level content. Tool results must stay first, so the
    images follow them, each labelled with the result it belongs to.
    """
    out: list[dict[str, Any]] = []
    images: list[dict[str, Any]] = []
    for block in results:
        content = block.get("content") if block.get("type") == "tool_result" else None
        if isinstance(content, list) and any(isinstance(c, dict) and c.get("type") == "image" for c in content):
            texts = [c for c in content if not (isinstance(c, dict) and c.get("type") == "image")]
            images.append({"type": "text", "text": "Screenshot:"})
            images.extend(c for c in content if isinstance(c, dict) and c.get("type") == "image")
            block = {**block, "content": texts or "Screenshot attached below."}
        out.append(block)
    return out + images
