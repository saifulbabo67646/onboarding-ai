"""Phase 3: turn research notes and hands-on findings into a demo playbook,
and revise a playbook from the owner's feedback.
"""

from __future__ import annotations

import json
from typing import Any

from anthropic import AsyncAnthropic

from .docs import DocsDigest
from .explorer import Exploration
from .llm import ResearchConfig, ResearchError, structured
from .playbook import PLAYBOOK_SCHEMA, Playbook
from .request import ResearchRequest

SYSTEM = """\
You design live product demos. From research notes and hands-on findings, write a demo playbook that \
an AI presenter will follow on a real video call, sharing its screen and driving the product live.

What makes a great playbook:
- A clear story: start with the big picture, then the 2-5 workflows with the most customer value, \
then the outcome. Doing one real task end to end beats touring every menu.
- Sections that fit the time budget (roughly 2-5 minutes each, including talking).
- Steps that are concrete and verified: use the exact menu paths and labels observed in the app; fall \
back to the documentation only where the app was not explored, and never invent UI.
- Talking points about value and meaning ("see which campaigns pay off"), not mechanics ("click Reports").
- Honest FAQ answers grounded in the sources; skip questions you cannot answer.
- An `avoid` list: destructive actions, unfinished or broken areas, settings that would surprise the \
account owner, and anything the owner asked to skip.
- `login.secret_names` only lists names from the available secrets; never include secret values.
- The `goal` field speaks to the presenter in plain language, like an owner briefing a colleague.

Respect the owner's notes above everything else. Write in {language}.\
"""


class PlaybookWriter:
    def __init__(self, *, client: AsyncAnthropic, config: ResearchConfig) -> None:
        self.client = client
        self.config = config

    async def write(
        self,
        request: ResearchRequest,
        *,
        docs: DocsDigest | None = None,
        exploration: Exploration | None = None,
    ) -> Playbook:
        if not (docs and docs.notes) and not (exploration and exploration.observations):
            raise ResearchError("Nothing was learned about the product, so there is nothing to write from.")
        parts = [_context(request)]
        if docs and docs.notes:
            parts.append(f"<documentation_research>\n{docs.notes}\n</documentation_research>")
        if exploration and (exploration.observations or exploration.summary):
            parts.append(f"<hands_on_findings>\n{exploration.render()}\n</hands_on_findings>")
        parts.append("Write the demo playbook.")
        data = await self._ask(request, "\n\n".join(parts), "playbook")
        playbook = Playbook.from_dict(data)
        if docs:
            playbook.sources = list(dict.fromkeys([*playbook.sources, *docs.sources]))
        return playbook.redact(request.secrets)

    async def refine(self, request: ResearchRequest, playbook: Playbook, instruction: str) -> Playbook:
        instruction = instruction.strip()
        if not instruction:
            raise ResearchError("Tell me what to change.")
        prompt = "\n\n".join(
            [
                _context(request),
                f"<current_playbook>\n{json.dumps(playbook.to_dict(), ensure_ascii=False, indent=1)}\n</current_playbook>",
                f"<owner_feedback>\n{instruction}\n</owner_feedback>",
                "Revise the playbook to follow the owner's feedback. Keep everything the feedback does not "
                "touch as it is, including verified steps and sources.",
            ]
        )
        data = await self._ask(request, prompt, "refinement")
        return Playbook.from_dict(data).redact(request.secrets)

    async def _ask(self, request: ResearchRequest, prompt: str, phase: str) -> dict[str, Any]:
        return await structured(
            self.client,
            self.config,
            system=SYSTEM.format(language=request.language),
            content=[{"type": "text", "text": prompt}],
            schema=PLAYBOOK_SCHEMA,
            phase=phase,
        )


def _context(request: ResearchRequest) -> str:
    lines = [f"Product URL: {request.url}"]
    if request.product_name:
        lines.append(f"Product: {request.product_name}")
    if request.company_name:
        lines.append(f"Company presenting: {request.company_name}")
    lines.append(f"Presenter name: {request.presenter_name}")
    lines.append(f"Demo length: about {request.max_minutes:g} minutes")
    lines.append(f"Available secrets: {', '.join(sorted(request.secrets)) or 'none'}")
    if request.notes:
        lines.append(f"<owner_notes>\n{request.notes}\n</owner_notes>")
    return "\n".join(lines)
