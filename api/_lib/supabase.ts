import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server handlers. It bypasses row-level
 * security, so callers authorize the request themselves first. Server
 * handlers keep no session, so none is persisted or refreshed.
 */
export function adminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
