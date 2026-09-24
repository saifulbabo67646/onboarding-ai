"""Run a sandbox: ``python -m onboard_sandbox --port 8765 --url https://example.com``."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal

from aiohttp import web
from onboard_humanize import Humanizer

from .capture import FrameStream, ScreenCapture
from .desktop import Browser, VirtualDisplay
from .human_input import HumanInput
from .server import Sandbox, create_app
from .x11_input import X11Input


def _parse_size(value: str) -> tuple[int, int]:
    w, h = value.lower().split("x")
    return int(w), int(h)


async def serve(args: argparse.Namespace) -> None:
    display = VirtualDisplay(args.display, args.size, spawn=not args.attach)
    await display.start()
    browser = None if args.no_browser else Browser(display)
    if browser:
        await browser.open(args.url)

    capture = ScreenCapture(args.display, args.size)
    backend = X11Input(args.display)
    human = HumanInput(
        backend,
        args.size,
        Humanizer(mouse_speed=args.mouse_speed, wpm=args.wpm, typo_rate=args.typo_rate),
        on_click=capture.effects.add,
    )
    # Park the cursor somewhere natural rather than the top-left corner.
    backend.move(args.size[0] * 2 // 3, args.size[1] // 2)
    human.set_idle(True)
    stream = FrameStream(capture, fps=args.fps)
    app = create_app(Sandbox(display, browser, capture, human, stream), token=args.token)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, args.host, args.port)
    await site.start()
    logging.getLogger("onboard.sandbox").info("sandbox ready on http://%s:%s (display %s)", args.host, args.port, args.display)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    await runner.cleanup()
    backend.close()
    if browser:
        await browser.stop()
    await display.stop()


def main() -> None:
    env = os.environ.get
    p = argparse.ArgumentParser(prog="onboard-sandbox", description="Virtual desktop with human-like input")
    p.add_argument("--host", default=env("SANDBOX_HOST", "0.0.0.0"))
    p.add_argument("--port", type=int, default=int(env("SANDBOX_PORT", "8765")))
    p.add_argument("--display", default=env("SANDBOX_DISPLAY", ":99"))
    p.add_argument("--size", type=_parse_size, default=_parse_size(env("SANDBOX_SIZE", "1280x800")))
    p.add_argument("--attach", action="store_true", help="use an existing X display instead of starting Xvfb")
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--url", default=env("SANDBOX_START_URL"), help="page to open at startup")
    p.add_argument("--token", default=env("SANDBOX_TOKEN"))
    p.add_argument("--fps", type=float, default=float(env("SANDBOX_FPS", "20")))
    p.add_argument("--mouse-speed", type=float, default=float(env("SANDBOX_MOUSE_SPEED", "1.0")))
    p.add_argument("--wpm", type=float, default=float(env("SANDBOX_WPM", "70")))
    p.add_argument("--typo-rate", type=float, default=float(env("SANDBOX_TYPO_RATE", "0.015")))
    args = p.parse_args()
    logging.basicConfig(level=env("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(serve(args))


if __name__ == "__main__":
    main()
