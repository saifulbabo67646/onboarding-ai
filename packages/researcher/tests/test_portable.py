"""The researcher on a non-Claude, Anthropic-compatible backend."""

import json

import pytest
from fakes import PLAYBOOK, FakeClient, FakeComputer, message, text, tool_use

from onboard_researcher import AppExplorer, DocsResearcher, PlaybookWriter, ResearchConfig, ResearchError, ResearchRequest
from onboard_researcher import docs as docs_module
from onboard_researcher.fetch import FetchError, Page, _TextExtractor, assert_public

PORTABLE = ResearchConfig(model="deepseek-v4.1-flash", base_url="https://api.example.com", settle_seconds=0)


def request(**kw):
    return ResearchRequest(**{"url": "app.acme.dev", "secrets": {"password": "hunter2-S3cret"}, **kw})


def assert_portable(params):
    for key in ("betas", "thinking", "output_config", "context_management", "fallbacks"):
        assert key not in params
    assert all("type" not in t for t in params.get("tools", []))


def test_config_reads_backend_from_env(monkeypatch):
    monkeypatch.setenv("RESEARCHER_MODEL", "glm-5.3-flash")
    monkeypatch.setenv("RESEARCHER_BASE_URL", "https://api.example.com")
    monkeypatch.setenv("RESEARCHER_API_KEY", "k")
    config = ResearchConfig.from_env()
    assert (config.model, config.base_url, config.api_key, config.is_native) == (
        "glm-5.3-flash", "https://api.example.com", "k", False,
    )
    assert ResearchConfig().is_native


async def test_explorer_drives_the_sandbox_with_the_portable_tool():
    client = FakeClient(
        [
            message(
                [
                    tool_use("t1", "computer", {"action": "left_click", "coordinate": [100, 200]}),
                    tool_use("t2", "type_secret", {"name": "password"}),
                ],
                "tool_use",
            ),
            message([tool_use("t3", "finish_exploration", {"summary": "ok"})], "tool_use"),
        ]
    )
    computer = FakeComputer()
    await AppExplorer(request(), computer, client=client, config=PORTABLE).explore()
    assert computer.actions[0]["type"] == "click"
    assert computer.actions[1]["text"] == "hunter2-S3cret"
    first = client.requests[0]
    assert_portable(first)
    assert first["tools"][0]["name"] == "computer"
    assert "hunter2" not in json.dumps(client.requests)
    assert client.requests[1]["messages"][-1]["content"][-1]["type"] == "image"


async def test_writer_parses_json_from_text_and_retries_once():
    fenced = "Here you go:\n```json\n" + json.dumps(PLAYBOOK) + "\n```"
    client = FakeClient([message([text("not json at all")]), message([text(fenced)])])
    pb = await PlaybookWriter(client=client, config=PORTABLE).refine(
        request(), __import__("onboard_researcher").Playbook.from_dict(PLAYBOOK), "shorter"
    )
    assert pb.product_name == "Acme Analytics"
    assert len(client.requests) == 2
    assert_portable(client.requests[0])
    assert "JSON schema" in client.requests[0]["messages"][0]["content"][-1]["text"]
    assert "not valid JSON" in client.requests[1]["messages"][-1]["content"]

    with pytest.raises(ResearchError):
        await PlaybookWriter(client=FakeClient([message([text("nope")])] * 2), config=PORTABLE).refine(
            request(), __import__("onboard_researcher").Playbook.from_dict(PLAYBOOK), "x"
        )


async def test_docs_read_pages_with_the_client_side_fetch_tool(monkeypatch):
    fetched = []

    async def fake_fetch(url, **kw):
        fetched.append(url)
        if "private" in url:
            raise FetchError("not public")
        return Page(url, "Docs", "Acme reports explained", ["https://docs.acme.dev/reports"])

    monkeypatch.setattr(docs_module, "fetch_page", fake_fetch)
    client = FakeClient(
        [
            message(
                [
                    tool_use("f1", "fetch_page", {"url": "https://docs.acme.dev"}),
                    tool_use("f2", "fetch_page", {"url": "http://private.local"}),
                ],
                "tool_use",
            ),
            message([text("## Product overview\nAcme does reports.")]),
        ]
    )
    digest = await DocsResearcher(request(), client=client, config=PORTABLE).research()
    assert digest.notes.startswith("## Product overview")
    assert digest.sources == ["https://docs.acme.dev"]
    assert_portable(client.requests[0])
    assert client.requests[0]["tools"][0]["name"] == "fetch_page"
    results = client.requests[1]["messages"][-1]["content"]
    assert "Acme reports explained" in results[0]["content"] and results[1]["is_error"]


@pytest.mark.parametrize("url", ["http://127.0.0.1:3000", "http://10.0.0.5/x", "http://169.254.169.254/latest", "ftp://x.dev"])
async def test_fetch_refuses_non_public_addresses(url):
    with pytest.raises(FetchError):
        await assert_public(url)


def test_html_is_reduced_to_text_and_links():
    parser = _TextExtractor("https://acme.dev/docs/")
    parser.feed(
        "<html><head><title>Acme Docs</title><style>x{}</style></head><body><h1>Reports</h1>"
        "<script>evil()</script><p>Build a report.</p><a href='/pricing#top'>Pricing</a>"
        "<a href='mailto:a@b'>mail</a></body></html>"
    )
    assert parser.title == "Acme Docs"
    assert "# Reports" in parser.text() and "Build a report." in parser.text() and "evil" not in parser.text()
    assert parser.links == ["https://acme.dev/pricing"]


def _rejected(status=400, code="request_rejected"):
    import anthropic

    # Built without __init__: the SDK's HTTP response type differs between versions.
    cls = anthropic.BadRequestError if status == 400 else anthropic.InternalServerError
    error = cls.__new__(cls)
    Exception.__init__(error, f"Error code: {status} - {{'error': {{'code': '{code}'}}}}")
    return error


async def test_transient_gateway_errors_are_retried(monkeypatch):
    from onboard_researcher import llm

    monkeypatch.setattr(llm, "RETRY_DELAY", 0)
    client = FakeClient([_rejected(), _rejected(500), message([text("ok")])])
    msg = await llm.stream_message(client, {"model": "m", "max_tokens": 10, "messages": []}, native=False)
    assert msg.content[0].text == "ok"
    assert len(client.requests) == 3


async def test_real_bad_requests_are_not_retried(monkeypatch):
    import anthropic

    from onboard_researcher import llm

    monkeypatch.setattr(llm, "RETRY_DELAY", 0)
    client = FakeClient([_rejected(code="invalid_param"), message([text("never")])])
    with pytest.raises(anthropic.BadRequestError):
        await llm.stream_message(client, {"model": "m", "max_tokens": 10, "messages": []}, native=False)
    # On Anthropic's own API a 400 is always a real error.
    client = FakeClient([_rejected(), message([text("never")])])
    with pytest.raises(anthropic.BadRequestError):
        await llm.stream_message(client, {"model": "m", "max_tokens": 10, "messages": []}, native=True)
