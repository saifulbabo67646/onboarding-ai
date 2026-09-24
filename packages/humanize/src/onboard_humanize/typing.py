"""Human-like typing cadence: variable inter-key intervals, faster common
bigrams, pauses at word and sentence boundaries, and the occasional typo that
gets noticed and corrected with backspace.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

BACKSPACE = "BackSpace"

_ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"]
_POS = {ch: (r, c) for r, row in enumerate(_ROWS) for c, ch in enumerate(row)}
_COMMON_BIGRAMS = {
    "th", "he", "in", "er", "an", "re", "on", "at", "en", "nd", "ti", "es", "or",
    "te", "of", "ed", "is", "it", "al", "ar", "st", "to", "nt", "ng", "se", "ha",
    "as", "ou", "io", "le", "ve", "co", "me", "de", "hi", "ri", "ro", "ic", "ne",
}


def neighbor_key(ch: str, rng: random.Random) -> str | None:
    """A physically adjacent key on a QWERTY keyboard (preserving case)."""
    lower = ch.lower()
    if lower not in _POS:
        return None
    r, c = _POS[lower]
    candidates = []
    for dr, dc in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, 1), (1, -1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < len(_ROWS) and 0 <= cc < len(_ROWS[rr]):
            k = _ROWS[rr][cc]
            if k.isalpha():
                candidates.append(k)
    if not candidates:
        return None
    k = rng.choice(candidates)
    return k.upper() if ch.isupper() else k


@dataclass(frozen=True)
class KeyStroke:
    """Press ``key`` after waiting ``delay`` seconds, holding it for ``hold``.

    ``key`` is either a single literal character or :data:`BACKSPACE`.
    """

    key: str
    delay: float
    hold: float


class TypingModel:
    """Plans keystrokes for a piece of text.

    Args:
        rng: Random source.
        wpm: Average words per minute (a word = 5 characters). 60-80 feels like
            a confident presenter typing while talking.
        typo_rate: Chance that any letter is mistyped (then corrected).
    """

    def __init__(self, rng: random.Random | None = None, *, wpm: float = 70.0, typo_rate: float = 0.015) -> None:
        self.rng = rng or random.Random()
        self.wpm = wpm
        self.typo_rate = typo_rate

    @property
    def base_interval(self) -> float:
        return 60.0 / (self.wpm * 5)

    def _interval(self, prev: str, ch: str) -> float:
        t = self.base_interval * self.rng.lognormvariate(0, 0.33)
        if (prev + ch).lower() in _COMMON_BIGRAMS:
            t *= 0.7
        if prev == " ":
            t *= 1.25
            if self.rng.random() < 0.04:
                t += self.rng.uniform(0.3, 0.9)  # brief "what's the next word" pause
        if prev in ".,!?;:":
            t *= self.rng.uniform(1.8, 2.8)
        if ch.isupper() or (not ch.isalnum() and ch != " "):
            t *= 1.25  # reaching for shift / symbols
        if ch.isdigit():
            t *= 1.3
        return min(t, 2.5)

    def _hold(self) -> float:
        return self.rng.uniform(0.045, 0.1)

    def plan(self, text: str, *, allow_typos: bool = True) -> list[KeyStroke]:
        strokes: list[KeyStroke] = []
        prev = " "
        i = 0
        while i < len(text):
            ch = text[i]
            delay = self._interval(prev, ch)
            wrong = neighbor_key(ch, self.rng) if allow_typos and ch.isalpha() else None
            if wrong and self.rng.random() < self.typo_rate:
                strokes.append(KeyStroke(wrong, delay, self._hold()))
                # Keep going a character or two before noticing the mistake.
                extra = min(self.rng.choice((0, 0, 1, 1, 2)), len(text) - i - 1)
                for j in range(1, extra + 1):
                    strokes.append(KeyStroke(text[i + j], self._interval(text[i + j - 1], text[i + j]), self._hold()))
                notice = self.rng.uniform(0.2, 0.5)
                for k in range(extra + 1):
                    strokes.append(KeyStroke(BACKSPACE, notice if k == 0 else self.rng.uniform(0.07, 0.13), self._hold()))
                delay = self.rng.uniform(0.1, 0.2)
            strokes.append(KeyStroke(ch, delay, self._hold()))
            prev = ch
            i += 1
        return strokes

    @staticmethod
    def apply(strokes: list[KeyStroke]) -> str:
        """Replay strokes into the resulting text (used by tests)."""
        out: list[str] = []
        for s in strokes:
            if s.key == BACKSPACE:
                if out:
                    out.pop()
            else:
                out.append(s.key)
        return "".join(out)
