import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JoinDemo } from '@/components/live/JoinDemo';
import { toPublic } from '@/lib/agents';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string }>;
};

/** The page the website widget loads in its iframe (see public/embed.js). */
export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ slug }, { name }] = await Promise.all([params, searchParams]);
  const agent = await getStore().getAgentBySlug(slug);
  if (!agent?.published) notFound();
  return <JoinDemo agent={toPublic(agent)} embedded initialName={(name ?? '').slice(0, 60)} />;
}
