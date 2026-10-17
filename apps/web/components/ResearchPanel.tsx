'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { progressLines } from '@/lib/research';
import type { ResearchJob, ResearchPhase } from '@/lib/types';

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
      if (res.ok) setJob((await res.json()).job);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [agentId, job]);

  async function start(notes: string) {
    setError(null);
    const { ok, data } = await send(`/api/agents/${agentId}/research`, {
      notes,
      docsUrls: job?.docsUrls ?? [],
    });
    if (data.job) setJob(data.job);
    if (!ok) setError(data.error ?? 'Could not start research');
  }

  if (!job) return <StartCard onStart={start} error={error} />;
  if (running(job)) return <Progress job={job} />;
  if (job.state === 'failed' || !job.draft) {
    return (
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>AI research</h3>
          <span className="badge badge-muted">Failed</span>
        </div>
        <p className="error-text" style={{ margin: 0 }}>
          {job.error ?? 'Research did not produce a draft.'}
        </p>
        <Warnings job={job} />
        <StartCard onStart={start} error={error} initialNotes={job.notes} compact />
      </div>
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
  compact = false,
}: {
  onStart: (notes: string) => Promise<void>;
  error: string | null;
  initialNotes?: string;
  compact?: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const body = (
    <>
      <div className="field">
        <label htmlFor="research-notes">Hints for the presenter (optional)</label>
        <textarea
          id="research-notes"
          className="textarea"
          style={{ minHeight: 80 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Who the audience is, what to focus on, what to skip."
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onStart(notes);
            setBusy(false);
          }}
        >
          {busy ? 'Starting…' : compact ? 'Try again' : 'Research this app'}
        </button>
      </div>
    </>
  );
  if (compact) return body;
  return (
    <div className="card stack">
      <div>
        <h3>Let AI prepare this demo</h3>
        <p className="faint" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
          The presenter reads your docs, signs in with the saved secrets, explores the app and
          drafts the goal and preparation notes for you to review.
        </p>
      </div>
      {body}
    </div>
  );
}

function Progress({ job }: { job: ResearchJob }) {
  const current = PHASES.findIndex((p) => p.key === job.phase);
  const lines = progressLines(job).slice(-8);
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Researching your app</h3>
        <span className="badge">
          <span className="spinner spinner-sm" /> Working
        </span>
      </div>
      <ol className="research-steps">
        {PHASES.map((p, i) => (
          <li key={p.key} className={i < current ? 'done' : i === current ? 'active' : ''}>
            {p.label}
          </li>
        ))}
      </ol>
      <div className="research-log" aria-live="polite">
        {lines.length === 0 ? (
          <span className="faint">
            {job.state === 'queued' ? 'Waiting for a free researcher…' : 'Getting started…'}
          </span>
        ) : (
          lines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        This usually takes 5-20 minutes. You can leave this page; the draft will be waiting here.
      </p>
    </div>
  );
}

function Warnings({ job }: { job: ResearchJob }) {
  if (job.warnings.length === 0) return null;
  return (
    <ul className="research-warnings">
      {job.warnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
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
  const [busy, setBusy] = useState<null | 'refine' | 'apply' | 'restart'>(null);
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
    if (!ok) return setError(data.error ?? 'Could not refine the draft');
    setFeedback('');
    onJob(data.job);
  }

  async function apply(publish: boolean) {
    setBusy('apply');
    setError(null);
    const { ok, data } = await send(`/api/agents/${agentId}/research/apply`, {
      goal,
      knowledge,
      publish,
    });
    setBusy(null);
    if (!ok) return setError(data.error ?? 'Could not save');
    onJob({ ...job, appliedAt: new Date().toISOString() });
    onApplied();
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>{playbook.demo_title || 'Drafted demo'}</h3>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            {playbook.product_summary}
          </p>
        </div>
        {job.appliedAt ? (
          <span className="badge badge-live">Approved</span>
        ) : (
          <span className="badge">Needs review</span>
        )}
      </div>
      <Warnings job={job} />

      <div className="playbook-meta faint">
        <span>~{playbook.duration_minutes || '?'} min</span>
        {playbook.audience && <span>For: {playbook.audience}</span>}
        {playbook.login.required && <span>Signs in first</span>}
        {job.revisions > 0 && <span>Revised {job.revisions}×</span>}
      </div>

      {playbook.sections.length > 0 && (
        <ol className="playbook-sections">
          {playbook.sections.map((s, i) => (
            <li key={i}>
              <details>
                <summary>
                  <strong>{s.title}</strong> <span className="faint">- {s.objective}</span>
                </summary>
                <div className="playbook-section-body">
                  {s.where && <div className="faint">Where: {s.where}</div>}
                  {s.steps.length > 0 && (
                    <ol>
                      {s.steps.map((step, j) => (
                        <li key={j}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {s.talking_points.length > 0 && (
                    <ul>
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

      <div className="field">
        <label htmlFor="draft-goal">Goal (what the presenter is asked to do)</label>
        <textarea
          id="draft-goal"
          className="textarea"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>
      <details>
        <summary className="faint" style={{ cursor: 'pointer', fontSize: 13.5 }}>
          Preparation notes ({playbook.faq.length} likely questions, {playbook.sources.length}{' '}
          sources)
        </summary>
        <textarea
          aria-label="Preparation notes"
          className="textarea"
          style={{ marginTop: 10, minHeight: 260, fontSize: 13 }}
          value={knowledge}
          onChange={(e) => setKnowledge(e.target.value)}
        />
      </details>

      <div className="field">
        <label htmlFor="draft-feedback">Ask for changes</label>
        <div className="row">
          <input
            id="draft-feedback"
            className="input"
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
          <button className="btn" disabled={!feedback.trim() || busy !== null} onClick={refine}>
            {busy === 'refine' ? 'Revising…' : 'Revise'}
          </button>
        </div>
        <span className="hint">
          The AI rewrites the draft; your manual edits above are replaced.
        </span>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('restart');
            await onRestart(job.notes);
            setBusy(null);
          }}
        >
          Research again
        </button>
        <div className="row">
          <button className="btn" disabled={busy !== null} onClick={() => apply(false)}>
            Save without publishing
          </button>
          <button
            className="btn btn-primary"
            disabled={busy !== null || !goal.trim()}
            onClick={() => apply(true)}
          >
            {busy === 'apply' ? 'Saving…' : 'Approve & publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
