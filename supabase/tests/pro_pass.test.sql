BEGIN;

SELECT plan(31);

-- Seed user 1 is free, user 2 has an active Wanderer subscription.
-- User 3 (below) has a cancelling subscription whose period has ended.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000003',
  'authenticated', 'authenticated', 'pass-lapsed@example.com', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
INSERT INTO public.subscriptions (user_id, tier, monthly_credits, parallel_renders, renewal_date, dodo_subscription_id, status)
VALUES ('00000000-0000-4000-8000-000000000003', 'wanderer', 100, 1, current_date - 2, 'sub_lapsed', 'cancelling');

-- ── Table lockdown ──────────────────────────────────────────

SELECT has_table('public', 'pro_passes', 'pro_passes table exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pro_passes'::regclass),
  'pro_passes has RLS enabled'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.grant_pro_pass(uuid, text, integer)', 'EXECUTE'),
  'signed-in users cannot call grant_pro_pass'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.grant_pro_pass(uuid, text, integer)', 'EXECUTE'),
  'guests cannot call grant_pro_pass'
);
SELECT ok(
  has_function_privilege('service_role', 'public.grant_pro_pass(uuid, text, integer)', 'EXECUTE'),
  'the webhook (service role) can call grant_pro_pass'
);

-- ── Granting (as the webhook would, service role) ───────────

SELECT is(
  (SELECT granted FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', 'pay_pass_1', 3)),
  true,
  'first delivery of a pass payment grants the pass'
);
SELECT ok(
  (SELECT expires_at BETWEEN now() + interval '3 days' - interval '1 minute' AND now() + interval '3 days'
     FROM public.pro_passes WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  'a new pass ends three days from now'
);
SELECT is(
  (SELECT granted FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', 'pay_pass_1', 3)),
  false,
  'a replayed payment does not grant again'
);
SELECT ok(
  (SELECT expires_at <= now() + interval '3 days'
     FROM public.pro_passes WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  'a replayed payment does not extend the pass'
);
SELECT is(
  (SELECT stacked FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', 'pay_pass_2', 3)),
  true,
  'buying again while the pass is active stacks'
);
SELECT ok(
  (SELECT expires_at BETWEEN now() + interval '6 days' - interval '1 minute' AND now() + interval '6 days'
     FROM public.pro_passes WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  'a stacked pass extends from the current end, not from now'
);

-- An ended pass restarts from now.
UPDATE public.pro_passes SET expires_at = now() - interval '10 days'
 WHERE user_id = '00000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT stacked FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', 'pay_pass_3', 3)),
  false,
  'buying after the pass ended is not stacking'
);
SELECT ok(
  (SELECT expires_at BETWEEN now() + interval '3 days' - interval '1 minute' AND now() + interval '3 days'
     FROM public.pro_passes WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  'a pass bought after the last one ended runs from now'
);

SELECT throws_ok(
  $$SELECT * FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', 'pay_pass_bad', 0)$$,
  '22023', NULL, 'a pass must last at least a day'
);
SELECT throws_ok(
  $$SELECT * FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', '', 3)$$,
  '22023', NULL, 'a pass needs a payment id'
);

-- The pass never touches a subscription row.
SELECT is(
  (SELECT granted FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000002', 'pay_pass_sub', 3)),
  true,
  'a subscriber can still be granted a pass'
);
SELECT is(
  (SELECT row(tier, status, renewal_date, dodo_subscription_id)::text FROM public.subscriptions
    WHERE user_id = '00000000-0000-4000-8000-000000000002'),
  row('wanderer', 'active', current_date + 30, 'local_wanderer_subscription')::text,
  'granting a pass leaves the subscription row unchanged'
);

-- ── has_pro_access: the SQL copy of isWanderer ──────────────

SELECT is(public.has_pro_access('00000000-0000-4000-8000-000000000001'), true, 'an active pass is Pro');
SELECT is(public.has_pro_access('00000000-0000-4000-8000-000000000002'), true, 'an active subscription is Pro');
SELECT is(public.has_pro_access('00000000-0000-4000-8000-000000000003'), false,
  'a cancelling subscription past its end is not Pro');

SELECT is(
  (SELECT granted FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000003', 'pay_pass_lapsed', 3)),
  true,
  'a lapsed subscriber can buy a pass'
);
SELECT is(public.has_pro_access('00000000-0000-4000-8000-000000000003'), true,
  'a lapsed subscriber with an active pass is Pro');

UPDATE public.pro_passes SET expires_at = now() - interval '1 second'
 WHERE user_id = '00000000-0000-4000-8000-000000000003';
SELECT is(public.has_pro_access('00000000-0000-4000-8000-000000000003'), false, 'an ended pass is not Pro');

-- A pass holder's feature vote weighs like a subscriber's.
UPDATE auth.users SET last_sign_in_at = now() WHERE id = '00000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT w.weight FROM public.feature_vote_weights() w WHERE w.user_id = '00000000-0000-4000-8000-000000000001'),
  (SELECT p.paid_weight FROM public.feature_vote_params() p),
  'a pass holder gets the paid vote weight'
);

-- ── Browser access ──────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.pro_passes),
  1::bigint,
  'a user sees only their own pass'
);
SELECT throws_ok(
  $$UPDATE public.pro_passes SET expires_at = now() + interval '1 year'$$,
  '42501', NULL, 'a user cannot extend their own pass'
);
SELECT throws_ok(
  $$INSERT INTO public.pro_passes (user_id, expires_at)
    VALUES ('00000000-0000-4000-8000-000000000001', now() + interval '1 year')$$,
  '42501', NULL, 'a user cannot create a pass'
);
SELECT throws_ok(
  $$SELECT * FROM public.grant_pro_pass('00000000-0000-4000-8000-000000000001', 'pay_forged', 3)$$,
  '42501', NULL, 'a user cannot call grant_pro_pass'
);
SELECT is(public.has_pro_access('00000000-0000-4000-8000-000000000002'), false,
  'has_pro_access does not reveal another user''s plan');

-- A pass lifts the free cloud limits (3 projects, 500 KB).
SELECT is(
  (SELECT public.upsert_cloud_project(
    'pass-big', '00000000-0000-4000-8000-000000000001', 'Big',
    jsonb_build_object('payload', repeat('x', 2 * 1024 * 1024)), now()
  ) ->> 'success'),
  'true',
  'a pass holder can save a 2 MB project'
);

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT is(
  (SELECT public.upsert_cloud_project(
    'lapsed-big', '00000000-0000-4000-8000-000000000003', 'Big',
    jsonb_build_object('payload', repeat('x', 2 * 1024 * 1024)), now()
  ) ->> 'error'),
  'too_large',
  'an ended pass gets the free size limit again'
);

SELECT * FROM finish();
ROLLBACK;
