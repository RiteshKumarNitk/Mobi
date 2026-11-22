/**
 * SMS delivery adapter.
 *
 * No SMS provider is integrated yet (MSG91 / Twilio / Gupshup / WhatsApp
 * Business API all fit here). Until one is, `sendSms` reports
 * `delivered: false` — it never pretends a message was sent. In development
 * the OTP is surfaced via OTP_DEBUG instead; in production a missing provider
 * means customers cannot receive OTPs (see docs/KNOWN_LIMITATIONS.md).
 *
 * To integrate: set SMS_PROVIDER and the provider's credentials, then
 * implement the matching branch below.
 */
export interface SmsResult {
  delivered: boolean;
  provider: string;
  reason?: string;
}

export async function sendSms(_phone: string, _message: string): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER ?? "";
  if (!provider) return { delivered: false, provider: "none", reason: "SMS_PROVIDER not configured" };
  return { delivered: false, provider, reason: `SMS provider "${provider}" is not implemented yet` };
}

export const smsConfigured = () => false;
