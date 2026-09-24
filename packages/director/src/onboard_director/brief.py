"""The demo brief: everything the owner configured for a presenting agent.

There is no knowledge base and no scripted step list - just a goal written in
plain language, a starting point, and a few presentation preferences. The
agent figures out the rest by looking at the screen.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote, urlparse

Mode = Literal["product_demo", "presentation"]

_SLIDES_RE = re.compile(r"https?://docs\.google\.com/presentation/d/([a-zA-Z0-9_-]{20,})")
_OFFICE_EXT = (".pptx", ".ppt", ".potx", ".docx", ".doc", ".xlsx", ".xls")


@dataclass
class DemoBrief:
    goal: str
    mode: Mode = "product_demo"
    start_url: str | None = None
    presenter_name: str = "Alex"
    company_name: str | None = None
    product_name: str | None = None
    audience_name: str | None = None
    greeting: str | None = None
    language: str = "English"
    allow_whiteboard: bool = False
    max_minutes: float = 30.0
    # name -> value. Values are typed into the sandbox but never shown to the model.
    secrets: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DemoBrief":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        values = {k: v for k, v in data.items() if k in known and v is not None}
        secrets = values.get("secrets") or {}
        if isinstance(secrets, list):  # [{"name": ..., "value": ...}]
            secrets = {s["name"]: s["value"] for s in secrets if s.get("name")}
        values["secrets"] = {str(k): str(v) for k, v in secrets.items()}
        if not values.get("goal"):
            raise ValueError("A demo brief needs a goal")
        if values.get("mode") not in (None, "product_demo", "presentation"):
            raise ValueError(f"Unknown mode: {values['mode']}")
        return cls(**values)

    @property
    def opening_url(self) -> str | None:
        return normalize_start_url(self.mode, self.start_url)


def google_slides_id(url: str | None) -> str | None:
    if not url:
        return None
    m = _SLIDES_RE.match(url.strip())
    return m.group(1) if m else None


def normalize_start_url(mode: str, url: str | None) -> str | None:
    """Turn a shared deck link into something that presents well in a browser.

    * Google Slides share/edit links open in presentation view.
    * Office files (``.pptx`` etc.) open in the Office Online viewer.
    * Anything else (PDF, Canva, Pitch, a web app) is used as-is.
    """
    if not url:
        return None
    url = url.strip()
    if not re.match(r"^[a-z]+://", url):
        url = "https://" + url
    if mode == "presentation":
        slides_id = google_slides_id(url)
        if slides_id:
            return f"https://docs.google.com/presentation/d/{slides_id}/present"
        path = urlparse(url).path.lower()
        if path.endswith(_OFFICE_EXT):
            return f"https://view.officeapps.live.com/op/view.aspx?src={quote(url, safe='')}"
    return url
