import { NewPresenter } from '@/components/app/NewPresenter';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'New presenter' };

export default function NewPresenterPage() {
  return (
    <div className="content-narrow">
      <PageHeader
        title="New presenter"
        description="Point it at your app and let it learn the product, or write the goal yourself."
        breadcrumbs={[{ label: 'Presenters', href: '/dashboard/presenters' }, { label: 'New' }]}
      />
      <NewPresenter />
    </div>
  );
}
