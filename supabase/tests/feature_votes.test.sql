BEGIN;

SELECT plan(39);

-- Fixtures. Seed users 1 (free) and 2 (active Wanderer) are made "recently
-- active"; 18 more free users bring the active total to 24 (weight 1 + 5 + 18),
-- just under the denominator floor of 25, so share = score / 25.
UPDATE auth.users
SET last_sign_in_at = now()
WHERE id IN (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  'authenticated', 'authenticated',
  'votes-extra-' || n || '@example.com',
  now(), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
FROM generate_series(1, 18) AS n;

-- ── Table lockdown ──────────────────────────────────────────

SELECT has_table('public', 'feature_votes', 'feature_votes table exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feature_votes'::regclass),
  'feature_votes has RLS enabled'
);
SELECT is(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feature_votes'),
  0::bigint,
  'feature_votes has no RLS policies'
);
SELECT has_column('public', 'feature_votes', 'user_id', 'feature_votes is per-user');
SELECT hasnt_column('public', 'feature_votes', 'count', 'legacy counter column is gone');

-- ── Helper reads auth.users, auth.sessions and subscriptions ─

-- A user who never signed in but has a fresh session counts as active.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000201',
   'authenticated', 'authenticated', 'votes-session@example.com',
   now(), NULL, '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000202',
   'authenticated', 'authenticated', 'votes-stale@example.com',
   now(), now() - interval '100 days', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000203',
   'authenticated', 'authenticated', 'votes-unconfirmed@example.com',
   NULL, now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000204',
   'authenticated', 'authenticated', 'votes-onhold@example.com',
   now(), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000205',
   'authenticated', 'authenticated', 'votes-cancelling@example.com',
   now(), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000206',
   'authenticated', 'authenticated', 'votes-lapsed@example.com',
   now(), now(), '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000201', now(), now());

INSERT INTO public.subscriptions (user_id, tier, renewal_date, status)
VALUES
  ('00000000-0000-4000-8000-000000000204', 'wanderer', current_date + 10, 'on_hold'),
  ('00000000-0000-4000-8000-000000000205', 'wanderer', current_date + 10, 'cancelling'),
  ('00000000-0000-4000-8000-000000000206', 'wanderer', current_date - 1, 'cancelling');

SELECT is(
  (SELECT weight FROM public.feature_vote_weights()
   WHERE user_id = '00000000-0000-4000-8000-000000000201'),
  1,
  'definer helper can read auth.sessions: session-only user counts as active (free)'
);
SELECT is(
  (SELECT count(*) FROM public.feature_vote_weights()
   WHERE user_id IN ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203')),
  0::bigint,
  'stale and unconfirmed users are not counted'
);
SELECT is(
  (SELECT weight FROM public.feature_vote_weights()
   WHERE user_id = '00000000-0000-4000-8000-000000000002'),
  5,
  'active subscription weighs 5'
);
SELECT is(
  (SELECT weight FROM public.feature_vote_weights()
   WHERE user_id = '00000000-0000-4000-8000-000000000204'),
  1,
  'on_hold subscription weighs as free'
);
SELECT is(
  (SELECT weight FROM public.feature_vote_weights()
   WHERE user_id = '00000000-0000-4000-8000-000000000205'),
  5,
  'cancelling subscription before its renewal date weighs 5'
);
SELECT is(
  (SELECT weight FROM public.feature_vote_weights()
   WHERE user_id = '00000000-0000-4000-8000-000000000206'),
  1,
  'cancelling subscription past its renewal date weighs as free'
);

-- Keep the denominator fixture simple again for the tier tests.
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000204',
  '00000000-0000-4000-8000-000000000205',
  '00000000-0000-4000-8000-000000000206'
);

-- ── Browser roles cannot touch the table or the helpers ─────

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT throws_ok(
  $$SELECT * FROM public.feature_votes$$,
  '42501', NULL,
  'authenticated cannot select feature_votes directly'
);
SELECT throws_ok(
  $$INSERT INTO public.feature_votes (user_id, feature_id)
    VALUES ('00000000-0000-4000-8000-000000000001', 'sneaky')$$,
  '42501', NULL,
  'authenticated cannot insert into feature_votes directly'
);
SELECT throws_ok(
  $$SELECT * FROM public.feature_vote_weights()$$,
  '42501', NULL,
  'authenticated cannot call the weights helper'
);

-- ── Voting: idempotent, validated ───────────────────────────

SELECT is(public.set_feature_vote('feat-e', true), true, 'vote returns true');
SELECT is(public.set_feature_vote('feat-e', true), true, 're-vote is idempotent');
SELECT is(
  (SELECT has_voted FROM public.get_feature_vote_summaries(ARRAY['feat-e'])),
  true,
  'caller sees their own vote'
);
SELECT is(public.set_feature_vote('feat-e', false), false, 'unvote returns false');
SELECT is(public.set_feature_vote('feat-e', false), false, 'repeat unvote is idempotent');
SELECT is(
  (SELECT has_voted FROM public.get_feature_vote_summaries(ARRAY['feat-e'])),
  false,
  'vote is gone after unvote'
);
SELECT throws_ok(
  $$SELECT public.set_feature_vote('Bad_Id', true)$$,
  '22023', NULL,
  'malformed feature id is rejected'
);
SELECT throws_ok(
  $$SELECT public.set_feature_vote(repeat('a', 49), true)$$,
  '22023', NULL,
  'over-long feature id is rejected'
);

