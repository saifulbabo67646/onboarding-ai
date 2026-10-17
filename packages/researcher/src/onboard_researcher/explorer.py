"""Phase 2: explore the live app in a sandbox, with nobody watching.

Claude drives the same kind of desktop the presenter will use, logs in with
the demo credentials (typed via ``type_secret``; the values never reach the
model), and maps the product: where things live, which workflows make a good
demo, what to avoid. Findings are recorded with the ``note`` tool, so they
survive even when old screenshots are cleared from context.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from anthropic import AsyncAnthropic
from onboard_director import Computer, ScreenView
from onboard_director.backend import hoist_images, prune_images
from onboard_director.tools import (
    COMPUTER_TOOLSET,
    OPEN_URL,
    TYPE_SECRET,
    as_computer_call,
    computer_action,
    define_tool,
    open_url_actions,
    portable_computer_tool,
)
from onboard_sandbox import SandboxInterrupted

from .llm import ResearchConfig, check_stop, request_params, stream_message
from .request import ResearchRequest

logger = logging.getLogger("onboard.researcher.explorer")

EventCallback = Callable[[str, dict[str, Any]], None]

CATEGORIES = ["feature", "navigation", "workflow", "login", "data", "caution"]

NOTE = define_tool(
    "note",
    "Record one finding for the demo playbook. Write it so a colleague who never saw the screen could "
    "use it. Call it as soon as you learn something - notes are the only thing that outlives this session.",
    {
        "category": {"type": "string", "enum": CATEGORIES},
        "title": {"type": "string", "description": "Short name, e.g. 'Create a report'."},
        "detail": {
            "type": "string",
            "description": "What it is, why it matters to a customer, and exact UI labels/steps you used.",
        },
        "location": {"type": "string", "description": "Navigation path, e.g. 'Sidebar > Reports > New'."},
    },
    ["category", "title", "detail"],
)

FINISH = define_tool(
    "finish_exploration",
    "Stop exploring once you have mapped the product well enough to plan a great demo.",
    {"summary": {"type": "string", "description": "What you covered and what you could not reach."}},
    ["summary"],
)

SYSTEM = """\
You are preparing to give a live demo of a web product. Before the real call you get private time on \
a desktop with a Chrome browser to learn the product hands-on. Nobody is watching; nothing you do here \
is shown to a customer. Work efficiently.

# What to do
1. If a login is needed, sign in: click the field, then use `type_secret` with the right secret name. \
Never guess credentials and never type secret values yourself.
2. Get the big picture: main navigation, the home/dashboard screen, the product's core objects.
3. Walk through the most valuable workflows end to end, as far as you can without changing real data. \
Prefer the workflows from the research notes and the owner's notes.
4. Record findings with `note` as you go: exact menu paths and button labels, what each screen shows, \
which sample data makes a good story, anything slow, broken or confusing ("caution").
5. Call `finish_exploration` when you have enough for a {minutes:g}-minute demo, or when you are told \
time is up.

