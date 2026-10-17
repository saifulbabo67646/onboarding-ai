import {
  GeneralSettings,
  InvitationsCard,
  LeaveOrDeleteCard,
  MembersCard,
} from '@/components/app/WorkspaceSettings';
import { PageHeader } from '@/components/ui';
import { emailConfigured } from '@/lib/server/email';
import { publicOrigin } from '@/lib/server/urls';
import { canManageMembers, requireViewer } from '@/lib/server/viewer';
import { listMembers, listPendingInvitations } from '@/lib/server/workspace';

export const metadata = { title: 'Workspace settings' };

export default async function SettingsPage() {
  const viewer = await requireViewer('/dashboard/settings');
  const canManage = canManageMembers(viewer.role);
  const [members, invites, origin] = await Promise.all([
    listMembers(viewer.workspace.id),
    canManage ? listPendingInvitations(viewer.workspace.id) : Promise.resolve([]),
    publicOrigin(),
  ]);

  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Everyone in a workspace shares its presenters and session history."
      />
      <div className="stack-lg">
        <GeneralSettings viewer={viewer} canManage={canManage} />
        <MembersCard members={members} viewer={viewer} canManage={canManage} />
        {canManage && (
          <InvitationsCard invites={invites} origin={origin} emailEnabled={emailConfigured()} />
        )}
        <LeaveOrDeleteCard viewer={viewer} />
      </div>
    </>
  );
}
