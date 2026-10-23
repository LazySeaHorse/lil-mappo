-- ============================================================
-- li'l Mappo — Migration 024: Explicit table grants
--
-- Why: Supabase is changing the default privileges of the public schema
-- (enforced on all existing projects from 2026-10-30). New tables will no
-- longer get SELECT/INSERT/UPDATE/DELETE granted automatically to anon,
-- authenticated and service_role. Tables that already exist keep their
-- grants, so production is unaffected, but a database rebuilt from these
-- migrations (a new or staging project, CI's local stack after a CLI
-- upgrade) would create tables the Data API cannot read (error 42501).
--
-- Migrations 020, 022 and 023 already grant explicitly. This migration does
-- the same for the older tables the app reaches through the Data API, with
-- exactly the privileges the code uses:
--
--   authenticated (browser, src/ via supabase-js; RLS still limits rows)
--     subscriptions   SELECT          useSubscription; has_pro_access (023) is
--                                     SECURITY INVOKER and executable by it
--     credit_balance  SELECT          useCredits
--     render_jobs     SELECT          useRenderJobs
--     cloud_projects  SELECT, DELETE  cloudProjectLibrary list/load/delete.
--                                     No INSERT/UPDATE: saves go through
--                                     upsert_cloud_project (SECURITY DEFINER,
--                                     023), which runs as its owner.
--
--   service_role (trusted backend, api/ via SUPABASE_SERVICE_ROLE_KEY)
--     subscriptions, credit_balance, render_jobs  SELECT, INSERT, UPDATE, DELETE
--
--   anon: nothing. No signed-out code path reads these tables.
--
-- None of these tables has a serial/identity column, so no sequence grants.
-- map_loads is only touched inside track_map_load (SECURITY DEFINER) and is
-- not read by the app, so it gets no role grants here.
--
-- This migration only GRANTs. GRANT is additive and idempotent: on
-- production, where these roles already hold the old default privileges,
-- it changes nothing, and it is safe to re-run. No REVOKE, no default
-- privilege, RLS, policy or schema changes.
-- ============================================================

BEGIN;

-- ── Browser (authenticated) ─────────────────────────────────

GRANT SELECT ON TABLE public.subscriptions  TO authenticated;
GRANT SELECT ON TABLE public.credit_balance TO authenticated;
GRANT SELECT ON TABLE public.render_jobs    TO authenticated;
GRANT SELECT, DELETE ON TABLE public.cloud_projects TO authenticated;

-- ── Server (service_role) ───────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_balance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.render_jobs    TO service_role;

COMMIT;
