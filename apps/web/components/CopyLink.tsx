'use client';

import { useState } from 'react';

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row">
      <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer">
        Open
      </a>
    </div>
  );
}
