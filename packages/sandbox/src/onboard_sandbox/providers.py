"""Provisioning: give every live session its own isolated desktop.

* ``StaticProvider`` - one pre-started sandbox at a fixed URL (development).
* ``LocalProcessProvider`` - spawns ``python -m onboard_sandbox`` with its own
  Xvfb display per session (Linux host with Xvfb + Chromium installed).
* ``DockerProvider`` - runs one container of the sandbox image per session.

All providers return a :class:`SandboxLease`; call ``release()`` when done.
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import socket
import sys
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Protocol

from .client import SandboxClient

logger = logging.getLogger("onboard.sandbox.providers")


@dataclass
class SandboxLease:
    url: str
    token: str | None = None
    _release: Callable[[], Awaitable[None]] | None = field(default=None, repr=False)

    def client(self) -> SandboxClient:
        return SandboxClient(self.url, token=self.token)

    async def release(self) -> None:
        if self._release:
            await self._release()
            self._release = None


class SandboxProvider(Protocol):
    async def acquire(self, session_id: str, *, start_url: str | None = None) -> SandboxLease: ...


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class StaticProvider:
    def __init__(self, url: str, token: str | None = None) -> None:
        self.url, self.token = url, token

    async def acquire(self, session_id: str, *, start_url: str | None = None) -> SandboxLease:
        lease = SandboxLease(self.url, self.token)
        client = lease.client()
        try:
            await client.wait_ready(30)
            if start_url:
                await client.open_browser(start_url)
        finally:
            await client.close()
        return lease


class LocalProcessProvider:
    _next_display = 100

    def __init__(self, *, size: str = "1280x800", extra_env: dict[str, str] | None = None) -> None:
        self.size = size
        self.extra_env = extra_env or {}

    def _display(self) -> str:
        while True:
            n = LocalProcessProvider._next_display
            LocalProcessProvider._next_display += 1
            if not os.path.exists(f"/tmp/.X11-unix/X{n}"):
                return f":{n}"

    async def acquire(self, session_id: str, *, start_url: str | None = None) -> SandboxLease:
        port = _free_port()
        token = secrets.token_urlsafe(24)
        args = [sys.executable, "-m", "onboard_sandbox", "--host", "127.0.0.1", "--port", str(port),
                "--display", self._display(), "--size", self.size, "--token", token]
        if start_url:
            args += ["--url", start_url]
        proc = await asyncio.create_subprocess_exec(*args, env={**os.environ, **self.extra_env})

        async def release() -> None:
            if proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), 10)
                except asyncio.TimeoutError:
                    proc.kill()

        lease = SandboxLease(f"http://127.0.0.1:{port}", token, release)
        client = lease.client()
        try:
            await client.wait_ready(45)
        except Exception:
            await release()
            raise
        finally:
            await client.close()
        logger.info("[%s] local sandbox on port %s", session_id, port)
        return lease


class DockerProvider:
    def __init__(
        self,
        image: str = "onboard-sandbox:latest",
        *,
        network: str | None = None,
        host: str = "127.0.0.1",
        size: str = "1280x800",
        extra_args: list[str] | None = None,
    ) -> None:
        self.image = image
        self.network = network
        self.host = host
        self.size = size
        self.extra_args = extra_args or []

    async def _docker(self, *args: str) -> str:
        proc = await asyncio.create_subprocess_exec(
            "docker", *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, err = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"docker {' '.join(args[:2])} failed: {err.decode().strip()}")
        return out.decode().strip()

    async def acquire(self, session_id: str, *, start_url: str | None = None) -> SandboxLease:
        token = secrets.token_urlsafe(24)
        name = f"onboard-sandbox-{session_id}"[:63]
        args = ["run", "-d", "--rm", "--name", name, "--shm-size=1g",
                "-e", f"SANDBOX_TOKEN={token}", "-e", f"SANDBOX_SIZE={self.size}"]
        if start_url:
            args += ["-e", f"SANDBOX_START_URL={start_url}"]
        if self.network:
            # Reach the container by name on a shared network (agent in compose).
            args += ["--network", self.network]
        else:
            args += ["-p", "127.0.0.1::8765"]
        args += [*self.extra_args, self.image]
        container = await self._docker(*args)

        async def release() -> None:
            try:
                await self._docker("rm", "-f", container)
            except RuntimeError as e:
                logger.warning("failed to remove sandbox container: %s", e)

        try:
            if self.network:
                url = f"http://{name}:8765"
            else:
                mapping = await self._docker("port", container, "8765/tcp")
                port = mapping.splitlines()[0].rsplit(":", 1)[1]
                url = f"http://{self.host}:{port}"
            lease = SandboxLease(url, token, release)
            client = lease.client()
            try:
                await client.wait_ready(60)
            finally:
                await client.close()
        except Exception:
            await release()
            raise
        logger.info("[%s] docker sandbox %s at %s", session_id, container[:12], url)
        return lease


def provider_from_env() -> SandboxProvider:
    """Build a provider from ``SANDBOX_PROVIDER`` (static | local | docker)."""
    kind = os.environ.get("SANDBOX_PROVIDER", "local").lower()
    size = os.environ.get("SANDBOX_SIZE", "1280x800")
    if kind == "static":
        return StaticProvider(os.environ.get("SANDBOX_URL", "http://127.0.0.1:8765"), os.environ.get("SANDBOX_TOKEN"))
    if kind == "docker":
        return DockerProvider(
            os.environ.get("SANDBOX_IMAGE", "onboard-sandbox:latest"),
            network=os.environ.get("SANDBOX_DOCKER_NETWORK") or None,
            size=size,
        )
    if kind == "local":
        return LocalProcessProvider(size=size)
    raise ValueError(f"Unknown SANDBOX_PROVIDER: {kind}")
