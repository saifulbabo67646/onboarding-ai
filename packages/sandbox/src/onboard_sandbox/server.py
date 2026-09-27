"""HTTP + WebSocket API of the sandbox.

    GET  /health                    -> {"ok": true, "size": [w, h], "cursor": [x, y]}
    GET  /screenshot?format=png     -> image bytes (``cursor=1`` to include pointer)
    POST /actions {"actions": [...]}-> {"results": [...]}   (409 if interrupted)
    POST /interrupt                 -> cancel the running action sequence
    POST /pause | /resume           -> hold/continue motion (audience is talking)
    POST /presence {"idle": bool, "click_highlight": bool}
    POST /browser/open {"url": ...} -> open a URL (new tab if the browser runs)
    GET  /stream                    -> WebSocket of binary JPEG frames

All endpoints accept an optional ``Authorization: Bearer <token>`` which is
required when the server was started with a token.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from dataclasses import dataclass

from aiohttp import WSMsgType, web

from .capture import FrameStream, ScreenCapture
from .desktop import Browser, VirtualDisplay
from .human_input import HumanInput, Interrupted

logger = logging.getLogger("onboard.sandbox.server")


@dataclass
class Sandbox:
    display: VirtualDisplay
    browser: Browser | None
    capture: ScreenCapture
    input: HumanInput
    stream: FrameStream


def _auth_middleware(token: str | None):
    @web.middleware
    async def middleware(request: web.Request, handler):
        if token and request.path != "/health":
            header = request.headers.get("Authorization", "")
            supplied = header[7:] if header.startswith("Bearer ") else request.query.get("token", "")
            if not hmac.compare_digest(supplied, token):
                raise web.HTTPUnauthorized(text="invalid sandbox token")
        return await handler(request)

    return middleware


def create_app(sandbox: Sandbox, *, token: str | None = None) -> web.Application:
    app = web.Application(middlewares=[_auth_middleware(token)], client_max_size=4 * 1024 * 1024)
    routes = web.RouteTableDef()

    @routes.get("/health")
    async def health(_: web.Request):
        w, h = sandbox.display.size
        return web.json_response({"ok": True, "size": [w, h], "cursor": list(sandbox.input.cursor)})

    @routes.get("/screenshot")
    async def screenshot(request: web.Request):
        fmt = request.query.get("format", "png").lower()
        quality = int(request.query.get("quality", "85"))
        with_cursor = request.query.get("cursor", "0") == "1"
        img = await asyncio.to_thread(sandbox.capture.grab, cursor=with_cursor)
        data = await asyncio.to_thread(sandbox.capture.encode, img, fmt, quality)
        return web.Response(body=data, content_type="image/jpeg" if fmt in ("jpg", "jpeg") else "image/png")

    @routes.post("/actions")
    async def actions(request: web.Request):
        body = await request.json()
        items = body.get("actions")
        if not isinstance(items, list):
            raise web.HTTPBadRequest(text="expected {'actions': [...]}")
        try:
            results = await sandbox.input.run(items)
        except Interrupted:
            return web.json_response({"interrupted": True, "cursor": list(sandbox.input.cursor)}, status=409)
        except (KeyError, ValueError, TypeError) as e:
            return web.json_response({"error": f"{type(e).__name__}: {e}"}, status=400)
        return web.json_response({"results": results})

    @routes.post("/interrupt")
    async def interrupt(_: web.Request):
        sandbox.input.interrupt()
        return web.json_response({"ok": True})

    @routes.post("/pause")
    async def pause(_: web.Request):
        sandbox.input.pause()
        return web.json_response({"ok": True})

    @routes.post("/resume")
    async def resume(_: web.Request):
        sandbox.input.resume()
        return web.json_response({"ok": True})

    @routes.post("/presence")
    async def presence(request: web.Request):
        body = await request.json()
        if "idle" in body:
            sandbox.input.set_idle(bool(body["idle"]))
        if "click_highlight" in body:
            sandbox.capture.effects.enabled = bool(body["click_highlight"])
        return web.json_response({"ok": True})

    @routes.post("/browser/open")
    async def browser_open(request: web.Request):
        if sandbox.browser is None:
            raise web.HTTPNotImplemented(text="this sandbox does not manage a browser")
        body = await request.json()
        await sandbox.browser.open(body.get("url"))
        return web.json_response({"ok": True})

    @routes.get("/stream")
    async def stream(request: web.Request):
        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=0)
        await ws.prepare(request)
        sandbox.stream.subscribe()
        seq = -1
        try:
            reader = asyncio.create_task(_drain(ws))
            while not ws.closed and not reader.done():
                seq, frame = await asyncio.to_thread(sandbox.stream.wait, seq, 1.0)
                if frame is not None and not ws.closed:
                    await ws.send_bytes(frame)
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            sandbox.stream.unsubscribe()
        return ws

    app.add_routes(routes)

    async def on_cleanup(_: web.Application):
        sandbox.stream.stop()
        await sandbox.input.close()

    app.on_cleanup.append(on_cleanup)
    return app


async def _drain(ws: web.WebSocketResponse) -> None:
    async for msg in ws:
        if msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
            break
