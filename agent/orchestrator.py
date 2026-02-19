"""
Orchestrator Agent

The main AI agent that joins the LiveKit room. Handles:
- Voice conversation (STT ↔ TTS)
- Delegating to RAG Agent and Browser Agent via tool calls
- Managing the onboarding flow and task queue
"""

import asyncio
import logging
import os

import aiohttp
from livekit.agents import Agent, AgentSession, RunContext
from livekit.agents.llm import function_tool

from browser_agent import BrowserAgent
from rag_agent import RAGAgent
from task_queue import TaskQueue

logger = logging.getLogger("onboarding-agent.orchestrator")

TARGET_APP_URL = os.getenv("TARGET_APP_URL", "https://trytaiga.com")
PROXY_REGISTER_URL = os.getenv("PROXY_REGISTER_URL", "http://localhost:9224")

SYSTEM_INSTRUCTIONS = """You are an AI onboarding assistant. Your job is to guide new users through a web application by controlling a browser and explaining features step by step.

The user can see the browser you are controlling in real-time on their screen.

Behavior:
1. When a user joins, greet them warmly and tell them you are ready to guide them through the application. Ask if they'd like a guided tour.
2. When they confirm, use the get_onboarding_steps tool to retrieve the onboarding plan.
3. For each step, first speak a SHORT narration (1-2 sentences max) describing what you are about to do, then call execute_browser_action.
4. IMPORTANT: Do NOT narrate and call a browser action at the same time. Always finish your narration sentence FIRST, then call the tool in a separate turn. This keeps your speech synchronized with the screen.
5. After the action completes, briefly describe what happened or what the user is seeing.
6. After completing a group of related steps, ask the user if they have questions.
7. If the user asks a question at any time, answer it helpfully using your knowledge and the answer_question tool.
8. When all steps are done, ask if they have any final questions and wrap up.

Keep your speech natural, concise, and friendly — like a helpful colleague showing someone around.
Keep narrations to 1-2 short sentences before each action so the screen stays in sync with your voice.

## Browser Control — Mandatory Workflow

You control a real browser via the execute_browser_action tool. Follow this workflow strictly:

### Step A — Always snapshot before interacting
Before ANY click, fill, select, or check action, call get_page_snapshot to get element refs (@e1, @e2, ...).
Never guess or reuse old refs — refs are invalidated after every navigation or DOM change.

### Step B — Use refs to interact
Use the @eN refs returned by the snapshot as the `target` for actions:
  fill @e2 "user@example.com"   → clears the field and types the value
  click @e3                     → clicks the element
  press Enter                   → submits a form or triggers keyboard action
  select @e4 "Option Name"      → picks a dropdown option
  check @e5                     → checks a checkbox
  scroll down 500               → scrolls the page down 500px
  scrollintoview @e6            → scrolls an off-screen element into view

### Step C — Re-snapshot after navigation or dynamic changes
After any click that navigates to a new page, or after a modal/dropdown opens, always call get_page_snapshot again before the next interaction.

## Form Filling — Exact Pattern

When asked to fill a form (e.g. login with email and password):
1. Call get_page_snapshot → identify the email input ref (e.g. @e2) and password input ref (e.g. @e3) and submit button ref (e.g. @e4)
2. execute_browser_action: action="fill", target="@e2", value="user@example.com"
3. execute_browser_action: action="fill", target="@e3", value="password123"
4. execute_browser_action: action="click", target="@e4"
5. Call get_page_snapshot again to confirm the result

## Semantic Locators — Fallback When Refs Are Unavailable

If a snapshot is not available or an element is hard to find by ref, use semantic locators:
  action="find", target="label 'Email' fill", value="user@example.com"
  action="find", target="placeholder 'Password' fill", value="secret"
  action="find", target="role button click", value="Submit"
  action="find", target="text 'Sign In' click"

## Key Commands Quick Reference

| action        | target                  | value          | description                        |
|---------------|-------------------------|----------------|------------------------------------|
| snapshot      | (none)                  | (none)         | Use get_page_snapshot tool instead |
| fill          | @eN                     | text to enter  | Clear field and type               |
| type          | @eN                     | text to append | Type without clearing              |
| click         | @eN                     | (none)         | Click element                      |
| press         | Enter / Tab / Escape    | (none)         | Press keyboard key                 |
| select        | @eN                     | option label   | Pick dropdown option               |
| check         | @eN                     | (none)         | Check a checkbox                   |
| uncheck       | @eN                     | (none)         | Uncheck a checkbox                 |
| scroll        | down / up               | pixels (e.g. 500) | Scroll the page                 |
| scrollintoview| @eN                     | (none)         | Scroll element into view           |
| hover         | @eN                     | (none)         | Hover over element                 |
| open          | https://url             | (none)         | Navigate to URL                    |
| wait          | --load networkidle      | (none)         | Wait for page to fully load        |
| wait          | @eN                     | (none)         | Wait for element to appear         |
| get           | url                     | (none)         | Get current page URL               |
| get           | title                   | (none)         | Get page title                     |
| get           | text @eN                | (none)         | Get text content of element        |
"""

