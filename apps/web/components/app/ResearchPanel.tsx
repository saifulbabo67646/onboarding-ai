'use client';

import { RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Spinner, Textarea } from '@/components/ui';
import { cx } from '@/lib/cx';
import { progressLines } from '@/lib/research';
import type { ResearchJob, ResearchPhase } from '@/lib/types';
import styles from './ResearchPanel.module.css';

const PHASES: { key: ResearchPhase; label: string }[] = [
  { key: 'docs', label: 'Reading the docs' },
  { key: 'explore', label: 'Exploring the app' },
  { key: 'write', label: 'Writing the demo' },
];

const POLL_MS = 3000;

function running(job: ResearchJob | null): boolean {
  return job?.state === 'queued' || job?.state === 'researching';
}

async function send(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * AI research for one presenter: start it, watch it work, then review the
 * drafted demo once - edit, refine it in plain language, approve.
 */
export function ResearchPanel({
  agentId,
  initialJob,
}: {
  agentId: string;
  initialJob: ResearchJob | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running(job)) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/agents/${agentId}/research`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()).job as ResearchJob | null;
      setJob(next);
      // The finished draft changes what the rest of the page shows.
      if (!running(next)) router.refresh();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [agentId, job, router]);

  async function start(notes: string) {
    setError(null);
    const { ok, data } = await send(`/api/agents/${agentId}/research`, {
      notes,
      docsUrls: job?.docsUrls ?? [],
    });
    if (data.job) setJob(data.job);
    if (!ok) setError(data.error ?? 'Could not start research.');
  }

  if (!job) return <StartCard onStart={start} error={error} />;
  if (running(job)) return <Progress job={job} />;
  if (job.state === 'failed' || !job.draft) {
    return (
      <StartCard onStart={start} error={error} initialNotes={job.notes} failed={job}>
        <Alert tone="danger" title="Research did not produce a draft">
          {job.error ?? 'Please try again.'}
        </Alert>
      </StartCard>
    );
  }
  return (
    <Review
      agentId={agentId}
      job={job}
      onJob={setJob}
      onRestart={start}
      onApplied={() => router.refresh()}
    />
  );
}

function StartCard({
  onStart,
  error,
  initialNotes = '',
  failed,
  children,
}: {
  onStart: (notes: string) => Promise<void>;
  error: string | null;
  initialNotes?: string;
  failed?: ResearchJob;
  children?: React.ReactNode;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  return (
    <Card
      title="Let AI prepare this demo"
      description="The presenter reads your docs, signs in with the saved secrets, explores the app and drafts the goal and preparation notes for you to review."
      actions={failed && <Badge tone="danger">Failed</Badge>}
    >
      <div className="stack">
        {children}
        {failed && <Warnings job={failed} />}
        <Field label="Hints for the presenter" htmlFor="research-notes" optional>
          <Textarea
            id="research-notes"
            compact
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Who the audience is, what to focus on, what to skip."
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Button
            variant="primary"
            icon={failed ? RefreshCw : Sparkles}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onStart(notes);
              setBusy(false);
            }}
          >
            {failed ? 'Try again' : 'Research this app'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Progress({ job }: { job: ResearchJob }) {
  const current = PHASES.findIndex((p) => p.key === job.phase);
  const lines = progressLines(job).slice(-8);
  return (
    <Card
      title="Researching your app"
      description="This usually takes 5-20 minutes. You can leave this page; the draft will be waiting here."
      actions={
        <Badge tone="accent">
          <Spinner size={12} /> Working
        </Badge>
      }
    >
      <div className="stack">
        <ol className={styles.steps}>
          {PHASES.map((p, i) => (
            <li
              key={p.key}
              className={cx(i < current && styles.done, i === current && styles.active)}
            >
              {p.label}
            </li>
          ))}
        </ol>
        <div className={styles.log} aria-live="polite">
          {lines.length === 0 ? (
            <span>
              {job.state === 'queued' ? 'Waiting for a free researcher…' : 'Getting started…'}
            </span>
          ) : (
            lines.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </div>
    </Card>
  );
}

function Warnings({ job }: { job: ResearchJob }) {
  if (job.warnings.length === 0) return null;
  return (
    <Alert tone="warning">
      <ul className={styles.list}>
        {job.warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </Alert>
  );
}

function Review({
  agentId,
  job,
  onJob,
  onRestart,
  onApplied,
}: {
  agentId: string;
  job: ResearchJob;
  onJob: (job: ResearchJob) => void;
  onRestart: (notes: string) => Promise<void>;
  onApplied: () => void;
}) {
  const draft = job.draft!;
  const { playbook } = draft;
  const [goal, setGoal] = useState(draft.goal);
  const [knowledge, setKnowledge] = useState(draft.knowledge);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<null | 'refine' | 'save' | 'publish' | 'restart'>(null);
  const [error, setError] = useState<string | null>(null);

  // A refined draft replaces any local edits.
  useEffect(() => {
    setGoal(draft.goal);
    setKnowledge(draft.knowledge);
  }, [draft.goal, draft.knowledge]);

  async function refine() {
    setBusy('refine');
    setError(null);
    const { ok, data } = await send(`/api/agents/${agentId}/research/refine`, {
      instruction: feedback,
    });
    setBusy(null);
    if (!ok) return setError(data.error ?? 'Could not revise the draft.');
    setFeedback('');
    onJob(data.job);
  }

  async function apply(publish: boolean) {
    setBusy(publish ? 'publish' : 'save');
    setError(null);
    const { ok, data } = await send(`/api/agents/${agentId}/research/apply`, {
      goal,
      knowledge,
      publish,
    });
    setBusy(null);
    if (!ok) return setError(data.error ?? 'Could not save.');
    onJob({ ...job, appliedAt: new Date().toISOString() });
    onApplied();
  }

  return (
    <Card
      title={playbook.demo_title || 'Drafted demo'}
      description={playbook.product_summary}
      actions={
        job.appliedAt ? (
          <Badge tone="success" dot>
            Approved
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Needs review
          </Badge>
        )
      }
      footer={
        <div className="row-between row-wrap">
          <Button
            variant="ghost"
            icon={RefreshCw}
            loading={busy === 'restart'}
            disabled={busy !== null}
            onClick={async () => {
              setBusy('restart');
              await onRestart(job.notes);
              setBusy(null);
            }}
          >
            Research again
          </Button>
          <div className="row">
            <Button loading={busy === 'save'} disabled={busy !== null} onClick={() => apply(false)}>
              Save without publishing
            </Button>
            <Button
              variant="primary"
              loading={busy === 'publish'}
              disabled={busy !== null || !goal.trim()}
              onClick={() => apply(true)}
            >
              Approve &amp; publish
            </Button>
          </div>
        </div>
      }
    >
      <div className="stack">
        <Warnings job={job} />

        <div className={styles.meta}>
          <span>~{playbook.duration_minutes || '?'} min</span>
          {playbook.audience && <span>For: {playbook.audience}</span>}
          {playbook.login.required && <span>Signs in first</span>}
          {job.revisions > 0 && <span>Revised {job.revisions}×</span>}
        </div>

        {playbook.sections.length > 0 && (
          <ol className={styles.sections}>
            {playbook.sections.map((s, i) => (
              <li key={i}>
                <details>
                  <summary>
                    <strong>{s.title}</strong> <span className="text-muted">- {s.objective}</span>
                  </summary>
                  <div className={styles.sectionBody}>
                    {s.where && <div className="text-muted">Where: {s.where}</div>}
                    {s.steps.length > 0 && (
                      <ol className={styles.list}>
                        {s.steps.map((step, j) => (
                          <li key={j}>{step}</li>
                        ))}
                      </ol>
                    )}
                    {s.talking_points.length > 0 && (
                      <ul className={styles.list}>
                        {s.talking_points.map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}

        <Field label="Goal" htmlFor="draft-goal" hint="What the presenter is asked to do.">
          <Textarea id="draft-goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        <details>
          <summary className={cx(styles.disclosure, 'text-secondary text-sm')}>
            Preparation notes ({playbook.faq.length} likely questions, {playbook.sources.length}{' '}
            sources)
          </summary>
          <Textarea
            aria-label="Preparation notes"
            className={styles.notes}
            value={knowledge}
            onChange={(e) => setKnowledge(e.target.value)}
          />
        </details>

        <Field
          label="Ask for changes"
          htmlFor="draft-feedback"
          hint="The AI rewrites the draft; your manual edits above are replaced."
        >
          <div className={styles.refine}>
            <Input
              id="draft-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Make it 10 minutes, skip billing, start with the mobile app."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && feedback.trim() && !busy) {
                  e.preventDefault();
                  void refine();
                }
              }}
            />
            <Button
              icon={Wand2}
              loading={busy === 'refine'}
              disabled={!feedback.trim() || busy !== null}
              onClick={refine}
            >
              Revise
            </Button>
          </div>
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Card>
  );
}
