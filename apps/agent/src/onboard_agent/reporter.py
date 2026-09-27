"""Sends session events (status, transcript, actions) back to the web app so
owners can follow sessions from the dashboard. Fire-and-forget: reporting
never blocks or breaks a live demo.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import aiohttp

logger = logging.getLogger("onboard.agent.reporter")


class EventReporter:
    def __init__(self, url: str | None, secret: str | None) -> None:
        self.url = url
        self.secret = secret
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self.url and self._task is None:
            self._task = asyncio.create_task(self._send_loop())

    def emit(self, kind: str, data: dict[str, Any]) -> None:
        if self.url:
            self._queue.put_nowait({"type": kind, "data": data, "ts": time.time()})

    async def close(self) -> None:
        if self._task:
            self._queue.put_nowait(None)
            try:
                await asyncio.wait_for(self._task, 10)
            except asyncio.TimeoutError:
                self._task.cancel()

    async def _send_loop(self) -> None:
        headers = {"Authorization": f"Bearer {self.secret}"} if self.secret else {}
        async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as http:
            while True:
                event = await self._queue.get()
                if event is None:
                    return
                batch = [event]
                while not self._queue.empty() and len(batch) < 50:
                    nxt = self._queue.get_nowait()
                    if nxt is None:
                        await self._post(http, batch)
                        return
                    batch.append(nxt)
                await self._post(http, batch)

    async def _post(self, http: aiohttp.ClientSession, batch: list[dict[str, Any]]) -> None:
        try:
            async with http.post(self.url, json={"events": batch}) as r:
                if r.status >= 400:
                    logger.warning("event callback returned %s", r.status)
        except Exception as e:  # noqa: BLE001
            logger.warning("event callback failed: %s", e)
