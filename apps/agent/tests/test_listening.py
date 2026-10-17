from livekit.agents import AgentSession

from onboard_agent.listening import ListeningConfig, has_words


def test_breathing_and_noise_are_not_words():
    assert not has_words("")
    assert not has_words("  ...  ")
    assert not has_words("-")
    assert has_words("wait")
    assert has_words("can you show billing", 3)


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("VAD_ACTIVATION_THRESHOLD", "0.7")
    monkeypatch.setenv("INTERRUPT_MIN_WORDS", "2")
    monkeypatch.setenv("NOISE_CANCELLATION", "OFF")
    cfg = ListeningConfig.from_env()
    assert cfg.vad_activation_threshold == 0.7
    assert cfg.interrupt_min_words == 2
    assert cfg.noise_canceller("wss://x.livekit.cloud") is None


def test_noise_cancellation_auto_only_on_livekit_cloud():
    cfg = ListeningConfig()
    assert cfg.noise_canceller("ws://localhost:7880") is None
    assert cfg.noise_canceller("wss://demo.livekit.cloud") is not None


async def test_session_accepts_listening_settings():
    cfg = ListeningConfig()
    session = AgentSession(vad=cfg.vad(), turn_handling=cfg.turn_handling())
    interruption = session._opts.turn_handling["interruption"]  # resolved options
    assert interruption["min_words"] == 1
    assert interruption["min_duration"] == 0.6
    assert interruption["resume_false_interruption"] is True
