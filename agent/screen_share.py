"""
Screen Share Pipeline

Connects to agent-browser's WebSocket stream, decodes JPEG frames,
and publishes them as a LiveKit video track (screen share).

agent-browser WebSocket protocol (port set via AGENT_BROWSER_STREAM_PORT):
  Receive: {"type": "frame", "data": "<base64-jpeg>", "metadata": {"deviceWidth": 1280, "deviceHeight": 720, ...}}
  Send:    {"type": "input_mouse", "eventType": "mousePressed", "x": 100, "y": 200, "button": "left", "clickCount": 1}
"""

import asyncio
import base64
import io
import json
import logging
import os

import websockets
from PIL import Image
from livekit import rtc

logger = logging.getLogger("onboarding-agent.screen-share")

VIEWPORT_WIDTH = int(os.getenv("AGENT_BROWSER_VIEWPORT_WIDTH", "1280"))
VIEWPORT_HEIGHT = int(os.getenv("AGENT_BROWSER_VIEWPORT_HEIGHT", "720"))


class ScreenSharePipeline:
    """Captures agent-browser viewport frames via WebSocket and publishes as a LiveKit video track."""

    def __init__(self, stream_port: int):
        self._stream_port = stream_port
        self._video_source: rtc.VideoSource | None = None
        self._track: rtc.LocalVideoTrack | None = None
        self._publication: rtc.LocalTrackPublication | None = None
        self._ws = None
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self, local_participant):
        """Start the screen share pipeline: create video track, publish it, and start frame loop.

        Args:
            local_participant: The agent's LocalParticipant (ctx.agent) to publish the track on.
        """
        if self._running:
            logger.warning("Screen share pipeline already running")
            return

        # Create LiveKit video source and track
        self._video_source = rtc.VideoSource(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
        self._track = rtc.LocalVideoTrack.create_video_track(
            "agent-screen-share", self._video_source
        )

        # Publish as screen share with H264 codec for broad compatibility
        options = rtc.TrackPublishOptions(
            source=rtc.TrackSource.SOURCE_SCREEN_SHARE,
            simulcast=False,
            video_encoding=rtc.VideoEncoding(
                max_framerate=15,
                max_bitrate=3_000_000,
            ),
            video_codec=rtc.VideoCodec.H264,
        )
        self._publication = await local_participant.publish_track(self._track, options)
        logger.info(f"Screen share track published: {self._publication.sid}")

        # Start the frame capture loop
        self._running = True
        self._task = asyncio.create_task(self._frame_loop())

    async def stop(self):
        """Stop the screen share pipeline."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("Screen share pipeline stopped")

    async def _frame_loop(self):
        """Main loop: connect to agent-browser WebSocket, receive frames, publish to LiveKit."""
        ws_url = f"ws://localhost:{self._stream_port}"
        logger.info(f"Connecting to agent-browser stream at {ws_url}")

        retry_count = 0
        max_retries = 60

        while self._running:
            try:
                async with websockets.connect(
                    ws_url,
                    max_size=10 * 1024 * 1024,  # 10MB max message size for large frames
                    ping_interval=20,
                    ping_timeout=20,
                ) as ws:
                    self._ws = ws
                    retry_count = 0
                    logger.info("Connected to agent-browser WebSocket stream")

                    async for message in ws:
                        if not self._running:
                            break

                        try:
                            data = json.loads(message)
                            if data.get("type") == "frame":
                                self._process_frame(data)
                        except json.JSONDecodeError:
                            pass
                        except Exception as e:
                            logger.error(f"Error processing frame: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                retry_count += 1
                if retry_count > max_retries:
                    logger.error(
                        f"Failed to connect to agent-browser stream after {max_retries} retries"
                    )
                    break
                if retry_count % 5 == 1:
                    logger.debug(
                        f"Waiting for agent-browser stream (attempt {retry_count})..."
                    )
                await asyncio.sleep(1.0)

    def _process_frame(self, frame_data: dict):
        """Decode a JPEG frame from agent-browser and push it to the LiveKit video source."""
        if not self._video_source:
            return

        try:
            jpeg_bytes = base64.b64decode(frame_data["data"])
            metadata = frame_data.get("metadata", {})
            width = metadata.get("deviceWidth", VIEWPORT_WIDTH)
            height = metadata.get("deviceHeight", VIEWPORT_HEIGHT)

            # Decode JPEG to RGBA
            img = Image.open(io.BytesIO(jpeg_bytes))
            if img.size != (width, height):
                img = img.resize((width, height))
            img = img.convert("RGBA")

            # Create and publish the video frame
            frame = rtc.VideoFrame(
                width, height, rtc.VideoBufferType.RGBA, bytearray(img.tobytes())
            )
            self._video_source.capture_frame(frame)

        except Exception as e:
            logger.error(f"Failed to process frame: {e}")
