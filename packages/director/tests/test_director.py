import asyncio
import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image

from onboard_director import DemoBrief, Director, DirectorConfig, is_backchannel, normalize_start_url
from onboard_director.tools import computer_action
from onboard_director.whiteboard import sketch_actions


# -- fakes ---------------------------------------------------------------------------


def tool_use(id, name, input, toolset=None):
    return SimpleNamespace(type="tool_use", id=id, name=name, input=input, toolset_name=toolset)


def text(t):
    return SimpleNamespace(type="text", text=t)


class FakeStream:
    def __init__(self, message, delay=0.0):
        self.message = message
        self.delay = delay

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        return self._events()

    async def _events(self):
        for block in self.message.content:
            await asyncio.sleep(self.delay)
            yield SimpleNamespace(type="content_block_stop", content_block=block)

    async def get_final_message(self):
        return self.message


class FakeClient:
    """Replays scripted assistant turns and records requests."""

    def __init__(self, turns, delay=0.0):
        self.turns = list(turns)
        self.requests = []
        self.delay = delay
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        # Portable (non-Claude) backends use the plain surface.
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **params):
        self.requests.append(json.loads(json.dumps(params, default=lambda o: o.__dict__)))
        content, stop = self.turns.pop(0)
        return FakeStream(SimpleNamespace(content=content, stop_reason=stop, stop_details=None), self.delay)


class FakeComputer:
    def __init__(self):
        self.actions = []
        self.interrupted = False
        buf = io.BytesIO()
        Image.new("RGB", (1280, 800), "white").save(buf, "JPEG")
        self.jpeg = buf.getvalue()

    async def health(self):
        return {"ok": True, "size": [1280, 800], "cursor": [10, 20]}

    async def screenshot(self, *, fmt="png", cursor=False, quality=85):
        return self.jpeg

    async def act(self, *actions):
        self.actions += actions
        await asyncio.sleep(0.01)
        return [{"type": a["type"], "cursor": [0, 0]} for a in actions]

    async def interrupt(self):
        self.interrupted = True

    async def pause(self):
        pass

    async def resume(self):
        pass

    async def presence(self, **kwargs):
        pass


class FakeNarrator:
    def __init__(self):
        self.said = []

    def say(self, text):
        self.said.append(text)

        class Done:
            async def wait(self):
                return True

        return Done()


def make(turns, brief=None, delay=0.0):
    brief = brief or DemoBrief(goal="Show the dashboard", start_url="https://app.example.com", audience_name="Sam")
    client = FakeClient(turns, delay)
    computer = FakeComputer()
    narrator = FakeNarrator()
    director = Director(brief, computer, narrator, client=client, config=DirectorConfig(settle_seconds=0))
    return director, client, computer, narrator


# -- tests ---------------------------------------------------------------------------


async def test_presents_and_ends():
    director, client, computer, narrator = make(
        [
            (
                [
                    text("plan: greet then open reports"),
                    tool_use("t1", "say", {"text": "Hi Sam! Let me show you around."}),
                    tool_use("t2", "left_click", {"coordinate": [100, 200]}, toolset="computer"),
                    tool_use("t3", "point_at", {"box": [90, 190, 40, 20], "text": "These are your reports."}),
                ],
                "tool_use",
            ),
            ([tool_use("t4", "end_demo", {"summary": "Showed reports."})], "tool_use"),
        ]
    )
    summary = await director.run()
    assert summary == "Showed reports."
    assert narrator.said == ["Hi Sam! Let me show you around.", "These are your reports."]
    assert computer.actions[0] == {"type": "click", "button": "left", "count": 1, "x": 100.0, "y": 200.0}
    assert computer.actions[1]["type"] == "gesture"

    first = client.requests[0]
    assert first["tools"][0] == {"type": "computer_toolset_20260801"}
    assert "context-management-2025-06-27" in first["betas"]
    assert first["fallbacks"] == "default"
    assert first["model"] == "claude-opus-5-5"
    assert first["thinking"]["type"] == "adaptive"
    assert "tool_choice" not in first  # forced tool use is rejected on Opus 5.5

    # Second request carries tool results, with toolset_name echoed for computer calls
    # and a fresh screenshot attached after the screen changed.
    results = client.requests[1]["messages"][-1]["content"]
    by_id = {r["tool_use_id"]: r for r in results if r.get("type") == "tool_result"}
    assert by_id["t2"]["toolset_name"] == "computer"
    assert "toolset_name" not in by_id["t1"]
    assert by_id["t3"]["content"][-1]["type"] == "image"


async def test_customer_interruption_skips_remaining_actions():
    director, client, computer, narrator = make(
        [
            (
                [
                    tool_use("t1", "say", {"text": "Now let's look at billing."}),
                    tool_use("t2", "wait", {"duration": 1}, toolset="computer"),
                    tool_use("t3", "left_click", {"coordinate": [5, 5]}, toolset="computer"),
                ],
                "tool_use",
            ),
            ([tool_use("t4", "end_demo", {"summary": "x"})], "tool_use"),
        ],
        delay=0.05,
    )

    async def interrupt():
        await asyncio.sleep(0.03)
        director.hear("Wait, can it export to CSV?")

    asyncio.create_task(interrupt())
    await director.run()
    assert computer.interrupted
    assert not any(a.get("type") == "click" for a in computer.actions)
    followup = client.requests[1]["messages"][-1]["content"]
    assert followup[-1] == {"type": "text", "text": "[Customer] Wait, can it export to CSV?"}
    skipped = [r for r in followup if r.get("tool_use_id") == "t3"][0]
    assert "customer started talking" in skipped["content"]


