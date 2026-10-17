'use client';

import { useState } from 'react';
import { AgentForm } from './AgentForm';
import { AutoSetupForm } from './AutoSetupForm';

type Tab = 'auto' | 'manual';

export function NewPresenter() {
  const [tab, setTab] = useState<Tab>('auto');
  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'auto'}
          className={`tab ${tab === 'auto' ? 'active' : ''}`}
          onClick={() => setTab('auto')}
        >
          Let AI prepare it
          <span className="tab-hint">Give a link and a demo login</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'manual'}
          className={`tab ${tab === 'manual' ? 'active' : ''}`}
          onClick={() => setTab('manual')}
        >
          Write it myself
          <span className="tab-hint">Product demo or slides, your own goal</span>
        </button>
      </div>
      {tab === 'auto' ? <AutoSetupForm /> : <AgentForm />}
    </div>
  );
}
