"""Async client for the sandbox HTTP/WebSocket API."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import aiohttp


class SandboxInterrupted(Exception):
    """The action sequence was cancelled (e.g. the audience started talking)."""


class SandboxClient:
    def __init__(self, base_url: str, *, token: str | None = None, timeout: float = 180.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "SandboxClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()

    @property
    def session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self._headers, timeout=self._timeout)
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def wait_ready(self, timeout: float = 60.0) -> dict[str, Any]:
        deadline = asyncio.get_running_loop().time() + timeout
        last_error: Exception | None = None
        while asyncio.get_running_loop().time() < deadline:
            try:
                return await self.health()
            except Exception as e:  # noqa: BLE001 - keep polling until ready
                last_error = e
                await asyncio.sleep(0.5)
        raise TimeoutError(f"sandbox at {self.base_url} not ready: {last_error}")

    async def health(self) -> dict[str, Any]:
        async with self.session.get(f"{self.base_url}/health") as r:
            r.raise_for_status()
            return await r.json()

    async def screenshot(self, *, fmt: str = "png", cursor: bool = False, quality: int = 85) -> bytes:
        params = {"format": fmt, "cursor": "1" if cursor else "0", "quality": str(quality)}
        async with self.session.get(f"{self.base_url}/screenshot", params=params) as r:
            r.raise_for_status()
            return await r.read()

    async def act(self, *actions: dict[str, Any]) -> list[dict[str, Any]]:
        async with self.session.post(f"{self.base_url}/actions", json={"actions": list(actions)}) as r:
            if r.status == 409:
                raise SandboxInterrupted()
            body = await r.json()
            if r.status >= 400:
                raise ValueError(body.get("error", f"sandbox error {r.status}"))
            return body["results"]

    async def _post(self, path: str, payload: dict[str, Any] | None = None) -> None:
        async with self.session.post(f"{self.base_url}{path}", json=payload or {}) as r:
            r.raise_for_status()

    async def interrupt(self) -> None:
        await self._post("/interrupt")

    async def pause(self) -> None:
        await self._post("/pause")

    async def resume(self) -> None:
        await self._post("/resume")

    async def presence(self, *, idle: bool | None = None, click_highlight: bool | None = None) -> None:
        body: dict[str, Any] = {}
        if idle is not None:
            body["idle"] = idle
        if click_highlight is not None:
            body["click_highlight"] = click_highlight
        await self._post("/presence", body)

    async def open_browser(self, url: str | None = None) -> None:
        await self._post("/browser/open", {"url": url})

    async def frames(self) -> AsyncIterator[bytes]:
        """Yield JPEG frames from the live stream until the connection closes."""
        url = self.base_url.replace("http://", "ws://").replace("https://", "wss://") + "/stream"
        async with self.session.ws_connect(url, heartbeat=20, max_msg_size=0) as ws:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.BINARY:
                    yield msg.data
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
