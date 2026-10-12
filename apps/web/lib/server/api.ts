import 'server-only';
import { NextResponse } from 'next/server';
import { ValidationError } from '../agents';
import { getViewer, type Viewer } from './viewer';

/** Wraps a dashboard API handler: requires a signed-in workspace member and maps errors. */
export function withViewer<Args extends unknown[]>(
  handler: (viewer: Viewer, ...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      return await handler(viewer, ...args);
    } catch (e) {
      if (e instanceof ValidationError || e instanceof SyntaxError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  };
}
