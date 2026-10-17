import json
from types import SimpleNamespace

import pytest
from fakes import PLAYBOOK, FakeClient, FakeComputer, FakeProvider, message, playbook_message, text, tool_use

from onboard_researcher import (
    AppExplorer,
    DocsResearcher,
    Playbook,
    PlaybookWriter,
    ResearchConfig,
    ResearchError,
    ResearchRequest,
    Researcher,
)

CONFIG = ResearchConfig(settle_seconds=0)


def request(**kw):
    return ResearchRequest(**{"url": "app.acme.dev", "secrets": {"password": "hunter2-S3cret"}, **kw})


# -- request & playbook ------------------------------------------------------------


def test_request_from_dict_normalises_url_and_secret_list():
    req = ResearchRequest.from_dict(
        {"url": "acme.dev", "secrets": [{"name": "password", "value": "x"}, {"name": "empty", "value": ""}], "bogus": 1}
    )
    assert req.url == "https://acme.dev"
    assert req.secrets == {"password": "x"}
    with pytest.raises(ValueError):
        ResearchRequest.from_dict({})
    with pytest.raises(ValueError):
        ResearchRequest(url="ftp://acme.dev")


def test_playbook_round_trip_and_rendering():
    pb = Playbook.from_dict(PLAYBOOK)
    assert Playbook.from_dict(pb.to_dict()) == pb
    goal = pb.render_goal()
    assert goal.startswith("Show how a marketing manager")
    assert "1. Overview dashboard - See performance at a glance" in goal
    assert "Avoid: Deleting dashboards." in goal
    knowledge = pb.render_knowledge()
    assert "Where: Sidebar > Home" in knowledge
    assert "type_secret` with: password" in knowledge
    assert "Q: Is there an API?" in knowledge


def test_playbook_tolerates_partial_data_and_redacts_secrets():
    pb = Playbook.from_dict({"goal": "Type hunter2-S3cret into the box", "sections": [{"title": "A", "objective": "B"}]})
    assert pb.duration_minutes == 15
    assert "hunter2" not in json.dumps(pb.redact({"password": "hunter2-S3cret"}).to_dict())


# -- docs phase --------------------------------------------------------------------


async def test_docs_phase_uses_web_tools_resumes_pause_turn_and_collects_sources():
    fetched = SimpleNamespace(type="web_fetch_tool_result", content=SimpleNamespace(url="https://docs.acme.dev/start"))
    client = FakeClient(
        [
            message([text("Searching..."), fetched], stop="pause_turn"),
            message([fetched, text("## Product overview\nAcme does analytics.")]),
        ]
    )
    digest = await DocsResearcher(request(docs_urls=["docs.acme.dev"]), client=client, config=CONFIG).research()
    assert "Acme does analytics" in digest.notes
    assert digest.sources == ["https://docs.acme.dev/start"]
    first, second = client.requests
    assert {t["type"] for t in first["tools"]} == {"web_search_20260209", "web_fetch_20260209"}
    assert "https://docs.acme.dev" in first["messages"][0]["content"][0]["text"]
    assert first["fallbacks"] == "default"
    # Continuation re-sends the paused assistant turn without a new user message.
    assert second["messages"][-1]["role"] == "assistant"


# -- exploration phase -------------------------------------------------------------


async def test_explorer_logs_in_takes_notes_and_never_leaks_secrets():
    client = FakeClient(
        [
            message(
                [
                    tool_use("t1", "left_click", {"coordinate": [100, 200]}, toolset="computer"),
                    tool_use("t2", "type_secret", {"name": "password", "press_enter": True}),
                ],
                "tool_use",
            ),
            message(
                [
                    tool_use("t3", "note", {"category": "navigation", "title": "Reports", "detail": "Lists reports", "location": "Sidebar > Reports"}),
                    tool_use("t4", "note", {"category": "bogus", "title": "Export", "detail": "CSV export"}),
                    tool_use("t5", "finish_exploration", {"summary": "Covered reports."}),
                ],
                "tool_use",
            ),
        ]
    )
    computer = FakeComputer()
    events = []
    result = await AppExplorer(request(), computer, client=client, config=CONFIG, on_event=lambda k, d: events.append((k, d))).explore("docs say: reports")

    assert computer.actions[0] == {"type": "click", "button": "left", "count": 1, "x": 100.0, "y": 200.0}
    assert computer.actions[1] == {"type": "type", "text": "hunter2-S3cret", "typos": False}
    assert [o.title for o in result.observations] == ["Reports", "Export"]
    assert result.observations[1].category == "feature"
    assert result.summary == "Covered reports."
    assert "Sidebar > Reports" in result.render()
    assert any(d.get("message") == "Learned: Reports" for _, d in events)

    sent = json.dumps(client.requests)
    assert "hunter2" not in sent
    first = client.requests[0]
    assert any(t.get("name") == "type_secret" for t in first["tools"])
    assert "context-management-2025-06-27" in first["betas"]
    assert "docs say: reports" in first["messages"][0]["content"][0]["text"]
    # A fresh screenshot is attached after the screen changed.
    results = client.requests[1]["messages"][-1]["content"]
    assert results[0]["toolset_name"] == "computer"
    assert results[-1]["content"][-1]["type"] == "image"


