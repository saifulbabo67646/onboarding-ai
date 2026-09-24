"""onboard-sandbox: an isolated virtual desktop with real, human-like input.

The server side (``python -m onboard_sandbox``) runs Xvfb + a headful Chromium,
injects OS-level mouse/keyboard events through XTEST with human timing from
``onboard_humanize``, and streams the screen (with the real cursor) over a
WebSocket. The client side (:class:`SandboxClient`) and the provisioning
helpers have no X11 dependency and can run anywhere.
"""

from .client import SandboxClient, SandboxInterrupted
from .providers import (
    DockerProvider,
    LocalProcessProvider,
    SandboxLease,
    SandboxProvider,
    StaticProvider,
    provider_from_env,
)

__all__ = [
    "DockerProvider",
    "LocalProcessProvider",
    "SandboxClient",
    "SandboxInterrupted",
    "SandboxLease",
    "SandboxProvider",
    "StaticProvider",
    "provider_from_env",
]
