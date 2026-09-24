import pytest
from livekit.agents import StopResponse, llm

from onboard_agent.voice import PresenterAgent


class Recorder:
    def __init__(self):
        self.heard = []

    def hear(self, text):
        self.heard.append(text)


async def test_user_turns_go_to_the_director_not_an_llm():
    agent = PresenterAgent()
    msg = llm.ChatMessage(role="user", content=["How does billing work?"])
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(llm.ChatContext(), msg)
    director = Recorder()
    agent.attach(director)  # early speech is replayed
    assert director.heard == ["How does billing work?"]
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(llm.ChatContext(), llm.ChatMessage(role="user", content=["ok"]))
    assert director.heard[-1] == "ok"
