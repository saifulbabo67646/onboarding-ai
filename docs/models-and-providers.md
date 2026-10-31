# Models and providers

The presenter (director) and the researcher each talk to a model through the Anthropic Messages
API. They are configured separately, so you can run them on different models.

## Default: Claude on Anthropic's API

With only `ANTHROPIC_API_KEY` set, both use `claude-opus-5-5`:

| Setting   | Presenter (`DIRECTOR_*`) | Researcher (`RESEARCHER_*`)                           |
| --------- | ------------------------ | ----------------------------------------------------- |
| Model     | `claude-opus-5-5`        | `claude-opus-5-5`                                     |
| Effort    | `medium` (live latency)  | `high` for docs and writing, `medium` for exploration |
| Fallbacks | on                       | on                                                    |

This is the **native** mode and gets the full feature set: the native computer-use toolset,
adaptive thinking and effort, server-side context editing for long sessions, server-side refusal
fallbacks, structured outputs, and server-side web search and web fetch for docs research.

`DIRECTOR_EFFORT` trades thinking for speed on the call. `low` means shorter pauses between
actions; `medium` is the default.

## Other Anthropic-compatible providers (portable mode)

Any provider that serves the Anthropic Messages format can be used: set the model, base URL and
key for the side you want to change.

```bash
DIRECTOR_MODEL=<model-id>
DIRECTOR_BASE_URL=https://provider.example.com/anthropic
DIRECTOR_API_KEY=...

RESEARCHER_MODEL=<model-id>
RESEARCHER_BASE_URL=https://provider.example.com/anthropic
RESEARCHER_API_KEY=...
```

A backend is native only when the model name starts with `claude` and no base URL is set.
Override that with `DIRECTOR_NATIVE` / `RESEARCHER_NATIVE` (`1` or `0`), for example `1` for
Claude behind a gateway that passes Anthropic's features through.

Set `*_API_KEY` whenever you set `*_BASE_URL`. Without it the Anthropic SDK falls back to
`ANTHROPIC_API_KEY` and sends that key to the other endpoint.

In portable mode requests are reduced to the core every compatible endpoint accepts (model,
system, messages, plain tools). In particular:

- the screen is driven through a regular `computer` tool with the same actions and parameters as
  Claude's computer toolset, executed by the same sandbox code;
- screenshots are sent as top-level content (many compatible endpoints ignore images inside tool
  results) and pruned client-side to the last few;
- JSON is requested in the prompt and validated, instead of structured outputs;
- docs research uses a client-side `fetch_page` tool (public addresses only) instead of
  server-side web search.

The model must accept images and point accurately. Many don't, or a gateway drops images
silently, so measure before switching.

### Example: research on DeepSeek

This is the setup the project's own demo video was recorded with: research on DeepSeek's
official Anthropic-compatible API, live demos on Claude.

```bash
RESEARCHER_MODEL=deepseek-flash
RESEARCHER_BASE_URL=https://api.deepseek.com/anthropic
RESEARCHER_API_KEY=<your DeepSeek key>
```

`deepseek-flash` accepts screenshots; `deepseek-v4-pro` replaces images with a placeholder, so it
can read docs but not explore the app. Third-party gateways in front of the same models may
reject image requests for minutes at a time with a bare `request_rejected` error. The researcher
retries those, and if exploring still fails partway it keeps what it found so far and says so in
the draft's warnings.

## Checking a model with `probe_models.py`

```bash
python scripts/probe_models.py --base-url <endpoint> --api-key-env <VAR> --models <model-id> [<model-id> ...]
```

It draws a test screen locally with known element positions (no sandbox or browser needed) and
reports, per model:

- **vision** - whether images actually arrive;
- **toolset** - whether the native computer toolset is accepted;
- **image placement** - whether a screenshot is read inside a tool result or only as top-level content;
- **portable** - click accuracy with the portable `computer` tool;
- optionally a plain click-tool test (skip with `--skip-plain`).

Other flags: `--repeats` (attempts per target, default 3), `--save-screen <png>`,
`--json <file>`. The key is read from the variable named by `--api-key-env` (default `API_KEY`),
from the environment or the repository's `.env`. `--base-url` defaults to `PROBE_BASE_URL`.
The probe makes real, billed API calls.

## Cost

The two sides have different needs:

- **Live demos** run while a visitor watches. Latency, pointing accuracy and judgement matter
  most, and every join is a new session. Keep the presenter on Claude in native mode.
- **Research** runs once per presenter, ahead of time, and nobody waits on each step. It is a
  good place to save: run it on a cheaper model or provider through `RESEARCHER_MODEL`,
  `RESEARCHER_BASE_URL` and `RESEARCHER_API_KEY`, and review the draft as usual. Expect weaker
  drafts from weaker models; you can still edit or refine them before approving.

Other levers:

- `RESEARCHER_EXPLORE_MINUTES` caps hands-on exploration (default 15).
- `RESEARCHER_EXPLORE=0` skips exploration entirely (docs only).
- Shorter **time limits** on presenters cap the length of each live session.
- `JOIN_LIMIT_*` and `MAX_CONCURRENT_SESSIONS_PER_PRESENTER` cap how many sessions strangers can
  start ([configuration](configuration.md#abuse-limits)).
- Deepgram and ElevenLabs bill per audio minute, on top of the model.
