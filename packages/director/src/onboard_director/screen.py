"""How a computer-use model sees a :class:`Computer`: scaled screenshots, zooms
and coordinate mapping between screenshot pixels and screen pixels.

Shared by the live :class:`~onboard_director.Director` and any other loop that
drives a sandbox with Claude (for example ``onboard-researcher``).
"""

from __future__ import annotations

import base64
import io
import math
from typing import Any

from PIL import Image

from .interfaces import Computer

# Keep screenshots inside the model's comfortable image budget.
_MAX_EDGE = 1568
_MAX_PIXELS = 1_150_000


def image_block(img: Image.Image, quality: int) -> dict[str, Any]:
    """A base64 JPEG image content block for the Messages API."""
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=quality)
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(out.getvalue()).decode()},
    }


class ScreenView:
    def __init__(self, computer: Computer, *, quality: int = 80) -> None:
        self.computer = computer
        self.quality = quality
        self.size = (1280, 800)
        # Screenshot pixels per screen pixel (<= 1).
        self.scale = 1.0

    async def calibrate(self) -> None:
        health = await self.computer.health()
        w, h = health.get("size", self.size)
        self.size = (int(w), int(h))
        self.scale = min(1.0, _MAX_EDGE / max(w, h), math.sqrt(_MAX_PIXELS / (w * h)))

    async def image(self) -> Image.Image:
        data = await self.computer.screenshot(fmt="jpeg", quality=self.quality)
        img = Image.open(io.BytesIO(data))
        if self.scale < 1.0:
            img = img.resize((round(img.width * self.scale), round(img.height * self.scale)), Image.LANCZOS)
        return img

    async def blocks(self) -> list[dict[str, Any]]:
        return [image_block(await self.image(), self.quality)]

    async def zoom(self, region: list[float]) -> list[dict[str, Any]]:
        img = await self.image()
        x0, y0, x1, y1 = [int(v) for v in region]
        crop = img.crop((max(0, x0), max(0, y0), min(img.width, x1), min(img.height, y1)))
        ratio = min(img.width / max(1, crop.width), img.height / max(1, crop.height))
        crop = crop.resize((max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio))), Image.LANCZOS)
        return [image_block(crop, 90)]

    async def cursor_text(self) -> str:
        x, y = (await self.computer.health())["cursor"]
        return f"X={round(x * self.scale)}, Y={round(y * self.scale)}"

    def to_screen(self, value: float) -> float:
        """Screenshot pixels -> screen pixels."""
        return float(value) / self.scale
