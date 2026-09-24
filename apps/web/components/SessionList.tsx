import type { DemoSession, SessionEvent } from '@/lib/types';

const STATE_LABEL: Record<DemoSession['state'], string> = {
  starting: 'Starting',
  joined: 'Joined',
  presenting: 'Live',
  ended: 'Ended',
};

function Line({ event }: { event: SessionEvent }) {
  const text = typeof event.data.text === 'string' ? event.data.text : '';
  if (event.type === 'say') {
    return (
      <div className="agent">
        <span className="who">Presenter</span>
        {text}
      </div>
    );
  }
  if (event.type === 'heard') {
    return (
      <div className="customer">
        <span className="who">Visitor</span>
        {text}
      </div>
    );
  }
  if (event.type === 'action') {
    const tool = String(event.data.tool ?? '');
    if (tool === 'say' || tool === 'screenshot') return null;
    return <div className="action">↳ {tool}</div>;
  }
  if (event.type === 'error') {
    return <div className="error-text">{String(event.data.message ?? 'error')}</div>;
  }
  return null;
}

export function SessionList({ sessions }: { sessions: DemoSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="faint" style={{ margin: 0, fontSize: 14 }}>
        No sessions yet. Open the share link to try it yourself.
      </p>
    );
  }
  return (
    <div>
      {sessions.map((s) => (
        <details key={s.id} className="session">
          <summary>
            <span>
              <strong>{s.visitorName}</strong>{' '}
              <span className="faint">· {new Date(s.startedAt).toLocaleString()}</span>
            </span>
            <span className={`badge ${s.state === 'presenting' ? 'badge-live' : 'badge-muted'}`}>
              {STATE_LABEL[s.state]}
            </span>
          </summary>
          <div className="stack" style={{ marginTop: 12 }}>
            {s.summary && <p style={{ margin: 0 }}>{s.summary}</p>}
            <div className="transcript">
              {s.events.map((e, i) => (
                <Line key={i} event={e} />
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
