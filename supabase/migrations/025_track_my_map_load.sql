-- ============================================================
-- li'l Mappo — Migration 025: track_my_map_load (browser-callable quota check)
--
-- Why: a signed-in free user's page load used to go browser → Vercel
-- (/api/track-map-load) → four Supabase calls (getUser, subscription,
-- Pro pass, track_map_load). This function lets the browser make the
-- same check in one database call, with the same result and security.
--
-- Security: track_map_load takes a user id and stays service-role only,
-- since a browser-callable version taking an id would let anyone burn
-- another user's quota. track_my_map_load takes NO arguments: the user is
-- always auth.uid() from the caller's JWT (identity-check pattern from
-- migration 019). Without a signed-in user it raises.
--
-- Behaviour (same as api/track-map-load.ts):
--   • has_pro_access (023, the SQL copy of isWanderer: Wanderer active,
--     cancelling through renewal_date, or an active Pro pass)
--       → allowed, zeros, nothing counted
--   • otherwise → track_map_load(auth.uid()), so the counting, limits and
--     advisory lock stay in one place (018).
--
-- Additive: one new function and its grants. track_map_load, its grants
-- and every table are unchanged, so applying this to production changes
-- nothing for the Vercel endpoint or for clients already running. Apply it
-- before deploying the client that calls it; until then that client falls
-- back to /api/track-map-load when the function is missing (PGRST202).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.track_my_map_load()
RETURNS TABLE(
  allowed       boolean,
  reason        text,
  monthly_total integer,
  daily_total   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The user is only ever the caller. Never accept an id from the browser.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Wanderer subscribers and Pro pass holders: unlimited, never counted.
  -- Runs as the function owner, so has_pro_access sees the caller's rows.
  IF public.has_pro_access(auth.uid()) THEN
    RETURN QUERY SELECT true, NULL::text, 0, 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.track_map_load(auth.uid());
END;
$$;

-- Signed-in browsers only. Guests have no quota row to count against.
REVOKE ALL ON FUNCTION public.track_my_map_load() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_my_map_load() TO authenticated;

COMMIT;
