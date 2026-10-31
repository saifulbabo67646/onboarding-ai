# Convenience targets. Each one wraps the exact commands CI runs
# (.github/workflows/test.yaml) or the README documents.
#
#   make install       Python venv + web dependencies
#   make check         everything CI runs (store tests need TEST_DATABASE_URL)
#   make help          list targets

PYTHON ?= python3
VENV   ?= .venv
BIN    := $(VENV)/bin
WEB    := apps/web

.DEFAULT_GOAL := help

.PHONY: help install install-python install-web \
        test test-python test-web lint format-check format typecheck check \
        dev-web dev-agent dev-researcher download-files \
        build up down logs

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Setup ──────────────────────────────────────────────────────────────────

install: install-python install-web ## Install Python packages (into .venv) and web dependencies

$(BIN)/python:
	$(PYTHON) -m venv $(VENV)

install-python: $(BIN)/python ## Create .venv and install every Python package with test extras
	$(BIN)/pip install -e packages/humanize -e "packages/sandbox[server,test]" \
		-e "packages/director[test]" -e "packages/researcher[test]" -e "apps/agent[test]"

install-web: ## pnpm install in apps/web (frozen lockfile, as CI)
	cd $(WEB) && pnpm install --frozen-lockfile

# ── Tests and checks ───────────────────────────────────────────────────────

test: test-python test-web ## Run the Python and web test suites

test-python: ## Run each Python package's tests, as CI does
	$(BIN)/pytest -q packages/humanize/tests
	CHROME_NO_SANDBOX=1 $(BIN)/pytest -q packages/sandbox/tests
	$(BIN)/pytest -q packages/director/tests
	$(BIN)/pytest -q packages/researcher/tests
	$(BIN)/pytest -q apps/agent/tests

test-web: ## Web unit tests (store tests run only when TEST_DATABASE_URL is set)
	cd $(WEB) && pnpm test

lint: ## ESLint (next lint) for the web app
	cd $(WEB) && pnpm lint

format-check: ## Prettier check for the web app
	cd $(WEB) && pnpm format:check

format: ## Prettier write for the web app
	cd $(WEB) && pnpm format:write

typecheck: ## TypeScript check for the web app
	cd $(WEB) && pnpm typecheck

check: lint format-check typecheck test-web test-python ## Everything CI runs

# ── Local development ──────────────────────────────────────────────────────

dev-web: ## Next.js dev server on http://localhost:3000 (needs Postgres)
	cd $(WEB) && pnpm dev

download-files: ## Download the worker's voice activity model (once)
	$(BIN)/onboard-agent download-files

dev-agent: ## Presenter worker in dev mode (reads .env)
	$(BIN)/onboard-agent dev

dev-researcher: ## Research service on port 8790 (reads .env)
	$(BIN)/onboard-researcher serve

# ── Docker compose ─────────────────────────────────────────────────────────

build: ## Build all images, including the per-session sandbox image
	docker compose --profile build build

up: ## Start the stack in the background
	docker compose up -d

down: ## Stop the stack (keeps the Postgres volume)
	docker compose down

logs: ## Follow logs of all services
	docker compose logs -f
