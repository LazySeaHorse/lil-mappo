BEGIN;

SELECT plan(15);

-- Seed user 1 is free, user 2 has an active Wanderer subscription.
-- User 11 holds an active Pro pass; user 12 is a second free user ("B")
-- whose counters must never move when someone else loads a map.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000011',
   'authenticated', 'authenticated', 'map-pass@example.com', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000012',
   'authenticated', 'authenticated', 'map-free-b@example.com', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.pro_passes (user_id, expires_at)
VALUES ('00000000-0000-4000-8000-000000000011', now() + interval '1 day');

INSERT INTO public.map_loads (user_id, monthly_total, daily_total, month_start, last_load_date)
VALUES ('00000000-0000-4000-8000-000000000012', 5, 1, date_trunc('month', current_date)::date, current_date);

-- ── Grants ──────────────────────────────────────────────────

SELECT ok(
  NOT has_function_privilege('anon', 'public.track_my_map_load()', 'EXECUTE'),
  'guests cannot call track_my_map_load'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.track_my_map_load()', 'EXECUTE'),
  'signed-in users can call track_my_map_load'
);
SELECT is(
  (SELECT array_agg(pronargs) FROM pg_proc
    WHERE proname = 'track_my_map_load' AND pronamespace = 'public'::regnamespace),
  ARRAY[0::smallint],
  'track_my_map_load has one version, and it takes no user id'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.track_my_map_load()$$,
  '42501', NULL, 'a guest calling track_my_map_load is refused'
);
RESET ROLE;

-- ── Called from the browser (authenticated) ─────────────────

SET LOCAL ROLE authenticated;

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT row(allowed, reason, monthly_total, daily_total)::text FROM public.track_my_map_load()),
  row(true, NULL::text, 1, 1)::text,
  'a free user''s first load is allowed and counted'
);

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
SELECT is(
  (SELECT row(allowed, reason, monthly_total, daily_total)::text FROM public.track_my_map_load()),
  row(true, NULL::text, 0, 0)::text,
  'a Wanderer subscriber is allowed with zeros'
);

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000011';
SELECT is(
  (SELECT row(allowed, reason, monthly_total, daily_total)::text FROM public.track_my_map_load()),
  row(true, NULL::text, 0, 0)::text,
  'a Pro pass holder is allowed with zeros'
);

SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$SELECT * FROM public.track_my_map_load()$$,
  'P0001', 'unauthorized', 'without a signed-in user it raises'
);

RESET ROLE;

-- ── Whose counters moved ────────────────────────────────────

SELECT is(
  (SELECT row(monthly_total, daily_total)::text FROM public.map_loads
    WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  row(1, 1)::text,
  'the caller''s own row was counted once'
);
SELECT is(
  (SELECT row(monthly_total, daily_total)::text FROM public.map_loads
    WHERE user_id = '00000000-0000-4000-8000-000000000012'),
  row(5, 1)::text,
  'another user''s row is untouched'
);
SELECT is(
  (SELECT count(*) FROM public.map_loads
    WHERE user_id IN ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000011')),
  0::bigint,
  'Wanderer and Pro pass loads are not counted'
);

-- ── Limits: the same answer as track_map_load ───────────────
-- Counters set to the limits in migrations 014/018. A blocked load changes
-- no counter, so both functions see the same row.

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

UPDATE public.map_loads SET monthly_total = 50, daily_total = 0
 WHERE user_id = '00000000-0000-4000-8000-000000000001';
SELECT results_eq(
  $$SELECT * FROM public.track_my_map_load()$$,
  $$SELECT * FROM public.track_map_load('00000000-0000-4000-8000-000000000001')$$,
  'at the monthly limit it answers as track_map_load does'
);
SELECT is(
  (SELECT allowed FROM public.track_my_map_load()),
  false,
  'at the monthly limit the load is blocked'
);

UPDATE public.map_loads SET monthly_total = 30, daily_total = 3
 WHERE user_id = '00000000-0000-4000-8000-000000000001';
SELECT results_eq(
  $$SELECT * FROM public.track_my_map_load()$$,
  $$SELECT * FROM public.track_map_load('00000000-0000-4000-8000-000000000001')$$,
  'at the daily throttle it answers as track_map_load does'
);
SELECT is(
  (SELECT allowed FROM public.track_my_map_load()),
  false,
  'at the daily throttle the load is blocked'
);

SELECT * FROM finish();
ROLLBACK;
