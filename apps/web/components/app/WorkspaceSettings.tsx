'use client';

import { Check, Copy, LogOut, Send, Trash2, UserMinus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Table,
  tableStyles as t,
} from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { formatDate, formatRelative } from '@/lib/format';
import type { PendingInvitation, WorkspaceMember } from '@/lib/server/workspace';
import type { Viewer, WorkspaceRole } from '@/lib/types';
import styles from './WorkspaceSettings.module.css';

type Member = WorkspaceMember;
type Invite = PendingInvitation;

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

/** Runs a Better Auth client call, surfaces its error, refreshes server data on success. */
function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(
    key: string,
    fn: () => Promise<{ error?: { message?: string } | null }>,
    { refresh = true } = {},
  ) {
    setBusy(key);
    setError(null);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      setError(error.message ?? 'Something went wrong.');
      return false;
    }
    if (refresh) router.refresh();
    return true;
  }
  return { error, busy, run };
}

export function GeneralSettings({ viewer, canManage }: { viewer: Viewer; canManage: boolean }) {
  const [name, setName] = useState(viewer.workspace.name);
  const { error, busy, run } = useAction();
  return (
    <Card title="General" description="The workspace name is shown to your teammates.">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run('name', () =>
            authClient.organization.update({ organizationId: viewer.workspace.id, data: { name } }),
          );
        }}
      >
        <Field label="Workspace name" htmlFor="workspace-name">
          <div className="row">
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
              required
              maxLength={80}
            />
            {canManage && (
              <Button
                type="submit"
                variant="primary"
                loading={busy === 'name'}
                disabled={name.trim() === viewer.workspace.name}
              >
                Save
              </Button>
            )}
          </div>
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Card>
  );
}

export function MembersCard({
  members,
  viewer,
  canManage,
}: {
  members: Member[];
  viewer: Viewer;
  canManage: boolean;
}) {
  const { error, busy, run } = useAction();
  return (
    <Card
      title="Members"
      description={`${members.length} ${members.length === 1 ? 'person' : 'people'} in this workspace.`}
      padded={false}
    >
      {error && (
        <div className={styles.inlineAlert}>
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Joined</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isSelf = m.userId === viewer.user.id;
            const editable = canManage && !isSelf && m.role !== 'owner';
            return (
              <tr key={m.id}>
                <td>
                  <div className="row">
                    <Avatar name={m.name || m.email} size="sm" />
                    <div>
                      <div className={t.primary}>
                        {m.name} {isSelf && <span className="text-muted">(you)</span>}
                      </div>
                      <div className="text-muted text-sm">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td className={styles.roleCell}>
                  {editable ? (
                    <Select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={busy === m.id}
                      onChange={(e) =>
                        void run(m.id, () =>
                          authClient.organization.updateMemberRole({
                            memberId: m.id,
                            role: e.target.value as 'admin' | 'member',
                          }),
                        )
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </Select>
                  ) : (
                    <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  )}
                </td>
                <td className={t.muted}>{formatDate(m.joinedAt)}</td>
                <td className={t.numeric}>
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={UserMinus}
                      loading={busy === `remove-${m.id}`}
                      onClick={() => {
                        if (confirm(`Remove ${m.name} from ${viewer.workspace.name}?`)) {
                          void run(`remove-${m.id}`, () =>
                            authClient.organization.removeMember({ memberIdOrEmail: m.id }),
                          );
                        }
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

function CopyInviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={copied ? Check : Copy}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

export function InvitationsCard({
  invites,
  origin,
  emailEnabled,
}: {
  invites: Invite[];
  origin: string;
  emailEnabled: boolean;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { error, busy, run } = useAction();

  return (
    <Card
      title="Invite people"
      description={
        emailEnabled
          ? 'They get an email with a link to join. Invitations expire after 7 days.'
          : "Email isn't configured on this server, so copy each invitation link and send it yourself. Invitations expire after 7 days."
      }
    >
      <div className="stack">
        <form
          className={styles.inviteForm}
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run('invite', () =>
              authClient.organization.inviteMember({ email: email.trim(), role }),
            );
            if (ok) {
              setSentTo(email.trim());
              setEmail('');
            }
          }}
        >
          <Input
            type="email"
            aria-label="Email address"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
          <Button type="submit" variant="primary" icon={Send} loading={busy === 'invite'}>
            Invite
          </Button>
        </form>
        {error && <Alert tone="danger">{error}</Alert>}
        {sentTo && !error && (
          <Alert tone="info">
            Invitation created for {sentTo}.{' '}
            {emailEnabled
              ? 'They will get an email shortly.'
              : 'Copy the link below and send it to them.'}
          </Alert>
        )}

        {invites.length > 0 && (
          <div className={styles.inviteList}>
            <h3 className={styles.subheading}>Pending</h3>
            {invites.map((inv) => (
              <div key={inv.id} className={styles.inviteRow}>
                <div className={styles.inviteWho}>
                  <span className={t.primary}>{inv.email}</span>
                  <span className="text-muted text-sm">
                    {ROLE_LABEL[inv.role]} · expires {formatRelative(inv.expiresAt)}
                  </span>
                </div>
                <CopyInviteLink url={`${origin}/invite/${inv.id}`} />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={X}
                  loading={busy === inv.id}
                  onClick={() =>
                    void run(inv.id, () =>
                      authClient.organization.cancelInvitation({ invitationId: inv.id }),
                    )
                  }
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function LeaveOrDeleteCard({ viewer }: { viewer: Viewer }) {
  const [confirmName, setConfirmName] = useState('');
  const { error, busy, run } = useAction();
  const isOwner = viewer.role === 'owner';
  const onlyWorkspace = viewer.workspaces.length === 1;

  // The active workspace changes server-side, so reload the whole shell.
  const exit = { refresh: false };
  const afterExit = () => window.location.assign('/dashboard');

  if (!isOwner) {
    return (
      <Card
        tone="danger"
        title="Leave workspace"
        description="You'll lose access to its presenters and sessions until someone invites you again."
      >
        <div className="stack">
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <Button
              variant="danger"
              icon={LogOut}
              loading={busy === 'leave'}
              disabled={onlyWorkspace}
              onClick={async () => {
                if (
                  await run(
                    'leave',
                    () => authClient.organization.leave({ organizationId: viewer.workspace.id }),
                    exit,
                  )
                ) {
                  afterExit();
                }
              }}
            >
              Leave {viewer.workspace.name}
            </Button>
            {onlyWorkspace && (
              <p className="text-muted text-sm" style={{ marginTop: 8 }}>
                This is your only workspace. Create another one before leaving.
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      tone="danger"
      title="Delete workspace"
      description="Permanently deletes the workspace with all of its presenters, sessions and transcripts."
    >
      <div className="stack">
        {onlyWorkspace ? (
          <p className="text-muted text-sm">
            This is your only workspace. Create another one first if you want to delete it.
          </p>
        ) : (
          <div className="row row-wrap">
            <Input
              aria-label="Type the workspace name to confirm"
              placeholder={`Type "${viewer.workspace.name}" to confirm`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className={styles.confirmInput}
            />
            <Button
              variant="danger"
              icon={Trash2}
              disabled={confirmName !== viewer.workspace.name}
              loading={busy === 'delete'}
              onClick={async () => {
                if (
                  await run(
                    'delete',
                    () => authClient.organization.delete({ organizationId: viewer.workspace.id }),
                    exit,
                  )
                ) {
                  afterExit();
                }
              }}
            >
              Delete workspace
            </Button>
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Card>
  );
}
