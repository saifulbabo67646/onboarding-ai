"""Presenter gestures: what a person does with the mouse while *talking* about
something on screen - hovering, circling a region, underlining a line of text,
small "look here" wiggles and idle drift.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Literal

from .mouse import MouseModel, MouseStep, Point

GestureKind = Literal["hover", "circle", "underline", "wiggle", "trace"]


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float

    @property
    def center(self) -> Point:
        return self.x + self.w / 2, self.y + self.h / 2

    @classmethod
    def around(cls, point: Point, w: float = 60, h: float = 24) -> "Box":
        return cls(point[0] - w / 2, point[1] - h / 2, w, h)


class GestureModel:
    def __init__(self, mouse: MouseModel | None = None, rng: random.Random | None = None) -> None:
        self.rng = rng or (mouse.rng if mouse else random.Random())
        self.mouse = mouse or MouseModel(self.rng)

    def gesture(self, kind: GestureKind, start: Point, box: Box) -> list[MouseStep]:
        if kind == "circle":
            return self.circle(start, box)
        if kind == "underline":
            return self.underline(start, box)
        if kind == "wiggle":
            return self.wiggle(start, box.center)
        return self.hover(start, box.center)

    def hover(self, start: Point, point: Point) -> list[MouseStep]:
        """Travel to a point, then settle with a couple of tiny adjustments."""
        steps = self.mouse.path(start, point, target_width=40)
        x, y = point
        for _ in range(self.rng.randint(1, 3)):
            nx = x + self.rng.uniform(-4, 4)
            ny = y + self.rng.uniform(-3, 3)
            micro = self.mouse.trace((x, y), [(nx, ny)], seconds_per_100px=4.0)
            if micro:
                micro[0] = MouseStep(micro[0].x, micro[0].y, micro[0].dt + self.rng.uniform(0.15, 0.45))
            steps += micro
            x, y = nx, ny
        return steps

    def circle(self, start: Point, box: Box, loops: float | None = None) -> list[MouseStep]:
        """Loosely circle a region, the way people 'lasso' something they talk about."""
        cx, cy = box.center
        rx = box.w / 2 + self.rng.uniform(10, 22)
        ry = box.h / 2 + self.rng.uniform(8, 18)
        loops = loops if loops is not None else self.rng.uniform(1.0, 1.35)
        # Start the loop at the angle closest to where the cursor comes from.
        a0 = math.atan2(start[1] - cy, start[0] - cx)
        direction = 1 if self.rng.random() < 0.7 else -1
        n = max(16, int(28 * loops))
        points: list[Point] = []
        wobble_phase = self.rng.uniform(0, math.tau)
        for i in range(n + 1):
            a = a0 + direction * math.tau * loops * i / n
            wobble = 1 + 0.06 * math.sin(3 * a + wobble_phase)
            points.append((cx + rx * wobble * math.cos(a), cy + ry * wobble * math.sin(a)))
        steps = self.mouse.path(start, points[0], target_width=60)
        perimeter = math.pi * (3 * (rx + ry) - math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
        seconds = self.rng.uniform(1.0, 1.5) * loops
        steps += self.mouse.trace(
            points[0], points[1:], seconds_per_100px=seconds / max(0.1, perimeter * loops / 100)
        )
        return steps

    def underline(self, start: Point, box: Box) -> list[MouseStep]:
        """Sweep under a line of text from left to right (sometimes back again)."""
        y = box.y + box.h + self.rng.uniform(3, 8)
        left = (box.x + self.rng.uniform(-6, 4), y)
        right = (box.x + box.w + self.rng.uniform(-4, 8), y + self.rng.uniform(-3, 3))
        steps = self.mouse.path(start, left, target_width=30)
        mid = ((left[0] + right[0]) / 2, y + self.rng.uniform(-2, 2))
        steps += self.mouse.trace(left, [mid, right], seconds_per_100px=self.rng.uniform(0.35, 0.55))
        if self.rng.random() < 0.35:
            back = (left[0] + (right[0] - left[0]) * self.rng.uniform(0.3, 0.6), y)
            steps += self.mouse.trace(right, [back], seconds_per_100px=0.4)
        return steps

    def wiggle(self, start: Point, point: Point) -> list[MouseStep]:
        """Arrive, then give a small side-to-side 'right here' shake."""
        steps = self.mouse.path(start, point, target_width=30)
        x, y = point
        amp = self.rng.uniform(6, 12)
        pts = []
        for i in range(self.rng.randint(2, 3)):
            pts += [(x - amp, y + self.rng.uniform(-2, 2)), (x + amp, y + self.rng.uniform(-2, 2))]
        pts.append(point)
        steps += self.mouse.trace(point, pts, seconds_per_100px=0.45)
        return steps

    def idle_drift(self, start: Point, bounds: tuple[int, int]) -> list[MouseStep]:
        """A small, slow, aimless movement - what a resting hand does."""
        dist = self.rng.uniform(4, 35)
        angle = self.rng.uniform(0, math.tau)
        x = min(max(start[0] + dist * math.cos(angle), 5), bounds[0] - 5)
        y = min(max(start[1] + dist * math.sin(angle), 5), bounds[1] - 5)
        return self.mouse.trace(start, [(x, y)], seconds_per_100px=self.rng.uniform(1.5, 3.0))
