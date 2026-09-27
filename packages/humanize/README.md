# onboard-humanize

Human-like mouse trajectories, presenter gestures, typing cadence and scrolling for computer-use
agents. Pure Python, no dependencies. It only **plans** input - positions, keystrokes and delays -
so you can execute it with any backend (XTEST, CDP, pyautogui, a robot arm…).

```python
from onboard_humanize import Humanizer, Box

h = Humanizer(seed=42, mouse_speed=1.0, wpm=70, typo_rate=0.015)

for step in h.mouse.path((100, 100), (900, 500), target_width=40):
    sleep(step.dt); move_mouse(step.x, step.y)

for stroke in h.typing.plan("hello world"):
    sleep(stroke.delay); press(stroke.key)   # stroke.key may be "BackSpace" (typo correction)

steps = h.gestures.circle(current_pos, Box(x=400, y=300, w=160, h=40))
```

## Models

- **Pointing** - duration from a noisy Fitts' law, minimum-jerk velocity (peaking a little before
  the midpoint), curved Bézier paths, low-pass tremor that fades on arrival, and overshoot +
  correction on long moves.
- **Gestures** - `hover` (arrive and settle), `circle` (loose lasso around a region), `underline`
  (sweep under a line of text), `wiggle` ("right here"), `idle_drift` (a resting hand).
- **Typing** - log-normal inter-key intervals, faster common bigrams, pauses at word and sentence
  boundaries, occasional QWERTY-neighbour typos that are noticed and corrected.
- **Scrolling / clicking** - flick bursts with U-shaped tick timing; dwell, hold and double-click
  intervals.

Everything takes an injectable `random.Random`, so behaviour is reproducible in tests.

```bash
pip install -e ".[test]" && pytest
```
