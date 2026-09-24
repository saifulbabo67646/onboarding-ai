"""Draw on an Excalidraw canvas the way a person does: pick a tool with its
keyboard shortcut, drag the shape out with the mouse, type labels.

Shapes use screen coordinates::

    {"kind": "rectangle", "x": 200, "y": 300, "width": 180, "height": 80, "label": "API"}
    {"kind": "ellipse" | "diamond", ...same as rectangle...}
    {"kind": "arrow" | "line", "x": 380, "y": 340, "to": [520, 340], "label": "calls"}
    {"kind": "text", "x": 200, "y": 450, "label": "Every request is authenticated"}
    {"kind": "freehand", "points": [[x, y], [x, y], ...]}
"""

from __future__ import annotations

from typing import Any

# Excalidraw single-key tool shortcuts.
TOOL_KEYS = {
    "rectangle": "r",
    "diamond": "d",
    "ellipse": "o",
    "arrow": "a",
    "line": "l",
    "freehand": "p",
    "text": "t",
}


def _label(text: str) -> list[dict[str, Any]]:
    return [
        {"type": "wait", "seconds": 0.25},
        {"type": "type", "text": text},
        {"type": "key", "keys": "Escape"},
    ]


def shape_actions(shape: dict[str, Any]) -> list[dict[str, Any]]:
    kind = shape.get("kind")
    if kind not in TOOL_KEYS:
        raise ValueError(f"Unsupported shape kind: {kind!r}")
    actions: list[dict[str, Any]] = [{"type": "key", "keys": TOOL_KEYS[kind]}]
    label = (shape.get("label") or "").strip()

    if kind in ("rectangle", "ellipse", "diamond"):
        x, y = float(shape["x"]), float(shape["y"])
        w, h = float(shape.get("width", 160)), float(shape.get("height", 80))
        actions.append({"type": "drag", "start": [x, y], "end": [x + w, y + h]})
        if label:
            # Enter on a selected container starts editing its bound text.
            actions += [{"type": "key", "keys": "Return"}, *_label(label)]
    elif kind in ("arrow", "line"):
        x, y = float(shape["x"]), float(shape["y"])
        tx, ty = shape["to"]
        actions.append({"type": "drag", "start": [x, y], "end": [float(tx), float(ty)]})
        if label:
            mx, my = (x + float(tx)) / 2, (y + float(ty)) / 2 - 22
            actions += [
                {"type": "key", "keys": TOOL_KEYS["text"]},
                {"type": "click", "x": mx, "y": my},
                *_label(label),
            ]
    elif kind == "text":
        actions += [{"type": "click", "x": float(shape["x"]), "y": float(shape["y"])}, *_label(label or "…")]
    elif kind == "freehand":
        points = [[float(p[0]), float(p[1])] for p in shape.get("points", [])]
        if len(points) < 2:
            raise ValueError("freehand needs at least two points")
        actions.append({"type": "trace", "points": points, "button": "left", "seconds_per_100px": 0.35})
    return actions


def sketch_actions(shapes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """All actions for a list of shapes, starting from a neutral canvas state."""
    actions: list[dict[str, Any]] = [{"type": "key", "keys": "Escape"}]
    for shape in shapes:
        actions += shape_actions(shape)
        actions.append({"type": "wait", "seconds": 0.2})
    return actions
