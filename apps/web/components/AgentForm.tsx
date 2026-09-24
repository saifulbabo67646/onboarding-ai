'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DemoAgent, DemoMode, Secret } from '@/lib/types';

type FormState = Omit<DemoAgent, 'id' | 'slug' | 'createdAt' | 'updatedAt'>;

const EMPTY: FormState = {
  name: '',
  mode: 'product_demo',
  goal: '',
  startUrl: '',
  description: '',
  presenterName: 'Alex',
  companyName: '',
  greeting: '',
  language: 'English',
  voiceId: '',
  allowWhiteboard: false,
  maxMinutes: 20,
  secrets: [],
  published: true,
};

const GOAL_PLACEHOLDER: Record<DemoMode, string> = {
  product_demo:
    'e.g. Give a 10 minute demo of our analytics dashboard to a prospective customer. Log in, show the overview KPIs and what they mean, build a quick report filtered to last month, and show how to share it with a teammate. Emphasise how much time it saves compared to spreadsheets.',
  presentation:
    'e.g. Present our Q3 product update deck to students. Explain each slide in plain language with an example, and use the whiteboard to sketch how the new sync engine works when you reach the architecture slide. Take questions at the end.',
};

export function AgentForm({ initial }: { initial?: DemoAgent }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial ? { ...initial } : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSecretNames] = useState(() => new Set(initial?.secrets.map((s) => s.name) ?? []));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setSecret = (i: number, patch: Partial<Secret>) =>
    set(
      'secrets',
      form.secrets.map((s, j) => (i === j ? { ...s, ...patch } : s)),
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(initial ? `/api/agents/${initial.id}` : '/api/agents', {
      method: initial ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'Could not save');
      return;
    }
    router.push(`/dashboard/agents/${body.agent.id}`);
    router.refresh();
  }

  async function remove() {
    if (!initial || !confirm(`Delete "${initial.name}" and its session history?`)) return;
    await fetch(`/api/agents/${initial.id}`, { method: 'DELETE' });
    router.push('/dashboard');
    router.refresh();
  }

  const isDeck = form.mode === 'presentation';

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <div className="field">
          <label>What should this presenter do?</label>
          <div className="row">
            {(['product_demo', 'presentation'] as DemoMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`btn ${form.mode === mode ? 'btn-primary' : ''}`}
                onClick={() => set('mode', mode)}
              >
                {mode === 'product_demo' ? 'Demo a product' : 'Present slides'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={isDeck ? 'Q3 product update' : 'Analytics dashboard tour'}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="startUrl">{isDeck ? 'Slide deck link' : 'Where the demo starts'}</label>
            <input
              id="startUrl"
              className="input"
              value={form.startUrl}
              onChange={(e) => set('startUrl', e.target.value)}
              placeholder={
                isDeck
                  ? 'https://docs.google.com/presentation/d/…/edit?usp=sharing'
                  : 'https://app.yourproduct.com/login'
              }
              required
            />
            <span className="hint">
              {isDeck
                ? 'A public Google Slides link, a link to a .pptx or .pdf file, or any web-based deck.'
                : 'The page the presenter has open when the call starts.'}
            </span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="goal">Goal</label>
          <textarea
            id="goal"
            className="textarea"
            value={form.goal}
            onChange={(e) => set('goal', e.target.value)}
            placeholder={GOAL_PLACEHOLDER[form.mode]}
            required
          />
          <span className="hint">
            Plain language. Say what the audience should see and understand, what to emphasise, and
            anything to avoid. The presenter figures out the clicks.
          </span>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.allowWhiteboard}
            onChange={(e) => set('allowWhiteboard', e.target.checked)}
          />
          <span>
            Allow the whiteboard
            <br />
            <span className="faint">
              The presenter can open Excalidraw and sketch diagrams while explaining.
            </span>
          </span>
        </label>
      </div>

      <div className="card stack">
        <h3>Presenter</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="presenterName">Presenter name</label>
            <input
              id="presenterName"
              className="input"
              value={form.presenterName}
              onChange={(e) => set('presenterName', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="companyName">Company</label>
            <input
              id="companyName"
              className="input"
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="language">Language</label>
            <input
              id="language"
              className="input"
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="voiceId">Voice ID (ElevenLabs, optional)</label>
            <input
              id="voiceId"
              className="input"
              value={form.voiceId}
              onChange={(e) => set('voiceId', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="maxMinutes">Time limit (minutes)</label>
            <input
              id="maxMinutes"
              className="input"
              type="number"
              min={2}
              max={120}
              value={form.maxMinutes}
              onChange={(e) => set('maxMinutes', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="greeting">Opening line (optional)</label>
            <input
              id="greeting"
              className="input"
              value={form.greeting}
              onChange={(e) => set('greeting', e.target.value)}
              placeholder="Thanks for making time today!"
            />
          </div>
        </div>
      </div>

      <div className="card stack">
        <h3>Public demo page</h3>
        <div className="field">
          <label htmlFor="description">Description shown to visitors</label>
          <textarea
            id="description"
            className="textarea"
            style={{ minHeight: 80 }}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="A live, interactive 15-minute tour of the platform. Ask questions any time."
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => set('published', e.target.checked)}
          />
          <span>Accept visitors (the share link works)</span>
        </label>
      </div>

      <div className="card stack">
        <div>
          <h3>Secrets</h3>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            Logins for the demo account. The presenter types them into the page but never sees, says
            or logs the values.
          </p>
        </div>
        {form.secrets.map((s, i) => (
          <div className="row" key={i}>
            <input
              className="input"
              placeholder="name (e.g. password)"
              value={s.name}
              onChange={(e) => setSecret(i, { name: e.target.value })}
            />
            <input
              className="input"
              type="password"
              placeholder={
                savedSecretNames.has(s.name) ? '•••••• saved - leave empty to keep' : 'value'
              }
              value={s.value}
              onChange={(e) => setSecret(i, { value: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                set(
                  'secrets',
                  form.secrets.filter((_, j) => j !== i),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => set('secrets', [...form.secrets, { name: '', value: '' }])}
          >
            Add secret
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          {initial && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          )}
        </div>
        <button className="btn btn-primary btn-lg" type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create presenter'}
        </button>
      </div>
    </form>
  );
}
