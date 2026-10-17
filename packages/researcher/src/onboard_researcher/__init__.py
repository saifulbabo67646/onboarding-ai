"""onboard-researcher: teach an AI presenter a product, automatically.

Give it a product URL (and demo credentials if the app needs a login). It reads
the public documentation, explores the live app in a sandbox, and writes a
demo playbook - the goal and preparation notes ``onboard-director`` presents
from. The owner reviews it once, refines it in plain language if needed, and
every visitor gets a demo based on it.
"""

from .docs import DocsDigest, DocsResearcher
from .explorer import AppExplorer, Exploration, Observation
from .llm import ResearchConfig, ResearchError
from .playbook import PLAYBOOK_SCHEMA, DemoSection, FaqItem, GlossaryItem, LoginGuide, Playbook
from .request import ResearchRequest
from .researcher import Researcher, ResearchResult, draft_of
from .writer import PlaybookWriter

__all__ = [
    "PLAYBOOK_SCHEMA",
    "AppExplorer",
    "DemoSection",
    "DocsDigest",
    "DocsResearcher",
    "Exploration",
    "FaqItem",
    "GlossaryItem",
    "LoginGuide",
    "Observation",
    "Playbook",
    "PlaybookWriter",
    "ResearchConfig",
    "ResearchError",
    "ResearchRequest",
    "ResearchResult",
    "Researcher",
    "draft_of",
]
