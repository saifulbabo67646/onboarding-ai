import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { AcceptInvite, SwitchAccount } from '@/components/auth/AcceptInvite';
import { CenteredPage } from '@/components/site/CenteredPage';
import { Alert, Button } from '@/components/ui';
import { getViewer } from '@/lib/server/viewer';
import { getInvitationDetails } from '@/lib/server/workspace';
import styles from '@/components/auth/Auth.module.css';

export const metadata: Metadata = { title: 'Workspace invitation' };

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invite, viewer] = await Promise.all([getInvitationDetails(id), getViewer()]);

  if (!invite || !invite.usable) {
    return (
      <CenteredPage>
        <div className="stack">
          <h1 className="title-lg">Invitation unavailable</h1>
          <p className="text-secondary">
            This invitation has expired, was revoked or was already used. Ask whoever invited you to
            send a new one.
          </p>
          <div>
            <Button href={viewer ? '/dashboard' : '/login'} variant="secondary">
              {viewer ? 'Go to dashboard' : 'Sign in'}
            </Button>
          </div>
        </div>
      </CenteredPage>
    );
  }

  const next = `/invite/${id}`;
  const qs = `?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`;
  const alreadyMember = viewer?.workspaces.some((w) => w.id === invite.organizationId) ?? false;
  const wrongAccount = viewer && viewer.user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <CenteredPage>
      <div className="stack">
        <div className={styles.header}>
          <span className={styles.icon}>
            <Users size={20} aria-hidden />
          </span>
          <h1 className="title-lg">Join {invite.workspaceName}</h1>
          <p className="text-secondary">
            {invite.inviterName} invited <strong>{invite.email}</strong> to collaborate on
            presenters as {invite.role === 'admin' ? 'an admin' : 'a member'}.
          </p>
        </div>

        {!viewer ? (
          <div className="stack-sm">
            <Button href={`/signup${qs}`} variant="primary" block>
              Create an account to accept
            </Button>
            <Button href={`/login${qs}`} variant="secondary" block>
              I already have an account
            </Button>
          </div>
        ) : wrongAccount ? (
          <div className="stack">
            <Alert tone="warning">
              You&apos;re signed in as {viewer.user.email}, but this invitation is for{' '}
              {invite.email}.
            </Alert>
            <SwitchAccount next={`/login${qs}`} />
          </div>
        ) : alreadyMember ? (
          <Button href="/dashboard" variant="primary">
            You&apos;re already a member. Go to dashboard
          </Button>
        ) : (
          <AcceptInvite invitationId={id} organizationName={invite.workspaceName} />
        )}
      </div>
    </CenteredPage>
  );
}
