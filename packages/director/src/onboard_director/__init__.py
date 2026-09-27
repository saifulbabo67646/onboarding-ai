"""onboard-director: a Claude computer-use loop that presents like a person.

Give it a goal, a :class:`Computer` (e.g. an ``onboard_sandbox`` client) and a
:class:`Narrator` (a voice), and it runs a live product demo or slide
presentation: talking while it works, pointing at what it explains, handling
interruptions and questions.
"""

from .brief import DemoBrief, normalize_start_url
from .director import Director, DirectorConfig, is_backchannel
from .interfaces import Computer, Narrator, PrintNarrator, Speech

__all__ = [
    "Computer",
    "DemoBrief",
    "Director",
    "DirectorConfig",
    "Narrator",
    "PrintNarrator",
    "Speech",
    "is_backchannel",
    "normalize_start_url",
]
