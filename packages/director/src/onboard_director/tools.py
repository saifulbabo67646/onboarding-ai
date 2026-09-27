"""Tool definitions: Claude's computer-use toolset plus presenter tools."""

from __future__ import annotations

from typing import Any

COMPUTER_TOOLSET = {"type": "computer_toolset_20260801"}


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
        # Stream arguments as they are generated so speech can start sooner.
        "eager_input_streaming": True,
    }


_BOX = {
    "type": "array",
    "items": {"type": "number"},
    "minItems": 4,
    "maxItems": 4,
    "description": "Bounding box [x, y, width, height] in screenshot pixels.",
}

SAY = _tool(
    "say",
    "Speak to the audience in your own voice. Returns immediately by default so you can keep "
    "working while you talk; speech is queued in order.",
    {
        "text": {"type": "string", "description": "What to say. One or two natural sentences."},
        "wait_until_spoken": {
            "type": "boolean",
            "description": "Block until you finish speaking (e.g. before a dramatic reveal). Default false.",
        },
    },
    ["text"],
)

POINT_AT = _tool(
    "point_at",
    "Move the mouse onto something on screen, the way a presenter does while explaining it, and "
    "optionally say something about it at the same time. Waits until the sentence is spoken.",
    {
        "box": _BOX,
        "text": {"type": "string", "description": "Optional sentence to say while pointing."},
        "gesture": {
            "type": "string",
            "enum": ["hover", "circle", "underline", "wiggle"],
            "description": "hover (default) rests on it; circle lassos a region; underline sweeps under "
            "a line of text; wiggle is a small 'right here' shake.",
        },
    },
    ["box"],
)

OPEN_URL = _tool(
    "open_url",
    "Open a web address like a person: focus the address bar (or open a new tab), type it and press Enter.",
    {
        "url": {"type": "string"},
        "new_tab": {"type": "boolean", "description": "Open in a new tab (default true)."},
    },
    ["url"],
)

TYPE_SECRET = _tool(
    "type_secret",
    "Type a stored secret (password, API key, ...) into the focused field without revealing it. "
    "Click the field first.",
    {
        "name": {"type": "string", "description": "Name of the secret."},
        "press_enter": {"type": "boolean", "description": "Press Enter afterwards (default false)."},
    },
    ["name"],
)

LISTEN = _tool(
    "listen",
    "Pause and give the audience room to talk (after asking a question or 'any questions?'). "
    "Returns what they said, or that they stayed quiet.",
    {"seconds": {"type": "number", "description": "How long to wait for a reply (default 12, max 60)."}},
    [],
)

SKETCH = _tool(
    "sketch",
    "Draw on the Excalidraw canvas that is currently open, using its drawing tools with the mouse. "
    "Coordinates are screen pixels on the canvas area.",
    {
        "shapes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["rectangle", "ellipse", "diamond", "arrow", "line", "text", "freehand"],
                    },
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "width": {"type": "number"},
                    "height": {"type": "number"},
                    "to": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
                    "points": {"type": "array", "items": {"type": "array", "items": {"type": "number"}}},
                    "label": {"type": "string"},
                },
                "required": ["kind"],
                "additionalProperties": False,
            },
        }
    },
    ["shapes"],
)

END_DEMO = _tool(
    "end_demo",
    "Finish the session after you have said goodbye.",
    {"summary": {"type": "string", "description": "Private one-paragraph summary for the owner."}},
    ["summary"],
)


def presenter_tools(*, whiteboard: bool, secrets: bool) -> list[dict[str, Any]]:
    tools = [SAY, POINT_AT, OPEN_URL, LISTEN]
    if secrets:
        tools.append(TYPE_SECRET)
    if whiteboard:
        tools.append(SKETCH)
    tools.append(END_DEMO)
    return tools


# -- computer toolset members -> sandbox actions -----------------------------------

_CLICKS = {
    "left_click": ("left", 1),
    "right_click": ("right", 1),
    "middle_click": ("middle", 1),
    "double_click": ("left", 2),
    "triple_click": ("left", 3),
}


def computer_action(name: str, args: dict[str, Any], scale: float = 1.0) -> dict[str, Any] | None:
    """Translate a toolset member call into a sandbox action.

    Returns ``None`` for members handled by the director itself (screenshot,
    zoom, cursor_position). ``scale`` maps screenshot pixels to screen pixels.
    """

    def pt(value: Any) -> tuple[float, float]:
        x, y = value
        return float(x) / scale, float(y) / scale

    if name in _CLICKS:
        button, count = _CLICKS[name]
        action: dict[str, Any] = {"type": "click", "button": button, "count": count}
        if args.get("coordinate"):
            action["x"], action["y"] = pt(args["coordinate"])
        if args.get("text"):
            action["modifiers"] = args["text"]
        return action
    if name == "mouse_move":
        x, y = pt(args["coordinate"])
        return {"type": "move", "x": x, "y": y}
    if name == "left_click_drag":
        action = {"type": "drag", "start": list(pt(args["start_coordinate"])), "end": list(pt(args["coordinate"]))}
        if args.get("text"):
            action["modifiers"] = args["text"]
        return action
    if name == "left_mouse_down":
        return {"type": "mouse_down", "button": "left"}
    if name == "left_mouse_up":
        return {"type": "mouse_up", "button": "left"}
    if name == "scroll":
        action = {
            "type": "scroll",
            "direction": args.get("scroll_direction", "down"),
            "amount": int(args.get("scroll_amount", 3)),
        }
        if args.get("coordinate"):
            action["x"], action["y"] = pt(args["coordinate"])
        if args.get("text"):
            action["modifiers"] = args["text"]
        return action
    if name == "type":
        return {"type": "type", "text": args.get("text", "")}
    if name == "key":
        return {"type": "key", "keys": args["text"], "repeat": int(args.get("repeat", 1))}
    if name == "hold_key":
        return {"type": "hold_key", "keys": args["text"], "seconds": float(args.get("duration", 1))}
    if name == "wait":
        return {"type": "wait", "seconds": float(args.get("duration", 1))}
    if name in ("screenshot", "zoom", "cursor_position"):
        return None
    raise ValueError(f"Unsupported computer action: {name}")