async def test_explorer_reports_tool_errors_and_stops_when_idle():
    client = FakeClient(
        [
            message([tool_use("t1", "type_secret", {"name": "nope"})], "tool_use"),
            message([text("thinking")]),
            message([text("still thinking")]),
            message([text("done?")]),
        ]
    )
    result = await AppExplorer(request(), FakeComputer(), client=client, config=CONFIG).explore()
    err = client.requests[1]["messages"][-1]["content"][0]
    assert err["is_error"] and "No secret named" in err["content"]
    assert result.observations == []
    assert len(client.requests) == 4


# -- writer ------------------------------------------------------------------------


async def test_writer_uses_structured_output_merges_sources_and_redacts():
    leaky = {**PLAYBOOK, "opening": "Password is hunter2-S3cret"}
    client = FakeClient([playbook_message(leaky)])
    from onboard_researcher import DocsDigest

    pb = await PlaybookWriter(client=client, config=CONFIG).write(
        request(), docs=DocsDigest("notes", ["https://acme.dev/pricing"])
    )
    assert "hunter2" not in json.dumps(pb.to_dict())
    assert pb.sources == ["https://docs.acme.dev/start", "https://acme.dev/pricing"]
    fmt = client.requests[0]["output_config"]["format"]
    assert fmt["type"] == "json_schema" and fmt["schema"]["additionalProperties"] is False


async def test_writer_refuses_to_write_from_nothing_and_refines():
    writer = PlaybookWriter(client=FakeClient([playbook_message({**PLAYBOOK, "duration_minutes": 5})]), config=CONFIG)
    with pytest.raises(ResearchError):
        await writer.write(request())
    refined = await writer.refine(request(), Playbook.from_dict(PLAYBOOK), "Make it five minutes")
    assert refined.duration_minutes == 5
    prompt = writer.client.requests[0]["messages"][0]["content"][0]["text"]
    assert "Make it five minutes" in prompt and "Acme Analytics" in prompt


# -- pipeline ----------------------------------------------------------------------


async def test_pipeline_runs_all_phases_in_a_leased_sandbox():
    client = FakeClient(
        [
            message([text("## Product overview\nAcme.")]),
            message([tool_use("t1", "finish_exploration", {"summary": "ok"})], "tool_use"),
            playbook_message(),
        ]
    )
    provider = FakeProvider()
    events = []
    result = await Researcher(
        request(), client=client, config=CONFIG, provider=provider, on_event=lambda k, d: events.append((k, d)), session_id="j1"
    ).run()
    assert provider.acquired == [("j1-explore", "https://app.acme.dev")]
    assert provider.lease.released and provider.computer.closed
    assert result.warnings == []
    draft = result.draft()
    assert set(draft) == {"goal", "knowledge", "playbook"}
    phases = [d["phase"] for k, d in events if k == "status"]
    assert phases == ["docs", "explore", "write"]


async def test_pipeline_degrades_when_docs_fail_and_no_sandbox():
    client = FakeClient([RuntimeError("search down"), playbook_message()])
    with pytest.raises(ResearchError):
        # Nothing learned at all -> cannot write.
        await Researcher(request(), client=client, config=CONFIG).run()

    client = FakeClient([message([text("notes")]), playbook_message()])
    result = await Researcher(request(), client=client, config=CONFIG, provider=None).run()
    assert result.warnings == ["No sandbox is configured, so the app was not explored."]
    assert result.playbook.product_name == "Acme Analytics"
