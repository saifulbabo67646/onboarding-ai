"""LiveKit worker: one presenter per meeting.

For every dispatched room it provisions a private sandbox desktop, shares its
screen into the meeting, joins with a voice, and lets the director present
the owner's goal to whoever joined.

Dispatch metadata (JSON), set by the web app::

    {
      "session_id": "...",
      "brief": { "goal": "...", "mode": "product_demo", "start_url": "...", ... },
      "voice": { "tts_voice": "<elevenlabs voice id>", "stt_language": "en" },
      "callback_url": "https://web/api/sessions/<id>/events"
    }
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from livekit import rtc
from livekit.agents import AgentServer, AgentSession, JobContext, cli
from livekit.plugins import deepgram, elevenlabs, silero
from onboard_director import DemoBrief, Director, DirectorConfig
from onboard_sandbox import provider_from_env

from .reporter import EventReporter
from .screen_share import ScreenShare
from .voice import LiveKitNarrator, PresenterAgent

logger = logging.getLogger("onboard.agent")

AGENT_NAME = os.environ.get("AGENT_NAME", "onboarding-agent")

server = AgentServer()


def _director_config() -> DirectorConfig:
    return DirectorConfig(
        model=os.environ.get("DIRECTOR_MODEL", "claude-opus-5"),
        effort=os.environ.get("DIRECTOR_EFFORT", "medium"),
        fallbacks=os.environ.get("DIRECTOR_FALLBACKS", "1") != "0",
    )


def _voice_session(voice: dict) -> AgentSession:
    tts_kwargs = {}
    if voice.get("tts_voice") or os.environ.get("ELEVEN_VOICE_ID"):
        tts_kwargs["voice_id"] = voice.get("tts_voice") or os.environ["ELEVEN_VOICE_ID"]
    return AgentSession(
        stt=deepgram.STT(model="nova-3", language=voice.get("stt_language", "en")),
        tts=elevenlabs.TTS(**tts_kwargs),
        vad=silero.VAD.load(),
    )


def _human_participants(room: rtc.Room) -> list[rtc.RemoteParticipant]:
    return [
        p for p in room.remote_participants.values() if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
    ]


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    meta = json.loads(ctx.job.metadata or "{}")
    brief = DemoBrief.from_dict(meta.get("brief") or {})
    session_id = meta.get("session_id") or ctx.room.name
    reporter = EventReporter(meta.get("callback_url"), os.environ.get("AGENT_CALLBACK_SECRET"))
    reporter.start()
    reporter.emit("status", {"state": "starting"})

    await ctx.connect()
    lease = await provider_from_env().acquire(session_id, start_url=brief.opening_url)
    sandbox = lease.client()
    share: ScreenShare | None = None

    async def cleanup(reason: str = "") -> None:
        if share:
            await share.stop()
        await sandbox.close()
        await lease.release()
        reporter.emit("status", {"state": "ended", "reason": reason})
        await reporter.close()

    ctx.add_shutdown_callback(cleanup)

    health = await sandbox.health()
    share = ScreenShare(sandbox, tuple(health["size"]))
    await share.start(ctx.room.local_participant)

    agent = PresenterAgent()
    session = _voice_session(meta.get("voice") or {})
    await session.start(agent=agent, room=ctx.room)

    participant = await ctx.wait_for_participant()
    brief.audience_name = brief.audience_name or participant.name or None
    reporter.emit("status", {"state": "joined", "audience": brief.audience_name})

    director = Director(brief, sandbox, LiveKitNarrator(session), config=_director_config(), on_event=reporter.emit)
    agent.attach(director)

    @session.on("user_state_changed")
    def _on_user_state(ev) -> None:
        asyncio.ensure_future(director.audience_speaking(ev.new_state == "speaking"))

    @ctx.room.on("participant_disconnected")
    def _on_left(_: rtc.RemoteParticipant) -> None:
        if not _human_participants(ctx.room):
            logger.info("audience left, stopping")
            director.stop()

    try:
        summary = await director.run()
        reporter.emit("summary", {"summary": summary})
    except Exception:
        logger.exception("director crashed")
        reporter.emit("error", {"message": "director crashed"})
    await asyncio.sleep(2)
    ctx.shutdown(reason="presentation finished")


def main() -> None:
    try:
        from dotenv import find_dotenv, load_dotenv

        load_dotenv(find_dotenv(usecwd=True))
    except ImportError:  # pragma: no cover
        pass
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    cli.run_app(server)


if __name__ == "__main__":
    main()
