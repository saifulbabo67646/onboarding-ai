# AI Onboarding Agent

An AI agent that joins LiveKit video calls, shares a live browser screen, and guides new users through a web application via voice.

## Architecture

- **Orchestrator Agent** — Joins LiveKit room, handles voice (STT → LLM → TTS), manages flow
- **Browser Agent** — Controls `agent-browser` to navigate and interact with the target web app
- **RAG Agent** — Retrieves onboarding steps and answers questions from knowledge base
- **Screen Share Pipeline** — Streams agent-browser viewport as a LiveKit video track

## Prerequisites

- Python 3.11+
- Node.js 18+ (for agent-browser)
- LiveKit Cloud account (API key + secret)
- OpenAI API key
- Deepgram API key
- ElevenLabs API key

## Setup

1. Install agent-browser:
   ```bash
   npm install -g agent-browser
   ```

2. Set up Python virtual environment and install dependencies:
   ```bash
   cd agent
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

4. Run the agent:
   ```bash
   python main.py dev
   ```

5. Open the LiveKit Meet app (parent directory) in your browser and join a room — the agent will join automatically.

## Project Structure

```
agent/
├── main.py              # Entry point — LiveKit AgentServer
├── orchestrator.py      # Orchestrator Agent (voice + flow control)
├── browser_agent.py     # Browser Agent (agent-browser CLI wrapper)
├── screen_share.py      # WSS frame stream → LiveKit video track
├── rag_agent.py         # Knowledge base retrieval
├── task_queue.py        # Interruptible task queue
├── knowledge_base/      # JSON knowledge base files
│   └── taiga.json       # Taiga onboarding data
├── requirements.txt
├── .env.example
└── README.md
```

## Test Application

The POC uses [Taiga](https://trytaiga.com) (open-source project management) as the test application.
