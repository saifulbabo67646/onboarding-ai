"""How the presenter listens: voice activity detection, what counts as an
interruption, and noise cancellation.

The defaults are tuned so that breathing, sighs, keyboard clicks and room
noise do not cut the presenter off: an interruption needs real recognised
words, not just sound. Everything can be adjusted with environment variables.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger("onboard.agent.listening")


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class ListeningConfig:
    # Silero speech probability needed to start a speech segment (0-1).
    # Breathing typically scores 0.3-0.55; clear speech scores > 0.8.
    vad_activation_threshold: float = 0.6
    # Ignore sound bursts shorter than this (seconds); breaths are short.
    vad_min_speech_duration: float = 0.15
    # Silence (seconds) that ends the visitor's turn.
    vad_min_silence_duration: float = 0.6
    # Speech needed (seconds) before the presenter stops talking.
    interrupt_min_duration: float = 0.6
    # Recognised words needed before the presenter stops talking.
    # Breathing and noise never produce words, so this is the key guard.
    interrupt_min_words: int = 1
    # Resume the presenter's sentence if an "interruption" turns out to be nothing.
    false_interruption_timeout: float = 1.5
    # "bvc" (LiveKit Cloud background voice cancellation), "nc", or "off".
    noise_cancellation: str = "auto"

    @classmethod
    def from_env(cls) -> "ListeningConfig":
        d = cls()
        return cls(
            vad_activation_threshold=_float("VAD_ACTIVATION_THRESHOLD", d.vad_activation_threshold),
            vad_min_speech_duration=_float("VAD_MIN_SPEECH_DURATION", d.vad_min_speech_duration),
            vad_min_silence_duration=_float("VAD_MIN_SILENCE_DURATION", d.vad_min_silence_duration),
            interrupt_min_duration=_float("INTERRUPT_MIN_DURATION", d.interrupt_min_duration),
            interrupt_min_words=int(_float("INTERRUPT_MIN_WORDS", d.interrupt_min_words)),
            false_interruption_timeout=_float("FALSE_INTERRUPTION_TIMEOUT", d.false_interruption_timeout),
            noise_cancellation=os.environ.get("NOISE_CANCELLATION", d.noise_cancellation).lower(),
        )

    def vad(self):
        from livekit.plugins import silero

        return silero.VAD.load(
            activation_threshold=self.vad_activation_threshold,
            min_speech_duration=self.vad_min_speech_duration,
            min_silence_duration=self.vad_min_silence_duration,
        )

    def turn_handling(self) -> dict:
        return {
            "interruption": {
                "min_duration": self.interrupt_min_duration,
                "min_words": self.interrupt_min_words,
                "resume_false_interruption": True,
                "false_interruption_timeout": self.false_interruption_timeout,
            }
        }

    def noise_canceller(self, livekit_url: str):
        """LiveKit's noise cancellation models only run on LiveKit Cloud."""
        mode = self.noise_cancellation
        if mode == "auto":
            mode = "bvc" if "livekit.cloud" in livekit_url else "off"
        if mode == "off":
            return None
        try:
            from livekit.plugins import noise_cancellation
        except ImportError:
            logger.warning("NOISE_CANCELLATION=%s but livekit-plugins-noise-cancellation is not installed", mode)
            return None
        return noise_cancellation.BVC() if mode == "bvc" else noise_cancellation.NC()


def has_words(text: str, minimum: int = 1) -> bool:
    return len([w for w in text.split() if any(c.isalnum() for c in w)]) >= minimum
