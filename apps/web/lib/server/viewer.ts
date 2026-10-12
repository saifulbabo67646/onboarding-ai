import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createPersonalWorkspace, getAuth } from './auth';
import { getDb } from './db/client';
import { member, organization } from './db/schema';
import type { Viewer, WorkspaceRole } from '../types';

export type { Viewer, WorkspaceRole };

/**
 * The signed-in user and the workspace they are working in, verified against
 * the database on every request (a stale or removed membership falls back to
 * another workspace). Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const { user, session } = result;

  const loadMemberships = () =>
    getDb()
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, user.id))
      .orderBy(asc(member.createdAt));
  let memberships = await loadMemberships();
  if (memberships.length === 0) {
    // Removed from every workspace: give them a fresh personal one rather than a dead end.
    await createPersonalWorkspace(user);
    memberships = await loadMemberships();
  }

  const activeId = (session as { activeOrganizationId?: string | null }).activeOrganizationId;
  let active = memberships.find((m) => m.id === activeId);
  if (!active) {
    active = memberships[0];
    await getAuth().api.setActiveOrganization({
      headers: requestHeaders,
      body: { organizationId: active.id },
    });
  }
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
    workspace: { id: active.id, name: active.name, slug: active.slug },
    role: active.role as WorkspaceRole,
    workspaces: memberships.map((m) => ({ id: m.id, name: m.name, role: m.role as WorkspaceRole })),
  };
});

/** For pages: redirect to sign-in when there is no usable session. */
export async function requireViewer(next = '/dashboard'): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}
