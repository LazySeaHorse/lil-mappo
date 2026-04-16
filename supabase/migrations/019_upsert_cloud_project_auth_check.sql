-- ============================================================
-- li'l Mappo — Migration 019: Enforce caller identity in upsert_cloud_project
--
-- upsert_cloud_project is SECURITY DEFINER and accepts p_user_id as a
-- caller-supplied parameter, but never verified it matched the calling
-- user's JWT identity (auth.uid()). An authenticated user who knew
-- another user's UUID could inject or overwrite that user's projects.
--
-- Fix: reject any call where p_user_id != auth.uid() before doing
-- anything else — same as the JWT verification pattern used in
-- server-side API routes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_cloud_project(
  p_project_id  TEXT,
  p_user_id     UUID,
  p_name        TEXT,
  p_data        JSONB,
  p_updated_at  TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_update   BOOLEAN;
  v_is_wanderer BOOLEAN;
  v_save_count  INT;
BEGIN
  -- Reject calls where the supplied user_id doesn't match the authenticated caller.
  -- SECURITY DEFINER bypasses RLS, so we must enforce ownership ourselves.
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Acquire a per-user advisory lock for the lifetime of this transaction.
  -- Concurrent calls for the same user queue here; different users are unaffected.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  -- Is this an update of an existing project, or a brand-new insert?
  SELECT EXISTS(
    SELECT 1 FROM cloud_projects WHERE id = p_project_id AND user_id = p_user_id
  ) INTO v_is_update;

  -- The save-limit only applies to new projects.
  IF NOT v_is_update THEN
    SELECT EXISTS(
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'cancelling')
        AND s.tier = 'wanderer'
    ) INTO v_is_wanderer;

    -- Free users are capped at 3 cloud saves.
    IF NOT v_is_wanderer THEN
      SELECT COUNT(*) INTO v_save_count
        FROM cloud_projects
       WHERE user_id = p_user_id;

      IF v_save_count >= 3 THEN
        RETURN jsonb_build_object('error', 'limit_exceeded', 'limit', 3);
      END IF;
    END IF;
  END IF;

  INSERT INTO public.cloud_projects (id, user_id, name, data, updated_at)
  VALUES (p_project_id, p_user_id, p_name, p_data, p_updated_at)
  ON CONFLICT (id) DO UPDATE
    SET name       = EXCLUDED.name,
        data       = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
  WHERE cloud_projects.user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grants unchanged from migration 017
REVOKE ALL ON FUNCTION public.upsert_cloud_project(TEXT, UUID, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_cloud_project(TEXT, UUID, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;
