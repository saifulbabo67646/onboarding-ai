"""Dry-run a presentation without a meeting.

    python -m onboard_director --goal "Show how to create a project" --url https://app.example.com

Speech is printed to the terminal; type a line and press Enter to "talk" to the
presenter (interruptions work). Watch the sandbox screen with any VNC-free
viewer by opening ``<sandbox>/screenshot`` or connect to ``/stream``.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from onboard_sandbox import LocalProcessProvider, SandboxLease, StaticProvider

from .brief import DemoBrief
from .director import Director, DirectorConfig
from .interfaces import PrintNarrator


async def _stdin_lines(director: Director) -> None:
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            return
        director.hear(line)


async def main_async(args: argparse.Namespace) -> None:
    brief = DemoBrief(
        goal=args.goal,
        mode=args.mode,
        start_url=args.url,
        presenter_name=args.presenter,
        audience_name=args.audience,
        allow_whiteboard=args.whiteboard,
        max_minutes=args.minutes,
    )
    provider = StaticProvider(args.sandbox) if args.sandbox else LocalProcessProvider()
    lease: SandboxLease = await provider.acquire("cli", start_url=brief.opening_url)
    print(f"sandbox: {lease.url}  (live view: {lease.url}/screenshot?cursor=1)", flush=True)
    computer = lease.client()
    director = Director(
        brief,
        computer,
        PrintNarrator(),
        config=DirectorConfig(model=args.model, effort=args.effort),
        on_event=lambda kind, data: kind == "action" and print(f"   · {data['tool']} {data['input']}", flush=True),
    )
    listener = asyncio.create_task(_stdin_lines(director))
    try:
        summary = await director.run()
        print(f"\nSummary: {summary}")
    finally:
        listener.cancel()
        await computer.close()
        await lease.release()


def main() -> None:
    p = argparse.ArgumentParser(prog="onboard-director")
    p.add_argument("--goal", required=True)
    p.add_argument("--mode", choices=["product_demo", "presentation"], default="product_demo")
    p.add_argument("--url", help="start URL (app or slide deck link)")
    p.add_argument("--sandbox", help="URL of a running sandbox (default: spawn one locally)")
    p.add_argument("--presenter", default="Alex")
    p.add_argument("--audience", default="there")
    p.add_argument("--whiteboard", action="store_true")
    p.add_argument("--minutes", type=float, default=15)
    p.add_argument("--model", default="claude-opus-5")
    p.add_argument("--effort", default="medium")
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
