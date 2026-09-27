# Presenter worker. Build from the repository root:
#   docker build -f apps/agent/Dockerfile -t onboard-agent .
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1
# The docker CLI lets the worker start one sandbox container per session
# (SANDBOX_PROVIDER=docker with /var/run/docker.sock mounted).
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/onboard
COPY packages/humanize ./packages/humanize
COPY packages/sandbox ./packages/sandbox
COPY packages/director ./packages/director
COPY apps/agent ./apps/agent
RUN pip install --no-cache-dir ./packages/humanize ./packages/sandbox ./packages/director ./apps/agent \
    && (onboard-agent download-files || true)

CMD ["onboard-agent", "start"]
