import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';
import { randomBytes } from 'crypto';
import { asc, eq } from 'drizzle-orm';
import { slugify } from '../agents';
import { getDb } from './db/client';
import * as schema from './db/schema';
import { sendEmail } from './email';
import { appOrigin } from './urls';

export const INVITATION_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The workspace a user lands in: their oldest membership. */
async function firstWorkspaceId(userId: string): Promise<string | null> {
  const [m] = await getDb()
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.member.createdAt))
    .limit(1);
  return m?.organizationId ?? null;
}

function createAuth() {
  const auth = betterAuth({
    appName: 'Onboarding AI',
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((s) => s.trim()),
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Onboarding AI password',
          text: `Hi ${user.name},\n\nReset your password here (valid for 1 hour):\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
        });
      },
    },
    socialProviders: googleEnabled()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {},
    account: {
      // Signing in with Google on an email that already has a password account
      // links the two instead of failing (Google verifies email ownership).
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    databaseHooks: {
      user: {
        create: {
          // Everyone starts with a personal workspace they own.
          after: async (user) => {
            await createPersonalWorkspace(user);
          },
        },
      },
      session: {
        create: {
          before: async (session) => ({
            data: { ...session, activeOrganizationId: await firstWorkspaceId(session.userId) },
          }),
        },
      },
    },
    plugins: [
      organization({
        creatorRole: 'owner',
        invitationExpiresIn: INVITATION_EXPIRES_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async ({ id, email, organization, inviter }) => {
          await sendEmail({
            to: email,
            subject: `Join ${organization.name} on Onboarding AI`,
            text: `${inviter.user.name} invited you to the "${organization.name}" workspace on Onboarding AI.\n\nAccept the invitation:\n${appOrigin()}/invite/${id}\n`,
          });
        },
      }),
      nextCookies(), // must be last: lets server actions set auth cookies
    ],
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

/** "Ada's workspace", owned by the user. Created at sign-up (and if they ever end up with none). */
export async function createPersonalWorkspace(user: { id: string; name: string }): Promise<string> {
  const name = `${user.name.split(' ')[0] || 'My'}'s workspace`;
  const org = await getAuth().api.createOrganization({
    body: { name, slug: `${slugify(name)}-${randomBytes(3).toString('hex')}`, userId: user.id },
  });
  return org!.id;
}

// Created lazily so `next build` doesn't need a database connection.
const globalForAuth = globalThis as unknown as { onboardAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.onboardAuth ??= createAuth();
  return globalForAuth.onboardAuth;
}
