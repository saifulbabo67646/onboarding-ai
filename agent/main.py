"""
AI Onboarding Agent — Entry Point

Launches a LiveKit agent that:
1. Joins a room with voice pipeline (STT → LLM → TTS)
2. Starts agent-browser and streams the viewport as a screen share
3. Guides users through a web application via voice + browser automation
"""

import logging
import os
import pathlib

from dotenv import dotenv_values
from livekit.agents import AgentSession, JobContext, AgentServer, room_io
from livekit.agents.cli import run_app
from livekit.plugins import deepgram, elevenlabs, openai, silero

from orchestrator import OnboardingOrchestrator

# Resolve env file path (works in both parent and child processes)
_AGENT_DIR = pathlib.Path(__file__).resolve().parent
_ENV_FILE = _AGENT_DIR / ".env" if (_AGENT_DIR / ".env").exists() else _AGENT_DIR / ".env.example"

# Read env values into a dict and inject into os.environ immediately
# This ensures child processes (forked by livekit-agents) inherit them
for _k, _v in dotenv_values(_ENV_FILE).items():
    os.environ.setdefault(_k, _v)

logger = logging.getLogger("onboarding-agent")
logger.setLevel(logging.INFO)

server = AgentServer()


@server.rtc_session(agent_name="onboarding-agent")
async def entrypoint(ctx: JobContext):
    """Main entrypoint — called when a new room session starts."""
    # Re-load env in child process if needed (for 'spawn' multiprocessing)
    if not os.environ.get("ELEVEN_API_KEY"):
        for k, v in dotenv_values(_ENV_FILE).items():
            os.environ.setdefault(k, v)

    logger.info(f"Agent joining room: {ctx.room.name}")

    session = AgentSession(
        stt=deepgram.STT(api_key=os.environ["DEEPGRAM_API_KEY"]),
        llm=openai.LLM(model="gpt-4o", api_key=os.environ["OPENAI_API_KEY"]),
        tts=elevenlabs.TTS(api_key=os.environ["ELEVEN_API_KEY"]),
        vad=silero.VAD.load(),
        allow_interruptions=True,
        min_interruption_duration=0.5,
    )

    await session.start(
        agent=OnboardingOrchestrator(room_name=ctx.room.name),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(),
            audio_output=room_io.AudioOutputOptions(),
        ),
    )


if __name__ == "__main__":
    run_app(server)
