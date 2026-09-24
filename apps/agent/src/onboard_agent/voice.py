"""Voice plumbing: LiveKit speech as the director's narrator, and the
audience's words routed to the director instead of a chat LLM.
"""

from __future__ import annotations

import logging

from livekit.agents import Agent, AgentSession, StopResponse, llm
from livekit.agents.voice import SpeechHandle
from onboard_director import Director

logger = logging.getLogger("onboard.agent.voice")


class _Speech:
    def __init__(self, handle: SpeechHandle) -> None:
        self.handle = handle

    async def wait(self) -> bool:
        await self.handle.wait_for_playout()
        return not self.handle.interrupted


class LiveKitNarrator:
    """Speaks through the session's TTS; the audience can barge in."""

    def __init__(self, session: AgentSession) -> None:
        self.session = session

    def say(self, text: str) -> _Speech:
        return _Speech(self.session.say(text, allow_interruptions=True))


class PresenterAgent(Agent):
    """A voice agent with no chat model of its own: every user turn goes to the director."""

    def __init__(self) -> None:
        super().__init__(instructions="You are a live presenter. Replies are produced by the demo director.")
        self.director: Director | None = None
        self._early: list[str] = []

    def attach(self, director: Director) -> None:
        self.director = director
        for text in self._early:
            director.hear(text)
        self._early.clear()

    async def on_user_turn_completed(self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage) -> None:
        text = new_message.text_content or ""
        if self.director:
            self.director.hear(text)
        elif text.strip():
            self._early.append(text)
        raise StopResponse()
