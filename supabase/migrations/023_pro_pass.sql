-- ============================================================
-- li'l Mappo — Migration 023: Pro pass (3-day pass)
--
-- A one-time $3 purchase that unlocks everything Wanderer unlocks for three
-- days. It lives in its own table so a pass can never overwrite or downgrade a
-- subscription row, and subscription webhooks (which upsert and delete
-- `subscriptions` rows) can never touch a pass.
--
--   pro_passes        one row per buyer: when their pass ends. The owner can
--                     read it; nobody but the service role can write it.
--   grant_pro_pass()  the only write path, called by the Dodo webhook after a
--                     verified payment.succeeded. Idempotent per payment id
--                     (processed_payments, migration 006) and stacking:
--                     new end = max(now, current end) + p_days.
--   has_pro_access()  the SQL copy of isWanderer (src/lib/cloudAccess.ts and
--                     api/_lib/entitlement.ts): Wanderer active, or cancelling
--                     through renewal_date (UTC), or a pass that has not ended.
--
-- Every SQL gate that checked for a paid plan now goes through has_pro_access:
-- upsert_cloud_project (size + count limits), feature_vote_weights (paid vote
-- weight) and delete_old_free_accounts (never delete a pass buyer).
-- ============================================================

BEGIN;

-- ── Table ───────────────────────────────────────────────────

CREATE TABLE public.pro_passes (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_passes ENABLE ROW LEVEL SECURITY;

-- Browsers may only read their own row. No INSERT/UPDATE/DELETE grants or
-- policies, so a user cannot create or extend a pass even through RLS.
REVOKE ALL ON TABLE public.pro_passes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pro_passes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pro_passes TO service_role;

CREATE POLICY "pro_passes_select_own"
  ON public.pro_passes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Entitlement (SQL copy of isWanderer) ────────────────────
-- SECURITY INVOKER: called from an RLS-limited session it can only see the
-- caller's own rows, so it cannot reveal another user's plan. The SECURITY
-- DEFINER functions below call it with full visibility.

CREATE OR REPLACE FUNCTION public.has_pro_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.tier = 'wanderer'
      AND (
        s.status = 'active'
        OR (s.status = 'cancelling' AND s.renewal_date >= (now() AT TIME ZONE 'utc')::date)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.pro_passes pp
    WHERE pp.user_id = p_user_id
      AND pp.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.has_pro_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_pro_access(uuid) TO authenticated, service_role;

-- ── Grant (webhook only) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_pro_pass(
  p_user_id    uuid,
  p_payment_id text,
  p_days       int
)
RETURNS TABLE (granted boolean, pass_expires_at timestamptz, stacked boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous timestamptz;
  v_expires  timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_payment_id IS NULL
     OR length(p_payment_id) = 0 OR length(p_payment_id) > 200 THEN
    RAISE EXCEPTION 'invalid pass grant' USING ERRCODE = '22023';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 31 THEN
    RAISE EXCEPTION 'invalid pass length' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: one grant per payment, in the same transaction as the grant,
  -- so a failed grant also rolls back the key and Dodo's retry can succeed.
  INSERT INTO public.processed_payments (payment_id)
  VALUES (p_payment_id)
  ON CONFLICT (payment_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT pp.expires_at INTO v_expires FROM public.pro_passes pp WHERE pp.user_id = p_user_id;
    RETURN QUERY SELECT false, v_expires, false;
    RETURN;
  END IF;

  -- Lock the row (if any) so two different payments landing at once both stack.
  SELECT pp.expires_at INTO v_previous
  FROM public.pro_passes pp
  WHERE pp.user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.pro_passes AS pp (user_id, expires_at)
  VALUES (p_user_id, now() + make_interval(days => p_days))
  ON CONFLICT (user_id) DO UPDATE
    SET expires_at = GREATEST(pp.expires_at, now()) + make_interval(days => p_days),
        updated_at = now()
  RETURNING pp.expires_at INTO v_expires;

  RETURN QUERY SELECT true, v_expires, (v_previous IS NOT NULL AND v_previous > now());
END;
$$;

REVOKE ALL ON FUNCTION public.grant_pro_pass(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_pro_pass(uuid, text, int) TO service_role;

-- ── Gate: cloud project saves (from migration 021) ──────────
-- Unchanged except that "Wanderer" is now has_pro_access().

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

  -- Subscription or Pro pass (same rules as isWanderer).
  v_is_wanderer := public.has_pro_access(p_user_id);

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

-- ── Gate: paid vote weight (from migration 022) ─────────────
-- Paid = any subscription that is active or still in its cancelling period
-- (unchanged) or an active Pro pass.

CREATE OR REPLACE FUNCTION public.feature_vote_weights()
RETURNS TABLE (user_id uuid, weight int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH p AS (SELECT * FROM public.feature_vote_params()),
  last_session AS (
    SELECT s.user_id, max(s.updated_at) AS at
    FROM auth.sessions s
    GROUP BY s.user_id
  ),
  relevant AS (
    SELECT u.id
    FROM auth.users u
    CROSS JOIN p
    LEFT JOIN last_session ls ON ls.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.email_confirmed_at IS NOT NULL
      AND NOT u.is_anonymous
      AND GREATEST(u.last_sign_in_at, ls.at) > now() - p.active_window
    UNION
    SELECT v.user_id FROM public.feature_votes v
  )
  SELECT
    r.id,
    CASE
      WHEN s.status = 'active'
        OR (s.status = 'cancelling' AND s.renewal_date >= current_date)
        OR pp.expires_at > now()
      THEN p.paid_weight
      ELSE p.free_weight
    END
  FROM relevant r
  CROSS JOIN p
  LEFT JOIN public.subscriptions s ON s.user_id = r.id
  LEFT JOIN public.pro_passes pp ON pp.user_id = r.id;
$$;

REVOKE ALL ON FUNCTION public.feature_vote_weights() FROM PUBLIC, anon, authenticated;

-- ── Cleanup (from migration 013) ────────────────────────────
-- A pass buyer is a paying customer: never delete them as a "free" account.

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
  v_cutoff_time := NOW() - (p_grace_period_hours || ' hours')::INTERVAL;

  WITH old_users AS (
    SELECT u.id
      FROM auth.users u
     WHERE u.created_at < v_cutoff_time
       AND NOT EXISTS (
         SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.pro_passes pp WHERE pp.user_id = u.id
       )
  )
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM old_users);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 0, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_old_free_accounts(INT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION delete_old_free_accounts(INT)
  TO service_role;

COMMIT;
