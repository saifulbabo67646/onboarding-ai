"""
Browser Agent

Manages agent-browser lifecycle and executes browser automation commands.
Handles:
- Starting/stopping the agent-browser process with WSS streaming
- Executing CLI commands via subprocess
- Getting page snapshots for AI decision-making
"""

import asyncio
import glob
import logging
import os
import pathlib
import shlex
import shutil
import socket
import subprocess
import time

logger = logging.getLogger("onboarding-agent.browser")

BASE_STREAM_PORT = int(os.getenv("AGENT_BROWSER_BASE_STREAM_PORT", "10000"))
VIEWPORT_WIDTH = int(os.getenv("AGENT_BROWSER_VIEWPORT_WIDTH", "1280"))
VIEWPORT_HEIGHT = int(os.getenv("AGENT_BROWSER_VIEWPORT_HEIGHT", "720"))


def find_free_port(start: int = BASE_STREAM_PORT, max_attempts: int = 200) -> int:
    """Find a free TCP port starting from `start`."""
    for port in range(start, start + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No free port found in range {start}-{start + max_attempts}")

# JavaScript to inject a visible cursor overlay into the page.
# CDP mouse events trigger real DOM mousemove/mousedown/mouseup events,
# so the injected cursor follows the agent's actions in the screencast.
# Kept minimal to avoid triggering extra screencast frames (which cause blinking).
# No idle animation — cursor stays still when not being moved by agent commands.
CURSOR_INJECT_JS = r"""
(function() {
  if (document.getElementById('__agent_cursor')) return;

  var cursor = document.createElement('div');
  cursor.id = '__agent_cursor';
  cursor.style.cssText = 'position:fixed;top:0;left:0;width:40px;height:40px;pointer-events:none;z-index:2147483647;transition:transform 0.25s cubic-bezier(0.25,1,0.5,1);transform:translate(300px,300px);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));';
  cursor.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M5 3L19 12L12 13L9 20L5 3Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>';
  document.documentElement.appendChild(cursor);

  var rippleContainer = document.createElement('div');
  rippleContainer.id = '__agent_cursor_ripples';
  rippleContainer.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483645;';
  document.documentElement.appendChild(rippleContainer);

  document.addEventListener('mousemove', function(e) {
    if (e.clientX < 0 || e.clientY < 0) return;
    cursor.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
  }, true);

  document.addEventListener('mousedown', function(e) {
    if (e.clientX < 0 || e.clientY < 0) return;
    var ripple = document.createElement('div');
    ripple.style.cssText = 'position:fixed;pointer-events:none;border-radius:50%;border:2.5px solid rgba(99,102,241,0.8);background:rgba(99,102,241,0.15);width:12px;height:12px;left:' + (e.clientX - 6) + 'px;top:' + (e.clientY - 6) + 'px;transition:all 0.45s ease-out;';
    rippleContainer.appendChild(ripple);
    requestAnimationFrame(function() {
      ripple.style.width = '50px'; ripple.style.height = '50px';
      ripple.style.left = (e.clientX - 25) + 'px'; ripple.style.top = (e.clientY - 25) + 'px';
      ripple.style.opacity = '0';
    });
    setTimeout(function() { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 500);
  }, true);
})();
"""

# Resolve at module load time (parent process where these env vars exist)
_AGENT_BROWSER_BIN = shutil.which("agent-browser") or "agent-browser"
_NODE_BIN_DIR = str(pathlib.Path(_AGENT_BROWSER_BIN).parent)

# Snapshot X11/Wayland display vars from the parent process.
# Child processes forked by livekit-agents may lose these.
_PARENT_DISPLAY_ENV = {}
for _key in ("DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"):
    _val = os.environ.get(_key)
    if _val:
        _PARENT_DISPLAY_ENV[_key] = _val
logger.info(f"Captured display env from parent: {list(_PARENT_DISPLAY_ENV.keys())}")


def _build_env(stream_port: int, session_name: str = "default") -> dict:
    """Build an environment dict for agent-browser subprocesses.
    Ensures DISPLAY, PATH, STREAM_PORT, and SESSION are always set correctly,
    even in livekit-agents child processes.
    """
    env = os.environ.copy()
    # Inject display vars captured from parent
    env.update(_PARENT_DISPLAY_ENV)
    env["AGENT_BROWSER_STREAM_PORT"] = str(stream_port)
    # Isolate each daemon into its own named session so concurrent
    # instances get separate browser processes, cookies, and state.
    env["AGENT_BROWSER_SESSION"] = session_name
    # Ensure PATH includes node bin dir
    if _NODE_BIN_DIR not in env.get("PATH", ""):
        env["PATH"] = f"{_NODE_BIN_DIR}:{env.get('PATH', '')}"
    return env


class BrowserAgent:
    """Manages an isolated agent-browser process per session.

    Each instance launches its own agent-browser daemon on a unique port,
    ensuring multiple concurrent sessions don't share the same browser.
    """

    def __init__(self, room_name: str, stream_port: int | None = None):
        self._room_name = room_name
        self._stream_port = stream_port or find_free_port()
        self._started = False
        self._daemon_proc: asyncio.subprocess.Process | None = None
        logger.info(f"[{room_name}] BrowserAgent allocated stream port {self._stream_port}")

    @property
    def stream_port(self) -> int:
        """The WebSocket stream port for this session's agent-browser instance."""
        return self._stream_port

    async def launch_daemon(self):
        """Launch a dedicated agent-browser daemon for this session.
        Starts agent-browser with streaming enabled on self._stream_port.
        """
        if self._daemon_proc is not None:
            logger.warning(f"[{self._room_name}] Daemon already running on port {self._stream_port}")
            return

        env = _build_env(self._stream_port, session_name=self._room_name)
        cmd = [_AGENT_BROWSER_BIN, "open", "about:blank"]
        logger.info(f"[{self._room_name}] Launching agent-browser daemon: {' '.join(cmd)} (port {self._stream_port}, session {self._room_name})")

        self._daemon_proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # Wait for the daemon to be ready (stream port accepting connections)
        ready = False
        for attempt in range(30):
            await asyncio.sleep(1.0)
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    s.connect(('127.0.0.1', self._stream_port))
                    ready = True
                    break
            except OSError:
                if attempt % 5 == 4:
                    logger.debug(f"[{self._room_name}] Waiting for daemon on port {self._stream_port} (attempt {attempt + 1})...")

        if ready:
            logger.info(f"[{self._room_name}] agent-browser daemon ready on port {self._stream_port}")
        else:
            logger.error(f"[{self._room_name}] agent-browser daemon did not become ready on port {self._stream_port}")

    async def stop_daemon(self):
        """Stop the agent-browser daemon for this session."""
        if self._daemon_proc:
            try:
                self._daemon_proc.terminate()
                await asyncio.wait_for(self._daemon_proc.wait(), timeout=5.0)
                logger.info(f"[{self._room_name}] agent-browser daemon stopped (port {self._stream_port})")
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    self._daemon_proc.kill()
                except ProcessLookupError:
                    pass
                logger.warning(f"[{self._room_name}] agent-browser daemon force-killed")
            finally:
                self._daemon_proc = None

    async def start(self, url: str) -> str:
        """Launch daemon (if needed) and navigate to URL."""
        if self._started:
            return "Browser already started"

        # Launch a per-session daemon if one isn't running
        if self._daemon_proc is None:
            await self.launch_daemon()

        logger.info(f"[{self._room_name}] Navigating agent-browser to {url}")

        # Navigate to the target URL
        result = await self._run_command(f"open {url}")

        # Set viewport size
        await self._run_command(f"set viewport {VIEWPORT_WIDTH} {VIEWPORT_HEIGHT}")

        # Wait for page to fully load
        await self._run_command("wait --load networkidle")

        # Inject visible cursor overlay so screencast frames show a cursor
        await self._inject_cursor()

        self._started = True
        logger.info(f"[{self._room_name}] agent-browser navigated to {url}")
        return result

    async def _inject_cursor(self):
        """Inject a visible cursor element into the current page.
        Re-injects after navigation since new pages won't have it."""
        try:
            js_escaped = CURSOR_INJECT_JS.replace('"', '\\"').replace('\n', ' ')
            await self._run_command(f'eval "{js_escaped}"')
            logger.info("Cursor overlay injected into page")
        except Exception as e:
            logger.warning(f"Failed to inject cursor: {e}")

    # Actions where we move the cursor to the target element first
    _HOVER_BEFORE_ACTIONS = {"click", "dblclick", "type", "fill", "select", "check", "uncheck", "focus"}

    async def _move_cursor_to_target(self, target: str):
        """Move the visible cursor to the target element before interacting.
        Uses 'hover' which dispatches mouseMoved CDP events, making the
        injected cursor smoothly travel to the element in the screencast."""
        if not target:
            return
        try:
            await self._run_command(f"hover {target}")
            # Brief pause so the screencast captures the cursor arriving
            await asyncio.sleep(0.3)
        except Exception as e:
            logger.debug(f"Could not hover before action: {e}")

    async def execute_action(self, action: str, target: str = "", value: str = "") -> str:
        """Execute a single browser action via agent-browser CLI.

        Args:
            action: Command name (click, type, scroll, open, press, etc.)
            target: Target selector or element ref (@e1, CSS selector, URL)
            value: Optional value (text to type, scroll amount, etc.)
        """
        # Auto-start browser on first action if not started
        if not self._started and action == "open":
            return await self.start(target)

        # Move cursor to the target element first for visual feedback
        if action in self._HOVER_BEFORE_ACTIONS and target:
            await self._move_cursor_to_target(target)

        parts = [action]
        if target:
            parts.append(target)
        if value:
            parts.append(f'"{value}"' if " " in value else value)

        command = " ".join(parts)
        logger.info(f"Executing browser command: {command}")
        result = await self._run_command(command)

        # Wait for page to settle after navigation-triggering actions
        if action == "open":
            await self._run_command("wait --load networkidle")
            await self._inject_cursor()
        elif action == "click":
            # Click may or may not navigate; use a short timeout so we don't hang
            try:
                await asyncio.wait_for(
                    self._run_command("wait --load networkidle"),
                    timeout=5.0,
                )
            except asyncio.TimeoutError:
                logger.debug("networkidle wait after click timed out (non-navigation click)")
            await self._inject_cursor()

        return result

    async def get_snapshot(self) -> str:
        """Get the current page's accessibility tree snapshot with element refs."""
        result = await self._run_command("snapshot -i --json")
        return result

    async def cleanup(self):
        """Close the browser and stop the daemon."""
        if self._started:
            try:
                await self._run_command("close")
            except Exception as e:
                logger.warning(f"[{self._room_name}] Error closing browser: {e}")
            self._started = False
        await self.stop_daemon()
        logger.info(f"[{self._room_name}] agent-browser cleaned up (port {self._stream_port})")

    async def _run_command(self, command: str) -> str:
        """Run an agent-browser CLI command and return its output."""
        env = _build_env(self._stream_port, session_name=self._room_name)
        full_command = f"{_AGENT_BROWSER_BIN} {command}"
        logger.info(f"[{self._room_name}] Running: {full_command}")

        proc = None
        try:
            proc = await asyncio.create_subprocess_exec(
                _AGENT_BROWSER_BIN,
                *shlex.split(command),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)

            output = stdout.decode().strip()
            err_output = stderr.decode().strip()
            if proc.returncode != 0:
                logger.error(f"agent-browser error (rc={proc.returncode}): {err_output}")
                return f"Error: {err_output}"

            if err_output:
                logger.debug(f"agent-browser stderr: {err_output}")

            return output if output else "OK"
        except asyncio.TimeoutError:
            logger.error(f"Command timed out: {full_command}")
            if proc and proc.returncode is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
            return "Error: Command timed out"
        except Exception as e:
            logger.error(f"Command failed: {e}")
            return f"Error: {str(e)}"
