import asyncio

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from fakes import PLAYBOOK

from onboard_researcher import Playbook, ResearchError, ResearchResult
from onboard_researcher.service import create_app


async def _callback_sink():
    """A fake dashboard endpoint that records posted events."""
    received: list[dict] = []
    done = asyncio.Event()

    async def handler(request: web.Request):
        assert request.headers.get("Authorization") == "Bearer cb-secret"
        for event in (await request.json())["events"]:
            received.append(event)
            if event["type"] == "status" and event["data"]["state"] in ("drafted", "failed"):
                done.set()
        return web.json_response({"ok": True})

    app = web.Application()
    app.router.add_post("/events", handler)
    server = TestServer(app)
    await server.start_server()
    return server, received, done


async def _service(run_research, refine=None):
    async def default_refine(req, playbook, instruction):
        if not instruction:
            raise ResearchError("Tell me what to change.")
        playbook.duration_minutes = 5
        return playbook

    app = create_app(
        run_research=run_research,
        refine_playbook=refine or default_refine,
        token="svc-token",
        callback_secret="cb-secret",
    )
    client = TestClient(TestServer(app))
    await client.start_server()
    return client


AUTH = {"Authorization": "Bearer svc-token"}


async def test_job_reports_progress_and_draft_to_callback():
    sink, received, done = await _callback_sink()
    seen_requests = []

    async def run_research(req, job_id, on_event):
        seen_requests.append((req, job_id))
        on_event("progress", {"phase": "docs", "message": "Reading"})
        return ResearchResult(playbook=Playbook.from_dict(PLAYBOOK))

    client = await _service(run_research)
    try:
        assert (await client.post("/jobs", json={"job_id": "j1"})).status == 401
        r = await client.post(
            "/jobs",
            headers=AUTH,
            json={
                "job_id": "j1",
                "request": {"url": "acme.dev", "secrets": [{"name": "pw", "value": "x"}]},
                "callback_url": str(sink.make_url("/events")),
            },
        )
        assert r.status == 202
        await asyncio.wait_for(done.wait(), 5)
        types = [e["type"] for e in received]
        assert types == ["status", "progress", "draft", "status"]
        assert received[2]["data"]["playbook"]["product_name"] == "Acme Analytics"
        assert received[2]["data"]["goal"].startswith("Show how")
        req, job_id = seen_requests[0]
        assert job_id == "j1" and req.secrets == {"pw": "x"} and req.url == "https://acme.dev"
        assert (await (await client.get("/jobs/j1", headers=AUTH)).json())["state"] == "done"
        assert (await client.get("/health")).status == 200
    finally:
        await client.close()
        await sink.close()


async def test_failed_job_reports_error():
    sink, received, done = await _callback_sink()

    async def run_research(req, job_id, on_event):
        raise ResearchError("Nothing was learned.")

    client = await _service(run_research)
    try:
        await client.post(
            "/jobs", headers=AUTH, json={"job_id": "j2", "request": {"url": "acme.dev"}, "callback_url": str(sink.make_url("/events"))}
        )
        await asyncio.wait_for(done.wait(), 5)
        errors = [e for e in received if e["type"] == "error"]
        assert errors[0]["data"]["message"] == "Nothing was learned."
        assert (await client.post("/jobs", headers=AUTH, json={"job_id": "j3", "request": {}})).status == 400
    finally:
        await client.close()
        await sink.close()


async def test_refine_returns_a_new_draft():
    async def never(*args):
        raise AssertionError

    client = await _service(never)
    try:
        body = {"request": {"url": "acme.dev"}, "playbook": PLAYBOOK, "instruction": "shorter"}
        r = await client.post("/refine", headers=AUTH, json=body)
        draft = await r.json()
        assert r.status == 200 and draft["playbook"]["duration_minutes"] == 5
        assert "about 5 minutes" in draft["goal"]
        r = await client.post("/refine", headers=AUTH, json={**body, "instruction": ""})
        assert r.status == 422
    finally:
        await client.close()
