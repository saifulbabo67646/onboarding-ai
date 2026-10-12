'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { Input } from './Field';
import styles from './CopyField.module.css';

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

/** Read-only value with copy (and optional open) actions - links, ids, keys. */
export function CopyField({ value, openable = false }: { value: string; openable?: boolean }) {
  const { copied, copy } = useCopy(value);
  return (
    <div className={styles.row}>
      <Input mono readOnly value={value} onFocus={(e) => e.target.select()} aria-label="Value" />
      <Button icon={copied ? Check : Copy} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {openable && (
        <Button href={value} external icon={ExternalLink} variant="primary">
          Open
        </Button>
      )}
    </div>
  );
}

/** A code snippet with a copy button in its corner. */
export function CodeBlock({ code }: { code: string }) {
  const { copied, copy } = useCopy(code);
  return (
    <div className={styles.code}>
      <pre>{code}</pre>
      <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
