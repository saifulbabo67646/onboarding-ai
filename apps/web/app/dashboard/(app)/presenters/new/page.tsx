import { PresenterForm } from '@/components/app/PresenterForm';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'New presenter' };

export default function NewPresenterPage() {
  return (
    <div className="content-narrow">
      <PageHeader
        title="New presenter"
        description="Give it a goal and a starting point. It takes care of the rest, live."
        breadcrumbs={[{ label: 'Presenters', href: '/dashboard/presenters' }, { label: 'New' }]}
      />
      <PresenterForm />
    </div>
  );
}
