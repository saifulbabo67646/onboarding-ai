import { NewWorkspaceForm } from '@/components/app/NewWorkspaceForm';
import { PageHeader } from '@/components/ui';
import { requireViewer } from '@/lib/server/viewer';

export const metadata = { title: 'New workspace' };

export default async function NewWorkspacePage() {
  await requireViewer('/dashboard/workspaces/new');
  return (
    <>
      <PageHeader
        title="New workspace"
        description="A separate space with its own presenters, sessions and members. You'll be its owner."
        breadcrumbs={[
          { label: 'Settings', href: '/dashboard/settings' },
          { label: 'New workspace' },
        ]}
      />
      <div style={{ maxWidth: 560 }}>
        <NewWorkspaceForm />
      </div>
    </>
  );
}
