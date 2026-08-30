-- ============================================================
-- li'l Mappo — Migration 020: Lock down webhook bookkeeping
--
-- These tables contain payment and subscription event identifiers and are
-- accessed only by server-side webhook handlers using the service-role key.
-- Tables in the public schema are exposed through Supabase's Data API, so
-- leaving RLS disabled would allow browser roles to use any inherited table
-- grants. Keep the tables in public for the existing PostgREST calls, but deny
-- all browser-facing roles at both the privilege and RLS layers.
-- ============================================================

BEGIN;

ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- No RLS policies are intentionally created. With RLS enabled, this makes the
-- tables deny-by-default for roles that do not bypass RLS.

REVOKE ALL ON TABLE public.processed_payments
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.processed_webhook_events
  FROM PUBLIC, anon, authenticated;

-- The webhook client uses SUPABASE_SERVICE_ROLE_KEY. Grant its required table
-- operations explicitly so the intended server-side access remains clear and
-- independent of Supabase's default grants.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.processed_payments
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.processed_webhook_events
  TO service_role;

COMMIT;
