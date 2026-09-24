"""Publishes the sandbox desktop into the meeting as the agent's screen share."""

from __future__ import annotations

import asyncio
import io
import logging

from livekit import rtc
from onboard_sandbox import SandboxClient
from PIL import Image

logger = logging.getLogger("onboard.agent.screen")


def _decode(jpeg: bytes) -> tuple[int, int, bytes]:
    img = Image.open(io.BytesIO(jpeg)).convert("RGBA")
    return img.width, img.height, img.tobytes()


class ScreenShare:
    def __init__(self, sandbox: SandboxClient, size: tuple[int, int], *, max_fps: int = 20, max_bitrate: int = 3_000_000) -> None:
        self.sandbox = sandbox
        self.width, self.height = size
        self.max_fps = max_fps
        self.max_bitrate = max_bitrate
        self._source = rtc.VideoSource(self.width, self.height, is_screencast=True)
        self._task: asyncio.Task | None = None
        self._publication: rtc.LocalTrackPublication | None = None
        self._participant: rtc.LocalParticipant | None = None

    async def start(self, participant: rtc.LocalParticipant) -> None:
        track = rtc.LocalVideoTrack.create_video_track("screen", self._source)
        options = rtc.TrackPublishOptions(
            source=rtc.TrackSource.SOURCE_SCREENSHARE,
            simulcast=False,
            video_encoding=rtc.VideoEncoding(max_framerate=self.max_fps, max_bitrate=self.max_bitrate),
        )
        self._participant = participant
        self._publication = await participant.publish_track(track, options)
        self._task = asyncio.create_task(self._pump())
        logger.info("screen share published (%s)", self._publication.sid)

    async def _pump(self) -> None:
        while True:
            try:
                async for jpeg in self.sandbox.frames():
                    w, h, rgba = await asyncio.to_thread(_decode, jpeg)
                    self._source.capture_frame(rtc.VideoFrame(w, h, rtc.VideoBufferType.RGBA, rgba))
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001 - reconnect on any stream hiccup
                logger.warning("screen stream interrupted: %s", e)
            await asyncio.sleep(1.0)

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._participant and self._publication:
            try:
                await self._participant.unpublish_track(self._publication.sid)
            except Exception:  # noqa: BLE001 - room may already be gone
                pass
