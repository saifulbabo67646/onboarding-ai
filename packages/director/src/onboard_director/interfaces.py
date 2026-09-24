"""The two seams that keep the director independent of any meeting platform or
desktop implementation: a :class:`Computer` it can see and drive, and a
:class:`Narrator` that gives it a voice.
"""

from __future__ import annotations

from typing import Any, Protocol


class Computer(Protocol):
    """Anything that looks like :class:`onboard_sandbox.SandboxClient`."""

    async def health(self) -> dict[str, Any]: ...
    async def screenshot(self, *, fmt: str = "png", cursor: bool = False, quality: int = 85) -> bytes: ...
    async def act(self, *actions: dict[str, Any]) -> list[dict[str, Any]]: ...
    async def interrupt(self) -> None: ...
    async def pause(self) -> None: ...
    async def resume(self) -> None: ...
    async def presence(self, *, idle: bool | None = None, click_highlight: bool | None = None) -> None: ...


class Speech(Protocol):
    async def wait(self) -> bool:
        """Wait until playout ends. Returns ``False`` if it was interrupted."""
        ...


class Narrator(Protocol):
    def say(self, text: str) -> Speech: ...


class PrintNarrator:
    """Prints speech and waits roughly as long as speaking it would take.

    Useful for dry runs without a meeting (``python -m onboard_director``).
    """

    def __init__(self, words_per_minute: float = 165.0) -> None:
        self.wpm = words_per_minute

    def say(self, text: str) -> Speech:
        import asyncio

        print(f"\n🗣  {text}", flush=True)
        seconds = len(text.split()) / self.wpm * 60
        task = asyncio.ensure_future(asyncio.sleep(seconds))

        class _Speech:
            async def wait(self_inner) -> bool:
                await task
                return True

        return _Speech()
