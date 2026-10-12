'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { slugify } from '@/lib/agents';
import { authClient } from '@/lib/auth-client';

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const suffix = Math.random().toString(16).slice(2, 8);
          const { data, error } = await authClient.organization.create({
            name: name.trim(),
            slug: `${slugify(name) || 'workspace'}-${suffix}`,
          });
          if (error || !data) {
            setBusy(false);
            setError(error?.message ?? 'Could not create the workspace.');
            return;
          }
          await authClient.organization.setActive({ organizationId: data.id });
          router.push('/dashboard');
          router.refresh();
        }}
      >
        <Field
          label="Workspace name"
          htmlFor="new-workspace"
          hint="Usually your company or team name."
        >
          <Input
            id="new-workspace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            required
            maxLength={80}
            autoFocus
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            Create workspace
          </Button>
        </div>
      </form>
    </Card>
  );
}
