import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://placeholder.supabase.co';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'placeholder-anon-key';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
    console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars. Using placeholder credentials.');
  }
}

/**
 * `type` from the auth redirect hash (`signup` after the email confirmation link).
 * Must be read before createClient: supabase-js clears the hash asynchronously.
 * Used by analytics to recognise the first sign-in after confirming an account.
 */
export const initialAuthCallbackType: string | null =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)).get('type') : null;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