# Delay (seconds) before executing a browser action, giving TTS time to finish narrating
PRE_ACTION_DELAY = float(os.getenv("PRE_ACTION_DELAY", "1.5"))


class OnboardingOrchestrator(Agent):
    def __init__(self, room_name: str):
        super().__init__(instructions=SYSTEM_INSTRUCTIONS)
        self._room_name = room_name
        self._browser_agent = BrowserAgent(room_name=room_name)
        self._rag_agent = RAGAgent()
        self._task_queue = TaskQueue()

    @property
    def stream_port(self) -> int:
        """The agent-browser stream port for this session."""
        return self._browser_agent.stream_port

    async def on_enter(self):
        """Called when the agent becomes active in the session."""
        logger.info(f"[{self._room_name}] Orchestrator agent entered session")

        # Start browser in background so it's ready when the user wants a tour
        asyncio.create_task(self._start_browser())

        self.session.generate_reply(
            instructions="Greet the user warmly. Introduce yourself as their AI onboarding assistant. Tell them you are ready to guide them through the application. Ask if they'd like a guided tour."
        )

    async def _start_browser(self):
        """Start agent-browser, navigate to target URL, and register with proxy."""
        try:
            logger.info(f"[{self._room_name}] Opening browser at {TARGET_APP_URL}")
            await self._browser_agent.start(TARGET_APP_URL)
            # Register room→port mapping with the proxy so clients can route
            await self._register_with_proxy()
            logger.info(f"[{self._room_name}] Browser started successfully on port {self._browser_agent.stream_port}")
        except Exception as e:
            logger.error(f"[{self._room_name}] Failed to start browser: {e}")

    async def _register_with_proxy(self):
        """Register this session's room→port mapping with the WebSocket proxy."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{PROXY_REGISTER_URL}/register",
                    json={"room": self._room_name, "port": self._browser_agent.stream_port},
                ) as resp:
                    if resp.status == 200:
                        logger.info(f"[{self._room_name}] Registered with proxy: port {self._browser_agent.stream_port}")
                    else:
                        body = await resp.text()
                        logger.error(f"[{self._room_name}] Proxy registration failed ({resp.status}): {body}")
        except Exception as e:
            logger.error(f"[{self._room_name}] Failed to register with proxy: {e}")

    async def _deregister_from_proxy(self):
        """Remove this session's room→port mapping from the proxy."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.delete(
                    f"{PROXY_REGISTER_URL}/register/{self._room_name}",
                ) as resp:
                    logger.info(f"[{self._room_name}] Deregistered from proxy (status {resp.status})")
        except Exception as e:
            logger.warning(f"[{self._room_name}] Failed to deregister from proxy: {e}")

    async def on_exit(self):
        """Called when the agent is replaced or session ends."""
        logger.info(f"[{self._room_name}] Orchestrator agent exiting session")
        await self._deregister_from_proxy()
        await self._browser_agent.cleanup()

    @function_tool
    async def get_onboarding_steps(self, context: RunContext) -> str:
        """Retrieve the onboarding steps for the target application. Call this when the user confirms they want a guided tour.

        Returns:
            A JSON string with ordered onboarding steps and tasks.
        """
        logger.info("Retrieving onboarding steps via RAG agent")
        steps = await self._rag_agent.get_onboarding_steps()
        self._task_queue.load_tasks(steps)
        return steps

    @function_tool
    async def execute_browser_action(
        self, context: RunContext, action: str, target: str = "", value: str = ""
    ) -> str:
        """Execute a browser action on the shared screen. Call this AFTER you have finished narrating what you are about to do.

        IMPORTANT: Always call get_page_snapshot first to get element refs (@e1, @e2, ...) before
        using actions that require a target element (fill, click, select, check, hover, scrollintoview).
        Refs are invalidated after every page navigation or DOM change — always re-snapshot.

        Args:
            action: The browser action to perform. Supported values:
                - 'fill'          → Clear a field and type text. target=@eN, value=text.
                - 'type'          → Type text without clearing. target=@eN, value=text.
                - 'click'         → Click an element. target=@eN.
                - 'press'         → Press a keyboard key. target=key name (e.g. 'Enter', 'Tab', 'Escape', 'Control+a').
                - 'select'        → Pick a dropdown option. target=@eN, value=option label.
                - 'check'         → Check a checkbox. target=@eN.
                - 'uncheck'       → Uncheck a checkbox. target=@eN.
                - 'hover'         → Hover over element. target=@eN.
                - 'scroll'        → Scroll the page. target='down' or 'up', value=pixels (e.g. '500').
                - 'scrollintoview'→ Scroll element into view. target=@eN.
                - 'open'          → Navigate to a URL. target=full URL.
                - 'wait'          → Wait. target='--load networkidle' | '@eN' | milliseconds.
                - 'find'          → Semantic locator fallback (no snapshot needed).
                                    target='label "Email" fill' | 'text "Sign In" click' | 'role button click'.
                                    value=text to fill (for fill actions).
                - 'get'           → Get info. target='url' | 'title' | 'text @eN'.
                - 'press'         → Keyboard key. target='Enter' | 'Tab' | 'Escape' | 'Control+a'.
            target: The target for the action — an element ref (@e1), URL, key name, or semantic locator.
            value: Optional value — text to fill/type, option label for select, pixel count for scroll.

        Returns:
            Result of the browser action, or an error message if it failed.
        """
        # Delay before acting so TTS narration finishes playing first
        if PRE_ACTION_DELAY > 0:
            logger.info(f"Waiting {PRE_ACTION_DELAY}s for narration to finish before browser action")
            await asyncio.sleep(PRE_ACTION_DELAY)

        logger.info(f"Browser action: {action} {target} {value}")
        result = await self._browser_agent.execute_action(action, target, value)
        return result

    @function_tool
    async def get_page_snapshot(self, context: RunContext) -> str:
        """Get the current page's accessibility tree snapshot with interactive element refs.

        MUST be called before any fill, click, select, check, or hover action so you know
        which @eN ref to target. Also call after any navigation or dynamic DOM change
        (modal open, dropdown expand, page redirect) to get fresh refs.

        The snapshot output lists interactive elements like:
            @e1 [button] "Sign In"
            @e2 [input type="email"] placeholder="Email"
            @e3 [input type="password"] placeholder="Password"
            @e4 [a href="/signup"] "Create account"

        Use the @eN refs directly as the `target` in execute_browser_action.

        Returns:
            Accessibility tree of the current page with @eN element refs.
        """
        logger.info("Getting page snapshot")
        snapshot = await self._browser_agent.get_snapshot()
        return snapshot

    @function_tool
    async def answer_question(self, context: RunContext, question: str) -> str:
        """Answer a user's question about the application using the knowledge base.

        Args:
            question: The user's question about the application.

        Returns:
            An answer based on the knowledge base.
        """
        logger.info(f"Answering question: {question}")
        answer = await self._rag_agent.answer_question(question)
        return answer
