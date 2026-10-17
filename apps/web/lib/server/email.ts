import 'server-only';

/**
 * Transactional email (workspace invites, password resets).
 *
 * Sends through Resend's HTTP API when RESEND_API_KEY and EMAIL_FROM are set.
 * Without them the message is logged instead, and the app still works: invite
 * links can be copied from the workspace settings page.
 */
export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(
      `[email] (not sent - RESEND_API_KEY/EMAIL_FROM unset) to=${to} subject="${subject}"\n${text}`,
    );
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    console.error(`[email] send failed (${res.status}): ${await res.text()}`);
  }
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
