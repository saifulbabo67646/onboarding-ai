"""The research pipeline: docs -> hands-on exploration -> playbook.

Phases degrade gracefully: if the docs can't be read the app is still explored,
and if no sandbox is available the playbook is written from the docs alone.
Only when nothing at all was learned does research fail.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from anthropic import AsyncAnthropic
from onboard_sandbox import SandboxProvider

from .docs import DocsDigest, DocsResearcher
from .explorer import AppExplorer, Exploration
from .llm import ResearchConfig, ResearchError
from .playbook import Playbook
from .request import ResearchRequest
from .writer import PlaybookWriter

logger = logging.getLogger("onboard.researcher")

EventCallback = Callable[[str, dict[str, Any]], None]


@dataclass
class ResearchResult:
    playbook: Playbook
    docs: DocsDigest | None = None
    exploration: Exploration | None = None
    warnings: list[str] = field(default_factory=list)

    def draft(self) -> dict[str, Any]:
        """What the dashboard stores and shows for review."""
        return draft_of(self.playbook)


def draft_of(playbook: Playbook) -> dict[str, Any]:
    return {
        "goal": playbook.render_goal(),
        "knowledge": playbook.render_knowledge(),
        "playbook": playbook.to_dict(),
    }


class Researcher:
    def __init__(
        self,
        request: ResearchRequest,
        *,
        client: AsyncAnthropic | None = None,
        config: ResearchConfig | None = None,
        provider: SandboxProvider | None = None,
        on_event: EventCallback | None = None,
        session_id: str = "research",
    ) -> None:
        self.request = request
        self.config = config or ResearchConfig()
        self.client = client or self.config.backend.client()
        self.provider = provider
        self.on_event = on_event or (lambda kind, data: None)
        self.session_id = session_id

    async def run(self) -> ResearchResult:
        warnings: list[str] = []
        docs: DocsDigest | None = None
        exploration: Exploration | None = None

        if self.request.research_docs:
            self._status("docs")
            try:
                docs = await DocsResearcher(
                    self.request, client=self.client, config=self.config, on_event=self.on_event
                ).research()
            except Exception as e:  # noqa: BLE001 - keep going with what we can learn
                warnings.append(self._warn("docs", f"Could not read the documentation: {e}"))

        if self.request.explore_app:
            if self.provider is None:
                warnings.append(self._warn("explore", "No sandbox is configured, so the app was not explored."))
            else:
                self._status("explore")
                try:
                    exploration = await self._explore(docs)
                except Exception as e:  # noqa: BLE001
                    warnings.append(self._warn("explore", f"Could not explore the app: {e}"))
                else:
                    if exploration.stopped_early:
                        warnings.append(self._warn(
                            "explore",
                            f"Exploring stopped early; the draft uses the {len(exploration.observations)} findings "
                            f"made before that: {exploration.stopped_early}",
                        ))

        self._status("write")
        self.on_event("progress", {"phase": "write", "message": "Writing the demo playbook"})
        playbook = await PlaybookWriter(client=self.client, config=self.config).write(
            self.request, docs=docs, exploration=exploration
        )
        return ResearchResult(playbook=playbook, docs=docs, exploration=exploration, warnings=warnings)

    async def _explore(self, docs: DocsDigest | None) -> Exploration:
        assert self.provider is not None
        lease = await self.provider.acquire(f"{self.session_id}-explore", start_url=self.request.url)
        computer = lease.client()
        try:
            explorer = AppExplorer(
                self.request, computer, client=self.client, config=self.config, on_event=self.on_event
            )
            return await explorer.explore(docs.notes if docs else None)
        finally:
            await computer.close()
            await lease.release()

    def _status(self, phase: str) -> None:
        self.on_event("status", {"state": "researching", "phase": phase})

    def _warn(self, phase: str, message: str) -> str:
        logger.warning("[%s] %s", phase, message)
        self.on_event("warning", {"phase": phase, "message": message})
        return message


__all__ = ["ResearchError", "ResearchResult", "Researcher", "draft_of"]
