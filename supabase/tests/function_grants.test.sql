BEGIN;

SELECT plan(12);

-- Migration 026: track_map_load and the signup hook are not callable from a
-- browser (anon or authenticated), only by the server and Supabase Auth.
-- Supabase grants new functions to anon and authenticated directly, so a
-- REVOKE FROM PUBLIC alone is not enough.

-- ── Browsers have no EXECUTE ────────────────────────────────

SELECT ok(
  NOT has_function_privilege('anon', 'public.track_map_load(uuid)', 'EXECUTE'),
  'guests cannot call track_map_load'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.track_map_load(uuid)', 'EXECUTE'),
  'signed-in users cannot call track_map_load'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.check_email_domain_before_signup(jsonb)', 'EXECUTE'),
  'guests cannot call the signup hook'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.check_email_domain_before_signup(jsonb)', 'EXECUTE'),
  'signed-in users cannot call the signup hook'
);

-- ── Legitimate callers keep EXECUTE ─────────────────────────

SELECT ok(
  has_function_privilege('service_role', 'public.track_map_load(uuid)', 'EXECUTE'),
  'service_role keeps EXECUTE on track_map_load'
);
SELECT ok(
  has_function_privilege('supabase_auth_admin', 'public.check_email_domain_before_signup(jsonb)', 'EXECUTE'),
  'Supabase Auth can call the signup hook'
);

-- ── Direct calls are refused ────────────────────────────────

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.track_map_load('00000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'a guest calling track_map_load is refused'
);
SELECT throws_ok(
  $$SELECT public.check_email_domain_before_signup('{"email":"a@example.com"}'::jsonb)$$,
  '42501', NULL, 'a guest calling the signup hook is refused'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT * FROM public.track_map_load('00000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'a signed-in user calling track_map_load directly is refused'
);

-- ── track_my_map_load still reaches track_map_load ──────────
-- It is SECURITY DEFINER, so it calls track_map_load as its owner.

SELECT is(
  (SELECT row(allowed, reason, monthly_total, daily_total)::text FROM public.track_my_map_load()),
  row(true, NULL::text, 1, 1)::text,
  'a free user''s track_my_map_load still counts through track_map_load'
);
RESET ROLE;

SELECT is(
  (SELECT row(monthly_total, daily_total)::text FROM public.map_loads
    WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  row(1, 1)::text,
  'the caller''s counters moved once'
);

-- ── The server still calls track_map_load ───────────────────

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT row(allowed, monthly_total, daily_total)::text
     FROM public.track_map_load('00000000-0000-4000-8000-000000000001')),
  row(true, 2, 2)::text,
  'service_role can still call track_map_load'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
