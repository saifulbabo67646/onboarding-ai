# Sandbox image: Xvfb + Openbox + headful Chromium + onboard-sandbox server.
# Build from the repository root:
#   docker build -f packages/sandbox/Dockerfile -t onboard-sandbox .
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=1 \
    XCURSOR_THEME=DMZ-White \
    XCURSOR_SIZE=24 \
    TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb openbox chromium dmz-cursor-theme \
      fonts-liberation fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk \
      ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Use the DMZ cursor theme for the default X cursor (modern arrow/hand/I-beam shapes).
RUN mkdir -p /usr/share/icons/default \
    && printf '[Icon Theme]\nInherits=DMZ-White\n' > /usr/share/icons/default/index.theme

WORKDIR /opt/onboard
COPY packages/humanize ./humanize
COPY packages/sandbox ./sandbox
RUN pip install --no-cache-dir ./humanize "./sandbox[server]"

# Run as an unprivileged user inside the container.
RUN useradd --create-home --uid 1000 presenter \
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
USER presenter

EXPOSE 8765
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["onboard-sandbox", "--host", "0.0.0.0", "--port", "8765"]
