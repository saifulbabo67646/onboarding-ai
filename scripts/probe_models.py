"""Probe whether a model behind an Anthropic-compatible endpoint can drive the
presenter/researcher: can it see screenshots, does it accept Claude's computer
toolset, and how accurately does it click with plain tools?

    python scripts/probe_models.py --base-url https://api.cheaperinference.com \
        --models deepseek-v4.1-flash glm-5.3-flash

Reads the key from --api-key-env (default API_KEY) in the environment or .env.
The test screen is drawn locally with known element positions, so every click
is scored exactly; no sandbox or browser is needed.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import anthropic
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages" / "director" / "src"))
from onboard_director.tools import portable_computer_tool  # noqa: E402

W, H = 1280, 800
# A 1280x800 screenshot costs hundreds of input tokens; far fewer means the
# endpoint (or a proxy route) silently dropped the image.
IMAGE_TOKEN_FLOOR = 300

# name -> (x, y, w, h); what the model is asked to click.
TARGETS: dict[str, tuple[int, int, int, int]] = {
    "the blue 'Sign in' button": (540, 470, 200, 44),
    "the email address input field": (500, 300, 280, 40),
    "the 'Forgot password?' link": (660, 420, 120, 20),
    "'Pricing' in the top navigation bar": (900, 22, 70, 24),
    "the 'Create account' button": (540, 540, 200, 40),
    "the small gear (settings) icon in the top-right corner": (1220, 20, 28, 28),
}


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def draw_screen() -> Image.Image:
    """A plausible SaaS login page whose element boxes are exactly TARGETS."""
    img = Image.new("RGB", (W, H), "#f5f6f8")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 68], fill="white")
    d.line([0, 68, W, 68], fill="#e2e4e9")
    d.text((40, 22), "Acme Analytics", fill="#111", font=_font(22))
    for label, x in (("Product", 640), ("Customers", 760), ("Pricing", 900), ("Docs", 1010)):
        d.text((x, 24), label, fill="#333", font=_font(18))
    gx, gy, gw, gh = TARGETS["the small gear (settings) icon in the top-right corner"]
    cx, cy = gx + gw / 2, gy + gh / 2
    d.ellipse([gx + 4, gy + 4, gx + gw - 4, gy + gh - 4], outline="#555", width=3)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill="#555")
    for i in range(8):
        a = i * math.pi / 4
        d.line([cx + 10 * math.cos(a), cy + 10 * math.sin(a), cx + 14 * math.cos(a), cy + 14 * math.sin(a)], fill="#555", width=3)

    d.rounded_rectangle([460, 170, 820, 620], radius=14, fill="white", outline="#e2e4e9")
    d.text((500, 200), "Welcome back", fill="#111", font=_font(26))
    d.text((500, 240), "Sign in to your workspace", fill="#666", font=_font(15))
    ex, ey, ew, eh = TARGETS["the email address input field"]
    d.text((ex, ey - 22), "Email", fill="#333", font=_font(14))
    d.rounded_rectangle([ex, ey, ex + ew, ey + eh], radius=6, outline="#c8ccd4", width=2)
    d.text((ex + 12, ey + 11), "you@company.com", fill="#9aa1ae", font=_font(15))
    d.text((500, 350), "Password", fill="#333", font=_font(14))
    d.rounded_rectangle([500, 372, 780, 412], radius=6, outline="#c8ccd4", width=2)
    fx, fy, _, _ = TARGETS["the 'Forgot password?' link"]
    d.text((fx, fy), "Forgot password?", fill="#4f5bff", font=_font(14))
    sx, sy, sw, sh = TARGETS["the blue 'Sign in' button"]
    d.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=8, fill="#4f5bff")
    d.text((sx + 72, sy + 13), "Sign in", fill="white", font=_font(17))
    cx_, cy_, cw, ch = TARGETS["the 'Create account' button"]
    d.rounded_rectangle([cx_, cy_, cx_ + cw, cy_ + ch], radius=8, outline="#4f5bff", width=2)
    d.text((cx_ + 46, cy_ + 11), "Create account", fill="#4f5bff", font=_font(16))
    return img


def image_block(img: Image.Image) -> dict[str, Any]:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(buf.getvalue()).decode()}}


CLICK_TOOL = {
    "name": "click",
    "description": f"Left-click at a pixel position on the {W}x{H} screenshot.",
    "input_schema": {
        "type": "object",
        "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
        "required": ["x", "y"],
    },
}


@dataclass
class Result:
    model: str
    vision: str = ""
    vision_ok: bool = False
    toolset: str = ""
    placement: dict[str, str] = field(default_factory=dict)
    portable: list[dict[str, Any]] = field(default_factory=list)
    clicks: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def seen(self) -> list[dict[str, Any]]:
        """Clicks made while the model actually received the screenshot."""
        return [c for c in self.clicks if c.get("saw_image") and "at" in c]

    @property
    def hits(self) -> int:
        return sum(1 for c in self.seen if c["hit"])

    @property
    def delivered(self) -> str:
        sent = [c for c in self.clicks if "saw_image" in c]
        return f"{sum(c['saw_image'] for c in sent)}/{len(sent)}"


def _err(e: Exception) -> str:
    msg = getattr(e, "message", None) or str(e)
    status = getattr(e, "status_code", None)
    return f"{type(e).__name__}{f' {status}' if status else ''}: {msg[:200]}"


def saw_image(msg: Any) -> bool:
    return (getattr(msg.usage, "input_tokens", 0) or 0) >= IMAGE_TOKEN_FLOOR


def probe_vision(client: anthropic.Anthropic, model: str, img: Image.Image, r: Result, tries: int) -> None:
    for _ in range(tries):
        _vision_once(client, model, img, r)
        if r.vision_ok:
            return


def _vision_once(client: anthropic.Anthropic, model: str, img: Image.Image, r: Result) -> None:
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=2000,
            messages=[{"role": "user", "content": [image_block(img), {"type": "text", "text": (
                "Look at this screenshot. Reply with exactly three lines: the product name in the top-left, "
                "the text on the solid blue button, and the heading of the card."
            )}]}],
        )
        text = " | ".join(b.text.strip() for b in msg.content if b.type == "text").replace("\n", " | ")
        if not saw_image(msg):
            r.vision = f"(image dropped: {msg.usage.input_tokens} input tokens) {text}"
            return
        r.vision = text
        low = text.lower()
        r.vision_ok = "acme" in low and "sign in" in low and "welcome" in low
    except Exception as e:  # noqa: BLE001 - every failure is a finding
        r.vision = _err(e)
        r.errors.append(f"vision: {r.vision}")


def probe_toolset(client: anthropic.Anthropic, model: str, img: Image.Image, r: Result) -> None:
    """Does the endpoint accept Claude's computer toolset, and does the model use it?"""
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=400,
            tools=[{"type": "computer_toolset_20260801"}],
            messages=[{"role": "user", "content": [image_block(img), {"type": "text", "text": "Click the blue 'Sign in' button."}]}],
        )
        uses = [b for b in msg.content if b.type == "tool_use"]
        if uses:
            u = uses[0]
            r.toolset = f"accepted - called {u.name}({json.dumps(u.input)})"
        else:
            text = " ".join(b.text for b in msg.content if b.type == "text").strip()
            r.toolset = f"ignored - no tool call, replied: {text[:120]!r}"
    except Exception as e:  # noqa: BLE001
        r.toolset = f"rejected - {_err(e)}"