async def test_backchannel_does_not_interrupt():
    director, *_ , computer, _ = make([([tool_use("t1", "end_demo", {"summary": "x"})], "tool_use")])
    director.hear("mhm")
    assert not computer.interrupted


async def test_secrets_are_typed_but_never_sent_to_the_model():
    brief = DemoBrief(goal="Log in and show projects", secrets={"password": "hunter2-S3cret"})
    director, client, computer, _ = make(
        [
            ([tool_use("t1", "type_secret", {"name": "password", "press_enter": True})], "tool_use"),
            ([tool_use("t2", "end_demo", {"summary": "x"})], "tool_use"),
        ],
        brief=brief,
    )
    await director.run()
    assert computer.actions[0] == {"type": "type", "text": "hunter2-S3cret", "typos": False}
    assert "hunter2" not in json.dumps(client.requests)
    assert "password" in client.requests[0]["system"][0]["text"]


async def test_end_turn_without_tools_listens_to_audience():
    director, client, *_ = make(
        [
            ([text("waiting for their answer")], "end_turn"),
            ([tool_use("t1", "end_demo", {"summary": "x"})], "tool_use"),
        ]
    )

    async def answer():
        await asyncio.sleep(0.1)
        director.hear("Yes please show me the API")

    asyncio.create_task(answer())
    await director.run()
    content = client.requests[1]["messages"][-1]["content"]
    assert content[0]["text"] == "[Customer] Yes please show me the API"


async def test_refusal_retries_then_stops():
    director, client, _, narrator = make([([], "refusal"), ([], "refusal")])
    await director.run()
    assert len(client.requests) == 2
    assert narrator.said and "stop here" in narrator.said[-1]


def test_backchannel_detection():
    assert is_backchannel("Okay.")
    assert is_backchannel("mhm")
    assert not is_backchannel("Okay, but how do I invite my team?")


@pytest.mark.parametrize(
    "mode,url,expected",
    [
        (
            "presentation",
            "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing",
            "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/present",
        ),
        (
            "presentation",
            "https://example.com/decks/q3.pptx",
            "https://view.officeapps.live.com/op/view.aspx?src=https%3A%2F%2Fexample.com%2Fdecks%2Fq3.pptx",
        ),
        ("presentation", "https://example.com/deck.pdf", "https://example.com/deck.pdf"),
        ("product_demo", "app.example.com", "https://app.example.com"),
        ("product_demo", None, None),
    ],
)
def test_normalize_start_url(mode, url, expected):
    assert normalize_start_url(mode, url) == expected


def test_brief_from_dict_accepts_secret_list():
    brief = DemoBrief.from_dict(
        {"goal": "g", "mode": "presentation", "secrets": [{"name": "pw", "value": "x"}], "unknown": 1}
    )
    assert brief.secrets == {"pw": "x"}
    with pytest.raises(ValueError):
        DemoBrief.from_dict({"goal": ""})


def test_computer_action_scaling():
    assert computer_action("double_click", {"coordinate": [50, 40]}, scale=0.5) == {
        "type": "click", "button": "left", "count": 2, "x": 100.0, "y": 80.0,
    }
    assert computer_action("scroll", {"scroll_direction": "up", "scroll_amount": 4}) == {
        "type": "scroll", "direction": "up", "amount": 4,
    }
    assert computer_action("screenshot", {}) is None


def test_sketch_uses_excalidraw_shortcuts_and_drags():
    actions = sketch_actions([
        {"kind": "rectangle", "x": 100, "y": 100, "width": 200, "height": 80, "label": "API"},
        {"kind": "arrow", "x": 300, "y": 140, "to": [450, 140]},
    ])
    keys = [a["keys"] for a in actions if a["type"] == "key"]
    assert keys[:3] == ["Escape", "r", "Return"]
    assert "a" in keys
    drags = [a for a in actions if a["type"] == "drag"]
    assert drags[0] == {"type": "drag", "start": [100.0, 100.0], "end": [300.0, 180.0]}
    assert any(a.get("text") == "API" for a in actions)


async def test_time_limit_still_says_goodbye():
    brief = DemoBrief(goal="Show the dashboard", max_minutes=-5)  # already past the hard limit
    director, client, _, narrator = make([], brief=brief)
    await director.run()
    assert client.requests == []
    assert "out of time" in narrator.said[-1]


def test_end_demo_is_described_as_hanging_up():
    from onboard_director.prompts import system_prompt
    from onboard_director.tools import END_DEMO

    assert "Hang up" in END_DEMO["description"]
    assert "hangs up the call for everyone" in system_prompt(DemoBrief(goal="g"))


