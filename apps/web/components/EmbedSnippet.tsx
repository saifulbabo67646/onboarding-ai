'use client';

import { useState } from 'react';

export function EmbedSnippet({ snippet, previewUrl }: { snippet: string; previewUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <pre className="code">{snippet}</pre>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy snippet'}
        </button>
        <a className="btn btn-ghost" href={previewUrl} target="_blank" rel="noreferrer">
          Preview on a sample page
        </a>
      </div>
    </div>
  );
}
