/**
 * Manually curated list of trusted email provider domains.
 * Disposable / temporary / catch-all domains are intentionally excluded.
 *
 * Keep this list short — the goal is to block throwaway accounts,
 * not to be exhaustive. Maintained manually; update as needed.
 */
export const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
] as const;

/**
 * Returns true if the email's domain is on the trusted list.
 * Case-insensitive. Does not validate email format.
 */
export function isAllowedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain);
}
