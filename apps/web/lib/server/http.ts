import 'server-only';
import { NextResponse } from 'next/server';
import { ValidationError } from '../validation';
import { ResearcherError } from './researcher';

/** Map expected failures to JSON responses; rethrow anything else. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ValidationError || e instanceof SyntaxError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  if (e instanceof ResearcherError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}
