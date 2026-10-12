import { Clock, Pencil, Radio, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { SessionsTable } from '@/components/app/SessionsTable';
import { Button, Card, CodeBlock, CopyField, DescriptionList, StatCard } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { getStore } from '@/lib/server/store';
import { publicOrigin } from '@/lib/server/urls';
import { overviewStats } from '@/lib/sessions';
import styles from './presenter.module.css';

export default async function PresenterOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(id);
  if (!agent) notFound();
  const sessions = await store.listSessions(id, 1000);
  const stats = overviewStats([agent], sessions);
  const origin = await publicOrigin();
  const shareUrl = `${origin}/d/${agent.slug}`;
  const snippet = `<script src="${origin}/embed.js" data-presenter="${agent.slug}" async></script>`;
  const settings = `/dashboard/presenters/${id}/settings`;

  return (
    <div className="stack-lg">
      <div className={styles.stats}>
        <StatCard label="Total sessions" value={sessions.length} icon={Users} />
        <StatCard label="Live now" value={stats.liveNow} icon={Radio} />
        <StatCard
          label="Average session"
          value={formatDuration(stats.avgDurationSec)}
          icon={Clock}
        />
      </div>

      <div className={styles.split}>
        <div className="stack">
          <Card
            title="Share link"
            description="Send it to a customer or student - every visitor gets their own private session."
          >
            <CopyField value={shareUrl} openable />
          </Card>
          <Card
            title="Add to your website"
            description={
              <>
                Paste before <code>&lt;/body&gt;</code> for a launcher in the corner of your site.
                Options: <code>data-label</code>, <code>data-color</code>,{' '}
                <code>data-position=&quot;left&quot;</code>, <code>data-name</code>, or call{' '}
                <code>OnboardAI.open()</code>.
              </>
            }
          >
            <CodeBlock code={snippet} />
          </Card>
        </div>

        <Card
          title="Brief"
          actions={
            <Button href={settings} size="sm" variant="ghost" icon={Pencil}>
              Edit
            </Button>
          }
        >
          <div className="stack">
            <p className={styles.goal}>{agent.goal}</p>
            <DescriptionList
              items={[
                {
                  label: agent.mode === 'presentation' ? 'Slide deck' : 'Starting page',
                  value: (
                    <a href={agent.startUrl} target="_blank" rel="noreferrer">
                      {new URL(agent.startUrl).host}
                    </a>
                  ),
                },
                { label: 'Language', value: agent.language },
                { label: 'Time limit', value: `${agent.maxMinutes} min` },
                { label: 'Whiteboard', value: agent.allowWhiteboard ? 'Allowed' : 'Off' },
                { label: 'Secrets', value: agent.secrets.length || 'None' },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Recent sessions"
        padded={false}
        actions={
          <Button href={`/dashboard/presenters/${id}/sessions`} size="sm" variant="ghost">
            View all
          </Button>
        }
      >
        <SessionsTable sessions={sessions.slice(0, 5)} />
      </Card>
    </div>
  );
}