def probe_placement(client: anthropic.Anthropic, model: str, img: Image.Image, r: Result) -> None:
    """Is a screenshot read when it is inside a tool_result, or only as top-level content?"""
    tool = portable_computer_tool(W, H)
    question = "What text is on the solid blue button in that screenshot? Answer with just the text."
    prior = [
        {"role": "user", "content": "Take a screenshot so we can see the screen."},
        {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_1", "name": "computer", "input": {"action": "screenshot"}}]},
    ]
    variants = {
        "inside tool_result": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": [image_block(img)]},
                               {"type": "text", "text": question}],
        "top-level (hoisted)": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "Screenshot attached below."},
                                {"type": "text", "text": "Screenshot:"}, image_block(img), {"type": "text", "text": question}],
    }
    for name, content in variants.items():
        try:
            msg = client.messages.create(model=model, max_tokens=1000, tools=[tool],
                                         messages=[*prior, {"role": "user", "content": content}])
            answer = " ".join(b.text for b in msg.content if b.type == "text").strip()
            seen = saw_image(msg)
            ok = seen and "sign in" in answer.lower()
            r.placement[name] = f"{'PASS' if ok else 'FAIL'} ({msg.usage.input_tokens} input tokens) {answer[:60]!r}"
        except Exception as e:  # noqa: BLE001
            r.placement[name] = f"ERROR {_err(e)}"


def probe_portable(client: anthropic.Anthropic, model: str, img: Image.Image, r: Result, repeats: int) -> None:
    """Clicks through the portable ``computer`` tool, exactly as the presenter would use it."""
    tool = portable_computer_tool(W, H)
    for target, (x, y, w, h) in TARGETS.items():
        for _ in range(repeats):
            entry: dict[str, Any] = {"target": target}
            try:
                msg = client.messages.create(
                    model=model, max_tokens=600, tools=[tool],
                    messages=[{"role": "user", "content": [image_block(img), {"type": "text", "text": f"Click {target}."}]}],
                )
                entry["saw_image"] = saw_image(msg)
                use = next((b for b in msg.content if b.type == "tool_use" and b.name == "computer"), None)
                coord = (use.input or {}).get("coordinate") if use else None
                if use is None:
                    entry["error"] = "no computer call"
                elif use.input.get("action") not in ("left_click", "double_click") or not coord:
                    entry["error"] = f"unexpected action {json.dumps(use.input)[:80]}"
                else:
                    px, py = float(coord[0]), float(coord[1])
                    entry["at"] = [px, py]
                    entry["hit"] = x <= px <= x + w and y <= py <= y + h
            except Exception as e:  # noqa: BLE001
                entry["error"] = _err(e)
            r.portable.append(entry)


