"""Scripted stand-ins for the Anthropic client and the sandbox."""

from __future__ import annotations

import asyncio
import io
import json
from types import SimpleNamespace
from typing import Any

from PIL import Image


def tool_use(id, name, input, toolset=None):
    return SimpleNamespace(type="tool_use", id=id, name=name, input=input, toolset_name=toolset)


def text(t):
    return SimpleNamespace(type="text", text=t)


def message(content, stop="end_turn"):
    return SimpleNamespace(content=content, stop_reason=stop, stop_details=None)


class _Stream:
    def __init__(self, msg):
        self.msg = msg

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get_final_message(self):
        return self.msg


class FakeClient:
    """Replays scripted responses in order and records every request."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests: list[dict[str, Any]] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        # Portable (non-Claude) backends use the plain surface.
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **params):
        self.requests.append(json.loads(json.dumps(params, default=lambda o: o.__dict__)))
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return _Stream(item)


class FakeComputer:
    def __init__(self):
        self.actions: list[dict[str, Any]] = []
        self.closed = False
        buf = io.BytesIO()
        Image.new("RGB", (1280, 800), "white").save(buf, "JPEG")
        self.jpeg = buf.getvalue()

    async def health(self):
        return {"ok": True, "size": [1280, 800], "cursor": [10, 20]}

    async def screenshot(self, *, fmt="png", cursor=False, quality=85):
        return self.jpeg

    async def act(self, *actions):
        self.actions += actions
        await asyncio.sleep(0)
        return [{"type": a["type"]} for a in actions]

    async def interrupt(self):
        pass

    async def pause(self):
        pass

    async def resume(self):
        pass

    async def presence(self, **kwargs):
        pass

    async def close(self):
        self.closed = True


class FakeLease:
    def __init__(self, computer):
        self.computer = computer
        self.released = False

    def client(self):
        return self.computer

    async def release(self):
        self.released = True


class FakeProvider:
    def __init__(self):
        self.computer = FakeComputer()
        self.lease = FakeLease(self.computer)
        self.acquired: list[tuple[str, str | None]] = []

    async def acquire(self, session_id, *, start_url=None):
        self.acquired.append((session_id, start_url))
        return self.lease


PLAYBOOK = {
    "product_name": "Acme Analytics",
    "product_summary": "Dashboards for marketing teams.",
    "audience": "Marketing managers",
    "demo_title": "Acme in 10 minutes",
    "goal": "Show how a marketing manager finds which campaigns pay off.",
    "duration_minutes": 10,
    "opening": "Let's find your best campaign in two minutes.",
    "sections": [
        {
            "title": "Overview dashboard",
            "objective": "See performance at a glance",
            "where": "Sidebar > Home",
            "steps": ["Open Home", "Hover the revenue chart"],
            "talking_points": ["Everything updates hourly"],
        }
    ],
    "login": {"required": True, "steps": ["Enter email", "Enter password"], "secret_names": ["password"]},
    "faq": [{"question": "Is there an API?", "answer": "Yes, REST."}],
    "glossary": [{"term": "Workspace", "meaning": "A team's shared space"}],
    "avoid": ["Deleting dashboards"],
    "sources": ["https://docs.acme.dev/start"],
}


def playbook_message(data=None):
    return message([text(json.dumps(data or PLAYBOOK))])
