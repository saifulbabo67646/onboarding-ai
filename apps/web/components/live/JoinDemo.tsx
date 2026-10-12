'use client';

import { ArrowRight, Mic, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CenteredPage } from '@/components/site/CenteredPage';
import { Alert, Avatar, Badge, Button, Field, Input } from '@/components/ui';
import type { ConnectionDetails, PublicAgent } from '@/lib/types';
import { DemoRoom } from './DemoRoom';
import styles from './JoinDemo.module.css';

type Phase = 'form' | 'joining' | 'live' | 'ended';

/** The visitor's journey: enter a name, join the live room, see the end screen. */
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

  if (phase === 'ended') {
    return (
      <CenteredPage embedded={embedded}>
        <div className="stack">
          <h1 className="title-lg">Thanks for joining!</h1>
          <p className="text-secondary">
            {endedByPresenter
              ? `${agent.presenterName} ended the session. We hope it was useful - you can start a fresh one whenever you like.`
              : 'We hope that was useful. You can start a fresh session whenever you like.'}
          </p>
          <Button
            variant="primary"
            size="lg"
            block
            icon={RotateCcw}
            onClick={() => setPhase('form')}
          >
            Start again
          </Button>
        </div>
      </CenteredPage>
    );
  }

  const isDeck = agent.mode === 'presentation';
  return (
    <CenteredPage embedded={embedded}>
      <form className="stack" onSubmit={join}>
        <div className="stack-sm">
          <div>
            <Badge tone="success" dot pulse>
              {isDeck ? 'Live presentation' : 'Live demo'}
            </Badge>
          </div>
          <h1 className="title-lg">{agent.name}</h1>
          {agent.description && <p className="text-secondary">{agent.description}</p>}
        </div>
        <div className={styles.presenter}>
          <Avatar name={agent.presenterName} brand />
          <div>
            <div className={styles.presenterName}>
              {agent.presenterName}
              {agent.companyName && <span className="text-muted"> · {agent.companyName}</span>}
            </div>
            <p className="text-secondary text-sm">
              Shares their screen and talks you through it. Interrupt any time with questions.
            </p>
          </div>
        </div>
        <Field label="Your name" htmlFor="visitor-name">
          <Input
            id="visitor-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane"
            autoFocus
            required
            maxLength={60}
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={phase === 'joining'}
          iconRight={ArrowRight}
        >
          {phase === 'joining' ? 'Connecting…' : 'Join now'}
        </Button>
        <p className={styles.note}>
          <Mic size={13} aria-hidden /> Your microphone lets you ask questions. Camera is optional.
        </p>
      </form>
    </CenteredPage>
  );
}