def probe_clicks(client: anthropic.Anthropic, model: str, img: Image.Image, r: Result, repeats: int) -> None:
    for target, box in TARGETS.items():
        for _ in range(repeats):
            r.clicks.append(_click_once(client, model, img, target, box))


def _click_once(
    client: anthropic.Anthropic, model: str, img: Image.Image, target: str, box: tuple[int, int, int, int]
) -> dict[str, Any]:
    x, y, w, h = box
    entry: dict[str, Any] = {"target": target}
    started = time.monotonic()
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=400,
            tools=[CLICK_TOOL],
            messages=[{"role": "user", "content": [image_block(img), {"type": "text", "text": (
                f"The screenshot is exactly {W}x{H} pixels. Use the click tool to click {target}."
            )}]}],
        )
        entry["seconds"] = round(time.monotonic() - started, 1)
        entry["saw_image"] = saw_image(msg)
        use = next((b for b in msg.content if b.type == "tool_use" and b.name == "click"), None)
        if use is None:
            entry["error"] = "no click call"
        else:
            px, py = float(use.input.get("x", -1)), float(use.input.get("y", -1))
            entry["at"] = [px, py]
            entry["hit"] = x <= px <= x + w and y <= py <= y + h
            entry["off_px"] = round(math.dist((px, py), (x + w / 2, y + h / 2)))
    except Exception as e:  # noqa: BLE001
        entry["error"] = _err(e)
    return entry


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base-url", default=os.environ.get("PROBE_BASE_URL"))
    p.add_argument("--api-key-env", default="API_KEY", help="env var holding the key (default API_KEY)")
    p.add_argument("--models", nargs="+", required=True)
    p.add_argument("--repeats", type=int, default=3, help="attempts per click target (default 3)")
    p.add_argument("--skip-plain", action="store_true", help="skip the plain click-tool test")
    p.add_argument("--save-screen", help="also write the test screenshot to this path")
    p.add_argument("--json", help="write full results as JSON to this path")
    args = p.parse_args()

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    key = os.environ.get(args.api_key_env)
    if not key:
        sys.exit(f"{args.api_key_env} is not set")
    client = anthropic.Anthropic(api_key=key, base_url=args.base_url, max_retries=1, timeout=120)
    img = draw_screen()
    if args.save_screen:
        img.save(args.save_screen)

    results = []
    for model in args.models:
        print(f"\n=== {model} ===", flush=True)
        r = Result(model)
        probe_vision(client, model, img, r, tries=args.repeats)
        print(f"vision   : {'PASS' if r.vision_ok else 'FAIL'}  {r.vision[:160]}", flush=True)
        probe_toolset(client, model, img, r)
        print(f"toolset  : {r.toolset}", flush=True)
        probe_placement(client, model, img, r)
        for name, verdict in r.placement.items():
            print(f"image {name:<20}: {verdict}", flush=True)
        probe_portable(client, model, img, r, repeats=args.repeats)
        seen_p = [c for c in r.portable if c.get("saw_image") and "at" in c]
        bad = [c for c in r.portable if "error" in c]
        print(f"portable : {sum(c['hit'] for c in seen_p)}/{len(seen_p)} hit when the image arrived"
              f" ({len(bad)} errors{': ' + bad[0]['error'] if bad else ''})", flush=True)
        if args.skip_plain:
            results.append(r)
            continue
        probe_clicks(client, model, img, r, repeats=args.repeats)
        for c in r.clicks:
            if "error" in c:
                print(f"  ERROR  {c['target']}: {c['error']}")
            elif not c["saw_image"]:
                print(f"  BLIND  {c['target']}: image dropped, ignored (clicked {c['at']})")
            else:
                mark = "HIT " if c["hit"] else "MISS"
                print(f"  {mark}  {c['target']}: clicked {c['at']} ({c['off_px']}px from centre, {c['seconds']}s)")
        print(f"clicks   : {r.hits}/{len(r.seen)} hit when the image arrived; image delivered {r.delivered}", flush=True)
        results.append(r)

    print("\n=== summary ===")
    print(f"{'model':<24}{'vision':<8}{'hits/seen':<11}{'img delivered':<15}toolset")
    for r in results:
        print(
            f"{r.model:<24}{'yes' if r.vision_ok else 'no':<8}{f'{r.hits}/{len(r.seen)}':<11}"
            f"{r.delivered:<15}{r.toolset.split(' - ')[0]}"
        )
    if args.json:
        Path(args.json).write_text(json.dumps([r.__dict__ for r in results], indent=2))


if __name__ == "__main__":
    main()