-- ── Tiers (as postgres: direct vote fixtures) ───────────────

RESET ROLE;

-- feat-a: one free voter.        score 1  -> 4%  -> few
-- feat-b: Wanderer + 8 free.     score 13 -> 52% -> most (9 voters caps at many)
-- feat-d: two free voters.       score 2  -> 8%  -> some
INSERT INTO public.feature_votes (user_id, feature_id) VALUES
  ('00000000-0000-4000-8000-000000000001', 'feat-a'),
  ('00000000-0000-4000-8000-000000000002', 'feat-b'),
  ('00000000-0000-4000-8000-000000000101', 'feat-d'),
  ('00000000-0000-4000-8000-000000000102', 'feat-d');
INSERT INTO public.feature_votes (user_id, feature_id)
SELECT ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'feat-b'
FROM generate_series(3, 10) AS n;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-zero'])),
  'none',
  'a feature nobody voted for is none'
);
SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-a', 'feat-b']) WHERE feature_id = 'feat-a'),
  'few',
  'one free voter (4%) is few'
);
SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-d'])),
  'some',
  'two free voters (8%) is some'
);
SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-b'])),
  'many',
  'nine voters at 52% share is capped to many (needs 10 voters for most)'
);

RESET ROLE;
INSERT INTO public.feature_votes (user_id, feature_id)
VALUES ('00000000-0000-4000-8000-000000000111', 'feat-b');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-b'])),
  'most',
  'ten voters at over 35% share is most'
);

-- A single paid vote (5/25 = 20%) would be "many" by share but one voter caps it.
RESET ROLE;
DELETE FROM public.feature_votes WHERE feature_id = 'feat-b';
INSERT INTO public.feature_votes (user_id, feature_id)
VALUES ('00000000-0000-4000-8000-000000000002', 'feat-p');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-p'])),
  'few',
  'a single paid vote is capped to few by the voter minimum'
);

-- Paid vs free: 5 free voters (5/25 = 20%, many) vs one Wanderer plus 4 free? Keep
-- it direct: Wanderer + 1 free = score 6 = 24%, two voters caps at some.
RESET ROLE;
INSERT INTO public.feature_votes (user_id, feature_id) VALUES
  ('00000000-0000-4000-8000-000000000001', 'feat-p');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT tier FROM public.get_feature_vote_summaries(ARRAY['feat-p'])),
  'some',
  'paid + free voter (24% share) is capped to some by two voters'
);

-- ── has_voted is per caller ─────────────────────────────────

SELECT is(
  (SELECT has_voted FROM public.get_feature_vote_summaries(ARRAY['feat-a'])),
  true,
  'voter sees has_voted on their own feature'
);

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';

SELECT is(
  (SELECT has_voted FROM public.get_feature_vote_summaries(ARRAY['feat-a'])),
  false,
  'another caller does not inherit that vote'
);

-- ── most_requested ──────────────────────────────────────────

RESET ROLE;
-- feat-m: 6 free voters (score 6). feat-big: 7 free voters (score 7), never passed.
INSERT INTO public.feature_votes (user_id, feature_id)
SELECT ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'feat-m'
FROM generate_series(1, 6) AS n;
INSERT INTO public.feature_votes (user_id, feature_id)
SELECT ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'feat-big'
FROM generate_series(1, 7) AS n;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT most_requested FROM public.get_feature_vote_summaries(ARRAY['feat-m', 'feat-a'])
   WHERE feature_id = 'feat-m'),
  true,
  'highest weighted score among the passed ids with enough voters is most requested'
);
SELECT is(
  (SELECT most_requested FROM public.get_feature_vote_summaries(ARRAY['feat-m', 'feat-big'])
   WHERE feature_id = 'feat-m'),
  false,
  'a higher-scoring passed feature takes the badge'
);
SELECT is(
  (SELECT count(*) FROM public.get_feature_vote_summaries(ARRAY['feat-a', 'feat-m']) WHERE most_requested),
  1::bigint,
  'ids that are not passed (feat-big) are ignored and only one badge is awarded'
);
SELECT is(
  (SELECT most_requested FROM public.get_feature_vote_summaries(ARRAY['feat-a', 'feat-d'])
   WHERE feature_id = 'feat-d'),
  false,
  'too few voters never earns most requested'
);

-- ── Oversized input is rejected before any work on it ────────

SELECT throws_ok(
  $$SELECT * FROM public.get_feature_vote_summaries(
      (SELECT array_agg('feat-' || n) FROM generate_series(1, 51) AS n))$$,
  '22023', 'too many feature ids',
  'more than 50 ids is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_feature_vote_summaries(array_fill('feat-a'::text, ARRAY[51]))$$,
  '22023', 'too many feature ids',
  'an oversized array is rejected as-is, even when it dedupes to a single id'
);
SELECT lives_ok(
  $$SELECT * FROM public.get_feature_vote_summaries(
      (SELECT array_agg('feat-' || n) FROM generate_series(1, 50) AS n))$$,
  'exactly 50 ids is accepted'
);

-- ── Anonymous callers ───────────────────────────────────────

SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT * FROM public.get_feature_vote_summaries(ARRAY['feat-a'])$$,
  '42501', NULL,
  'anon cannot read vote summaries'
);

SELECT * FROM finish();
ROLLBACK;
