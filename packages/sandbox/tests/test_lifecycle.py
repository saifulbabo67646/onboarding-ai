"""Sandbox lifecycle: idle shutdown and a browser profile that keeps credentials off screen."""

import asyncio

from onboard_sandbox import __main__ as entry
from onboard_sandbox.server import Activity


def test_open_stream_counts_as_use():
    activity = Activity()
    activity.last -= 100
    assert activity.idle_for() >= 100
    activity.streams = 1
    assert activity.idle_for() == 0
    activity.streams = 0
    activity.touch()
    assert activity.idle_for() < 1


async def test_exits_after_the_idle_timeout(monkeypatch):
    real_sleep = asyncio.sleep
    monkeypatch.setattr(entry.asyncio, "sleep", lambda s: real_sleep(0))
    activity, stop = Activity(), asyncio.Event()
    activity.last -= 10
    await asyncio.wait_for(entry._exit_when_idle(activity, 5, stop), 1)
    assert stop.is_set()


async def test_no_timeout_means_never():
    stop = asyncio.Event()
    await entry._exit_when_idle(Activity(), 0, stop)
    assert not stop.is_set()


def test_browser_profile_hides_password_prompts(tmp_path):
    import json

    from onboard_sandbox.desktop import Browser

    class Display:
        size = (1280, 800)
        env = {}

    browser = Browser(Display(), executable="/bin/true", profile_dir=str(tmp_path))
    browser._write_preferences()
    prefs = json.loads((tmp_path / "Default" / "Preferences").read_text())
    assert prefs["credentials_enable_service"] is False
    assert prefs["profile"]["password_manager_enabled"] is False
