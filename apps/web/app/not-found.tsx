import { ArrowLeft, SearchX } from 'lucide-react';
import { CenteredPage } from '@/components/site/CenteredPage';
import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <CenteredPage>
      <EmptyState
        icon={SearchX}
        title="This page isn't available"
        description="The link may be wrong, or this demo is paused right now. Please check with whoever shared it."
        action={
          <Button href="/" icon={ArrowLeft}>
            Back to home
          </Button>
        }
      />
    </CenteredPage>
  );
}
