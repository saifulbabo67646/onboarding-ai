import math
import random

from onboard_humanize import BACKSPACE, Box, Humanizer, MouseModel, TypingModel, scroll_plan


def test_path_lands_exactly_on_target():
    model = MouseModel(random.Random(1))
    for seed in range(50):
        model.rng.seed(seed)
        steps = model.path((10, 10), (900, 610))
        assert (steps[-1].x, steps[-1].y) == (900, 610)


def test_path_duration_follows_fitts_law():
    model = MouseModel(random.Random(2))
    short = sum(s.dt for s in model.path((0, 0), (40, 0), allow_overshoot=False))
    long = sum(s.dt for s in model.path((0, 0), (1200, 0), allow_overshoot=False))
    assert 0.08 <= short < long < 2.0


def test_path_is_curved_not_a_straight_line():
    model = MouseModel(random.Random(3))
    steps = model.path((0, 0), (800, 0), allow_overshoot=False)
    assert max(abs(s.y) for s in steps) > 3


def test_velocity_is_bell_shaped():
    model = MouseModel(random.Random(4), hz=100)
    steps = model.path((0, 0), (1000, 0), allow_overshoot=False)
    xs = [0] + [s.x for s in steps]
    speeds = [abs(b - a) for a, b in zip(xs, xs[1:])]
    third = len(speeds) // 3
    assert sum(speeds[third : 2 * third]) > sum(speeds[:third])
    assert sum(speeds[third : 2 * third]) > sum(speeds[2 * third :])


def test_no_duplicate_consecutive_steps():
    steps = MouseModel(random.Random(5)).path((0, 0), (300, 200))
    assert all((a.x, a.y) != (b.x, b.y) for a, b in zip(steps, steps[1:]))


def test_typing_always_produces_the_intended_text():
    model = TypingModel(random.Random(6), typo_rate=0.3)
    text = "Hello there, this is the Analytics dashboard! 2024 revenue: $1.2M"
    for seed in range(30):
        model.rng.seed(seed)
        strokes = model.plan(text)
        assert TypingModel.apply(strokes) == text


def test_typing_makes_and_corrects_typos():
    model = TypingModel(random.Random(7), typo_rate=0.5)
    strokes = model.plan("presentation")
    assert any(s.key == BACKSPACE for s in strokes)


def test_typing_without_typos_is_exact_keystrokes():
    strokes = TypingModel(random.Random(8), typo_rate=1.0).plan("secret", allow_typos=False)
    assert [s.key for s in strokes] == list("secret")


def test_typing_speed_matches_wpm():
    model = TypingModel(random.Random(9), wpm=60, typo_rate=0)
    text = "the quick brown fox jumps over the lazy dog " * 5
    total = sum(s.delay for s in model.plan(text))
    wpm = len(text) / 5 / (total / 60)
    assert 35 < wpm < 90


def test_scroll_plan_has_one_delay_per_tick():
    rng = random.Random(10)
    for n in (1, 3, 7, 15):
        assert len(scroll_plan(n, rng)) == n


def test_circle_gesture_surrounds_box():
    h = Humanizer(seed=11)
    box = Box(400, 300, 120, 40)
    steps = h.gestures.circle((100, 100), box)
    cx, cy = box.center
    angles = {round(math.atan2(s.y - cy, s.x - cx), 1) for s in steps[-40:]}
    assert len(angles) > 10
    assert min(s.x for s in steps) < box.x and max(s.x for s in steps) > box.x + box.w


def test_underline_passes_below_text():
    h = Humanizer(seed=12)
    box = Box(200, 200, 300, 20)
    steps = h.gestures.underline((0, 0), box)
    tail = steps[-10:]
    assert all(s.y >= box.y + box.h - 3 for s in tail)


def test_humanizer_is_reproducible():
    a = Humanizer(seed=13).mouse.path((0, 0), (500, 500))
    b = Humanizer(seed=13).mouse.path((0, 0), (500, 500))
    assert a == b
