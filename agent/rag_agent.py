"""
RAG Agent

Retrieves onboarding steps and answers questions from the knowledge base.
For the POC, uses simple JSON files. Will be upgraded to vector DB for SaaS.
"""

import json
import logging
import os

logger = logging.getLogger("onboarding-agent.rag")

KNOWLEDGE_BASE_DIR = os.path.join(os.path.dirname(__file__), "knowledge_base")


class RAGAgent:
    """Handles knowledge base retrieval for onboarding steps and Q&A."""

    def __init__(self):
        self._knowledge = self._load_knowledge_base()

    def _load_knowledge_base(self) -> dict:
        """Load knowledge base from JSON files."""
        kb = {}
        if not os.path.exists(KNOWLEDGE_BASE_DIR):
            logger.warning(f"Knowledge base directory not found: {KNOWLEDGE_BASE_DIR}")
            return kb

        for filename in os.listdir(KNOWLEDGE_BASE_DIR):
            if filename.endswith(".json"):
                filepath = os.path.join(KNOWLEDGE_BASE_DIR, filename)
                try:
                    with open(filepath, "r") as f:
                        data = json.load(f)
                        kb[filename.replace(".json", "")] = data
                        logger.info(f"Loaded knowledge base: {filename}")
                except Exception as e:
                    logger.error(f"Failed to load {filename}: {e}")
        return kb

    async def get_onboarding_steps(self) -> str:
        """Retrieve structured onboarding steps for the target application.

        Returns:
            JSON string with ordered onboarding steps.
        """
        app_data = self._knowledge.get("taiga", {})
        steps = app_data.get("onboarding_steps", [])

        if not steps:
            return json.dumps({
                "message": "No onboarding steps found",
                "steps": []
            })

        return json.dumps({
            "app_name": app_data.get("app_name", "Unknown"),
            "app_url": app_data.get("app_url", ""),
            "total_steps": len(steps),
            "steps": steps,
        }, indent=2)

    async def answer_question(self, question: str) -> str:
        """Answer a question using the knowledge base.

        Args:
            question: The user's question.

        Returns:
            Relevant information from the knowledge base.
        """
        app_data = self._knowledge.get("taiga", {})
        faq = app_data.get("faq", [])

        # Simple keyword matching for POC (upgrade to vector search for SaaS)
        question_lower = question.lower()
        relevant_answers = []

        for entry in faq:
            q_keywords = entry.get("question", "").lower()
            if any(word in question_lower for word in q_keywords.split() if len(word) > 3):
                relevant_answers.append(entry["answer"])

        if relevant_answers:
            return " ".join(relevant_answers)

        # Fallback: return general app description
        description = app_data.get("description", "")
        if description:
            return f"Based on what I know about the application: {description}"

        return "I don't have specific information about that in my knowledge base, but I'll do my best to help based on what's visible on screen."
