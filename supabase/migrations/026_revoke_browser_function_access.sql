-- ============================================================
-- li'l Mappo — Migration 026: Revoke browser access to two internal functions
--
-- The gap: Supabase's default privileges grant EXECUTE on every new function
-- in `public` directly to anon, authenticated and service_role, as separate
-- grants alongside the PUBLIC one. `REVOKE ... FROM PUBLIC` removes only the
-- PUBLIC grant, so these two SECURITY DEFINER functions stayed callable by
-- any browser holding the (public) anon key, through PostgREST /rest/v1/rpc:
--
--   • track_map_load(uuid) (014, redefined in 018) takes a user id and
--     increments and returns that user's map load counters, so anyone could
--     burn another user's quota or read their counts.
--   • check_email_domain_before_signup(jsonb) (016) is the Auth "before user
--     created" hook; calling it reveals which signup domains are allowed.
--
-- Fix: revoke EXECUTE from anon and authenticated as well. Nothing else
-- changes: function bodies, PUBLIC (already revoked), service_role and
-- supabase_auth_admin grants, and every other function are untouched.
--
-- Legitimate callers keep access:
--   • api/track-map-load.ts calls track_map_load with the service-role
--     client (api/_lib/supabase.ts adminClient); service_role keeps its
--     explicit GRANT from 014/018.
--   • track_my_map_load() (025) calls track_map_load from inside a
--     SECURITY DEFINER function, i.e. as the function owner, which owns
--     track_map_load and so keeps EXECUTE. Browsers keep calling
--     track_my_map_load(), whose grant to authenticated is unchanged.
--   • Supabase Auth runs the signup hook as supabase_auth_admin, which keeps
--     its explicit GRANT from 016 (service_role keeps its grant too).
--   • Nothing in src/ calls either function, and api/ calls only
--     track_map_load, through the service-role client.
--
-- Safe in any deploy order: it only removes access no shipped code uses, so
-- every deployed client and endpoint works the same before and after, and
-- re-running it is a no-op.
-- ============================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.track_map_load(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_email_domain_before_signup(jsonb) FROM anon, authenticated;

COMMIT;
