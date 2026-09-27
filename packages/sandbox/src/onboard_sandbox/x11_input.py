"""Real mouse and keyboard input on an X11 display via the XTEST extension.

Events injected with XTEST are indistinguishable from a physical device for
applications: the browser receives genuine OS-level pointer motion, button
and key events (no DOM-level synthetic events, no automation flags).
"""

from __future__ import annotations

import logging
import time

from Xlib import X, XK
from Xlib import display as xdisplay
from Xlib.ext import xtest

logger = logging.getLogger("onboard.sandbox.input")

KEY_ALIASES = {
    "ctrl": "Control_L",
    "control": "Control_L",
    "alt": "Alt_L",
    "option": "Alt_L",
    "shift": "Shift_L",
    "super": "Super_L",
    "cmd": "Super_L",
    "command": "Super_L",
    "meta": "Super_L",
    "win": "Super_L",
    "enter": "Return",
    "return": "Return",
    "esc": "Escape",
    "escape": "Escape",
    "backspace": "BackSpace",
    "tab": "Tab",
    "space": "space",
    "del": "Delete",
    "delete": "Delete",
    "insert": "Insert",
    "home": "Home",
    "end": "End",
    "pageup": "Page_Up",
    "page_up": "Page_Up",
    "pgup": "Page_Up",
    "pagedown": "Page_Down",
    "page_down": "Page_Down",
    "pgdn": "Page_Down",
    "up": "Up",
    "down": "Down",
    "left": "Left",
    "right": "Right",
    "minus": "minus",
    "plus": "plus",
    "equal": "equal",
    "period": "period",
    "comma": "comma",
    "slash": "slash",
}

def char_to_keysym(ch: str) -> int:
    if ch == "\n":
        return XK.XK_Return
    if ch == "\t":
        return XK.XK_Tab
    code = ord(ch)
    if 0x20 <= code <= 0x7E or 0xA0 <= code <= 0xFF:
        return code
    return 0x01000000 | code


def name_to_keysym(name: str) -> int:
    alias = KEY_ALIASES.get(name.lower())
    if alias:
        return XK.string_to_keysym(alias)
    if len(name) == 1:
        return char_to_keysym(name)
    keysym = XK.string_to_keysym(name)
    if keysym == X.NoSymbol:
        # Try common capitalisations: "f5" -> "F5", "return" -> "Return".
        for candidate in (name.upper(), name.capitalize()):
            keysym = XK.string_to_keysym(candidate)
            if keysym != X.NoSymbol:
                break
    if keysym == X.NoSymbol:
        raise ValueError(f"Unknown key name: {name!r}")
    return keysym


def parse_combo(combo: str) -> list[int]:
    """``"ctrl+shift+t"`` -> keysyms. A lone ``+`` is the plus key."""
    if combo.strip() == "+":
        return [name_to_keysym("plus")]
    parts = [p for p in combo.replace(" ", "").split("+") if p]
    return [name_to_keysym(p) for p in parts]


class X11Input:
    """Injects pointer and keyboard events into an X display."""

    def __init__(self, display_name: str) -> None:
        self.display = xdisplay.Display(display_name)
        if not self.display.has_extension("XTEST"):
            raise RuntimeError(f"X display {display_name} lacks the XTEST extension")
        self.root = self.display.screen().root
        self._shift = self.display.keysym_to_keycode(XK.XK_Shift_L)
        self._spare = self._find_spare_keycode()

    # -- pointer ----------------------------------------------------------------

    def position(self) -> tuple[int, int]:
        pointer = self.root.query_pointer()
        return pointer.root_x, pointer.root_y

    def move(self, x: int, y: int) -> None:
        xtest.fake_input(self.display, X.MotionNotify, x=int(x), y=int(y))
        self.display.sync()

    def button(self, button: int, down: bool) -> None:
        xtest.fake_input(self.display, X.ButtonPress if down else X.ButtonRelease, button)
        self.display.sync()

    # -- keyboard ---------------------------------------------------------------

    def _find_spare_keycode(self) -> int | None:
        first = self.display.display.info.min_keycode
        count = self.display.display.info.max_keycode - first + 1
        mapping = self.display.get_keyboard_mapping(first, count)
        for offset, syms in enumerate(mapping):
            if not any(syms):
                return first + offset
        return None

    def _keycode_for(self, keysym: int) -> tuple[int, bool]:
        best: tuple[int, int] | None = None
        for keycode, index in self.display.keysym_to_keycodes(keysym):
            if index in (0, 1) and (best is None or index < best[1]):
                best = (keycode, index)
        if best:
            return best[0], best[1] == 1
        if self._spare is None:
            raise ValueError(f"No keycode available for keysym {keysym:#x}")
        # Temporarily bind the keysym to an unused keycode (same trick as xdotool).
        self.display.change_keyboard_mapping(self._spare, [(keysym, keysym)])
        self.display.sync()
        time.sleep(0.03)
        return self._spare, False

    def key(self, keycode: int, down: bool) -> None:
        xtest.fake_input(self.display, X.KeyPress if down else X.KeyRelease, keycode)
        self.display.sync()

    def keysym_down(self, keysym: int) -> tuple[int, bool]:
        keycode, shift = self._keycode_for(keysym)
        if shift:
            self.key(self._shift, True)
        self.key(keycode, True)
        return keycode, shift

    def keysym_up(self, keycode: int, shift: bool) -> None:
        self.key(keycode, False)
        if shift:
            self.key(self._shift, False)

    def combo_down(self, combo: str) -> list[tuple[int, bool]]:
        return [self.keysym_down(k) for k in parse_combo(combo)]

    def combo_up(self, pressed: list[tuple[int, bool]]) -> None:
        for keycode, shift in reversed(pressed):
            self.keysym_up(keycode, shift)

    def close(self) -> None:
        try:
            self.display.close()
        except Exception:  # pragma: no cover - best effort
            pass
