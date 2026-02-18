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

        Args:
            action: The browser action to perform (e.g., 'click', 'type', 'scroll', 'open', 'press').
            target: The target element or URL (e.g., '@e1', 'https://example.com', 'ArrowRight').
            value: Optional value for the action (e.g., text to type).

        Returns:
            Result of the browser action.
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
        """Get the current page's accessibility tree snapshot to understand what's on screen.

        Returns:
            JSON snapshot of the current page with element refs.
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
