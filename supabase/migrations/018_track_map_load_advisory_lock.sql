-- ============================================================
-- li'l Mappo — Migration 018: Add advisory lock to track_map_load
--
-- track_map_load was susceptible to a TOCTOU race: two concurrent
-- page loads for the same user could both read the same counter,
-- both pass the quota check, and both commit an increment — allowing
-- a slight over-count at quota boundaries.
--
-- Fix: acquire a per-user advisory lock before reading, matching the
-- pattern already used in create_render_job (012) and
-- upsert_cloud_project (017).
-- ============================================================

CREATE OR REPLACE FUNCTION public.track_map_load(p_user_id uuid)
RETURNS TABLE(
  allowed       boolean,
  reason        text,
  monthly_total integer,
  daily_total   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today          date := current_date;
  v_month_start    date := date_trunc('month', current_date)::date;
  v_row            public.map_loads%ROWTYPE;
  v_monthly        integer;
  v_daily          integer;
BEGIN
  -- Acquire a per-user advisory lock for the lifetime of this transaction.
  -- Concurrent calls for the same user queue here; different users are unaffected.
  -- Same pattern as create_render_job (012) and upsert_cloud_project (017).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  -- Upsert: create the row on first load, otherwise read current state
  INSERT INTO public.map_loads(user_id, monthly_total, daily_total, month_start, last_load_date)
  VALUES (p_user_id, 0, 0, v_month_start, v_today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.map_loads WHERE map_loads.user_id = p_user_id;

  -- ── Reset counters if time boundaries crossed ──────────────────────────────
  IF v_row.month_start < v_month_start THEN
    -- New calendar month → full reset
    UPDATE public.map_loads
      SET monthly_total  = 0,
          daily_total    = 0,
          month_start    = v_month_start,
          last_load_date = v_today
    WHERE map_loads.user_id = p_user_id;
    v_row.monthly_total  := 0;
    v_row.daily_total    := 0;
    v_row.last_load_date := v_today;
  ELSIF v_row.last_load_date < v_today THEN
    -- New day within the same month → reset daily counter only
    UPDATE public.map_loads
      SET daily_total    = 0,
          last_load_date = v_today
    WHERE map_loads.user_id = p_user_id;
    v_row.daily_total    := 0;
    v_row.last_load_date := v_today;
  END IF;

  -- ── Check quota ────────────────────────────────────────────────────────────
  IF v_row.monthly_total >= 50 THEN
    RETURN QUERY SELECT false, 'monthly_exhausted'::text, v_row.monthly_total, v_row.daily_total;
    RETURN;
  END IF;

  IF v_row.monthly_total >= 30 AND v_row.daily_total >= 3 THEN
    RETURN QUERY SELECT false, 'daily_throttled'::text, v_row.monthly_total, v_row.daily_total;
    RETURN;
  END IF;

  -- ── Increment and allow ────────────────────────────────────────────────────
  UPDATE public.map_loads
    SET monthly_total  = v_row.monthly_total + 1,
        daily_total    = v_row.daily_total + 1,
        last_load_date = v_today
  WHERE map_loads.user_id = p_user_id;

  v_monthly := v_row.monthly_total + 1;
  v_daily   := v_row.daily_total + 1;

  RETURN QUERY SELECT true, null::text, v_monthly, v_daily;
END;
$$;

-- Grant unchanged from migration 014
REVOKE ALL ON FUNCTION public.track_map_load(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_map_load(uuid) TO service_role;
