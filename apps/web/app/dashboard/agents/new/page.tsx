import type { Metadata } from 'next';
import { NewPresenter } from '@/components/NewPresenter';
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
              Point it at your app and let it learn the product, or write the goal yourself.
            </p>
          </div>
        </div>
        <NewPresenter />
      </main>
    </>
  );
}
