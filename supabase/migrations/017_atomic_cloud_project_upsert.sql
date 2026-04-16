-- ============================================================
-- li'l Mappo — Migration 017: Atomic cloud project upsert
--
-- The COUNT(*) < 3 check in the migration 015 INSERT policy is
-- evaluated under MVCC: concurrent transactions each see a
-- snapshot of committed rows, so a user firing several simultaneous
-- saves can race past the limit before any of them commit.
--
-- Fix: replace the racy RLS INSERT policy with a SECURITY DEFINER
-- function that acquires a per-user advisory lock before counting,
-- guaranteeing the check and insert are never interleaved.
-- Same pattern as create_render_job (migration 012).
--
-- Client-side: saveProjectToCloud() now calls
--   supabase.rpc('upsert_cloud_project', { ... })
-- instead of a direct .upsert() call.
-- ============================================================

-- ── Step 1: Create the atomic upsert function ────────────────────────────────

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
  WHERE cloud_projects.user_id = p_user_id;  -- safety: never overwrite another user's row

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Authenticated users call this via supabase.rpc(); no other roles need it.
REVOKE ALL ON FUNCTION public.upsert_cloud_project(TEXT, UUID, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_cloud_project(TEXT, UUID, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

-- ── Step 2: Remove the direct INSERT policy ──────────────────────────────────
--
-- Without a permissive INSERT policy, authenticated clients cannot INSERT into
-- cloud_projects directly — all inserts must go through upsert_cloud_project(),
-- which is SECURITY DEFINER and bypasses RLS.
--
-- The UPDATE and SELECT/DELETE policies from migration 015 are untouched:
-- updates via saveProjectToCloud() now also go through the RPC (which handles
-- the conflict-update path), but a direct .update() call from the client is still
-- allowed by the existing UPDATE policy as a safe fallback.
DROP POLICY IF EXISTS "cloud_projects_insert" ON public.cloud_projects;
