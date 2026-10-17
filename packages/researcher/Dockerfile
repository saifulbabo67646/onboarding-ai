# Research service: learns a product and drafts its demo for the dashboard.
# Build from the repository root:
#   docker build -f packages/researcher/Dockerfile -t onboard-researcher .
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1
# The docker CLI lets the service start a sandbox container per exploration
# (SANDBOX_PROVIDER=docker with /var/run/docker.sock mounted).
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/onboard
COPY packages/humanize ./packages/humanize
COPY packages/sandbox ./packages/sandbox
COPY packages/director ./packages/director
COPY packages/researcher ./packages/researcher
RUN pip install --no-cache-dir ./packages/humanize ./packages/sandbox ./packages/director ./packages/researcher

EXPOSE 8790
CMD ["onboard-researcher", "serve", "--port", "8790"]
