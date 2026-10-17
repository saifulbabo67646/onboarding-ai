'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import styles from './DeletePresenter.module.css';

/** Danger zone: deleting needs the presenter's name typed in, like most SaaS tools. */
export function DeletePresenter({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    router.push('/dashboard/presenters');
    router.refresh();
  }

  return (
    <Card
      tone="danger"
      title="Delete presenter"
      description="Removes the presenter, its share link, widget and all session history. This can't be undone."
    >
      <div className="row row-wrap">
        <Input
          aria-label="Type the presenter name to confirm"
          placeholder={`Type "${name}" to confirm`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={styles.confirm}
        />
        <Button
          variant="danger"
          icon={Trash2}
          disabled={confirm !== name}
          loading={busy}
          onClick={remove}
        >
          Delete presenter
        </Button>
      </div>
    </Card>
  );
}
