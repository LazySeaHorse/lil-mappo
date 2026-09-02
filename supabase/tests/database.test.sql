BEGIN;

SELECT plan(12);

SELECT has_table('public', 'subscriptions', 'subscriptions table exists');
SELECT has_table('public', 'credit_balance', 'credit balance table exists');
SELECT has_table('public', 'cloud_projects', 'cloud projects table exists');
SELECT has_table('public', 'map_loads', 'map load counters table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscriptions'::regclass),
  'subscriptions has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.credit_balance'::regclass),
  'credit balance has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cloud_projects'::regclass),
  'cloud projects has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.map_loads'::regclass),
  'map load counters have RLS enabled'
);

INSERT INTO public.cloud_projects (id, user_id, name, data)
VALUES (
  'local-free-project',
  '00000000-0000-4000-8000-000000000001',
  'Local free project',
  '{}'::jsonb
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.subscriptions),
  0::bigint,
  'free user cannot see another user subscription'
);
SELECT is(
  (SELECT count(*) FROM public.cloud_projects),
  1::bigint,
  'free user can see their own cloud project'
);

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';

SELECT is(
  (SELECT count(*) FROM public.subscriptions),
  1::bigint,
  'Wanderer can see their own subscription'
);
SELECT is(
  (SELECT count(*) FROM public.cloud_projects),
  0::bigint,
  'Wanderer cannot see another user cloud project'
);

SELECT * FROM finish();
ROLLBACK;
