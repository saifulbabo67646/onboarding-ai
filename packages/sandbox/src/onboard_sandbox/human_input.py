"""Executes high-level input actions with human timing.

Actions are plain dicts (so they travel over HTTP unchanged)::

    {"type": "move", "x": 640, "y": 400}
    {"type": "click", "x": 640, "y": 400, "button": "left", "count": 1, "modifiers": "ctrl"}
    {"type": "mouse_down" | "mouse_up", "button": "left"}
    {"type": "drag", "start": [x, y], "end": [x, y], "modifiers": "shift"}
    {"type": "trace", "points": [[x, y], ...], "button": "left"}   # draw a freehand path
    {"type": "scroll", "x": 640, "y": 400, "direction": "down", "amount": 5}
    {"type": "type", "text": "hello", "typos": true}
    {"type": "key", "keys": "ctrl+t", "repeat": 1}
    {"type": "hold_key", "keys": "shift", "seconds": 1.5}
    {"type": "gesture", "kind": "circle", "box": [x, y, w, h]}
    {"type": "wait", "seconds": 1.0}
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Protocol

from onboard_humanize import BACKSPACE, Box, Humanizer, MouseStep

logger = logging.getLogger("onboard.sandbox.human")


class InputBackend(Protocol):
    def position(self) -> tuple[int, int]: ...
    def move(self, x: int, y: int) -> None: ...
    def button(self, button: int, down: bool) -> None: ...
    def combo_down(self, combo: str) -> list[Any]: ...
    def combo_up(self, pressed: list[Any]) -> None: ...


class Interrupted(Exception):
    """Raised when an action sequence is cancelled mid-flight."""


BUTTONS = {"left": 1, "middle": 2, "right": 3}
SCROLL_BUTTONS = {"up": 4, "down": 5, "left": 6, "right": 7}


class HumanInput:
    """Runs actions one at a time with human-like motion and timing.

    Also provides *presence*: when idle, the cursor occasionally drifts a little
    like a resting hand, and while paused (e.g. the audience is talking) no new
    motion starts.
    """

    def __init__(
        self,
        backend: InputBackend,
        screen_size: tuple[int, int],
        humanizer: Humanizer | None = None,
        *,
        on_click: Any = None,
    ) -> None:
        self.backend = backend
        self.width, self.height = screen_size
        self.h = humanizer or Humanizer()
        self.rng: random.Random = self.h.rng
        self.on_click = on_click
        self._lock = asyncio.Lock()
        self._interrupt = asyncio.Event()
        self._resume = asyncio.Event()
        self._resume.set()
        self._last_activity = time.monotonic()
        self._idle_enabled = False
        self._idle_task: asyncio.Task | None = None
        self._pressed_buttons: set[int] = set()
        self._waiting = 0

    # -- state ------------------------------------------------------------------

    @property
    def cursor(self) -> tuple[int, int]:
        return self.backend.position()

    def interrupt(self) -> None:
        self._interrupt.set()

    def pause(self) -> None:
        self._resume.clear()

    def resume(self) -> None:
        self._resume.set()

    @property
    def paused(self) -> bool:
        return not self._resume.is_set()

    def set_idle(self, enabled: bool) -> None:
        self._idle_enabled = enabled
        if enabled and (self._idle_task is None or self._idle_task.done()):
            self._idle_task = asyncio.create_task(self._idle_loop())

    async def close(self) -> None:
        self._idle_enabled = False
        if self._idle_task:
            self._idle_task.cancel()
        for b in list(self._pressed_buttons):
            self.backend.button(b, False)

    # -- execution --------------------------------------------------------------

    async def run(self, actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Run actions sequentially. Raises :class:`Interrupted` if cancelled."""
        results = []
        self._waiting += 1
        try:
            await self._lock.acquire()
        finally:
            self._waiting -= 1
        self._interrupt.clear()
        try:
            for action in actions:
                await self._checkpoint()
                results.append(await self._run_one(action))
                self._last_activity = time.monotonic()
        finally:
            self._last_activity = time.monotonic()
            self._lock.release()
        return results

    async def _checkpoint(self) -> None:
        if self._interrupt.is_set():
            raise Interrupted()
        if not self._resume.is_set():
            try:
                await asyncio.wait_for(self._resume.wait(), timeout=20)
            except asyncio.TimeoutError:
                self._resume.set()
        if self._interrupt.is_set():
            raise Interrupted()

    async def _sleep(self, seconds: float) -> None:
        if seconds <= 0:
            return
        if self._interrupt.is_set():
            raise Interrupted()
        try:
            await asyncio.wait_for(self._interrupt.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            return
        raise Interrupted()

    async def _play(self, steps: list[MouseStep]) -> None:
        for step in steps:
            await self._sleep(step.dt)
            self.backend.move(self._cx(step.x), self._cy(step.y))

    def _cx(self, x: float) -> int:
        return int(min(max(x, 0), self.width - 1))

    def _cy(self, y: float) -> int:
        return int(min(max(y, 0), self.height - 1))

    async def move_to(self, x: float, y: float, *, target_width: float = 24) -> None:
        await self._play(self.h.mouse.path(self.cursor, (self._cx(x), self._cy(y)), target_width=target_width))

    async def _with_modifiers(self, modifiers: str | None, fn) -> None:
        pressed = self.backend.combo_down(modifiers) if modifiers else []
        try:
            if pressed:
                await self._sleep(self.rng.uniform(0.05, 0.12))
            await fn()
        finally:
            if pressed:
                self.backend.combo_up(pressed)

    async def _run_one(self, a: dict[str, Any]) -> dict[str, Any]:
        kind = a.get("type")
        handler = getattr(self, f"_do_{kind}", None)
        if handler is None:
            raise ValueError(f"Unknown action type: {kind!r}")
        out = await handler(a) or {}
        x, y = self.cursor
        return {"type": kind, "cursor": [x, y], **out}

    async def _do_move(self, a):
        await self.move_to(a["x"], a["y"], target_width=a.get("target_width", 24))

    async def _do_click(self, a):
        button = BUTTONS[a.get("button", "left")]
        count = int(a.get("count", 1))
        if "x" in a and "y" in a:
            await self.move_to(a["x"], a["y"])
        timing = self.h.click_timing()
        await self._sleep(timing.dwell)

        async def clicks():
            for i in range(count):
                if i:
                    await self._sleep(timing.interval)
                self.backend.button(button, True)
                if self.on_click:
                    self.on_click(*self.cursor)
                await self._sleep(timing.hold)
                self.backend.button(button, False)

        await self._with_modifiers(a.get("modifiers"), clicks)

    async def _do_mouse_down(self, a):
        button = BUTTONS[a.get("button", "left")]
        self.backend.button(button, True)
        self._pressed_buttons.add(button)
        if self.on_click:
            self.on_click(*self.cursor)

    async def _do_mouse_up(self, a):
        button = BUTTONS[a.get("button", "left")]
        self.backend.button(button, False)
        self._pressed_buttons.discard(button)

    async def _do_drag(self, a):
        start, end = a["start"], a["end"]
        await self.move_to(*start)

        async def drag():
            await self._sleep(self.rng.uniform(0.1, 0.2))
            self.backend.button(1, True)
            self._pressed_buttons.add(1)
            try:
                await self._sleep(self.rng.uniform(0.08, 0.16))
                steps = self.h.mouse.path(tuple(start), tuple(end), allow_overshoot=False)
                # Dragging is slower and more careful than free movement.
                await self._play([MouseStep(s.x, s.y, s.dt * 1.4) for s in steps])
                await self._sleep(self.rng.uniform(0.08, 0.18))
            finally:
                self.backend.button(1, False)
                self._pressed_buttons.discard(1)

        await self._with_modifiers(a.get("modifiers"), drag)

    async def _do_trace(self, a):
        points = [tuple(p) for p in a["points"]]
        if not points:
            return
        await self.move_to(*points[0])
        button = BUTTONS.get(a.get("button", "left")) if a.get("button", "left") else None
        if button:
            await self._sleep(self.rng.uniform(0.08, 0.15))
            self.backend.button(button, True)
            self._pressed_buttons.add(button)
        try:
            await self._play(self.h.mouse.trace(points[0], points[1:], seconds_per_100px=a.get("seconds_per_100px", 0.3)))
        finally:
            if button:
                await asyncio.sleep(0.05)
                self.backend.button(button, False)
                self._pressed_buttons.discard(button)

    async def _do_scroll(self, a):
        if "x" in a and "y" in a:
            await self.move_to(a["x"], a["y"], target_width=200)
            await self._sleep(self.rng.uniform(0.08, 0.2))
        button = SCROLL_BUTTONS[a.get("direction", "down")]
        amount = max(1, int(a.get("amount", 3)))

        async def wheel():
            for delay in self.h.scroll_plan(amount):
                await self._sleep(delay)
                self.backend.button(button, True)
                self.backend.button(button, False)

        await self._with_modifiers(a.get("modifiers"), wheel)

    async def _do_type(self, a):
        text = a.get("text", "")
        strokes = self.h.typing.plan(text, allow_typos=a.get("typos", True))
        for stroke in strokes:
            await self._sleep(stroke.delay)
            key = "BackSpace" if stroke.key == BACKSPACE else stroke.key
            pressed = self.backend.combo_down(key) if key == "BackSpace" else self._char_down(key)
            await asyncio.sleep(stroke.hold)
            self.backend.combo_up(pressed)

    def _char_down(self, ch: str):
        # A literal "+" must not be parsed as a combo separator.
        if ch == "+":
            return self.backend.combo_down("plus")
        if ch == " ":
            return self.backend.combo_down("space")
        return self.backend.combo_down(ch)

    async def _do_key(self, a):
        repeat = max(1, min(int(a.get("repeat", 1)), 100))
        for i in range(repeat):
            if i:
                await self._sleep(self.rng.uniform(0.08, 0.16))
            pressed = self.backend.combo_down(a["keys"])
            await asyncio.sleep(self.rng.uniform(0.05, 0.1))
            self.backend.combo_up(pressed)
        await self._sleep(self.rng.uniform(0.05, 0.15))

    async def _do_hold_key(self, a):
        pressed = self.backend.combo_down(a["keys"])
        try:
            await self._sleep(min(float(a.get("seconds", 1.0)), 30))
        finally:
            self.backend.combo_up(pressed)

    async def _do_gesture(self, a):
        x, y, w, h = a["box"]
        steps = self.h.gestures.gesture(a.get("kind", "hover"), self.cursor, Box(x, y, w, h))
        await self._play(steps)

    async def _do_wait(self, a):
        await self._sleep(min(float(a.get("seconds", 1.0)), 60))

    # -- idle presence ------------------------------------------------------------

    async def _idle_loop(self) -> None:
        while self._idle_enabled:
            await asyncio.sleep(0.5)
            quiet_for = time.monotonic() - self._last_activity
            if quiet_for < self.rng.uniform(3.0, 7.0) or self._lock.locked() or self.paused:
                continue
            async with self._lock:
                for step in self.h.gestures.idle_drift(self.cursor, (self.width, self.height)):
                    await asyncio.sleep(step.dt)
                    if self._waiting or self.paused:
                        break  # real work arrived - get out of the way
                    self.backend.move(self._cx(step.x), self._cy(step.y))
                self._last_activity = time.monotonic()
