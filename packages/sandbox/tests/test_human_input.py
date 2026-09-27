import asyncio

import pytest
from onboard_humanize import Humanizer

from onboard_sandbox.human_input import HumanInput, Interrupted


class FakeBackend:
    def __init__(self):
        self.pos = (0, 0)
        self.events: list[tuple] = []

    def position(self):
        return self.pos

    def move(self, x, y):
        self.pos = (x, y)
        self.events.append(("move", x, y))

    def button(self, button, down):
        self.events.append(("button", button, down))

    def combo_down(self, combo):
        self.events.append(("down", combo))
        return [combo]

    def combo_up(self, pressed):
        self.events.append(("up", pressed[0]))


def fast_humanizer():
    return Humanizer(seed=1, mouse_speed=20, wpm=5000, typo_rate=0)


async def test_click_moves_then_presses():
    backend = FakeBackend()
    human = HumanInput(backend, (1280, 800), fast_humanizer())
    await human.run([{"type": "click", "x": 500, "y": 300}])
    assert backend.pos == (500, 300)
    buttons = [e for e in backend.events if e[0] == "button"]
    assert buttons == [("button", 1, True), ("button", 1, False)]
    assert len([e for e in backend.events if e[0] == "move"]) > 3


async def test_type_sends_each_character():
    backend = FakeBackend()
    human = HumanInput(backend, (1280, 800), fast_humanizer())
    await human.run([{"type": "type", "text": "a +b"}])
    downs = [e[1] for e in backend.events if e[0] == "down"]
    assert downs == ["a", "space", "plus", "b"]


async def test_coordinates_are_clamped_to_screen():
    backend = FakeBackend()
    human = HumanInput(backend, (100, 100), fast_humanizer())
    await human.run([{"type": "move", "x": 5000, "y": -20}])
    assert backend.pos == (99, 0)


async def test_interrupt_stops_sequence():
    backend = FakeBackend()
    human = HumanInput(backend, (1280, 800), Humanizer(seed=2))

    async def stop_soon():
        await asyncio.sleep(0.05)
        human.interrupt()

    asyncio.create_task(stop_soon())
    with pytest.raises(Interrupted):
        await human.run([{"type": "wait", "seconds": 5}, {"type": "click", "x": 10, "y": 10}])
    assert not [e for e in backend.events if e[0] == "button"]


async def test_unknown_action_is_rejected():
    human = HumanInput(FakeBackend(), (1280, 800), fast_humanizer())
    with pytest.raises(ValueError):
        await human.run([{"type": "teleport"}])


async def test_drag_holds_button_during_motion():
    backend = FakeBackend()
    human = HumanInput(backend, (1280, 800), fast_humanizer())
    await human.run([{"type": "drag", "start": [100, 100], "end": [400, 300]}])
    down = backend.events.index(("button", 1, True))
    up = backend.events.index(("button", 1, False))
    assert any(e[0] == "move" for e in backend.events[down:up])
    assert backend.pos == (400, 300)
