"""
Task Queue

Interruptible task queue for browser actions. Tasks are small and atomic
so the orchestrator can pause between tasks for user Q&A.
"""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("onboarding-agent.task-queue")


@dataclass
class BrowserTask:
    """A single atomic browser action."""
    action: str
    target: str = ""
    value: str = ""
    narration: str = ""
    step_group: str = ""


class TaskQueue:
    """Interruptible task queue for browser actions."""

    def __init__(self):
        self.tasks: list[BrowserTask] = []
        self.current_index: int = 0
        self.paused: bool = False

    def load_tasks(self, steps_json: str):
        """Load tasks from RAG agent's onboarding steps JSON."""
        import json

        try:
            data = json.loads(steps_json)
            steps = data.get("steps", [])
        except (json.JSONDecodeError, AttributeError):
            logger.error("Failed to parse onboarding steps JSON")
            return

        self.tasks = []
        for step in steps:
            tasks = step.get("tasks", [])
            step_title = step.get("title", "")
            for task in tasks:
                self.tasks.append(
                    BrowserTask(
                        action=task.get("action", ""),
                        target=task.get("target", ""),
                        value=task.get("value", ""),
                        narration=task.get("narration", ""),
                        step_group=step_title,
                    )
                )

        self.current_index = 0
        self.paused = False
        logger.info(f"Loaded {len(self.tasks)} tasks from {len(steps)} steps")

    def get_next_task(self) -> BrowserTask | None:
        """Get the next task without executing it. Returns None if queue empty or paused."""
        if self.paused or self.current_index >= len(self.tasks):
            return None
        return self.tasks[self.current_index]

    def advance(self):
        """Mark current task as done and move to next."""
        if self.current_index < len(self.tasks):
            self.current_index += 1

    def pause(self):
        """Pause the queue — called when user starts speaking."""
        self.paused = True
        logger.info("Task queue paused")

    def resume(self):
        """Resume the queue — called after answering user's question."""
        self.paused = False
        logger.info("Task queue resumed")

    def insert_task(self, task: BrowserTask, position: int | None = None):
        """Insert an ad-hoc task (e.g., user asks to see something specific)."""
        pos = position if position is not None else self.current_index
        self.tasks.insert(pos, task)
        logger.info(f"Inserted ad-hoc task at position {pos}: {task.action} {task.target}")

    @property
    def is_complete(self) -> bool:
        """Whether all tasks have been executed."""
        return self.current_index >= len(self.tasks)

    @property
    def progress(self) -> str:
        """Human-readable progress string."""
        return f"{self.current_index}/{len(self.tasks)}"

    @property
    def current_step_group(self) -> str:
        """The step group of the current task."""
        if self.current_index < len(self.tasks):
            return self.tasks[self.current_index].step_group
        return ""
