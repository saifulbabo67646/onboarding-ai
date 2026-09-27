# onboard-agent

LiveKit worker that turns a dispatched room into a live, presented session:

1. reads the presenter brief from the dispatch metadata;
2. provisions a private sandbox desktop (`SANDBOX_PROVIDER` = `local` | `docker` | `static`);
3. publishes the desktop as its **screen share** (`SOURCE_SCREENSHARE`, screencast-tuned);
4. joins with a voice - Deepgram STT in, ElevenLabs TTS out - with no chat LLM of its own:
   every visitor turn goes to the [director](../../packages/director);
5. waits for the visitor, then lets the director present; freezes the mouse while the visitor
   talks; leaves when the goal is done or the visitor leaves;
6. reports status, transcript and actions to the web app (`callback_url`).

```bash
pip install -e ../../packages/humanize -e "../../packages/sandbox[server]" -e ../../packages/director -e .
onboard-agent download-files
onboard-agent dev        # or: onboard-agent start
```

Dispatch metadata (set by `apps/web`):

```json
{
  "session_id": "…",
  "brief": { "goal": "…", "mode": "product_demo", "start_url": "…", "presenter_name": "Maya" },
  "voice": { "tts_voice": "<elevenlabs voice id>" },
  "callback_url": "https://…/api/sessions/<id>/events"
}
```

Environment: `LIVEKIT_*`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVEN_API_KEY`,
`DIRECTOR_MODEL`, `DIRECTOR_EFFORT`, `AGENT_CALLBACK_SECRET`, `SANDBOX_*`, `AGENT_NAME`
(default `onboarding-agent`).
