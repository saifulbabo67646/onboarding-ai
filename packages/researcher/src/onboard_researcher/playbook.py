"""The demo playbook: what the researcher learned, shaped as a plan a live
presenter can follow.

The playbook is structured (so it can be reviewed, refined and diffed) and
renders to the two plain-text fields a presenter consumes:

* :meth:`Playbook.render_goal` - the demo instruction (``DemoBrief.goal``);
* :meth:`Playbook.render_knowledge` - background notes (``DemoBrief.knowledge``).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from typing import Any


@dataclass
class DemoSection:
    title: str
    objective: str
    # How to get there in the UI, e.g. "Sidebar > Reports > New report".
    where: str = ""
    steps: list[str] = field(default_factory=list)
    talking_points: list[str] = field(default_factory=list)


@dataclass
class LoginGuide:
    required: bool = False
    steps: list[str] = field(default_factory=list)
    secret_names: list[str] = field(default_factory=list)


@dataclass
class FaqItem:
    question: str
    answer: str


@dataclass
class GlossaryItem:
    term: str
    meaning: str


@dataclass
class Playbook:
    product_name: str
    product_summary: str
    audience: str
    demo_title: str
    # One or two paragraphs in plain language: what the demo should achieve.
    goal: str
    duration_minutes: float
    opening: str
    sections: list[DemoSection] = field(default_factory=list)
    login: LoginGuide = field(default_factory=LoginGuide)
    faq: list[FaqItem] = field(default_factory=list)
    glossary: list[GlossaryItem] = field(default_factory=list)
    avoid: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)

    # -- serialisation -----------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Playbook":
        def pick(kind, raw: dict[str, Any]):
            names = {f.name for f in fields(kind)}
            return {k: v for k, v in (raw or {}).items() if k in names}

        values = pick(cls, data)
        values["sections"] = [DemoSection(**pick(DemoSection, s)) for s in data.get("sections") or []]
        values["login"] = LoginGuide(**pick(LoginGuide, data.get("login") or {}))
        values["faq"] = [FaqItem(**pick(FaqItem, f)) for f in data.get("faq") or []]
        values["glossary"] = [GlossaryItem(**pick(GlossaryItem, g)) for g in data.get("glossary") or []]
        values["duration_minutes"] = float(values.get("duration_minutes") or 15)
        for key in ("product_name", "product_summary", "audience", "demo_title", "goal", "opening"):
            values[key] = str(values.get(key) or "")
        return cls(**values)

    # -- rendering for the presenter ----------------------------------------------

    def render_goal(self) -> str:
        """The demo instruction: intent first, then the planned arc."""
        lines = [self.goal.strip()]
        if self.audience:
            lines.append(f"\nAudience: {self.audience.strip()}")
        lines.append(f"Target length: about {self.duration_minutes:g} minutes.")
        if self.opening:
            lines.append(f"Open with: {self.opening.strip()}")
        if self.sections:
            lines.append("\nPlanned flow:")
            for i, s in enumerate(self.sections, 1):
                lines.append(f"{i}. {s.title} - {s.objective}")
        if self.avoid:
            lines.append("\nAvoid: " + "; ".join(a.strip().rstrip(".") for a in self.avoid) + ".")
        return "\n".join(lines).strip()

    def render_knowledge(self) -> str:
        """Background notes: product facts, where things live, how to log in, FAQ."""
        out: list[str] = [f"## {self.product_name or 'The product'}", self.product_summary.strip()]
        if self.login.required:
            out.append("\n## Logging in")
            out += [f"- {step}" for step in self.login.steps]
            if self.login.secret_names:
                out.append(f"- Use `type_secret` with: {', '.join(self.login.secret_names)}")
        if self.sections:
            out.append("\n## Demo sections")
            for i, s in enumerate(self.sections, 1):
                out.append(f"\n### {i}. {s.title}")
                out.append(f"Goal: {s.objective}")
                if s.where:
                    out.append(f"Where: {s.where}")
                if s.steps:
                    out.append("Steps:")
                    out += [f"  {j}. {step}" for j, step in enumerate(s.steps, 1)]
                if s.talking_points:
                    out.append("Talking points:")
                    out += [f"  - {p}" for p in s.talking_points]
        if self.faq:
            out.append("\n## Likely questions")
            for item in self.faq:
                out.append(f"- Q: {item.question}\n  A: {item.answer}")
        if self.glossary:
            out.append("\n## Terms")
            out += [f"- {g.term}: {g.meaning}" for g in self.glossary]
        return "\n".join(out).strip()

    def redact(self, secrets: dict[str, str]) -> "Playbook":
        """Defence in depth: strip any secret value that leaked into the text."""
        values = [v for v in secrets.values() if len(v) >= 4]
        if not values:
            return self

        def clean(obj: Any) -> Any:
            if isinstance(obj, str):
                for v in values:
                    obj = obj.replace(v, "[secret]")
                return obj
            if isinstance(obj, list):
                return [clean(o) for o in obj]
            if isinstance(obj, dict):
                return {k: clean(v) for k, v in obj.items()}
            return obj

        return Playbook.from_dict(clean(self.to_dict()))


def _obj(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


_STR = {"type": "string"}
_STRS = {"type": "array", "items": _STR}

# JSON schema for structured outputs (``output_config.format``).
PLAYBOOK_SCHEMA: dict[str, Any] = _obj(
    {
        "product_name": _STR,
        "product_summary": {"type": "string", "description": "2-4 sentences: what it is, who it is for, why it matters."},
        "audience": {"type": "string", "description": "Who the demo is for and what they care about."},
        "demo_title": _STR,
        "goal": {
            "type": "string",
            "description": "The demo instruction for the presenter, in plain language, 1-2 short paragraphs: "
            "what to show, what the audience should understand, what to emphasise.",
        },
        "duration_minutes": {"type": "number"},
        "opening": {"type": "string", "description": "A one-sentence hook to open with."},
        "sections": {
            "type": "array",
            "items": _obj(
                {
                    "title": _STR,
                    "objective": {"type": "string", "description": "What the audience should take away."},
                    "where": {"type": "string", "description": "Navigation path in the UI, as observed."},
                    "steps": {**_STRS, "description": "Concrete UI steps, as observed or documented."},
                    "talking_points": {**_STRS, "description": "Value-focused things to say."},
                }
            ),
        },
        "login": _obj({"required": {"type": "boolean"}, "steps": _STRS, "secret_names": _STRS}),
        "faq": {"type": "array", "items": _obj({"question": _STR, "answer": _STR})},
        "glossary": {"type": "array", "items": _obj({"term": _STR, "meaning": _STR})},
        "avoid": {**_STRS, "description": "Things not to do or show during the live demo."},
        "sources": {**_STRS, "description": "URLs of documentation pages the playbook relies on."},
    }
)
