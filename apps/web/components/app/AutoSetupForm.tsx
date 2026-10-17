'use client';

import { Plus, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input, Textarea } from '@/components/ui';
import type { Secret } from '@/lib/types';
import styles from './PresenterForm.module.css';
import { emptySecret, SecretsEditor } from './SecretsEditor';

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
      setError(body.error ?? 'Could not create the presenter. Please try again.');
      return;
    }
    const id = body.agent.id as string;
    // A failure here is shown (with a retry) on the presenter page.
    await fetch(`/api/agents/${id}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, docsUrls: docsUrl.trim() ? [docsUrl] : [] }),
    }).catch(() => undefined);
    router.push(`/dashboard/presenters/${id}`);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Card
        title="Your product"
        description="The presenter reads your public docs, signs in with the demo account, explores the app and drafts the demo. You review it once before anyone sees it."
      >
        <div className="grid-2">
          <Field label="Name" htmlFor="auto-name" hint="Shown to visitors and in your dashboard.">
            <Input
              id="auto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Analytics tour"
              required
            />
          </Field>
          <Field
            label="App link"
            htmlFor="auto-url"
            hint="Where the demo starts - usually the login page."
          >
            <Input
              id="auto-url"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://app.yourproduct.com/login"
              required
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Demo account"
        description="Only if the app needs a login. Typed into the page, never shown to the model, spoken or logged. Use an account with demo data, not a real customer's."
        actions={
          <Button
            size="sm"
            icon={Plus}
            onClick={() => setExtraSecrets([...extraSecrets, emptySecret()])}
          >
            Add secret
          </Button>
        }
      >
        <div className="stack">
          <div className="grid-2">
            <Field label="Username or email" htmlFor="auto-username">
              <Input
                id="auto-username"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="auto-password">
              <Input
                id="auto-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>
          {extraSecrets.length > 0 && (
            <SecretsEditor secrets={extraSecrets} onChange={setExtraSecrets} />
          )}
        </div>
      </Card>

      <Card title="Hints" description="Optional. Steer what the demo covers and how it sounds.">
        <div className="stack">
          <Field label="Anything the presenter should know?" htmlFor="auto-notes" optional>
            <Textarea
              id="auto-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Visitors are finance managers evaluating us. Focus on reporting and approvals; skip the admin settings. Creating sample invoices is fine."
            />
          </Field>
          <Field
            label="Documentation link"
            htmlFor="auto-docs"
            optional
            hint="If your docs live somewhere the presenter might not find."
          >
            <Input
              id="auto-docs"
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              placeholder="https://docs.yourproduct.com"
            />
          </Field>
          <div className="grid-2">
            <Field label="Presenter name" htmlFor="auto-presenter">
              <Input
                id="auto-presenter"
                value={presenterName}
                onChange={(e) => setPresenterName(e.target.value)}
              />
            </Field>
            <Field label="Company" htmlFor="auto-company" optional>
              <Input
                id="auto-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Field>
            <Field label="Language" htmlFor="auto-language">
              <Input
                id="auto-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </Field>
            <Field label="Demo length" htmlFor="auto-minutes" hint="Minutes, 2-120.">
              <Input
                id="auto-minutes"
                type="number"
                min={2}
                max={120}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value))}
              />
            </Field>
          </div>
        </div>
      </Card>

      <div className={styles.actionBar}>
        <div className={styles.status}>{error && <Alert tone="danger">{error}</Alert>}</div>
        <div className="row">
          <Button variant="ghost" onClick={() => router.back()} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Sparkles} loading={busy}>
            Research my app
          </Button>
        </div>
      </div>
    </form>
  );
}
