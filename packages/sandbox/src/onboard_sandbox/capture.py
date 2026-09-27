"""Screen capture for an X display, with the *real* cursor composited in.

X screen grabs never contain the pointer, so we fetch the current cursor image
through XFixes (the same shape the application set: arrow, hand over links,
I-beam over text) and draw it onto every frame - exactly what a viewer sees in
a normal screen share.
"""

from __future__ import annotations

import io
import logging
import threading
import time
from dataclasses import dataclass, field

import mss
from PIL import Image, ImageDraw

logger = logging.getLogger("onboard.sandbox.capture")


@dataclass
class _CursorSprite:
    serial: int
    image: Image.Image
    xhot: int
    yhot: int


@dataclass
class ClickEffects:
    """Optional click highlight (a soft ring that fades out), off by default."""

    enabled: bool = False
    duration: float = 0.45
    _clicks: list[tuple[float, int, int]] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def add(self, x: int, y: int) -> None:
        if not self.enabled:
            return
        with self._lock:
            self._clicks.append((time.monotonic(), x, y))

    def draw(self, img: Image.Image) -> None:
        if not self.enabled:
            return
        now = time.monotonic()
        with self._lock:
            self._clicks = [c for c in self._clicks if now - c[0] < self.duration]
            clicks = list(self._clicks)
        if not clicks:
            return
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        for t0, x, y in clicks:
            p = (now - t0) / self.duration
            r = 8 + 22 * p
            alpha = int(170 * (1 - p))
            d.ellipse((x - r, y - r, x + r, y + r), outline=(99, 102, 241, alpha), width=3)
        img.alpha_composite(overlay)


def _fallback_arrow() -> _CursorSprite:
    img = Image.new("RGBA", (18, 26), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(1, 1), (1, 20), (6, 15), (10, 24), (13, 23), (9, 14), (16, 14)], fill="black", outline="white")
    return _CursorSprite(-1, img, 1, 1)


class ScreenCapture:
    """Grabs frames from an X display. Thread-safe per instance via a lock."""

    def __init__(self, display_name: str, size: tuple[int, int], effects: ClickEffects | None = None) -> None:
        self.display_name = display_name
        self.width, self.height = size
        self.effects = effects or ClickEffects()
        self._lock = threading.Lock()
        self._local = threading.local()
        self._fallback = _fallback_arrow()

    # Each thread needs its own X connections (Xlib/mss are not thread-safe).
    def _conns(self):
        conns = getattr(self._local, "conns", None)
        if conns is None:
            sct = mss.mss(display=self.display_name.encode() if isinstance(self.display_name, str) else self.display_name)
            xfixes_display = None
            try:
                from Xlib import display as xdisplay

                xfixes_display = xdisplay.Display(self.display_name)
                if not xfixes_display.has_extension("XFIXES"):
                    xfixes_display = None
                else:
                    xfixes_display.xfixes_query_version()
            except Exception as e:  # pragma: no cover - depends on X server
                logger.warning("XFixes unavailable, drawing a fallback cursor: %s", e)
                xfixes_display = None
            conns = self._local.conns = {"sct": sct, "xfixes": xfixes_display, "sprite": None}
        return conns

    def _cursor(self, conns) -> tuple[_CursorSprite, int, int] | None:
        xd = conns["xfixes"]
        if xd is None:
            return None
        try:
            reply = xd.xfixes_get_cursor_image(xd.screen().root)
        except Exception:
            return None
        sprite: _CursorSprite | None = conns["sprite"]
        if sprite is None or sprite.serial != reply.cursor_serial:
            w, h = reply.width, reply.height
            if w == 0 or h == 0:
                return None
            argb = reply.cursor_image
            buf = bytearray(w * h * 4)
            for i, px in enumerate(argb):
                a = (px >> 24) & 0xFF
                r = (px >> 16) & 0xFF
                g = (px >> 8) & 0xFF
                b = px & 0xFF
                if a:  # XFixes returns premultiplied alpha
                    r, g, b = min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a)
                buf[i * 4 : i * 4 + 4] = bytes((r, g, b, a))
            sprite = _CursorSprite(reply.cursor_serial, Image.frombytes("RGBA", (w, h), bytes(buf)), reply.xhot, reply.yhot)
            conns["sprite"] = sprite
        return sprite, reply.x, reply.y

    def grab(self, *, cursor: bool = True) -> Image.Image:
        conns = self._conns()
        shot = conns["sct"].grab({"left": 0, "top": 0, "width": self.width, "height": self.height})
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX").convert("RGBA")
        if cursor:
            self.effects.draw(img)
            found = self._cursor(conns)
            if found:
                sprite, x, y = found
            else:
                sprite = self._fallback
                x = y = None
            if x is not None:
                img.alpha_composite(sprite.image, dest=(max(0, x - sprite.xhot), max(0, y - sprite.yhot)))
        return img

    def encode(self, img: Image.Image, fmt: str = "jpeg", quality: int = 80) -> bytes:
        out = io.BytesIO()
        if fmt.lower() in ("jpg", "jpeg"):
            img.convert("RGB").save(out, "JPEG", quality=quality)
        else:
            img.save(out, "PNG", optimize=False, compress_level=3)
        return out.getvalue()


class FrameStream:
    """Captures frames on a background thread while anyone is watching.

    Consumers call :meth:`latest` (or await new frames through ``wait``); the
    capture loop only runs when there is at least one subscriber.
    """

    def __init__(self, capture: ScreenCapture, fps: float = 20.0, quality: int = 78) -> None:
        self.capture = capture
        self.fps = fps
        self.quality = quality
        self._subscribers = 0
        self._cond = threading.Condition()
        self._frame: bytes | None = None
        self._seq = 0
        self._thread: threading.Thread | None = None
        self._stop = False

    def subscribe(self) -> None:
        with self._cond:
            self._subscribers += 1
            if self._thread is None or not self._thread.is_alive():
                self._stop = False
                self._thread = threading.Thread(target=self._loop, name="frame-capture", daemon=True)
                self._thread.start()

    def unsubscribe(self) -> None:
        with self._cond:
            self._subscribers = max(0, self._subscribers - 1)

    def wait(self, after_seq: int, timeout: float = 1.0) -> tuple[int, bytes | None]:
        with self._cond:
            self._cond.wait_for(lambda: self._seq != after_seq or self._stop, timeout=timeout)
            return self._seq, self._frame

    def stop(self) -> None:
        with self._cond:
            self._stop = True
            self._cond.notify_all()

    def _loop(self) -> None:
        interval = 1.0 / self.fps
        while True:
            with self._cond:
                if self._stop or self._subscribers == 0:
                    self._thread = None
                    return
            t0 = time.monotonic()
            try:
                frame = self.capture.encode(self.capture.grab(cursor=True), "jpeg", self.quality)
            except Exception as e:  # pragma: no cover - transient X errors
                logger.warning("frame capture failed: %s", e)
                time.sleep(0.5)
                continue
            with self._cond:
                self._frame = frame
                self._seq += 1
                self._cond.notify_all()
            time.sleep(max(0.0, interval - (time.monotonic() - t0)))