def test_preparation_notes_reach_the_system_prompt():
    from onboard_director.prompts import system_prompt

    brief = DemoBrief.from_dict({"goal": "g", "knowledge": "Reports live under Insights > Reports."})
    assert "Insights > Reports" in system_prompt(brief)
    assert "preparation_notes" not in system_prompt(DemoBrief(goal="g"))


# -- portable backends (Anthropic-compatible providers) ----------------------------

from onboard_director.backend import ModelBackend, hoist_images, portable_params, prune_images
from onboard_director.tools import as_computer_call, portable_computer_tool


def test_portable_tool_mirrors_the_toolset_and_maps_to_the_same_actions():
    tool = portable_computer_tool(1280, 800)
    assert tool["name"] == "computer" and "1280x800" in tool["description"]
    assert "left_click" in tool["input_schema"]["properties"]["action"]["enum"]
    portable = tool_use("p", "computer", {"action": "double_click", "coordinate": [50, 40]})
    native = tool_use("n", "double_click", {"coordinate": [50, 40]}, toolset="computer")
    assert as_computer_call(portable)[0] == as_computer_call(native)[0] == "double_click"
    assert computer_action(*as_computer_call(portable)) == computer_action(*as_computer_call(native))
    assert as_computer_call(tool_use("s", "say", {"text": "hi"})) is None


def test_portable_params_strip_claude_only_fields():
    params = {
        "model": "m", "max_tokens": 10, "messages": [], "betas": ["x"], "thinking": {"type": "adaptive"},
        "output_config": {"effort": "low"}, "context_management": {}, "fallbacks": "default",
        "cache_control": {"type": "ephemeral"},
        "system": [{"type": "text", "text": "sys", "cache_control": {"type": "ephemeral"}}],
        "tools": [{"name": "say", "description": "d", "input_schema": {}, "eager_input_streaming": True}],
    }
    out = portable_params(params)
    assert out == {"model": "m", "max_tokens": 10, "messages": [], "system": "sys",
                   "tools": [{"name": "say", "description": "d", "input_schema": {}}]}
    with pytest.raises(ValueError):
        portable_params({"tools": [{"type": "computer_toolset_20260801"}]})


def test_prune_and_hoist_images():
    img = {"type": "image", "source": {}}
    messages = [
        {"role": "user", "content": [img, {"type": "text", "text": "a"}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "1", "content": [img]}]},
        {"role": "user", "content": [img]},
    ]
    prune_images(messages, keep=2)
    assert messages[0]["content"][0]["type"] == "text"
    assert messages[1]["content"][0]["content"][0] == img and messages[2]["content"][0] == img

    hoisted = hoist_images([
        {"type": "tool_result", "tool_use_id": "1", "content": [{"type": "text", "text": "OK"}, img]},
        {"type": "tool_result", "tool_use_id": "2", "content": "Spoken."},
    ])
    assert [b["type"] for b in hoisted] == ["tool_result", "tool_result", "text", "image"]
    assert hoisted[0]["content"] == [{"type": "text", "text": "OK"}]


def test_backend_detection_from_env(monkeypatch):
    assert ModelBackend("claude-opus-5").is_native
    assert not ModelBackend("claude-opus-5", base_url="https://proxy.example").is_native
    monkeypatch.setenv("X_MODEL", "deepseek-v4.1-flash")
    monkeypatch.setenv("X_BASE_URL", "https://api.example.com")
    backend = ModelBackend.from_env("X", default_model="claude-opus-5")
    assert backend.model == "deepseek-v4.1-flash" and not backend.is_native
    monkeypatch.setenv("X_NATIVE", "1")
    assert ModelBackend.from_env("X", default_model="m").is_native


async def test_director_presents_on_a_portable_backend():
    brief = DemoBrief(goal="Show the dashboard", start_url="https://app.example.com", audience_name="Sam")
    client = FakeClient(
        [
            (
                [
                    tool_use("t1", "say", {"text": "Hi Sam!"}),
                    tool_use("t2", "computer", {"action": "left_click", "coordinate": [100, 200]}),
                ],
                "tool_use",
            ),
            ([tool_use("t3", "end_demo", {"summary": "done"})], "tool_use"),
        ]
    )
    computer, narrator = FakeComputer(), FakeNarrator()
    config = DirectorConfig(model="deepseek-v4.1-flash", settle_seconds=0)
    director = Director(brief, computer, narrator, client=client, config=config)
    assert await director.run() == "done"
    assert computer.actions[0] == {"type": "click", "button": "left", "count": 1, "x": 100.0, "y": 200.0}

    first = client.requests[0]
    for key in ("betas", "thinking", "output_config", "context_management", "fallbacks"):
        assert key not in first
    assert isinstance(first["system"], str)
    assert first["tools"][0]["name"] == "computer" and "type" not in first["tools"][0]
    # The screenshot taken after acting travels as top-level content, not inside the tool result.
    followup = client.requests[1]["messages"][-1]["content"]
    inner = [c for b in followup if b["type"] == "tool_result" and isinstance(b["content"], list) for c in b["content"]]
    assert all(c["type"] != "image" for c in inner)
    assert followup[-1]["type"] == "image"
