-- ============================================================
-- li'l Mappo — Migration 009: Restrict increment_purchased_credits
--
-- The function was created with SECURITY DEFINER but without
-- revoking the default PUBLIC execute grant, meaning any browser
-- client (authenticated or anon) could call it via supabase.rpc()
-- to inflate their own credit balance.
--
-- This migration revokes execute from all client-facing roles.
-- The function is only called by server-side webhook handlers that
-- use the service_role key, which bypasses this restriction.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.increment_purchased_credits(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_purchased_credits(UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_purchased_credits(UUID, INT) FROM authenticated;
