"""End-to-end test against a real Xvfb + Chromium sandbox (skipped when unavailable)."""

import asyncio
import io
import os
import shutil
import sys

import pytest

from onboard_sandbox import SandboxClient
from onboard_sandbox.desktop import find_chromium

pytestmark = pytest.mark.skipif(
    not shutil.which("Xvfb") or not find_chromium(), reason="needs Xvfb and Chromium"
)

PAGE = "data:text/html,<input id=q style='position:absolute;left:100px;top:100px;width:400px;height:40px'>"


@pytest.fixture
async def sandbox():
    port = 18765
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "onboard_sandbox", "--port", str(port), "--display", ":91",
        "--url", PAGE, "--token", "t0k", "--wpm", "400", "--typo-rate", "0",
        env={**os.environ},
    )
    client = SandboxClient(f"http://127.0.0.1:{port}", token="t0k")
    try:
        await client.wait_ready(30)
        await asyncio.sleep(3)  # let Chromium paint
        yield client
    finally:
        await client.close()
        proc.terminate()
        await proc.wait()


async def test_real_input_reaches_the_browser(sandbox: SandboxClient):
    from PIL import Image

    before = Image.open(io.BytesIO(await sandbox.screenshot()))
    assert before.size == (1280, 800)
    await sandbox.act({"type": "click", "x": 300, "y": 207}, {"type": "type", "text": "WWWWWWWW"})
    await asyncio.sleep(0.3)
    after = Image.open(io.BytesIO(await sandbox.screenshot())).convert("L")
    # Typed glyphs darken the input box region.
    box = after.crop((105, 195, 400, 220))
    assert box.getextrema()[0] < 100


async def test_stream_delivers_jpeg_frames(sandbox: SandboxClient):
    frames = []
    async for frame in sandbox.frames():
        frames.append(frame)
        if len(frames) == 3:
            break
    assert all(f[:2] == b"\xff\xd8" for f in frames)


async def test_token_is_required(sandbox: SandboxClient):
    import aiohttp

    anonymous = SandboxClient("http://127.0.0.1:18765")
    try:
        assert (await anonymous.health())["ok"]  # health stays public
        with pytest.raises(aiohttp.ClientResponseError) as err:
            await anonymous.screenshot()
        assert err.value.status == 401
    finally:
        await anonymous.close()
