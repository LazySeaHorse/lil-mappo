-- Migration 013: atomic cleanup of free accounts using server-side RPC
--
-- Replaces the application-level pagination + deletion pattern in cleanup-free-accounts.ts
-- with a single Postgres function that atomically:
--   1. Identifies users older than the grace period
--   2. Checks for subscription rows atomically
--   3. Deletes only those without subscriptions
--
-- This eliminates pagination race conditions and ensures consistency.

CREATE OR REPLACE FUNCTION delete_old_free_accounts(
  p_grace_period_hours INT DEFAULT 24
)
RETURNS TABLE(deleted_count INT, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_cutoff_time TIMESTAMPTZ;
  v_deleted INT := 0;
BEGIN
  -- Calculate the cutoff timestamp
  v_cutoff_time := NOW() - (p_grace_period_hours || ' hours')::INTERVAL;

  -- Delete all auth.users that:
  --   1. Were created before the cutoff
  --   2. Have NO subscription rows
  -- This is done atomically in a single query to eliminate race conditions.
  WITH old_users AS (
    SELECT u.id
      FROM auth.users u
     WHERE u.created_at < v_cutoff_time
       AND NOT EXISTS (
         SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
       )
  )
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM old_users);

  -- Get the count of deleted rows
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  -- If deletion fails, return error message without partial deletion
  RETURN QUERY SELECT 0, SQLERRM;
END;
$$;

-- Lock down to service_role only
REVOKE EXECUTE ON FUNCTION delete_old_free_accounts(INT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION delete_old_free_accounts(INT)
  TO service_role;
