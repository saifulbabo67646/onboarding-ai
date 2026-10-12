'use client';

import { Check, LogOut, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

export function AcceptInvite({
  invitationId,
  organizationName,
}: {
  invitationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  if (declined) return <Alert tone="info">Invitation declined. You can close this page.</Alert>;

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="row">
        <Button
          variant="primary"
          icon={Check}
          loading={busy === 'accept'}
          disabled={busy !== null}
          onClick={async () => {
            setBusy('accept');
            setError(null);
            const { data, error } = await authClient.organization.acceptInvitation({
              invitationId,
            });
            if (error || !data) {
              setBusy(null);
              setError(error?.message ?? 'Could not accept the invitation.');
              return;
            }
            await authClient.organization.setActive({
              organizationId: data.invitation.organizationId,
            });
            router.push('/dashboard');
            router.refresh();
          }}
        >
          Join {organizationName}
        </Button>
        <Button
          variant="ghost"
          icon={X}
          loading={busy === 'decline'}
          disabled={busy !== null}
          onClick={async () => {
            setBusy('decline');
            setError(null);
            const { error } = await authClient.organization.rejectInvitation({ invitationId });
            setBusy(null);
            if (error) setError(error.message ?? 'Could not decline the invitation.');
            else setDeclined(true);
          }}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

/** Signs out, then continues to sign-in with the invited address prefilled. */
export function SwitchAccount({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Button
        variant="secondary"
        icon={LogOut}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await authClient.signOut();
          window.location.href = next;
        }}
      >
        Sign in with a different account
      </Button>
    </div>
  );
}
