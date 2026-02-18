'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

// Connect via proxy (port 9224) because agent-browser rejects browser WebSocket connections with Origin header
const STREAM_URL = process.env.NEXT_PUBLIC_BROWSER_STREAM_URL ?? 'ws://localhost:9224';

interface StreamStatus {
  connected: boolean;
  screencasting: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

interface TabInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

export function BrowserStream({ roomName }: { roomName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'streaming' | 'disconnected'>(
    'connecting',
  );
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const lastFrameTimeRef = useRef(0);
  const pendingFrameRef = useRef<number | null>(null);

  const retryCountRef = useRef(0);

  const connect = useCallback(() => {
    // Don't reconnect if component unmounted
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    let ws: WebSocket;
    try {
      const wsUrl = `${STREAM_URL}?room=${encodeURIComponent(roomName)}`;
      ws = new WebSocket(wsUrl);
    } catch {
      setStatus('disconnected');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setError(null);
      setStatus('connected');
    };

    ws.onmessage = async (event) => {
      try {
        // ws proxy sends Buffer which arrives as Blob in the browser
        const text = typeof event.data === 'string'
          ? event.data
          : await (event.data as Blob).text();
        const data = JSON.parse(text);

        if (data.type === 'status') {
          const s = data as StreamStatus & { type: string };
          if (s.screencasting) {
            setStatus('streaming');
          }
        } else if (data.type === 'tabs') {
          if (Array.isArray(data.tabs)) {
            setTabs(data.tabs);
          }
        } else if (data.type === 'frame') {
          setStatus('streaming');
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const metadata = data.metadata;
          // Only resize canvas when dimensions actually change to avoid clearing it
          if (metadata?.deviceWidth && metadata?.deviceHeight) {
            if (canvas.width !== metadata.deviceWidth || canvas.height !== metadata.deviceHeight) {
              canvas.width = metadata.deviceWidth;
              canvas.height = metadata.deviceHeight;
            }
          }

          // Throttle to ~30fps to avoid flicker during rapid updates (typing etc.)
          const now = performance.now();
          const elapsed = now - lastFrameTimeRef.current;
          const MIN_FRAME_INTERVAL = 33; // ~30fps

          const drawFrame = () => {
            lastFrameTimeRef.current = performance.now();
            pendingFrameRef.current = null;
            const src = `data:image/jpeg;base64,${data.data}`;
            if (typeof createImageBitmap !== 'undefined') {
              fetch(src)
                .then(r => r.blob())
                .then(blob => createImageBitmap(blob))
                .then(bmp => {
                  ctx.drawImage(bmp, 0, 0);
                  bmp.close();
                })
                .catch(() => {});
            } else {
              const img = new Image();
              img.onload = () => { ctx.drawImage(img, 0, 0); };
              img.src = src;
            }
          };

          if (elapsed >= MIN_FRAME_INTERVAL) {
            drawFrame();
          } else {
            // Schedule this frame for later, replacing any previously pending frame
            if (pendingFrameRef.current !== null) {
              cancelAnimationFrame(pendingFrameRef.current);
            }
            pendingFrameRef.current = requestAnimationFrame(drawFrame);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      // Suppress console noise — reconnect handles it
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      scheduleReconnect();
    };
  }, [roomName]);

  const scheduleReconnect = useCallback(() => {
    retryCountRef.current += 1;
    // Exponential backoff: 2s, 4s, 8s, max 10s
    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current - 1), 10000);
    setTimeout(() => {
      if (!wsRef.current) {
        connect();
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Extract domain from URL for display in tab
  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  // Favicon URL helper
  const getFaviconUrl = (url: string) => {
    try {
      const u = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=16`;
    } catch {
      return '';
    }
  };

  const activeTab = tabs.find(t => t.active) || tabs[0];

  return (
    <div className="browser-stream-container" style={{ position: 'relative', width: '100%', height: '100%', background: '#1a1a2e', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* ── Browser chrome (always visible) ── */}
      {/* Tab bar */}
      <div className="browser-tab-bar" style={{
        display: 'flex',
        alignItems: 'flex-end',
        background: '#202124',
        padding: '4px 8px 0',
        gap: '1px',
        minHeight: '34px',
        flexShrink: 0,
      }}>
        {tabs.length > 0 ? tabs.map((tab) => (
          <div
            key={tab.index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              maxWidth: '220px',
              minWidth: '60px',
              borderRadius: '8px 8px 0 0',
              background: tab.active ? '#35363a' : 'transparent',
              color: tab.active ? '#e8eaed' : '#9aa0a6',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              cursor: 'default',
              transition: 'background 0.15s',
            }}
          >
            {tab.url && (
              <img
                src={getFaviconUrl(tab.url)}
                alt=""
                width={14}
                height={14}
                style={{ flexShrink: 0, borderRadius: '2px' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tab.title || getDomain(tab.url) || `Tab ${tab.index + 1}`}
            </span>
          </div>
        )) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px 8px 0 0',
            background: '#35363a',
            color: '#9aa0a6',
            fontSize: '12px',
          }}>
            New Tab
          </div>
        )}
        {/* New tab button (decorative) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          color: '#9aa0a6',
          fontSize: '18px',
          borderRadius: '50%',
          marginBottom: '2px',
          marginLeft: '2px',
          flexShrink: 0,
        }}>
          +
        </div>
      </div>

      {/* Address bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#35363a',
        padding: '4px 12px',
        gap: '8px',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1,
          background: '#202124',
          borderRadius: '16px',
          padding: '5px 14px',
          fontSize: '12px',
          color: '#9aa0a6',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minHeight: '18px',
        }}>
          {activeTab?.url || ''}
        </div>
      </div>

      {/* ── Viewport area ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Status overlay */}
        {status !== 'streaming' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              color: '#e0e0e0',
              gap: '12px',
              background: '#1a1a2e',
            }}
          >
            <div className="loading-spinner" />
            {status === 'disconnected' ? (
              <span style={{ fontSize: '14px', opacity: 0.8 }}>
                Waiting for AI agent to start browser...
              </span>
            ) : status === 'connected' ? (
              <span style={{ fontSize: '14px', opacity: 0.8 }}>
                Connected — waiting for browser viewport...
              </span>
            ) : (
              <span style={{ fontSize: '14px', opacity: 0.8 }}>
                Connecting to browser stream...
              </span>
            )}
          </div>
        )}

        {/* Browser viewport canvas */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            cursor: 'default',
            pointerEvents: 'none',
            display: status === 'streaming' ? 'block' : 'none',
          }}
        />
      </div>

      <style jsx>{`
        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
