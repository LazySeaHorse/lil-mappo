-- ============================================================
-- li'l Mappo — Migration 021: Cap cloud project payload size
--
-- upsert_cloud_project accepted an unbounded JSONB payload, so any
-- authenticated account could fill the database with huge rows.
--
-- Two layers:
--   1. A table CHECK constraint is the hard ceiling for every write path
--      (the RPC and the direct-write RLS policies alike).
--   2. The RPC enforces the tighter per-tier limit and returns a structured
--      `too_large` error the client can show.
--
-- Sizes are measured as the UTF-8 byte length of the JSON text, which is
-- what the client can also compute before uploading.
--   Free:     500 KB
--   Wanderer: 5 MB
--
-- The CHECKs are NOT VALID so existing rows cannot fail this migration;
-- they apply to every new insert and update.
-- ============================================================

ALTER TABLE public.cloud_projects
  ADD CONSTRAINT cloud_projects_data_size
  CHECK (octet_length(data::text) <= 5 * 1024 * 1024) NOT VALID;

ALTER TABLE public.cloud_projects
  ADD CONSTRAINT cloud_projects_name_length
  CHECK (char_length(name) <= 200) NOT VALID;

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
  v_size        INT;
  v_size_limit  INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_name IS NULL OR char_length(p_name) > 200 THEN
    RAISE EXCEPTION 'invalid project name';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  SELECT EXISTS(
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'cancelling')
      AND s.tier = 'wanderer'
  ) INTO v_is_wanderer;

  -- Size limit applies to every save, new or update.
  v_size       := octet_length(p_data::text);
  v_size_limit := CASE WHEN v_is_wanderer THEN 5 * 1024 * 1024 ELSE 500 * 1024 END;
  IF v_size > v_size_limit THEN
    RETURN jsonb_build_object(
      'error', 'too_large',
      'limit_bytes', v_size_limit,
      'size_bytes', v_size
    );
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM cloud_projects WHERE id = p_project_id AND user_id = p_user_id
  ) INTO v_is_update;

  -- The save-count limit only applies to new projects, and only to free users.
  IF NOT v_is_update AND NOT v_is_wanderer THEN
    SELECT COUNT(*) INTO v_save_count
      FROM cloud_projects
     WHERE user_id = p_user_id;

    IF v_save_count >= 3 THEN
      RETURN jsonb_build_object('error', 'limit_exceeded', 'limit', 3);
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

REVOKE ALL ON FUNCTION public.upsert_cloud_project(TEXT, UUID, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_cloud_project(TEXT, UUID, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;
