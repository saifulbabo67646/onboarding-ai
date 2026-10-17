"""Client-side web page reading, for backends without Anthropic's server-side
``web_fetch``. The model chooses the URLs, so requests to private, loopback
and link-local addresses are refused (no reaching the dashboard, the Docker
network or cloud metadata endpoints from a prompt).
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urljoin, urldefrag, urlparse

import aiohttp

_SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "head"}
_BLOCK_TAGS = {"p", "div", "section", "article", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "table"}
MAX_BYTES = 2_000_000


class FetchError(Exception):
    pass


@dataclass
class Page:
    url: str
    title: str
    text: str
    links: list[str] = field(default_factory=list)


class _TextExtractor(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.parts: list[str] = []
        self.links: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")
        if tag in ("h1", "h2", "h3"):
            self.parts.append("#" * int(tag[1]) + " ")
        if tag == "a":
            href = dict(attrs).get("href")
            if href and not href.startswith(("mailto:", "javascript:", "tel:")):
                link = urldefrag(urljoin(self.base_url, href))[0]
                if link.startswith(("http://", "https://")) and link not in self.links:
                    self.links.append(link)

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        return re.sub(r"\n\s*\n+", "\n\n", raw).strip()


async def assert_public(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise FetchError("Only public http(s) URLs can be fetched.")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise FetchError(f"Could not resolve {parsed.hostname}.") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise FetchError(f"{parsed.hostname} is not a public address.")


async def fetch_page(url: str, *, max_chars: int = 20_000, timeout: float = 20.0) -> Page:
    """Download a page and reduce it to readable text plus its links."""
    current = url
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as http:
        for _ in range(5):  # follow redirects manually so every hop is checked
            await assert_public(current)
            async with http.get(current, allow_redirects=False, headers={"User-Agent": "onboard-researcher/0.1"}) as r:
                if r.status in (301, 302, 303, 307, 308) and r.headers.get("Location"):
                    current = urljoin(current, r.headers["Location"])
                    continue
                if r.status >= 400:
                    raise FetchError(f"HTTP {r.status} for {current}")
                body = await r.content.read(MAX_BYTES)
                ctype = r.headers.get("Content-Type", "")
                text = body.decode(r.get_encoding() if r.charset else "utf-8", errors="replace")
                if "html" not in ctype and not text.lstrip().startswith("<"):
                    return Page(current, "", text[:max_chars])
                parser = _TextExtractor(current)
                parser.feed(text)
                return Page(current, parser.title.strip(), parser.text()[:max_chars], parser.links[:80])
    raise FetchError("Too many redirects.")