# Rules
- Look, don't change. You may open forms, dialogs and settings to see what they contain, but cancel \
instead of submitting anything that creates, edits, deletes, sends, invites, publishes or pays - \
unless the owner's notes explicitly allow creating sample data.
- Stay on the product's own domain (and its docs). Don't sign up for anything or accept terms on the \
owner's behalf.
- You see the screen through screenshots; after any turn that changes the screen you automatically get \
a fresh one. Batch a few confident actions per turn.
- Text you write outside of tool calls is private scratch space.\
"""


@dataclass
class Observation:
    category: str
    title: str
    detail: str
    location: str = ""


@dataclass
class Exploration:
    observations: list[Observation] = field(default_factory=list)
    summary: str = ""

    def render(self) -> str:
        if not self.observations:
            return self.summary or "(Nothing was recorded.)"
        lines = [f"Summary: {self.summary}"] if self.summary else []
        for cat in CATEGORIES:
            items = [o for o in self.observations if o.category == cat]
            if not items:
                continue
            lines.append(f"\n## {cat.title()}")
            for o in items:
                where = f" ({o.location})" if o.location else ""
                lines.append(f"- {o.title}{where}: {o.detail}")
        return "\n".join(lines).strip()


class AppExplorer:
    def __init__(
        self,
        request: ResearchRequest,
        computer: Computer,
        *,
        client: AsyncAnthropic,
        config: ResearchConfig,
        on_event: EventCallback | None = None,
    ) -> None:
        self.request = request
        self.computer = computer
        self.client = client
        self.config = config
        self.on_event = on_event or (lambda kind, data: None)
        self.screen = ScreenView(computer, quality=config.screenshot_quality)
        self.result = Exploration()
        self._finished = False

    def _tools(self) -> list[dict[str, Any]]:
        if self.config.is_native:
            computer = COMPUTER_TOOLSET
        else:
            w, h = self.screen.size
            computer = portable_computer_tool(round(w * self.screen.scale), round(h * self.screen.scale))
        tools = [computer, OPEN_URL, NOTE, FINISH]
        if self.request.secrets:
            tools.insert(2, TYPE_SECRET)
        return tools

    def _system(self) -> str:
        text = SYSTEM.format(minutes=self.request.max_minutes)
        if self.request.secrets:
            text += "\n\n# Secrets available to `type_secret`\n" + ", ".join(sorted(self.request.secrets))
        return text

    def _opening(self, docs_notes: str | None) -> str:
        r = self.request
        parts = [f"The browser shows {r.url}."]
        if r.notes:
            parts.append(f"Owner's notes about the demo:\n<owner_notes>\n{r.notes}\n</owner_notes>")
        if docs_notes:
            parts.append(f"Research notes from the product's documentation:\n<research_notes>\n{docs_notes}\n</research_notes>")
        parts.append("Start exploring.")
        return "\n\n".join(parts)

    async def explore(self, docs_notes: str | None = None) -> Exploration:
        await self.screen.calibrate()
        self.on_event("progress", {"phase": "explore", "message": "Opening the app"})
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": [{"type": "text", "text": self._opening(docs_notes)}, *await self.screen.blocks()]}
        ]
        started = time.monotonic()
        time_warned = False
        idle_turns = 0
        for _ in range(self.config.max_explore_turns):
            elapsed = (time.monotonic() - started) / 60
            if elapsed >= self.config.max_explore_minutes + 3:
                logger.info("exploration hard time limit reached")
                break
            if not time_warned and elapsed >= self.config.max_explore_minutes:
                time_warned = True
                _append_text(messages, "(Time is up: record any last notes and call finish_exploration now.)")

            if not self.config.is_native:
                prune_images(messages, self.config.keep_screenshots)
            message = await stream_message(self.client, self._params(messages), native=self.config.is_native)
            check_stop(message, "exploration")
            messages.append({"role": "assistant", "content": message.content})
            tool_uses = [b for b in message.content if getattr(b, "type", None) == "tool_use"]
            if not tool_uses:
                idle_turns += 1
                if idle_turns > 2:
                    break
                _append_text(messages, "Continue exploring, or call finish_exploration if you are done.")
                continue
            idle_turns = 0
            messages.append({"role": "user", "content": await self._run_tools(tool_uses)})
            if self._finished:
                break
        self.on_event(
            "progress",
            {"phase": "explore", "message": f"Finished exploring ({len(self.result.observations)} findings)"},
        )
        return self.result

    def _params(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        return request_params(
            self.config,
            system=self._system(),
            messages=messages,
            tools=self._tools(),
            effort=self.config.explore_effort,
            context_editing=True,
        )

    async def _run_tools(self, tool_uses: list[Any]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        changed = False
        for block in tool_uses:
            entry: dict[str, Any] = {"type": "tool_result", "tool_use_id": block.id}
            if getattr(block, "toolset_name", None):
                entry["toolset_name"] = block.toolset_name
            try:
                content, block_changed = await self._execute(block)
                entry["content"] = content
                changed = changed or block_changed
            except SandboxInterrupted:
                entry["content"] = "Interrupted."
                changed = True
            except Exception as e:  # noqa: BLE001 - report every failure back to the model
                logger.info("tool %s failed: %s", block.name, e)
                entry["content"] = f"Error: {e}"
                entry["is_error"] = True
            results.append(entry)
        if changed and results and not self._finished:
            await asyncio.sleep(self.config.settle_seconds)
            last = results[-1]
            existing = last["content"] if isinstance(last["content"], list) else [{"type": "text", "text": str(last["content"])}]
            last["content"] = [*existing, {"type": "text", "text": "Screen now:"}, *await self.screen.blocks()]
        return results if self.config.is_native else hoist_images(results)

    async def _execute(self, block: Any) -> tuple[Any, bool]:
        args = block.input if isinstance(block.input, dict) else {}
        name = block.name
        call = as_computer_call(block)
        if call:
            name, args = call
            if name == "screenshot":
                return await self.screen.blocks(), False
            if name == "zoom":
                return await self.screen.zoom(_require(args, "region")), False
            if name == "cursor_position":
                return await self.screen.cursor_text(), False
            action = computer_action(name, args, self.screen.scale)
            if action:
                await self.computer.act(action)
            return "OK", name not in ("wait", "mouse_move")
        if name == "open_url":
            url = _require(args, "url")
            await self.computer.act(*open_url_actions(url, new_tab=args.get("new_tab", True)))
            self.on_event("progress", {"phase": "explore", "message": f"Opened {url}"})
            return f"Opened {url}.", True
        if name == "type_secret":
            secret = _require(args, "name")
            if secret not in self.request.secrets:
                raise ValueError(f"No secret named {secret!r}. Available: {', '.join(self.request.secrets) or 'none'}")
            actions: list[dict[str, Any]] = [{"type": "type", "text": self.request.secrets[secret], "typos": False}]
            if args.get("press_enter"):
                actions.append({"type": "key", "keys": "Return"})
            await self.computer.act(*actions)
            return f"Typed the {secret} secret.", True
        if name == "note":
            category = args.get("category") if args.get("category") in CATEGORIES else "feature"
            obs = Observation(category, _require(args, "title"), _require(args, "detail"), str(args.get("location") or ""))
            self.result.observations.append(obs)
            self.on_event("progress", {"phase": "explore", "message": f"Learned: {obs.title}"})
            return "Noted.", False
        if name == "finish_exploration":
            self.result.summary = str(args.get("summary") or "")
            self._finished = True
            return "Exploration finished.", False
        raise ValueError(f"Unknown tool {name}")


def _require(args: dict[str, Any], key: str) -> Any:
    if key not in args or args[key] in (None, ""):
        raise ValueError(f"Missing required argument '{key}'")
    return args[key]


def _append_text(messages: list[dict[str, Any]], text: str) -> None:
    block = {"type": "text", "text": text}
    if messages and messages[-1]["role"] == "user":
        messages[-1]["content"] = [*messages[-1]["content"], block]
    else:
        messages.append({"role": "user", "content": [block]})
