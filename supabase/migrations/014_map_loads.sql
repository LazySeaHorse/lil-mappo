-- ============================================================
-- li'l Mappo — Migration 014: Map load quota tracking
--
-- Tracks Mapbox map loads for free (signed-in) users.
-- Wanderer subscribers have unlimited loads — this table is
-- never written for them.
--
-- Quota rules (enforced by track_map_load RPC):
--   • Monthly total  ≥ 50  → blocked ("monthly_exhausted")
--   • Monthly total  ≥ 30
--     AND daily total ≥ 3  → blocked ("daily_throttled")
--   • Otherwise             → allowed; counters incremented
--
-- "Month" = calendar month; resets on the 1st of each month
-- (aligned with Mapbox billing).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.map_loads (
  user_id         uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_total   integer NOT NULL DEFAULT 0,
  daily_total     integer NOT NULL DEFAULT 0,
  month_start     date    NOT NULL DEFAULT date_trunc('month', current_date)::date,
  last_load_date  date    NOT NULL DEFAULT current_date
);

-- Only the owner (and service role) can touch their own row
ALTER TABLE public.map_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_loads_own"
  ON public.map_loads
  FOR SELECT
  USING (auth.uid() = user_id);

-- No direct client writes — all mutations go through the RPC below.

-- ─── RPC: track_map_load ─────────────────────────────────────────────────────
-- Called by /api/track-map-load on every page load for free users.
-- Returns a single row with:
--   allowed       bool   — whether the map should be shown
--   reason        text   — null when allowed; 'daily_throttled' | 'monthly_exhausted' when not
--   monthly_total int    — current monthly count (after increment if allowed)
--   daily_total   int    — current daily count (after increment if allowed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_map_load(p_user_id uuid)
RETURNS TABLE(
  allowed       boolean,
  reason        text,
  monthly_total integer,
  daily_total   integer
)
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as postgres; bypasses RLS for the write
SET search_path = public
AS $$
DECLARE
  v_today          date := current_date;
  v_month_start    date := date_trunc('month', current_date)::date;
  v_row            public.map_loads%ROWTYPE;
  v_monthly        integer;
  v_daily          integer;
BEGIN
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

-- Restrict direct execution to service role + authenticated users calling via API
REVOKE ALL ON FUNCTION public.track_map_load(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_map_load(uuid) TO service_role;
