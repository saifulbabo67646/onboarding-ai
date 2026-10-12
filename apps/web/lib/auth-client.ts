'use client';

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** Browser-side auth: sign in/up, Google, workspaces and invitations. */
export const authClient = createAuthClient({ plugins: [organizationClient()] });
