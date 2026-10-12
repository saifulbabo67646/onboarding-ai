import { MousePointerClick } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { formatClock } from '@/lib/format';
import type { DemoSession, SessionEvent } from '@/lib/types';
import styles from './Transcript.module.css';

const QUIET_TOOLS = new Set(['say', 'screenshot', 'zoom', 'cursor_position', 'wait', 'listen']);

function actionLabel(e: SessionEvent): string | null {
  const tool = String(e.data.tool ?? '');
  if (QUIET_TOOLS.has(tool)) return null;
  const input = (e.data.input ?? {}) as Record<string, unknown>;
  switch (tool) {
    case 'open_url':
      return `Opened ${input.url}`;
    case 'point_at':
      return 'Pointed at something on screen';
    case 'type_secret':
      return `Entered the ${input.name} secret`;
    case 'sketch':
      return 'Drew on the whiteboard';
    case 'type':
      return 'Typed text';
    case 'end_demo':
      return 'Ended the session';
    default:
      return tool.replace(/_/g, ' ');
  }
}

/** Conversation timeline: who said what, with the presenter's notable actions in between. */
export function Transcript({
  session,
  presenterName,
}: {
  session: DemoSession;
  presenterName: string;
}) {
  const items = session.events.flatMap((e, i) => {
    const time = formatClock(e.ts, session.startedAt);
    if (e.type === 'say' || e.type === 'heard') {
      const agent = e.type === 'say';
      const who = agent ? presenterName : session.visitorName;
      return [
        <li key={i} className={styles.message}>
          <Avatar name={who} size="sm" brand={agent} />
          <div>
            <div className={styles.meta}>
              <span className={styles.who}>{who}</span>
              <span className={styles.time}>{time}</span>
            </div>
            <p className={styles.text}>{String(e.data.text ?? '')}</p>
          </div>
        </li>,
      ];
    }
    if (e.type === 'action') {
      const label = actionLabel(e);
      return label
        ? [
            <li key={i} className={styles.action}>
              <MousePointerClick size={13} aria-hidden />
              {label}
              <span className={styles.time}>{time}</span>
            </li>,
          ]
        : [];
    }
    if (e.type === 'error') {
      return [
        <li key={i} className={styles.error}>
          {String(e.data.message ?? 'Something went wrong')}
        </li>,
      ];
    }
    return [];
  });

  if (items.length === 0) {
    return <p className="text-muted text-sm">No conversation was recorded for this session.</p>;
  }
  return <ol className={styles.list}>{items}</ol>;
}
