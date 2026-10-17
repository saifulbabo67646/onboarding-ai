'use client';

import { KeyRound, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { Secret } from '@/lib/types';
import styles from './SecretsEditor.module.css';

/** Name/value rows for demo credentials. Saved values are never sent back to the browser. */
export function SecretsEditor({
  secrets,
  onChange,
  savedNames,
}: {
  secrets: Secret[];
  onChange: (secrets: Secret[]) => void;
  savedNames?: Set<string>;
}) {
  const update = (i: number, patch: Partial<Secret>) =>
    onChange(secrets.map((s, j) => (i === j ? { ...s, ...patch } : s)));
  return (
    <div className="stack-sm">
      {secrets.map((s, i) => (
        <div className={styles.row} key={i}>
          <KeyRound size={16} className="text-muted" aria-hidden />
          <Input
            aria-label="Secret name"
            mono
            placeholder="name"
            value={s.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            aria-label="Secret value"
            type="password"
            autoComplete="new-password"
            placeholder={savedNames?.has(s.name) ? '•••••••• saved — leave empty to keep' : 'value'}
            value={s.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <Button
            variant="ghost"
            icon={Trash2}
            aria-label={`Remove ${s.name || 'secret'}`}
            onClick={() => onChange(secrets.filter((_, j) => j !== i))}
          />
        </div>
      ))}
    </div>
  );
}

export const emptySecret = (): Secret => ({ name: '', value: '' });
