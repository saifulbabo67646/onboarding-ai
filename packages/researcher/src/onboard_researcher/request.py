"""What the owner hands the researcher: a product URL, optional demo
credentials and optional hints. Everything else is discovered.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ResearchRequest:
    url: str
    product_name: str | None = None
    company_name: str | None = None
    # Free-form hints from the owner: audience, what to emphasise, what to avoid.
    notes: str | None = None
    # Extra starting points for documentation (help center, API docs, ...).
    docs_urls: list[str] = field(default_factory=list)
    language: str = "English"
    presenter_name: str = "Alex"
    # Target length of the live demo the playbook is written for.
    max_minutes: float = 20.0
    # name -> value. Typed into the sandbox while exploring, never shown to the model.
    secrets: dict[str, str] = field(default_factory=dict)
    research_docs: bool = True
    explore_app: bool = True

    def __post_init__(self) -> None:
        self.url = normalize_url(self.url)
        self.docs_urls = [normalize_url(u) for u in self.docs_urls if u and u.strip()]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ResearchRequest":
        known = set(cls.__dataclass_fields__)  # type: ignore[attr-defined]
        values = {k: v for k, v in data.items() if k in known and v is not None}
        if not values.get("url"):
            raise ValueError("A research request needs the product URL")
        secrets = values.get("secrets") or {}
        if isinstance(secrets, list):  # [{"name": ..., "value": ...}]
            secrets = {s["name"]: s["value"] for s in secrets if s.get("name") and s.get("value")}
        values["secrets"] = {str(k): str(v) for k, v in secrets.items()}
        values["docs_urls"] = [str(u) for u in values.get("docs_urls") or []]
        return cls(**values)


def normalize_url(url: str) -> str:
    url = url.strip()
    if not re.match(r"^[a-z][a-z0-9+.-]*://", url, re.IGNORECASE):
        url = "https://" + url
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError(f"Only http(s) URLs are supported: {url}")
    return url
