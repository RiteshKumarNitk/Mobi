import { logger } from "./logger";

/**
 * Email delivery adapter.
 *
 * No SMTP / transactional-email provider is integrated yet (nodemailer + SMTP,
 * SES, Resend or Postmark all fit here). Until one is, `sendEmail` returns
 * `ok: false` and never claims a message was delivered. Message bodies are not
 * logged (they can contain personal data).
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; mock: boolean }> {
  if (!opts.to) return { ok: false, mock: true };
  logger.info("email_not_sent", { reason: "no email provider configured", subject: opts.subject, toDomain: opts.to.split("@")[1] ?? "" });
  return { ok: false, mock: true };
}
