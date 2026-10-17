"""Command line: research a product once, or serve research jobs over HTTP.

    onboard-researcher run --url https://app.example.com \\
        --secret username=demo@example.com --secret password=... \\
        --notes "Prospects are finance managers; focus on reporting"

    onboard-researcher serve --port 8790     # used by the dashboard
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from onboard_sandbox import SandboxProvider, StaticProvider, provider_from_env

from .llm import ResearchConfig
from .playbook import Playbook
from .request import ResearchRequest
from .researcher import Researcher
from .writer import PlaybookWriter


def _provider(sandbox_url: str | None, enabled: bool) -> SandboxProvider | None:
    if not enabled:
        return None
    if sandbox_url:
        return StaticProvider(sandbox_url, os.environ.get("SANDBOX_TOKEN"))
    try:
        return provider_from_env()
    except ValueError as e:
        logging.warning("no sandbox provider: %s", e)
        return None


def _print_event(kind: str, data: dict) -> None:
    if kind in ("progress", "warning"):
        prefix = "!" if kind == "warning" else "·"
        print(f"  {prefix} [{data.get('phase')}] {data.get('message')}", file=sys.stderr, flush=True)


async def run_once(args: argparse.Namespace) -> None:
    secrets = dict(s.split("=", 1) for s in args.secret or [])
    request = ResearchRequest(
        url=args.url,
        product_name=args.product,
        notes=args.notes,
        docs_urls=args.docs_url or [],
        language=args.language,
        max_minutes=args.minutes,
        secrets=secrets,
        research_docs=not args.no_docs,
        explore_app=not args.no_explore,
    )
    researcher = Researcher(
        request,
        config=ResearchConfig.from_env(),
        provider=_provider(args.sandbox, request.explore_app),
        on_event=_print_event,
    )
    result = await researcher.run()
    if args.out:
        Path(args.out).write_text(json.dumps(result.draft(), indent=2, ensure_ascii=False))
        print(f"wrote {args.out}", file=sys.stderr)
    print("# Goal\n\n" + result.playbook.render_goal())
    print("\n# Preparation notes\n\n" + result.playbook.render_knowledge())


def serve(args: argparse.Namespace) -> None:
    from aiohttp import web

    from .service import create_app

    config = ResearchConfig.from_env()
    client = config.backend.client()
    provider = _provider(None, os.environ.get("RESEARCHER_EXPLORE", "1") != "0")
    writer = PlaybookWriter(client=client, config=config)

    async def run_research(request: ResearchRequest, job_id: str, on_event):
        return await Researcher(
            request, client=client, config=config, provider=provider, on_event=on_event, session_id=f"research-{job_id}"
        ).run()

    async def refine(request: ResearchRequest, playbook: Playbook, instruction: str) -> Playbook:
        return await writer.refine(request, playbook, instruction)

    token = os.environ.get("RESEARCHER_TOKEN")
    if not token:
        logging.warning("RESEARCHER_TOKEN is not set: anyone who can reach this port can start research jobs")
    app = create_app(
        run_research=run_research,
        refine_playbook=refine,
        token=token,
        callback_secret=os.environ.get("AGENT_CALLBACK_SECRET"),
        max_jobs=int(os.environ.get("RESEARCHER_MAX_JOBS", "2")),
    )
    web.run_app(app, host=args.host, port=args.port)


def main() -> None:
    try:
        from dotenv import find_dotenv, load_dotenv

        load_dotenv(find_dotenv(usecwd=True))
    except ImportError:  # pragma: no cover - python-dotenv is optional
        pass
    p = argparse.ArgumentParser(prog="onboard-researcher")
    sub = p.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="research one product and print the playbook")
    run.add_argument("--url", required=True)
    run.add_argument("--product", help="product name, if the URL doesn't make it obvious")
    run.add_argument("--notes", help="audience, focus, things to avoid")
    run.add_argument("--docs-url", action="append", help="documentation start page (repeatable)")
    run.add_argument("--secret", action="append", help="name=value demo credential (repeatable)")
    run.add_argument("--language", default="English")
    run.add_argument("--minutes", type=float, default=20)
    run.add_argument("--sandbox", help="URL of a running sandbox (default: SANDBOX_PROVIDER)")
    run.add_argument("--no-docs", action="store_true", help="skip the documentation phase")
    run.add_argument("--no-explore", action="store_true", help="skip hands-on exploration")
    run.add_argument("--out", help="also write the draft (goal, knowledge, playbook) as JSON")

    srv = sub.add_parser("serve", help="serve research jobs for the dashboard")
    srv.add_argument("--host", default=os.environ.get("RESEARCHER_HOST", "0.0.0.0"))
    srv.add_argument("--port", type=int, default=int(os.environ.get("RESEARCHER_PORT", "8790")))

    args = p.parse_args()
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(levelname)s %(name)s: %(message)s")
    if args.command == "run":
        asyncio.run(run_once(args))
    else:
        serve(args)


if __name__ == "__main__":
    main()
