'use client';

import { useEffect, useState } from 'react';
import type { ConnectionDetails, PublicAgent } from '@/lib/types';
import { DemoRoom } from './DemoRoom';

type Phase = 'form' | 'joining' | 'live' | 'ended';

export function JoinDemo({
  agent,
  embedded = false,
  initialName = '',
}: {
  agent: PublicAgent;
  /** Rendered inside the website widget (an iframe on the owner's site). */
  embedded?: boolean;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ConnectionDetails | null>(null);
  const [endedByPresenter, setEndedByPresenter] = useState(false);

  // Tell the widget on the host page what is happening so it can resize itself.
  useEffect(() => {
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ source: 'onboard-ai', type: 'state', state: phase }, '*');
    }
  }, [embedded, phase]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setPhase('joining');
    setError(null);
    const res = await fetch(`/api/demo/${agent.slug}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'Something went wrong. Please try again.');
      setPhase('form');
      return;
    }
    setDetails(body as ConnectionDetails);
    setPhase('live');
  }

  if (phase === 'live' && details) {
    return (
      <DemoRoom
        details={details}
        agent={agent}
        onLeave={(byPresenter) => {
          setEndedByPresenter(byPresenter);
          setPhase('ended');
        }}
      />
    );
  }

  const isDeck = agent.mode === 'presentation';
  return (
    <main className={`join-page${embedded ? ' embedded' : ''}`}>
      <div className="card join-card stack">
        {phase === 'ended' ? (
          <>
            <h1>Thanks for joining!</h1>
            <p className="muted" style={{ margin: 0 }}>
              {endedByPresenter
                ? `${agent.presenterName} ended the session. We hope it was useful - you can start a fresh one whenever you like.`
                : 'We hope that was useful. You can start a fresh session whenever you like.'}
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setPhase('form')}>
              Start again
            </button>
          </>
        ) : (
          <form className="stack" onSubmit={join}>
            <div>
              <span className="badge">
                <span className="dot" /> {isDeck ? 'Live presentation' : 'Live demo'}
              </span>
              <h1>{agent.name}</h1>
              {agent.description && (
                <p className="muted" style={{ margin: 0 }}>
                  {agent.description}
                </p>
              )}
            </div>
            <div className="presenter">
              <div className="avatar">{agent.presenterName.slice(0, 1).toUpperCase()}</div>
              <div style={{ fontSize: 14 }}>
                <strong>{agent.presenterName}</strong>
                {agent.companyName && <span className="muted"> · {agent.companyName}</span>}
                <div className="faint">
                  Shares their screen and talks you through it. Interrupt any time with questions.
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="visitor-name">Your name</label>
              <input
                id="visitor-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane"
                autoFocus
                required
                maxLength={60}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={phase === 'joining'}>
              {phase === 'joining' ? 'Connecting…' : 'Join now'}
            </button>
            <p className="faint" style={{ margin: 0, fontSize: 12.5, textAlign: 'center' }}>
              Your microphone is used so you can ask questions. Camera is optional.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
