"""Virtual desktop lifecycle: Xvfb display, optional window manager and a real
(headful) Chromium window with its tab strip and address bar visible - the
audience sees a normal browser, not a headless page.
"""

from __future__ import annotations

import asyncio
import glob
import logging
import os
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger("onboard.sandbox.desktop")


def find_chromium() -> str | None:
    env = os.environ.get("CHROME_PATH")
    if env and Path(env).exists():
        return env
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        path = shutil.which(name)
        if path:
            return path
    # Playwright-managed Chromium (handy for local development).
    base = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", str(Path.home() / ".cache/ms-playwright"))
    for pattern in ("chromium-*/chrome-linux/chrome", "chromium-*/chrome-linux64/chrome"):
        matches = sorted(glob.glob(os.path.join(base, pattern)), reverse=True)
        if matches:
            return matches[0]
    return None


class VirtualDisplay:
    """Starts ``Xvfb`` (unless attaching to an existing display)."""

    def __init__(self, display: str = ":99", size: tuple[int, int] = (1280, 800), *, spawn: bool = True) -> None:
        self.display = display
        self.size = size
        self.spawn = spawn
        self._procs: list[asyncio.subprocess.Process] = []

    @property
    def env(self) -> dict[str, str]:
        return {**os.environ, "DISPLAY": self.display}

    async def start(self) -> None:
        if self.spawn:
            w, h = self.size
            number = self.display.lstrip(":").split(".")[0]
            socket = Path(f"/tmp/.X11-unix/X{number}")
            if socket.exists():
                raise RuntimeError(f"Display {self.display} is already in use")
            xvfb = await asyncio.create_subprocess_exec(
                "Xvfb", self.display, "-screen", "0", f"{w}x{h}x24", "-nolisten", "tcp", "-ac",
                "+extension", "XFIXES", "+extension", "RANDR",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            self._procs.append(xvfb)
            for _ in range(100):
                if socket.exists():
                    break
                if xvfb.returncode is not None:
                    raise RuntimeError("Xvfb exited during startup")
                await asyncio.sleep(0.05)
            else:
                raise RuntimeError("Timed out waiting for Xvfb")
        await self._start_window_manager()
        self._set_root_cursor()

    async def _start_window_manager(self) -> None:
        for wm in ("openbox", "fluxbox", "matchbox-window-manager"):
            if shutil.which(wm):
                proc = await asyncio.create_subprocess_exec(
                    wm, env=self.env, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
                )
                self._procs.append(proc)
                await asyncio.sleep(0.3)
                logger.info("window manager: %s", wm)
                return

    def _set_root_cursor(self) -> None:
        """Without a desktop environment X shows an 'X' cursor on the root window."""
        try:
            from Xlib import display as xdisplay

            d = xdisplay.Display(self.display)
            font = d.open_font("cursor")
            left_ptr = 68  # XC_left_ptr
            cursor = font.create_glyph_cursor(font, left_ptr, left_ptr + 1, (0, 0, 0), (65535, 65535, 65535))
            d.screen().root.change_attributes(cursor=cursor)
            d.sync()
            d.close()
        except Exception as e:  # pragma: no cover - cosmetic
            logger.debug("could not set root cursor: %s", e)

    async def stop(self) -> None:
        for proc in reversed(self._procs):
            if proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), 5)
                except asyncio.TimeoutError:
                    proc.kill()
        self._procs.clear()


class Browser:
    """A headful Chromium window filling the virtual screen."""

    def __init__(
        self,
        display: VirtualDisplay,
        *,
        executable: str | None = None,
        profile_dir: str | None = None,
        extra_args: list[str] | None = None,
    ) -> None:
        self.display = display
        self.executable = executable or find_chromium()
        self.profile_dir = profile_dir or tempfile.mkdtemp(prefix="onboard-chrome-")
        self.extra_args = extra_args or []
        self._proc: asyncio.subprocess.Process | None = None

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    def _args(self) -> list[str]:
        w, h = self.display.size
        args = [
            f"--user-data-dir={self.profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-default-apps",
            "--disable-session-crashed-bubble",
            "--hide-crash-restore-bubble",
            "--disable-features=Translate,MediaRouter,OptimizationHints,PrivacySandboxSettings4",
            "--password-store=basic",
            "--disable-dev-shm-usage",
            "--force-device-scale-factor=1",
            "--window-position=0,0",
            f"--window-size={w},{h}",
            "--start-maximized",
            "--lang=en-US",
            "--autoplay-policy=no-user-gesture-required",
            "--test-type",  # suppresses the "unsupported flag" info bar
        ]
        if os.geteuid() == 0 or os.environ.get("CHROME_NO_SANDBOX") == "1":
            # Chromium's own sandbox needs user namespaces that many container
            # runtimes block; the container itself is the isolation boundary.
            args.append("--no-sandbox")
        return args + self.extra_args

    async def open(self, url: str | None = None) -> None:
        """Launch the browser, or open ``url`` in a new tab if already running."""
        if not self.executable:
            raise RuntimeError("Chromium not found; set CHROME_PATH")
        env = {
            **self.display.env,
            # Silences Chromium's "Google API keys are missing" info bar.
            "GOOGLE_API_KEY": "no",
            "GOOGLE_DEFAULT_CLIENT_ID": "no",
            "GOOGLE_DEFAULT_CLIENT_SECRET": "no",
        }
        args = self._args() + ([url] if url else [])
        if self.running:
            # A second invocation with the same profile forwards the URL to the
            # running instance, which opens it in a new tab.
            proc = await asyncio.create_subprocess_exec(
                self.executable, *args, env=env,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), 15)
            return
        self._proc = await asyncio.create_subprocess_exec(
            self.executable, *args, env=env,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        logger.info("chromium started (pid %s)", self._proc.pid)

    async def stop(self) -> None:
        if self.running and self._proc:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), 5)
            except asyncio.TimeoutError:
                self._proc.kill()
        self._proc = None
        shutil.rmtree(self.profile_dir, ignore_errors=True)
