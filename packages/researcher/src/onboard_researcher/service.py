"""HTTP service that runs research jobs in the background.

    GET  /health                -> {"ok": true, "running": n}
    POST /jobs                  {"job_id", "request": {...}, "callback_url"} -> 202
    GET  /jobs/{job_id}         -> {"state": "running" | "done" | "failed" | "unknown"}
    POST /refine                {"request": {...}, "playbook": {...}, "instruction"} -> draft

Progress and the final draft are posted to ``callback_url`` as
``{"events": [{"type", "data", "ts"}, ...]}``:

* ``status``   ``{"state": "researching", "phase"}`` / ``{"state": "drafted"}`` / ``{"state": "failed"}``
* ``progress`` ``{"phase", "message"}`` - human-readable log lines
* ``warning``  ``{"phase", "message"}`` - a phase was skipped or failed
* ``draft``    ``{"goal", "knowledge", "playbook"}``
* ``error``    ``{"message"}``

Requests carry the owner's demo credentials, so the service must only be
reachable by the dashboard: set a token and keep it on a private network.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from typing import Any, Awaitable, Callable

from aiohttp import web

from .llm import ResearchError
from .playbook import Playbook
from .reporter import CallbackReporter
from .request import ResearchRequest
from .researcher import ResearchResult, draft_of

logger = logging.getLogger("onboard.researcher.service")

EventCallback = Callable[[str, dict[str, Any]], None]
# (request, job_id, on_event) -> result. Lets tests and embedders swap the pipeline.
RunResearch = Callable[[ResearchRequest, str, EventCallback], Awaitable[ResearchResult]]
RefinePlaybook = Callable[[ResearchRequest, Playbook, str], Awaitable[Playbook]]


def _auth_middleware(token: str | None):
    @web.middleware
    async def middleware(request: web.Request, handler):
        if token and request.path != "/health":
            given = request.headers.get("Authorization", "")
            if not hmac.compare_digest(given, f"Bearer {token}"):
                raise web.HTTPUnauthorized(text="bad token")
        return await handler(request)

    return middleware


async def _json(request: web.Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        raise web.HTTPBadRequest(text="expected a JSON body")
    if not isinstance(body, dict):
        raise web.HTTPBadRequest(text="expected a JSON object")
    return body


def _parse_request(raw: Any) -> ResearchRequest:
    try:
        return ResearchRequest.from_dict(raw if isinstance(raw, dict) else {})
    except (ValueError, TypeError) as e:
        raise web.HTTPBadRequest(text=str(e))


def create_app(
    *,
    run_research: RunResearch,
    refine_playbook: RefinePlaybook,
    token: str | None = None,
    callback_secret: str | None = None,
    max_jobs: int = 2,
) -> web.Application:
    app = web.Application(middlewares=[_auth_middleware(token)], client_max_size=4 * 1024 * 1024)
    routes = web.RouteTableDef()
    slots = asyncio.Semaphore(max_jobs)
    tasks: dict[str, asyncio.Task] = {}
    states: dict[str, str] = {}

    async def run_job(job_id: str, req: ResearchRequest, callback_url: str | None) -> None:
        reporter = CallbackReporter(callback_url, callback_secret)
        reporter.start()
        reporter.emit("status", {"state": "queued"})
        try:
            async with slots:
                states[job_id] = "running"
                result = await run_research(req, job_id, reporter.emit)
            reporter.emit("draft", result.draft())
            reporter.emit("status", {"state": "drafted", "warnings": result.warnings})
            states[job_id] = "done"
        except asyncio.CancelledError:
            reporter.emit("error", {"message": "Research was cancelled."})
            reporter.emit("status", {"state": "failed"})
            states[job_id] = "failed"
            raise
        except Exception as e:  # noqa: BLE001 - report every failure to the owner
            logger.exception("research job %s failed", job_id)
            message = str(e) if isinstance(e, ResearchError) else f"Research failed: {e}"
            reporter.emit("error", {"message": message})
            reporter.emit("status", {"state": "failed"})
            states[job_id] = "failed"
        finally:
            tasks.pop(job_id, None)
            await reporter.close()

    @routes.get("/health")
    async def health(_: web.Request):
        return web.json_response({"ok": True, "running": len(tasks)})

    @routes.post("/jobs")
    async def start_job(request: web.Request):
        body = await _json(request)
        job_id = str(body.get("job_id") or "").strip()
        if not job_id:
            raise web.HTTPBadRequest(text="job_id is required")
        if job_id in tasks:
            raise web.HTTPConflict(text="job already running")
        req = _parse_request(body.get("request"))
        states[job_id] = "queued"
        tasks[job_id] = asyncio.create_task(run_job(job_id, req, body.get("callback_url")))
        return web.json_response({"accepted": True, "job_id": job_id}, status=202)

    @routes.get("/jobs/{job_id}")
    async def job_state(request: web.Request):
        return web.json_response({"state": states.get(request.match_info["job_id"], "unknown")})

    @routes.post("/refine")
    async def refine(request: web.Request):
        body = await _json(request)
        req = _parse_request(body.get("request"))
        if not isinstance(body.get("playbook"), dict):
            raise web.HTTPBadRequest(text="playbook is required")
        try:
            playbook = await refine_playbook(req, Playbook.from_dict(body["playbook"]), str(body.get("instruction") or ""))
        except ResearchError as e:
            return web.json_response({"error": str(e)}, status=422)
        return web.json_response(draft_of(playbook))

    app.add_routes(routes)

    async def on_cleanup(_: web.Application) -> None:
        for task in list(tasks.values()):
            task.cancel()
        await asyncio.gather(*tasks.values(), return_exceptions=True)

    app.on_cleanup.append(on_cleanup)
    return app
