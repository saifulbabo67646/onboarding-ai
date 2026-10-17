'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Secret } from '@/lib/types';
import { SecretsEditor } from './SecretsEditor';

/**
 * The shortest path to a presenter: a URL, demo credentials and a few hints.
 * Creates a paused presenter, starts AI research, and hands over to the
 * presenter page where the owner follows progress and reviews the draft.
 */
export function AutoSetupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [extraSecrets, setExtraSecrets] = useState<Secret[]>([]);
  const [notes, setNotes] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [presenterName, setPresenterName] = useState('Alex');
  const [companyName, setCompanyName] = useState('');
  const [language, setLanguage] = useState('English');
  const [maxMinutes, setMaxMinutes] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const secrets = [
      { name: 'username', value: username },
      { name: 'password', value: password },
      ...extraSecrets,
    ].filter((s) => s.name.trim() && s.value);
    const created = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mode: 'product_demo',
        startUrl,
        goal: '',
        presenterName,
        companyName,
        language,
        maxMinutes,
        secrets,
        // Stays private until the owner approves the drafted demo.
        published: false,
      }),
    });
    const body = await created.json().catch(() => ({}));
    if (!created.ok) {
      setBusy(false);
      setError(body.error ?? 'Could not create the presenter');
      return;
    }
    const id = body.agent.id as string;
    // A failure here is shown (with a retry) on the presenter page.
    await fetch(`/api/agents/${id}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, docsUrls: docsUrl.trim() ? [docsUrl] : [] }),
    }).catch(() => undefined);
    router.push(`/dashboard/agents/${id}`);
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <div>
          <h3>Your product</h3>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            The presenter reads your public docs, signs in with the demo account, explores the app
            and drafts the demo. You review it once before anyone sees it.
          </p>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="auto-name">Name</label>
            <input
              id="auto-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Analytics tour"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="auto-url">App link</label>
            <input
              id="auto-url"
              className="input"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://app.yourproduct.com/login"
              required
            />
            <span className="hint">Where the demo starts - usually the login page.</span>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h3>Demo account</h3>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            Only if the app needs a login. Values are stored server-side and typed into the page;
            the AI never sees, says or logs them. Use an account with demo data, not a real
            customer&apos;s.
          </p>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="auto-username">Username or email</label>
            <input
              id="auto-username"
              className="input"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="auto-password">Password</label>
            <input
              id="auto-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <details>
          <summary className="faint" style={{ cursor: 'pointer', fontSize: 13.5 }}>
            More secrets (workspace ID, one-time code, API key…)
          </summary>
          <div style={{ marginTop: 12 }}>
            <SecretsEditor secrets={extraSecrets} onChange={setExtraSecrets} />
          </div>
        </details>
      </div>

      <div className="card stack">
        <h3>Hints (optional)</h3>
        <div className="field">
          <label htmlFor="auto-notes">Anything the presenter should know?</label>
          <textarea
            id="auto-notes"
            className="textarea"
            style={{ minHeight: 100 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Visitors are finance managers evaluating us. Focus on reporting and approvals; skip the admin settings. Creating sample invoices is fine."
          />
        </div>
        <div className="field">
          <label htmlFor="auto-docs">Documentation link</label>
          <input
            id="auto-docs"
            className="input"
            value={docsUrl}
            onChange={(e) => setDocsUrl(e.target.value)}
            placeholder="https://docs.yourproduct.com"
          />
          <span className="hint">If your docs live somewhere the presenter might not find.</span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="auto-presenter">Presenter name</label>
            <input
              id="auto-presenter"
              className="input"
              value={presenterName}
              onChange={(e) => setPresenterName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="auto-company">Company</label>
            <input
              id="auto-company"
              className="input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="auto-language">Language</label>
            <input
              id="auto-language"
              className="input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="auto-minutes">Demo length (minutes)</label>
            <input
              id="auto-minutes"
              className="input"
              type="number"
              min={2}
              max={120}
              value={maxMinutes}
              onChange={(e) => setMaxMinutes(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? 'Starting…' : 'Research my app'}
        </button>
      </div>
    </form>
  );
}
