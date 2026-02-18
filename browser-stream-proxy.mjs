/**
 * Multi-session WebSocket proxy for agent-browser viewport streaming.
 *
 * Routes client WebSocket connections to the correct agent-browser instance
 * based on room name. Each agent session registers its room→port mapping
 * via the HTTP registration API.
 *
 * Client connects: ws://localhost:9224?room=<roomName>
 * Agent registers: POST /register { room, port }
 * Agent deregisters: DELETE /register/:room
 *
 * Usage: node browser-stream-proxy.mjs
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const PROXY_PORT = parseInt(process.env.BROWSER_STREAM_PROXY_PORT || '9224');
const TAB_POLL_INTERVAL = parseInt(process.env.TAB_POLL_INTERVAL || '3000');

// ─── Room Registry ────────────────────────────────────────────────────────────
// Maps room names to upstream agent-browser ports.
// Populated by agent sessions via POST /register.
const roomRegistry = new Map(); // Map<string, number>

// ─── Tab polling (per-room) ───────────────────────────────────────────────────

/**
 * Poll agent-browser for tab info using a specific stream port and session.
 */
async function pollTabInfo(streamPort, sessionName) {
  const env = { ...process.env, AGENT_BROWSER_STREAM_PORT: String(streamPort), AGENT_BROWSER_SESSION: sessionName };
  try {
    const [tabResult, titleResult, urlResult] = await Promise.allSettled([
      execFileAsync('agent-browser', ['tab'], { timeout: 5000, env }),
      execFileAsync('agent-browser', ['get', 'title'], { timeout: 5000, env }),
      execFileAsync('agent-browser', ['get', 'url'], { timeout: 5000, env }),
    ]);

    const tabOutput = tabResult.status === 'fulfilled' ? tabResult.value.stdout.trim() : '';
    let currentTitle = '';
    let currentUrl = '';

    if (titleResult.status === 'fulfilled') {
      const raw = titleResult.value.stdout.trim();
      try {
        const parsed = JSON.parse(raw);
        currentTitle = parsed?.data?.title || parsed?.title || raw;
      } catch { currentTitle = raw; }
    }

    if (urlResult.status === 'fulfilled') {
      const raw = urlResult.value.stdout.trim();
      try {
        const parsed = JSON.parse(raw);
        currentUrl = parsed?.data?.url || parsed?.url || raw;
      } catch { currentUrl = raw; }
    }

    const tabs = [];
    let activeIndex = 0;

    if (tabOutput) {
      try {
        const parsed = JSON.parse(tabOutput);
        const arr = Array.isArray(parsed) ? parsed : (parsed?.data && Array.isArray(parsed.data) ? parsed.data : null);
        if (arr) {
          arr.forEach((t, i) => {
            tabs.push({ index: i, title: t.title || t.name || `Tab ${i + 1}`, url: t.url || '', active: !!t.active });
            if (t.active) activeIndex = i;
          });
        }
      } catch {
        const lines = tabOutput.split('\n').filter(l => l.trim());
        lines.forEach((line, i) => {
          const isActive = line.includes('*') || line.includes('(active)');
          const cleaned = line.replace(/^\s*\*?\s*\d+:\s*/, '').replace(/\(active\)/i, '').trim();
          const dashIdx = cleaned.lastIndexOf(' - ');
          const title = dashIdx > 0 ? cleaned.substring(0, dashIdx) : cleaned;
          const url = dashIdx > 0 ? cleaned.substring(dashIdx + 3) : '';
          tabs.push({ index: i, title: title || `Tab ${i + 1}`, url, active: isActive });
          if (isActive) activeIndex = i;
        });
      }
    }

    if (tabs.length === 0 && (currentTitle || currentUrl)) {
      tabs.push({ index: 0, title: currentTitle || 'Current Tab', url: currentUrl, active: true });
    }

    if (tabs.length > 0 && activeIndex < tabs.length) {
      if (currentTitle) tabs[activeIndex].title = currentTitle;
      if (currentUrl) tabs[activeIndex].url = currentUrl;
    }

    return tabs.length > 0 ? { tabs, activeIndex } : null;
  } catch (err) {
    return null;
  }
}

// ─── HTTP Server (registration API + health) ─────────────────────────────────

