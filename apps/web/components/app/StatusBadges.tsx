import { CircleCheck, CircleX, Presentation, MonitorPlay } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { SessionStatus } from '@/lib/sessions';
import type { DemoMode } from '@/lib/types';

/** Status vocabulary shared by every list and detail page. */
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'live':
      return (
        <Badge tone="success" dot pulse>
          Live
        </Badge>
      );
    case 'connecting':
      return (
        <Badge tone="warning" dot>
          Connecting
        </Badge>
      );
    case 'failed':
      return (
        <Badge tone="danger" icon={CircleX}>
          Failed
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={CircleCheck}>
          Ended
        </Badge>
      );
  }
}

export function PresenterStatusBadge({ published }: { published: boolean }) {
  return published ? (
    <Badge tone="success" dot>
      Accepting visitors
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Paused
    </Badge>
  );
}

export const MODE_LABEL: Record<DemoMode, string> = {
  product_demo: 'Product demo',
  presentation: 'Slides',
};

export function ModeBadge({ mode }: { mode: DemoMode }) {
  return (
    <Badge tone="accent" icon={mode === 'presentation' ? Presentation : MonitorPlay}>
      {MODE_LABEL[mode]}
    </Badge>
  );
}
