'use client';

import { PenLine, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { OptionCards, type Option } from '@/components/ui';
import { AutoSetupForm } from './AutoSetupForm';
import { PresenterForm } from './PresenterForm';

type Setup = 'auto' | 'manual';

const SETUPS: Option<Setup>[] = [
  {
    value: 'auto',
    label: 'Let AI prepare it',
    description: 'Give a link and a demo login. It learns the app and drafts the demo for review.',
    icon: Sparkles,
  },
  {
    value: 'manual',
    label: 'Write it myself',
    description: 'A product demo or slides, with a goal you write.',
    icon: PenLine,
  },
];

/** The "New presenter" page: AI-prepared or hand-written. */
export function NewPresenter() {
  const [setup, setSetup] = useState<Setup>('auto');
  return (
    <div className="stack-lg">
      <OptionCards name="setup" value={setup} options={SETUPS} onChange={setSetup} />
      {setup === 'auto' ? <AutoSetupForm /> : <PresenterForm />}
    </div>
  );
}
