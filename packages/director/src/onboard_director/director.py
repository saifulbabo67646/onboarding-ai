"""The director: a Claude computer-use loop that presents live.

It looks at the screen, decides what to show and say next, and drives the
sandbox with human-like input while speaking through a :class:`Narrator`.
Tool calls are executed *while the model is still streaming*, so speech and
motion start as early as possible, and the audience can interrupt at any
time.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import math
import re
import time
from dataclasses import dataclass
from typing import Any, Callable

import anthropic
from anthropic import AsyncAnthropic
from onboard_sandbox import SandboxInterrupted
from PIL import Image

from . import whiteboard
from .brief import DemoBrief, google_slides_id
from .interfaces import Computer, Narrator, Speech
from .prompts import opening_message, system_prompt
from .tools import COMPUTER_TOOLSET, computer_action, presenter_tools

logger = logging.getLogger("onboard.director")

EventCallback = Callable[[str, dict[str, Any]], None]

_BACKCHANNEL = re.compile(
    r"^(ok(ay)?|yeah|yes|yep|yup|mhm+|mm+|uh[- ]?huh|right|sure|got it|cool|nice|great|i see|"
    r"alright|all right|makes sense|perfect|good|wow|interesting|thanks|thank you)[.!]*$",
    re.IGNORECASE,
)


def is_backchannel(text: str) -> bool:
    """Short acknowledgements shouldn't derail the presenter."""
    return bool(_BACKCHANNEL.match(text.strip().rstrip(",")))


@dataclass
class DirectorConfig:
    model: str = "claude-opus-5"
    effort: str = "medium"  # latency matters in a live call; raise for harder demos
    max_tokens: int = 16000
    fallbacks: bool = True
    screenshot_quality: int = 80
    settle_seconds: float = 0.6
    max_turns: int = 400
    # Server-side context editing keeps long sessions lean.
    context_trigger_tokens: int = 90_000
    context_keep_tool_uses: int = 24


