import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JoinDemo } from '@/components/JoinDemo';
import { toPublic } from '@/lib/agents';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const agent = await getStore().getAgentBySlug(slug);
  return agent?.published ? toPublic(agent) : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const agent = await load((await params).slug);
  return agent
    ? {
        title: agent.name,
        description: agent.description || `A live session with ${agent.presenterName}`,
      }
    : { title: 'Demo not found' };
}

export default async function DemoPage({ params }: Props) {
  const agent = await load((await params).slug);
  if (!agent) notFound();
  return <JoinDemo agent={agent} />;
}
