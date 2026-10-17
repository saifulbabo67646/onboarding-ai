'use client';

import type { Secret } from '@/lib/types';

/** Name/value rows for demo credentials. Saved values are never sent back to the browser. */
export function SecretsEditor({
  secrets,
  onChange,
  savedNames = new Set<string>(),
}: {
  secrets: Secret[];
  onChange: (secrets: Secret[]) => void;
  savedNames?: Set<string>;
}) {
  const update = (i: number, patch: Partial<Secret>) =>
    onChange(secrets.map((s, j) => (i === j ? { ...s, ...patch } : s)));

  return (
    <div className="stack" style={{ gap: 10 }}>
      {secrets.map((s, i) => (
        <div className="row" key={i}>
          <input
            className="input"
            placeholder="name (e.g. password)"
            aria-label="Secret name"
            value={s.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <input
            className="input"
            type="password"
            aria-label="Secret value"
            autoComplete="new-password"
            placeholder={savedNames.has(s.name) ? '•••••• saved - leave empty to keep' : 'value'}
            value={s.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onChange(secrets.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn"
          onClick={() => onChange([...secrets, { name: '', value: '' }])}
        >
          Add secret
        </button>
      </div>
    </div>
  );
}
