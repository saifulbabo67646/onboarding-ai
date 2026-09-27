"""onboard-humanize: human-like mouse, keyboard and gesture models.

Pure Python, no dependencies. The models only *plan* input (positions,
keystrokes and delays); executing them is up to an input backend such as
``onboard_sandbox``.

>>> from onboard_humanize import Humanizer
>>> h = Humanizer(seed=7)
>>> steps = h.mouse.path((0, 0), (640, 400))
>>> steps[-1].x, steps[-1].y
(640, 400)
"""

from __future__ import annotations

import random

from .gestures import Box, GestureKind, GestureModel
from .mouse import MouseModel, MouseStep
from .timing import ClickTiming, click_timing, scroll_plan
from .typing import BACKSPACE, KeyStroke, TypingModel, neighbor_key

__all__ = [
    "BACKSPACE",
    "Box",
    "ClickTiming",
    "GestureKind",
    "GestureModel",
    "Humanizer",
    "KeyStroke",
    "MouseModel",
    "MouseStep",
    "TypingModel",
    "click_timing",
    "neighbor_key",
    "scroll_plan",
]


class Humanizer:
    """Facade that shares one random source across all models.

    Args:
        seed: Optional seed for reproducible behaviour.
        mouse_speed: Pointer speed multiplier (1.0 = relaxed presenter).
        wpm: Typing speed in words per minute.
        typo_rate: Probability of a corrected typo per letter.
    """

    def __init__(
        self,
        seed: int | None = None,
        *,
        mouse_speed: float = 1.0,
        wpm: float = 70.0,
        typo_rate: float = 0.015,
    ) -> None:
        self.rng = random.Random(seed)
        self.mouse = MouseModel(self.rng, speed=mouse_speed)
        self.gestures = GestureModel(self.mouse, self.rng)
        self.typing = TypingModel(self.rng, wpm=wpm, typo_rate=typo_rate)

    def click_timing(self) -> ClickTiming:
        return click_timing(self.rng)

    def scroll_plan(self, clicks: int) -> list[float]:
        return scroll_plan(clicks, self.rng)
