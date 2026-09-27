"""Human-like mouse trajectories.

The model combines three well-studied properties of human pointing:

* **Fitts' law** - movement time grows with the log of distance / target size.
* **Minimum-jerk velocity** - the hand accelerates smoothly, peaks slightly
  before the midpoint, then decelerates into the target.
* **Curved paths, tremor and corrective sub-movements** - people rarely move in
  straight lines, the hand shakes a little, and long moves often overshoot and
  correct.

Everything is driven by an injectable ``random.Random`` so trajectories are
reproducible in tests.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class MouseStep:
    """Move the pointer to ``(x, y)`` after waiting ``dt`` seconds."""

    x: int
    y: int
    dt: float


Point = tuple[float, float]


def _min_jerk(t: float) -> float:
    return 10 * t**3 - 15 * t**4 + 6 * t**5


def _bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: float) -> Point:
    u = 1 - t
    x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
    y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
    return x, y


def _distance(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


class MouseModel:
    """Generates human-like pointer trajectories.

    Args:
        rng: Random source (pass a seeded instance for reproducibility).
        speed: Global speed multiplier. ``1.0`` is a relaxed presenter pace,
            ``> 1`` is faster.
        hz: Pointer update rate. 60-120 matches real mice.
        overshoot_prob: Probability that a long move overshoots and corrects.
    """

    def __init__(
        self,
        rng: random.Random | None = None,
        *,
        speed: float = 1.0,
        hz: float = 90.0,
        overshoot_prob: float = 0.35,
    ) -> None:
        self.rng = rng or random.Random()
        self.speed = max(0.1, speed)
        self.hz = hz
        self.overshoot_prob = overshoot_prob

    # -- timing ---------------------------------------------------------------

    def duration(self, distance: float, target_width: float = 24.0) -> float:
        """Movement time in seconds according to a noisy Fitts' law."""
        if distance < 1:
            return 0.0
        a, b = 0.12, 0.13
        index_of_difficulty = math.log2(distance / max(target_width, 4.0) + 1)
        t = (a + b * index_of_difficulty) * self.rng.uniform(0.85, 1.2)
        return max(0.08, t / self.speed)

    # -- paths ----------------------------------------------------------------

    def path(
        self,
        start: Point,
        end: Point,
        *,
        target_width: float = 24.0,
        allow_overshoot: bool = True,
    ) -> list[MouseStep]:
        """Return the pointer steps that carry the cursor from ``start`` to ``end``.

        The final step always lands exactly on ``end`` (rounded to pixels).
        """
        distance = _distance(start, end)
        if distance < 1:
            return []
        total = self.duration(distance, target_width)

        if allow_overshoot and distance > 250 and self.rng.random() < self.overshoot_prob:
            dx, dy = (end[0] - start[0]) / distance, (end[1] - start[1]) / distance
            over = distance * self.rng.uniform(0.03, 0.07)
            side = distance * self.rng.uniform(-0.02, 0.02)
            overshoot = (end[0] + dx * over - dy * side, end[1] + dy * over + dx * side)
            first = self._segment(start, overshoot, total * 0.85, curvature=1.0)
            correction = self._segment(
                overshoot, end, self.rng.uniform(0.12, 0.22) / self.speed, curvature=0.3
            )
            if correction:
                correction[0] = MouseStep(
                    correction[0].x,
                    correction[0].y,
                    correction[0].dt + self.rng.uniform(0.03, 0.09),
                )
            return _dedupe(first + correction)

        return _dedupe(self._segment(start, end, total, curvature=1.0))

    def trace(self, start: Point, points: list[Point], *, seconds_per_100px: float = 0.25) -> list[MouseStep]:
        """Follow a polyline smoothly (used for drawing and gestures)."""
        steps: list[MouseStep] = []
        current = start
        for point in points:
            length = _distance(current, point)
            if length < 1:
                continue
            duration = max(0.05, length / 100 * seconds_per_100px / self.speed)
            steps += self._segment(current, point, duration, curvature=0.15, easing=False)
            current = point
        return _dedupe(steps)

    def _segment(
        self,
        start: Point,
        end: Point,
        duration: float,
        *,
        curvature: float,
        easing: bool = True,
    ) -> list[MouseStep]:
        distance = _distance(start, end)
        if distance < 1:
            return []
        dx, dy = (end[0] - start[0]) / distance, (end[1] - start[1]) / distance
        # Perpendicular offset for the control points gives the path its arc.
        bend = distance * self.rng.uniform(0.04, 0.18) * curvature
        bend *= 1 if self.rng.random() < 0.5 else -1
        c1_off = bend * self.rng.uniform(0.6, 1.2)
        c2_off = bend * self.rng.uniform(0.3, 0.9)
        p1 = (start[0] + dx * distance * 0.3 - dy * c1_off, start[1] + dy * distance * 0.3 + dx * c1_off)
        p2 = (start[0] + dx * distance * 0.7 - dy * c2_off, start[1] + dy * distance * 0.7 + dx * c2_off)

        n = max(2, int(duration * self.hz))
        base_dt = duration / n
        tremor_amp = min(1.2, distance / 400) if easing else 0.4
        noise_x = noise_y = 0.0
        steps: list[MouseStep] = []
        for i in range(1, n + 1):
            t = i / n
            s = _min_jerk(t**0.92) if easing else t
            x, y = _bezier(start, p1, p2, end, s)
            # Low-pass filtered noise = tremor; fades out as the hand lands.
            noise_x = 0.7 * noise_x + 0.3 * self.rng.gauss(0, tremor_amp)
            noise_y = 0.7 * noise_y + 0.3 * self.rng.gauss(0, tremor_amp)
            fade = 1 - s
            if i < n:
                x += noise_x * fade
                y += noise_y * fade
            else:
                x, y = end
            dt = base_dt * self.rng.uniform(0.85, 1.15)
            steps.append(MouseStep(round(x), round(y), dt))
        return steps


def _dedupe(steps: list[MouseStep]) -> list[MouseStep]:
    """Merge consecutive steps that land on the same pixel (keeps total time)."""
    out: list[MouseStep] = []
    carry = 0.0
    for step in steps:
        if out and out[-1].x == step.x and out[-1].y == step.y:
            carry += step.dt
            continue
        out.append(MouseStep(step.x, step.y, step.dt + carry))
        carry = 0.0
    if carry and out:
        last = out[-1]
        out[-1] = MouseStep(last.x, last.y, last.dt + carry)
    return out
