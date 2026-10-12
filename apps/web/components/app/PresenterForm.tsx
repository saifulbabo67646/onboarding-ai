'use client';

import { KeyRound, MonitorPlay, Plus, Presentation, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  OptionCards,
  Switch,
  Textarea,
  type Option,
} from '@/components/ui';
import type { DemoAgent, DemoMode, Secret } from '@/lib/types';
import styles from './PresenterForm.module.css';

type FormState = Omit<DemoAgent, 'id' | 'workspaceId' | 'slug' | 'createdAt' | 'updatedAt'>;

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

const MODES: Option<DemoMode>[] = [
  {
    value: 'product_demo',
    label: 'Demo a product',
    description: 'Drives your web app live: logs in, clicks through, explains.',
    icon: MonitorPlay,
  },
  {
    value: 'presentation',
    label: 'Present slides',
    description: 'Presents a Google Slides, PowerPoint or PDF deck slide by slide.',
    icon: Presentation,
  },
];

const GOAL_PLACEHOLDER: Record<DemoMode, string> = {
  product_demo:
    'e.g. Give a 10 minute demo of our analytics dashboard to a prospective customer. Log in, show the overview KPIs and what they mean, build a quick report for last month and share it with a teammate. Emphasise the time it saves compared to spreadsheets.',
  presentation:
    'e.g. Present our Q3 product update to new students. Explain each slide in plain language with an example, sketch how the sync engine works on the whiteboard when you reach the architecture slide, and take questions at the end.',
};