const server = createServer((req, res) => {
  // POST /register — agent registers room→port mapping
  if (req.method === 'POST' && req.url === '/register') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { room, port } = JSON.parse(body);
        if (!room || !port) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'room and port required' }));
          return;
        }
        roomRegistry.set(room, port);
        console.log(`[proxy] Registered room "${room}" → port ${port} (total: ${roomRegistry.size})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, room, port }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON' }));
      }
    });
    return;
  }

  // DELETE /register/:room — agent deregisters
  if (req.method === 'DELETE' && req.url?.startsWith('/register/')) {
    const room = decodeURIComponent(req.url.slice('/register/'.length));
    const had = roomRegistry.delete(room);
    console.log(`[proxy] Deregistered room "${room}" (found: ${had}, remaining: ${roomRegistry.size})`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, room, removed: had }));
    return;
  }

  // GET /rooms — list registered rooms (debug)
  if (req.method === 'GET' && req.url === '/rooms') {
    const rooms = Object.fromEntries(roomRegistry);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rooms));
    return;
  }

  // Default health check
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`browser-stream-proxy running (${roomRegistry.size} rooms registered)`);
});

const wss = new WebSocketServer({ server });

// ─── WebSocket connection handler ─────────────────────────────────────────────

function nudgeScreencast(ws) {
  // Send a no-op mouse event far off-screen to trigger a fresh screencast
  // frame without moving the visible cursor. Using coordinates outside the
  // viewport ensures the injected cursor overlay is not affected.
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'input_mouse',
      eventType: 'mouseMoved',
      x: -1, y: -1, button: 'none', clickCount: 0,
    }));
  }
}

wss.on('connection', (clientWs, req) => {
  // Extract room name from query string: ws://host:port?room=<roomName>
  const url = new URL(req.url, `http://${req.headers.host}`);
  const room = url.searchParams.get('room');

  if (!room) {
    console.log('[proxy] Client connected without ?room= parameter, closing');
    clientWs.close(4000, 'Missing ?room= query parameter');
    return;
  }

  const upstreamPort = roomRegistry.get(room);
  if (!upstreamPort) {
    console.log(`[proxy] No registered agent for room "${room}", closing`);
    clientWs.close(4001, `No agent registered for room "${room}"`);
    return;
  }

  const upstreamUrl = `ws://localhost:${upstreamPort}`;
  console.log(`[proxy] Client for room "${room}" → upstream ${upstreamUrl}`);

  // Connect to the session-specific agent-browser instance
  const upstream = new WebSocket(upstreamUrl, {
    headers: {},
    maxPayload: 50 * 1024 * 1024,
  });

  let nudgeInterval = null;

  upstream.on('open', () => {
    console.log(`[proxy] [${room}] Connected to agent-browser upstream on port ${upstreamPort}`);
    setTimeout(() => nudgeScreencast(upstream), 500);
    nudgeInterval = setInterval(() => nudgeScreencast(upstream), 5000);
  });

  // Forward frames from agent-browser → browser client
  let msgCount = 0;
  upstream.on('message', (data) => {
    msgCount++;
    if (msgCount <= 3) {
      const preview = typeof data === 'string' ? data.slice(0, 80) : data.toString('utf8', 0, 80);
      console.log(`[proxy] [${room}] upstream msg #${msgCount} (${data.length} bytes): ${preview}...`);
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  // Client is read-only
  clientWs.on('message', () => {});

  // Periodically poll tab info for this room's agent-browser port
  let tabPollInterval = setInterval(async () => {
    const info = await pollTabInfo(upstreamPort, room);
    if (info && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'tabs', ...info }));
    }
  }, TAB_POLL_INTERVAL);

  const cleanup = () => {
    if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
    if (tabPollInterval) { clearInterval(tabPollInterval); tabPollInterval = null; }
  };

  upstream.on('close', () => {
    console.log(`[proxy] [${room}] Upstream closed`);
    cleanup();
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  upstream.on('error', (err) => {
    console.log(`[proxy] [${room}] Upstream error: ${err.message}`);
    cleanup();
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  clientWs.on('close', () => {
    console.log(`[proxy] [${room}] Browser disconnected`);
    cleanup();
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });

  clientWs.on('error', (err) => {
    console.log(`[proxy] [${room}] Client error: ${err.message}`);
    cleanup();
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`[proxy] Multi-session browser stream proxy listening on ws://localhost:${PROXY_PORT}`);
  console.log(`[proxy] Clients connect with: ws://localhost:${PROXY_PORT}?room=<roomName>`);
  console.log(`[proxy] Agents register via: POST http://localhost:${PROXY_PORT}/register`);
});
