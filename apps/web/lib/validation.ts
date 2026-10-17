/** Small input validators shared by the API routes' parsers. */

export class ValidationError extends Error {}

export function str(value: unknown, field: string, { required = false, max = 4000 } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ValidationError(`${field} is required`);
  if (trimmed.length > max) throw new ValidationError(`${field} is too long (max ${max})`);
  return trimmed;
}

/** An http(s) URL; a missing scheme defaults to https. */
export function url(value: unknown, field: string): string {
  const raw = str(value, field, { required: true, max: 2000 });
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new ValidationError(`${field} must be a valid http(s) URL`);
  }
}

export function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Expected a JSON object');
  }
  return body as Record<string, unknown>;
}
