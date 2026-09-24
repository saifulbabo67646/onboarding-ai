import asyncio
import io

from PIL import Image

from onboard_agent.screen_share import ScreenShare


class FakeSandbox:
    async def frames(self):
        for color in ("red", "green", "blue"):
            buf = io.BytesIO()
            Image.new("RGB", (64, 40), color).save(buf, "JPEG")
            yield buf.getvalue()
        await asyncio.sleep(10)


async def test_frames_are_decoded_into_video_frames():
    share = ScreenShare(FakeSandbox(), (64, 40))
    captured = []
    share._source = type("Src", (), {"capture_frame": lambda self, f: captured.append(f)})()
    task = asyncio.create_task(share._pump())
    await asyncio.sleep(0.3)
    task.cancel()
    assert len(captured) == 3
    assert (captured[0].width, captured[0].height) == (64, 40)
    assert bytes(captured[0].data[:3]) != bytes(captured[2].data[:3])
