import 'server-only';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { WorkspaceRole } from '../types';
import { getDb } from './db/client';
import { invitation, member, organization, user } from './db/schema';

export type WorkspaceMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
};

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = await getDb()
    .select({
      id: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, workspaceId))
    .orderBy(asc(member.createdAt));
  return rows.map((r) => ({
    ...r,
    role: r.role as WorkspaceRole,
    joinedAt: r.joinedAt.toISOString(),
  }));
}

export async function listPendingInvitations(workspaceId: string): Promise<PendingInvitation[]> {
  const rows = await getDb()
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitation.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: (r.role ?? 'member') as WorkspaceRole,
    expiresAt: r.expiresAt.toISOString(),
  }));
}

/** Public details shown on the invitation page (no session required to view). */
export async function getInvitationDetails(id: string) {
  const [row] = await getDb()
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      workspaceName: organization.name,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(eq(invitation.id, id));
  if (!row) return undefined;
  return {
    ...row,
    role: (row.role ?? 'member') as WorkspaceRole,
    usable: row.status === 'pending' && row.expiresAt > new Date(),
  };
}
