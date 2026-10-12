/** Only allow same-site relative redirects (blocks `//evil.com` and `https://…`). */
export function safeNext(value: string | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