/** Create or edit a presenter. Used by the "New presenter" and "Settings" pages. */
export function PresenterForm({ initial }: { initial?: DemoAgent }) {
  const router = useRouter();
  const start = useMemo<FormState>(() => {
    if (!initial) return EMPTY;
    const editable: Partial<DemoAgent> = { ...initial };
    for (const key of ['id', 'workspaceId', 'slug', 'createdAt', 'updatedAt'] as const)
      delete editable[key];
    return editable as FormState;
  }, [initial]);
  const [form, setForm] = useState<FormState>(start);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedSecrets = useMemo(() => new Set(initial?.secrets.map((s) => s.name)), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSavedAt(null);
  };
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
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? 'Could not save. Please try again.');
      return;
    }
    if (initial) {
      setSavedAt(Date.now());
      router.refresh();
    } else {
      router.push(`/dashboard/presenters/${body.agent.id}`);
    }
  }

  const isDeck = form.mode === 'presentation';

  return (
    <form className={styles.form} onSubmit={submit}>
      <Card title="Type" description="What should this presenter do?">
        <OptionCards
          name="mode"
          value={form.mode}
          options={MODES}
          onChange={(v) => set('mode', v)}
        />
      </Card>

      <Card title="Goal" description="Plain language. The presenter works out the clicks itself.">
        <div className="stack">
          <div className="grid-2">
            <Field label="Name" htmlFor="name" hint="Shown to visitors and in your dashboard.">
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder={isDeck ? 'Q3 product update' : 'Analytics dashboard tour'}
                required
              />
            </Field>
            <Field
              label={isDeck ? 'Slide deck link' : 'Starting page'}
              htmlFor="startUrl"
              hint={
                isDeck
                  ? 'A public Google Slides link, a .pptx or .pdf URL, or any web deck.'
                  : 'The page open in the browser when the call starts.'
              }
            >
              <Input
                id="startUrl"
                value={form.startUrl}
                onChange={(e) => set('startUrl', e.target.value)}
                placeholder={
                  isDeck
                    ? 'https://docs.google.com/presentation/d/…'
                    : 'https://app.yourproduct.com/login'
                }
                required
              />
            </Field>
          </div>
          <Field
            label="Goal"
            htmlFor="goal"
            hint="What the audience should see and understand, what to emphasise, and anything to avoid."
          >
            <Textarea
              id="goal"
              value={form.goal}
              onChange={(e) => set('goal', e.target.value)}
              placeholder={GOAL_PLACEHOLDER[form.mode]}
              required
            />
          </Field>
          <Switch
            checked={form.allowWhiteboard}
            onChange={(v) => set('allowWhiteboard', v)}
            label="Allow the whiteboard"
            description="The presenter can open Excalidraw and sketch diagrams while explaining."
          />
        </div>
      </Card>

      <Card title="Persona" description="How the presenter introduces itself and sounds.">
        <div className="grid-2">
          <Field label="Presenter name" htmlFor="presenterName">
            <Input
              id="presenterName"
              value={form.presenterName}
              onChange={(e) => set('presenterName', e.target.value)}
            />
          </Field>
          <Field label="Company" htmlFor="companyName" optional>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          </Field>
          <Field label="Language" htmlFor="language">
            <Input
              id="language"
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
            />
          </Field>
          <Field label="Voice ID" htmlFor="voiceId" optional hint="An ElevenLabs voice id.">
            <Input
              id="voiceId"
              mono
              value={form.voiceId}
              onChange={(e) => set('voiceId', e.target.value)}
            />
          </Field>
          <Field label="Opening line" htmlFor="greeting" optional>
            <Input
              id="greeting"
              value={form.greeting}
              onChange={(e) => set('greeting', e.target.value)}
              placeholder="Thanks for making time today!"
            />
          </Field>
          <Field
            label="Time limit"
            htmlFor="maxMinutes"
            hint="Minutes, 2-120. It wraps up near the limit."
          >
            <Input
              id="maxMinutes"
              type="number"
              min={2}
              max={120}
              value={form.maxMinutes}
              onChange={(e) => set('maxMinutes', Number(e.target.value))}
            />
          </Field>
        </div>
      </Card>

      <Card title="Visitors" description="What people see before they join.">
        <div className="stack">
          <Field label="Description" htmlFor="description" optional>
            <Textarea
              id="description"
              compact
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="A live, interactive 15-minute tour of the platform. Ask questions any time."
            />
          </Field>
          <Switch
            checked={form.published}
            onChange={(v) => set('published', v)}
            label="Accept visitors"
            description="When off, the share link and website widget show the demo as unavailable."
          />
        </div>
      </Card>

      <Card
        title="Secrets"
        description="Logins for your demo account. Typed into the page, never shown to the model, spoken or logged."
        actions={
          <Button
            size="sm"
            icon={Plus}
            onClick={() => set('secrets', [...form.secrets, { name: '', value: '' }])}
          >
            Add secret
          </Button>
        }
      >
        {form.secrets.length === 0 ? (
          <p className="text-muted text-sm">
            No secrets. Add one if the demo needs to sign in (for example <code>email</code> and{' '}
            <code>password</code>).
          </p>
        ) : (
          <div className="stack-sm">
            {form.secrets.map((s, i) => (
              <div className={styles.secretRow} key={i}>
                <KeyRound size={16} className="text-muted" aria-hidden />
                <Input
                  aria-label="Secret name"
                  mono
                  placeholder="name"
                  value={s.name}
                  onChange={(e) => setSecret(i, { name: e.target.value })}
                />
                <Input
                  aria-label="Secret value"
                  type="password"
                  placeholder={
                    savedSecrets.has(s.name) ? '•••••••• saved — leave empty to keep' : 'value'
                  }
                  value={s.value}
                  onChange={(e) => setSecret(i, { value: e.target.value })}
                />
                <Button
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`Remove ${s.name || 'secret'}`}
                  onClick={() =>
                    set(
                      'secrets',
                      form.secrets.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className={styles.actionBar}>
        <div className={styles.status}>
          {error ? (
            <Alert tone="danger">{error}</Alert>
          ) : savedAt ? (
            <span className="text-secondary text-sm">All changes saved</span>
          ) : dirty && initial ? (
            <span className="text-secondary text-sm">You have unsaved changes</span>
          ) : null}
        </div>
        <div className="row">
          <Button
            variant="ghost"
            onClick={() => (initial ? setForm(start) : router.back())}
            disabled={saving || (Boolean(initial) && !dirty)}
          >
            {initial ? 'Discard' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={initial ? !dirty : false}
          >
            {initial ? 'Save changes' : 'Create presenter'}
          </Button>
        </div>
      </div>
    </form>
  );
}
