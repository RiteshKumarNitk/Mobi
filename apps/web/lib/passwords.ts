import bcrypt from "bcryptjs";

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_ROUNDS = 12;

/**
 * Passwords that ship in the seed data / README. They are fine on a dev
 * database but must never authenticate against production.
 */
export const DEMO_PASSWORDS = ["Admin@123", "Customer@123"];

export const isDemoPassword = (password: string) => DEMO_PASSWORDS.includes(password);

/** Returns a human-readable policy violation, or null when the password is acceptable. */
export function passwordPolicyError(password: string, opts: { forbidDemo?: boolean } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > 128) return "Password must be at most 128 characters";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain letters and numbers";
  if (opts.forbidDemo && isDemoPassword(password)) return "This password is publicly known; choose another";
  return null;
}

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
