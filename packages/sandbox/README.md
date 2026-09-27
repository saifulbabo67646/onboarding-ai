# onboard-sandbox

An isolated virtual desktop for computer-use agents that need to be **watched**: Xvfb + a headful
Chromium (real tab strip and address bar), OS-level mouse and keyboard through XTEST with human
timing from [`onboard-humanize`](../humanize), screenshots, and a live JPEG stream with the real
cursor composited in (arrow, hand, I-beam - via XFixes).

## Run

```bash
pip install -e ../humanize -e ".[server]"
onboard-sandbox --port 8765 --url https://example.com          # starts Xvfb :99 + Chromium
onboard-sandbox --attach --display :0 --no-browser             # drive an existing X display
```

Or with Docker (from the repo root): `docker build -f packages/sandbox/Dockerfile -t onboard-sandbox .`

## HTTP API

| Endpoint | |
| --- | --- |
| `GET /health` | `{"ok", "size": [w, h], "cursor": [x, y]}` (no auth) |
| `GET /screenshot?format=png\|jpeg&cursor=0\|1` | Current screen |
| `POST /actions {"actions": [...]}` | Run actions in order with human timing; `409` if interrupted |
| `POST /interrupt` | Cancel the running sequence |
| `POST /pause`, `POST /resume` | Freeze/continue motion (e.g. while someone talks) |
| `POST /presence {"idle": bool, "click_highlight": bool}` | Idle hand drift; optional click ring |
| `POST /browser/open {"url"}` | Open a URL (new tab if the browser is running) |
| `GET /stream` (WebSocket) | Binary JPEG frames (~20 fps) |

Pass `--token` (or `SANDBOX_TOKEN`) to require `Authorization: Bearer <token>`.

Actions:

```json
{"type": "move", "x": 640, "y": 400}
{"type": "click", "x": 640, "y": 400, "button": "left", "count": 2, "modifiers": "ctrl"}
{"type": "drag", "start": [100, 100], "end": [400, 300]}
{"type": "trace", "points": [[100, 100], [140, 120], [180, 100]], "button": "left"}
{"type": "scroll", "x": 640, "y": 400, "direction": "down", "amount": 5}
{"type": "type", "text": "hello", "typos": true}
{"type": "key", "keys": "ctrl+t", "repeat": 1}
{"type": "hold_key", "keys": "shift", "seconds": 1}
{"type": "gesture", "kind": "circle", "box": [x, y, w, h]}
{"type": "mouse_down"} / {"type": "mouse_up"} / {"type": "wait", "seconds": 1}
```

## Client and provisioning

```python
from onboard_sandbox import SandboxClient, provider_from_env

lease = await provider_from_env().acquire("session-1", start_url="https://example.com")
async with lease.client() as sandbox:
    await sandbox.act({"type": "click", "x": 200, "y": 170}, {"type": "type", "text": "hi"})
    png = await sandbox.screenshot()
    async for jpeg in sandbox.frames():
        ...
await lease.release()
```

Providers: `LocalProcessProvider` (spawns a sandbox with its own display per session),
`DockerProvider` (one container per session), `StaticProvider` (a fixed URL). The client and
providers only need `aiohttp`.

```bash
pip install -e ".[server,test]" && pytest   # integration test runs if Xvfb + Chromium exist
```
