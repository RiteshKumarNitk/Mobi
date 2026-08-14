/**
 * Email sending. In production configure SMTP via the "email" settings group
 * (host, port, user, pass, from) and swap the console stub for a real client
 * (nodemailer / SES / Resend / Postmark).
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; mock: boolean }> {
  if (!opts.to) return { ok: false, mock: true };
  console.log(`[EMAIL -> ${opts.to}] ${opts.subject}`);
  console.log(opts.html.slice(0, 300));
  return { ok: true, mock: true };
}
