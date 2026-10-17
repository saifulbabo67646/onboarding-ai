"""Phase 1: read the product's public documentation.

On Anthropic's API Claude searches and reads the web itself (server-side
``web_search`` and ``web_fetch``). On portable backends the model reads pages
through a client-side ``fetch_page`` tool instead, starting from the product
URL and the owner's docs links and following links from there (no search).
Either way it writes research notes a presenter can rely on.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import aiohttp
from anthropic import AsyncAnthropic

from onboard_director.tools import define_tool

from .fetch import FetchError, fetch_page
from .llm import ResearchConfig, check_stop, request_params, run_with_server_tools, stream_message, text_of
from .request import ResearchRequest

logger = logging.getLogger("onboard.researcher.docs")

EventCallback = Callable[[str, dict[str, Any]], None]

SYSTEM = """\
You are a meticulous product researcher. A colleague will soon give a live demo of a web product, \
and you are preparing them. Use web search and web fetch to study the product's own public material: \
the website, documentation, help center, getting-started guides, changelog and pricing pages. Prefer \
official sources over third-party reviews.

Write concise research notes in Markdown with these sections:
## Product overview - what it is, who it is for, the problem it solves.
## Key capabilities - the features that matter most, with why they matter.
## Core workflows - the 3-6 most valuable tasks a new user does, each with documented steps \
(menu names, button labels) as precisely as the docs allow.
## Getting started and login - sign-in flow, onboarding steps, demo/sandbox data if any.
## Terminology - product-specific terms and what they mean.
## Likely questions - questions prospects commonly ask, with accurate answers from the docs.
## Sources - the URLs you relied on.

Only state what the sources support; mark anything uncertain. Do not invent features.\
"""

FETCH_PAGE = define_tool(
    "fetch_page",
    "Download a public web page and return its readable text and the links on it. Start from the URLs "
    "you were given and follow links to documentation, help and pricing pages.",
    {"url": {"type": "string", "description": "Absolute http(s) URL."}},
    ["url"],
)


@dataclass
class DocsDigest:
    notes: str
    sources: list[str] = field(default_factory=list)


class DocsResearcher:
    def __init__(
        self,
        request: ResearchRequest,
        *,
        client: AsyncAnthropic,
        config: ResearchConfig,
        on_event: EventCallback | None = None,
    ) -> None:
        self.request = request
        self.client = client
        self.config = config
        self.on_event = on_event or (lambda kind, data: None)

    def _prompt(self) -> str:
        r = self.request
        lines = [f"Product URL: {r.url}"]
        if r.product_name:
            lines.append(f"Product name: {r.product_name}")
        if r.company_name:
            lines.append(f"Company: {r.company_name}")
        if r.docs_urls:
            lines.append("Documentation the owner pointed to:\n" + "\n".join(f"- {u}" for u in r.docs_urls))
        if r.notes:
            lines.append(f"Owner's notes about the demo (audience, focus):\n<owner_notes>\n{r.notes}\n</owner_notes>")
        lines.append("Research the product and write the notes.")
        return "\n\n".join(lines)

    def _tools(self) -> list[dict[str, Any]]:
        return [
            {"type": "web_search_20260209", "name": "web_search", "max_uses": self.config.max_searches},
            {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": self.config.max_fetches},
        ]

    async def research(self) -> DocsDigest:
        self.on_event("progress", {"phase": "docs", "message": "Reading the product's documentation"})
        if not self.config.is_native:
            return await self._research_portable()
        params = request_params(
            self.config,
            system=SYSTEM,
            messages=[{"role": "user", "content": [{"type": "text", "text": self._prompt()}]}],
            tools=self._tools(),
        )
        responses = await run_with_server_tools(self.client, self.config, params, "documentation")
        sources = _sources(responses)
        for url in sources:
            self.on_event("progress", {"phase": "docs", "message": f"Read {url}"})
        notes = text_of(responses)
        logger.info("docs research: %d chars of notes from %d sources", len(notes), len(sources))
        return DocsDigest(notes=notes, sources=sources)


    async def _research_portable(self) -> DocsDigest:
        """Tool loop with client-side page fetching, for backends without server tools."""
        messages: list[dict[str, Any]] = [{"role": "user", "content": [{"type": "text", "text": self._prompt()}]}]
        sources: list[str] = []
        fetches = 0
        for _ in range(self.config.max_fetches + 4):
            params = request_params(self.config, system=SYSTEM, messages=messages, tools=[FETCH_PAGE])
            message = await stream_message(self.client, params, native=False)
            check_stop(message, "documentation")
            messages.append({"role": "assistant", "content": message.content})
            uses = [b for b in message.content if getattr(b, "type", None) == "tool_use"]
            if not uses:
                notes = text_of([message])
                logger.info("docs research (portable): %d chars from %d pages", len(notes), len(sources))
                return DocsDigest(notes=notes, sources=sources)
            results = []
            for block in uses:
                url = str((block.input or {}).get("url") or "")
                if fetches >= self.config.max_fetches:
                    content, error = "Page budget used up. Write the notes now.", True
                else:
                    fetches += 1
                    content, error = await self._fetch(url)
                    if not error:
                        sources.append(url)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": content, "is_error": error})
            messages.append({"role": "user", "content": results})
        messages.append({"role": "user", "content": "Stop reading now and write the research notes."})
        message = await stream_message(self.client, request_params(self.config, system=SYSTEM, messages=messages), native=False)
        return DocsDigest(notes=text_of([message]), sources=sources)

    async def _fetch(self, url: str) -> tuple[str, bool]:
        try:
            page = await fetch_page(url)
        except (FetchError, aiohttp.ClientError, TimeoutError, ValueError) as e:
            return f"Could not fetch {url}: {e}", True
        self.on_event("progress", {"phase": "docs", "message": f"Read {page.url}"})
        links = "\n".join(page.links[:60])
        return f"URL: {page.url}\nTitle: {page.title}\n\n{page.text}\n\nLinks on this page:\n{links}", False


def _sources(responses: list[Any]) -> list[str]:
    """URLs of pages successfully fetched, in order, without duplicates."""
    seen: dict[str, None] = {}
    for message in responses:
        for block in message.content:
            if getattr(block, "type", None) != "web_fetch_tool_result":
                continue
            result = getattr(block, "content", None)
            url = getattr(result, "url", None)
            if isinstance(url, str) and url:
                seen.setdefault(url, None)
    return list(seen)

