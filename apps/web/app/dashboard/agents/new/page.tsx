import type { Metadata } from 'next';
import { AgentForm } from '@/components/AgentForm';
import { TopBar } from '@/components/TopBar';

export const metadata: Metadata = { title: 'New presenter' };

export default function NewAgentPage() {
  return (
    <>
      <TopBar owner />
      <main className="container" style={{ maxWidth: 820, paddingBottom: 64 }}>
        <div className="page-header">
          <div>
            <h1>New presenter</h1>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Give it a goal and a starting point. It takes care of the rest, live.
            </p>
          </div>
        </div>
        <AgentForm />
      </main>
    </>
  );
}