class Director:
    def __init__(
        self,
        brief: DemoBrief,
        computer: Computer,
        narrator: Narrator,
        *,
        client: AsyncAnthropic | None = None,
        config: DirectorConfig | None = None,
        on_event: EventCallback | None = None,
    ) -> None:
        self.brief = brief
        self.computer = computer
        self.narrator = narrator
        self.client = client or AsyncAnthropic()
        self.config = config or DirectorConfig()
        self.on_event = on_event or (lambda kind, data: None)
        self.messages: list[dict[str, Any]] = []
        self.summary: str | None = None

        self._inbox: list[str] = []
        self._heard = asyncio.Event()
        self._cancel_turn = False
        self._audience_speaking = False
        self._speeches: list[Speech] = []
        self._done = False
        self._scale = 1.0
        self._screen = (1280, 800)
        self._started = 0.0
        self._wrap_up_sent = False
        self._system = ""
        self._tools: list[dict[str, Any]] = []
        self._pending_results: list[dict[str, Any]] = []

    # -- audience input ---------------------------------------------------------------

    def hear(self, text: str) -> None:
        """Feed a final transcript of something the audience said."""
        text = text.strip()
        if not text:
            return
        self._inbox.append(text)
        self._heard.set()
        self.on_event("heard", {"text": text})
        if not is_backchannel(text):
            self._cancel_turn = True
            asyncio.ensure_future(self._safe(self.computer.interrupt()))

    async def audience_speaking(self, speaking: bool) -> None:
        """Freeze the mouse while someone is talking, like a polite presenter."""
        self._audience_speaking = speaking
        await self._safe(self.computer.pause() if speaking else self.computer.resume())

    def stop(self) -> None:
        self._done = True
        self._heard.set()

    # -- lifecycle --------------------------------------------------------------------

    async def prepare(self) -> None:
        health = await self.computer.health()
        w, h = health.get("size", self._screen)
        self._screen = (int(w), int(h))
        # Keep screenshots inside the model's comfortable image budget.
        self._scale = min(1.0, 1568 / max(w, h), math.sqrt(1_150_000 / (w * h)))
        deck_outline = await self._deck_outline() if self.brief.mode == "presentation" else None
        self._system = system_prompt(self.brief, deck_outline=deck_outline)
        self._tools = [
            COMPUTER_TOOLSET,
            *presenter_tools(whiteboard=self.brief.allow_whiteboard, secrets=bool(self.brief.secrets)),
        ]
        await self._safe(self.computer.presence(idle=True))

    async def run(self) -> str | None:
        """Present until the goal is done, the audience leaves, or time runs out."""
        if not self._system:
            await self.prepare()
        self._started = time.monotonic()
        self.messages = [
            {
                "role": "user",
                "content": [{"type": "text", "text": opening_message(self.brief)}, *await self._screenshot_blocks()],
            }
        ]
        self.on_event("status", {"state": "presenting"})
        refusals = 0
        for _ in range(self.config.max_turns):
            if self._done:
                break
            self._check_time()
            message = await self._model_turn()
            if message is None:
                break
            if message.stop_reason == "refusal":
                refusals += 1
                logger.warning("model refused (%s)", getattr(message, "stop_details", None))
                if refusals >= 2:
                    await self._say_and_wait("I'm going to stop here for today - thanks so much for your time.")
                    break
                # Nothing was appended for the refused turn; nudge and retry.
                self._append_user([{"type": "text", "text": "(Continue the session within the stated goal.)"}])
                continue
            refusals = 0
            self.messages.append({"role": "assistant", "content": message.content})
            content = self._pending_results
            if not any(getattr(b, "type", None) == "tool_use" for b in message.content):
                if self._done:
                    break
                # The model ended its turn without acting: give the audience the floor.
                heard = await self._listen(15)
                content = [{"type": "text", "text": heard}]
            content += self._drain_inbox_blocks()
            if self._done:
                break
            self._append_user(content)
        await self._finish_speaking()
        await self._safe(self.computer.presence(idle=False))
        self.on_event("end", {"summary": self.summary})
        return self.summary

    # -- model turn --------------------------------------------------------------------

    def _request_params(self) -> dict[str, Any]:
        betas = ["context-management-2025-06-27"]
        params: dict[str, Any] = {
            "model": self.config.model,
            "max_tokens": self.config.max_tokens,
            "system": [{"type": "text", "text": self._system, "cache_control": {"type": "ephemeral"}}],
            "tools": self._tools,
            "messages": self.messages,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": self.config.effort},
            "cache_control": {"type": "ephemeral"},
            "context_management": {
                "edits": [
                    {
                        "type": "clear_tool_uses_20250919",
                        "trigger": {"type": "input_tokens", "value": self.config.context_trigger_tokens},
                        "keep": {"type": "tool_uses", "value": self.config.context_keep_tool_uses},
                        "clear_at_least": {"type": "input_tokens", "value": 20_000},
                    }
                ]
            },
        }
        if self.config.fallbacks:
            betas.append("server-side-fallback-2026-07-01")
            params["fallbacks"] = "default"
        params["betas"] = betas
        return params

    async def _model_turn(self):
        """One model response, with its tool calls executed as they stream in."""
        for attempt in range(3):
            try:
                return await self._stream_turn()
            except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as e:
                # The SDK already retried; keep the call alive with a human filler.
                logger.warning("model unavailable (attempt %s): %s", attempt + 1, e)
                self.on_event("error", {"message": str(e)})
                if attempt == 0:
                    await self._say_and_wait("Sorry, just give me a second here.")
                await asyncio.sleep(3 * (attempt + 1))
            except anthropic.APIStatusError as e:
                logger.error("model request rejected: %s", e)
                self.on_event("error", {"message": str(e)})
                return None
        return None

    async def _stream_turn(self):
        self._cancel_turn = False
        self._pending_results = []
        queue: asyncio.Queue = asyncio.Queue()
        results: dict[str, dict[str, Any]] = {}
        worker = asyncio.create_task(self._run_tools(queue, results))
        try:
            async with self.client.beta.messages.stream(**self._request_params()) as stream:
                async for event in stream:
                    if event.type == "content_block_stop" and getattr(event.content_block, "type", None) == "tool_use":
                        queue.put_nowait(event.content_block)
                message = await stream.get_final_message()
        finally:
            queue.put_nowait(None)
            changed_screen = await worker

        tool_uses = [b for b in message.content if getattr(b, "type", None) == "tool_use"]
        for block in tool_uses:
            result = results.get(block.id) or {"content": "Not executed.", "is_error": True}
            entry: dict[str, Any] = {"type": "tool_result", "tool_use_id": block.id, **result}
            if getattr(block, "toolset_name", None):
                entry["toolset_name"] = block.toolset_name
            self._pending_results.append(entry)
        if changed_screen and self._pending_results and not self._done:
            await asyncio.sleep(self.config.settle_seconds)
            last = self._pending_results[-1]
            existing = last["content"] if isinstance(last["content"], list) else [{"type": "text", "text": str(last["content"])}]
            last["content"] = [*existing, {"type": "text", "text": "Screen after your actions:"}, *await self._screenshot_blocks()]
        return message

    async def _run_tools(self, queue: asyncio.Queue, results: dict[str, dict[str, Any]]) -> bool:
        """Executes tool calls in order as they stream in. Returns True if the screen may have changed."""
        changed = False
        while True:
            block = await queue.get()
            if block is None:
                return changed
            if self._cancel_turn or self._done:
                results[block.id] = {"content": "Not executed: the customer started talking.", "is_error": False}
                continue
            try:
                content, block_changed = await self._execute(block)
                results[block.id] = {"content": content, "is_error": False}
                changed = (changed or block_changed) and not self._is_screenshot(block)
            except SandboxInterrupted:
                results[block.id] = {"content": "Interrupted: the customer started talking.", "is_error": False}
                changed = True
            except Exception as e:  # noqa: BLE001 - report every failure back to the model
                logger.warning("tool %s failed: %s", block.name, e)
                results[block.id] = {"content": f"Error: {e}", "is_error": True}

    @staticmethod
    def _is_screenshot(block) -> bool:
        return getattr(block, "toolset_name", None) == "computer" and block.name in ("screenshot", "zoom")

    async def _execute(self, block) -> tuple[Any, bool]:
        args = block.input if isinstance(block.input, dict) else {}
        name = block.name
        self.on_event("action", {"tool": name, "input": args})
        if getattr(block, "toolset_name", None) == "computer":
            return await self._computer(name, args)
        handler = getattr(self, f"_tool_{name}", None)
        if handler is None:
            raise ValueError(f"Unknown tool {name}")
        return await handler(args)

    # -- computer toolset ----------------------------------------------------------

    async def _computer(self, name: str, args: dict[str, Any]) -> tuple[Any, bool]:
        if name == "screenshot":
            return await self._screenshot_blocks(), False
        if name == "zoom":
            return await self._zoom(args["region"]), False
        if name == "cursor_position":
            x, y = (await self.computer.health())["cursor"]
            return f"X={round(x * self._scale)}, Y={round(y * self._scale)}", False
        action = computer_action(name, args, self._scale)
        if action:
            await self.computer.act(action)
        return "OK", name not in ("wait", "mouse_move")

    # -- presenter tools -----------------------------------------------------------

    async def _tool_say(self, args: dict[str, Any]) -> tuple[Any, bool]:
        speech = self._speak(_require(args, "text"))
        if args.get("wait_until_spoken"):
            finished = await speech.wait()
            return ("Spoken." if finished else "You were interrupted while speaking."), False
        return "Speaking.", False

    async def _tool_point_at(self, args: dict[str, Any]) -> tuple[Any, bool]:
        x, y, w, h = [float(v) / self._scale for v in _require(args, "box")]
        speech = self._speak(args["text"]) if args.get("text") else None
        await self.computer.act({"type": "gesture", "kind": args.get("gesture", "hover"), "box": [x, y, w, h]})
        if speech and not await speech.wait():
            return "You were interrupted while speaking.", False
        return "Done.", False

    async def _tool_open_url(self, args: dict[str, Any]) -> tuple[Any, bool]:
        url = _require(args, "url")
        focus = "ctrl+t" if args.get("new_tab", True) else "ctrl+l"
        await self.computer.act(
            {"type": "key", "keys": focus},
            {"type": "wait", "seconds": 0.35},
            {"type": "type", "text": url},
            {"type": "wait", "seconds": 0.2},
            {"type": "key", "keys": "Return"},
            {"type": "wait", "seconds": 1.5},
        )
        return f"Opened {url}.", True

    async def _tool_type_secret(self, args: dict[str, Any]) -> tuple[Any, bool]:
        name = _require(args, "name")
        if name not in self.brief.secrets:
            raise ValueError(f"No secret named {name!r}. Available: {', '.join(self.brief.secrets) or 'none'}")
        actions: list[dict[str, Any]] = [{"type": "type", "text": self.brief.secrets[name], "typos": False}]
        if args.get("press_enter"):
            actions.append({"type": "key", "keys": "Return"})
        await self.computer.act(*actions)
        return f"Typed the {name} secret.", True

    async def _tool_listen(self, args: dict[str, Any]) -> tuple[Any, bool]:
        seconds = min(max(float(args.get("seconds", 12)), 3), 60)
        return await self._listen(seconds), False

    async def _tool_sketch(self, args: dict[str, Any]) -> tuple[Any, bool]:
        shapes = _require(args, "shapes")
        scaled = [_scale_shape(s, self._scale) for s in shapes]
        await self.computer.act(*whiteboard.sketch_actions(scaled))
        return f"Drew {len(shapes)} shape(s).", True

    async def _tool_end_demo(self, args: dict[str, Any]) -> tuple[Any, bool]:
        self.summary = args.get("summary")
        await self._finish_speaking()
        self._done = True
        return "Session ended.", False

    # -- helpers ----------------------------------------------------------------------

    def _speak(self, text: str) -> Speech:
        self.on_event("say", {"text": text})
        speech = self.narrator.say(text)
        self._speeches.append(speech)
        self._speeches = self._speeches[-8:]
        return speech

    async def _say_and_wait(self, text: str) -> None:
        await self._speak(text).wait()

    async def _finish_speaking(self) -> None:
        for speech in list(self._speeches):
            try:
                await asyncio.wait_for(speech.wait(), 60)
            except Exception:  # noqa: BLE001
                pass
        self._speeches.clear()

    async def _listen(self, seconds: float) -> str:
        await self._finish_speaking()
        if not self._inbox:
            self._heard.clear()
            try:
                await asyncio.wait_for(self._heard.wait(), seconds)
            except asyncio.TimeoutError:
                # Someone may be mid-sentence; give the transcript a moment to land.
                deadline = time.monotonic() + 10
                while self._audience_speaking and not self._inbox and time.monotonic() < deadline:
                    await asyncio.sleep(0.2)
            # People often continue after a short breath.
            await asyncio.sleep(0.8)
        if not self._inbox:
            return "(No reply - they stayed quiet.)"
        said = " ".join(self._inbox)
        self._inbox.clear()
        return f"[Customer] {said}"

    def _drain_inbox_blocks(self) -> list[dict[str, Any]]:
        if not self._inbox:
            return []
        said = " ".join(self._inbox)
        self._inbox.clear()
        return [{"type": "text", "text": f"[Customer] {said}"}]

    def _append_user(self, content: list[dict[str, Any]]) -> None:
        if self.messages and self.messages[-1]["role"] == "user":
            self.messages[-1]["content"] = [*self.messages[-1]["content"], *content]
        else:
            self.messages.append({"role": "user", "content": content})

    def _check_time(self) -> None:
        elapsed_min = (time.monotonic() - self._started) / 60
        if not self._wrap_up_sent and elapsed_min >= self.brief.max_minutes:
            self._wrap_up_sent = True
            self._inbox.append("(Time check from the organiser: please wrap up now.)")
        if elapsed_min >= self.brief.max_minutes + 5:
            self._done = True

    async def _screenshot_image(self) -> Image.Image:
        data = await self.computer.screenshot(fmt="jpeg", quality=self.config.screenshot_quality)
        img = Image.open(io.BytesIO(data))
        if self._scale < 1.0:
            img = img.resize((round(img.width * self._scale), round(img.height * self._scale)), Image.LANCZOS)
        return img

    async def _screenshot_blocks(self) -> list[dict[str, Any]]:
        return [_image_block(await self._screenshot_image(), self.config.screenshot_quality)]

    async def _zoom(self, region: list[float]) -> list[dict[str, Any]]:
        img = await self._screenshot_image()
        x0, y0, x1, y1 = [int(v) for v in region]
        crop = img.crop((max(0, x0), max(0, y0), min(img.width, x1), min(img.height, y1)))
        ratio = min(img.width / max(1, crop.width), img.height / max(1, crop.height))
        crop = crop.resize((max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio))), Image.LANCZOS)
        return [_image_block(crop, 90)]

    async def _deck_outline(self) -> str | None:
        slides_id = google_slides_id(self.brief.start_url)
        if not slides_id:
            return None
        import aiohttp

        url = f"https://docs.google.com/presentation/d/{slides_id}/export/txt"
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as http:
                async with http.get(url) as r:
                    if r.status != 200 or "text/plain" not in r.headers.get("Content-Type", ""):
                        return None
                    return (await r.text())[:30_000]
        except Exception as e:  # noqa: BLE001 - outline is a nice-to-have
            logger.info("could not fetch deck outline: %s", e)
            return None

    @staticmethod
    async def _safe(coro) -> None:
        try:
            await coro
        except Exception as e:  # noqa: BLE001
            logger.debug("ignored: %s", e)


def _require(args: dict[str, Any], key: str) -> Any:
    if key not in args or args[key] in (None, ""):
        raise ValueError(f"Missing required argument '{key}'")
    return args[key]


def _image_block(img: Image.Image, quality: int) -> dict[str, Any]:
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=quality)
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(out.getvalue()).decode()},
    }


def _scale_shape(shape: dict[str, Any], scale: float) -> dict[str, Any]:
    if scale == 1.0:
        return shape
    s = dict(shape)
    for key in ("x", "y", "width", "height"):
        if key in s:
            s[key] = float(s[key]) / scale
    if "to" in s:
        s["to"] = [float(v) / scale for v in s["to"]]
    if "points" in s:
        s["points"] = [[float(x) / scale, float(y) / scale] for x, y in s["points"]]
    return s
