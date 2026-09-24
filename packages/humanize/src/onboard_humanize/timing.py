"""Small timing models for clicks and scroll-wheel input."""

from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass(frozen=True)
class ClickTiming:
    dwell: float  # pause after arriving, before pressing
    hold: float  # button down time
    interval: float  # gap between clicks of a double/triple click


def click_timing(rng: random.Random) -> ClickTiming:
    return ClickTiming(
        dwell=rng.uniform(0.08, 0.22),
        hold=rng.uniform(0.06, 0.12),
        interval=rng.uniform(0.07, 0.13),
    )


def scroll_plan(clicks: int, rng: random.Random) -> list[float]:
    """Delays (seconds) before each wheel tick.

    People scroll in flicks of a few notches that speed up then slow down, with
    a short pause between flicks while they look at the content.
    """
    delays: list[float] = []
    remaining = abs(clicks)
    while remaining > 0:
        burst = min(remaining, rng.randint(3, 6))
        for i in range(burst):
            # U-shaped: slow start, fast middle, slow finish.
            edge = abs((i + 0.5) / burst - 0.5) * 2
            delay = rng.uniform(0.02, 0.035) + 0.06 * edge**2
            if i == 0 and delays:
                delay += rng.uniform(0.18, 0.45)  # look at the content between flicks
            delays.append(delay)
        remaining -= burst
    return delays
