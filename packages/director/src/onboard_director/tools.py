"""Tool definitions: Claude's computer-use toolset plus presenter tools."""

from __future__ import annotations

from typing import Any

COMPUTER_TOOLSET = {"type": "computer_toolset_20260801"}

COMPUTER_ACTIONS = [
    "screenshot", "left_click", "right_click", "middle_click", "double_click", "triple_click",
    "mouse_move", "left_click_drag", "left_mouse_down", "left_mouse_up", "scroll",
    "type", "key", "hold_key", "wait", "zoom", "cursor_position",
]


def define_tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
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

SAY = define_tool(
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

POINT_AT = define_tool(
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

OPEN_URL = define_tool(
    "open_url",
    "Open a web address like a person: focus the address bar (or open a new tab), type it and press Enter.",
    {
        "url": {"type": "string"},
        "new_tab": {"type": "boolean", "description": "Open in a new tab (default true)."},
    },
    ["url"],
)

TYPE_SECRET = define_tool(
    "type_secret",
    "Type a stored secret (password, API key, ...) into the focused field without revealing it. "
    "Click the field first.",
    {
        "name": {"type": "string", "description": "Name of the secret."},
        "press_enter": {"type": "boolean", "description": "Press Enter afterwards (default false)."},
    },
    ["name"],
)

LISTEN = define_tool(
    "listen",
    "Pause and give the audience room to talk (after asking a question or 'any questions?'). "
    "Returns what they said, or that they stayed quiet.",
    {"seconds": {"type": "number", "description": "How long to wait for a reply (default 12, max 60)."}},
    [],
)

SKETCH = define_tool(
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

END_DEMO = define_tool(
    "end_demo",
    "Hang up the call for everyone and end the session. Only call this after you have said "
    "goodbye out loud; it waits for your last words to finish, then closes the meeting.",
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


def open_url_actions(url: str, *, new_tab: bool = True) -> list[dict[str, Any]]:
    """Sandbox actions that open a URL the way a person does: focus the address bar, type, Enter."""
    return [
        {"type": "key", "keys": "ctrl+t" if new_tab else "ctrl+l"},
        {"type": "wait", "seconds": 0.35},
        {"type": "type", "text": url},
        {"type": "wait", "seconds": 0.2},
        {"type": "key", "keys": "Return"},
        {"type": "wait", "seconds": 1.5},
    ]


def portable_computer_tool(width: int, height: int) -> dict[str, Any]:
    """Claude's computer toolset as an ordinary tool, for models without it.

    One ``computer`` tool whose ``action`` names and parameters match the
    toolset members, so both forms run through :func:`computer_action`.
    """
    point = {"type": "array", "items": {"type": "integer"}, "minItems": 2, "maxItems": 2}
    return {
        "name": "computer",
        "description": (
            f"Use the mouse and keyboard on a {width}x{height} pixel screen and look at it. Coordinates are "
            f"[x, y] pixels on the latest screenshot, origin top-left. Look at the screenshot carefully and "
            "aim for the centre of the element. Actions: screenshot; left_click/right_click/middle_click/"
            "double_click/triple_click (coordinate; text = modifier keys like 'ctrl'); mouse_move (coordinate); "
            "left_click_drag (start_coordinate, coordinate); left_mouse_down/left_mouse_up; scroll "
            "(coordinate, scroll_direction, scroll_amount); type (text); key (text = xdotool keys like "
            "'Return' or 'ctrl+a', optional repeat); hold_key (text, duration); wait (duration seconds); "
            "zoom (region = [x0, y0, x1, y1], returns a magnified view); cursor_position."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": COMPUTER_ACTIONS},
                "coordinate": point,
                "start_coordinate": point,
                "text": {"type": "string"},
                "scroll_direction": {"type": "string", "enum": ["up", "down", "left", "right"]},
                "scroll_amount": {"type": "integer"},
                "duration": {"type": "number"},
                "repeat": {"type": "integer"},
                "region": {"type": "array", "items": {"type": "integer"}, "minItems": 4, "maxItems": 4},
            },
            "required": ["action"],
        },
    }


def as_computer_call(block: Any) -> tuple[str, dict[str, Any]] | None:
    """``(action, args)`` if a tool_use block drives the computer, in either form."""
    args = block.input if isinstance(block.input, dict) else {}
    if getattr(block, "toolset_name", None) == "computer":
        return block.name, args
    if block.name == "computer" and isinstance(args.get("action"), str):
        return args["action"], args
    return None


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
