BEGIN;

SELECT plan(18);

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

-- ── upsert_cloud_project size limits ─────────────────────────────────────────
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT public.upsert_cloud_project(
    'free-small', '00000000-0000-4000-8000-000000000001', 'Small',
    '{"a":1}'::jsonb, now()
  ) ->> 'success'),
  'true',
  'free user can save a small project'
);
SELECT is(
  (SELECT public.upsert_cloud_project(
    'free-big', '00000000-0000-4000-8000-000000000001', 'Big',
    jsonb_build_object('payload', repeat('x', 600 * 1024)), now()
  ) ->> 'error'),
  'too_large',
  'free user is rejected above 500 KB'
);

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';

SELECT is(
  (SELECT public.upsert_cloud_project(
    'wanderer-big', '00000000-0000-4000-8000-000000000002', 'Big',
    jsonb_build_object('payload', repeat('x', 2 * 1024 * 1024)), now()
  ) ->> 'success'),
  'true',
  'Wanderer can save a 2 MB project'
);
SELECT is(
  (SELECT public.upsert_cloud_project(
    'wanderer-huge', '00000000-0000-4000-8000-000000000002', 'Huge',
    jsonb_build_object('payload', repeat('x', 6 * 1024 * 1024)), now()
  ) ->> 'error'),
  'too_large',
  'Wanderer is rejected above 5 MB'
);

-- Browsers save through upsert_cloud_project only (migration 017 dropped the
-- INSERT policy). The 5 MB CHECK constraint (migration 021) is the ceiling for
-- the one direct write left to them: updating their own row.
SELECT throws_ok(
  $$INSERT INTO public.cloud_projects (id, user_id, name, data)
    VALUES ('direct-insert', '00000000-0000-4000-8000-000000000002', 'Direct', '{}'::jsonb)$$,
  '42501',
  NULL,
  'a direct insert is refused; saves go through upsert_cloud_project'
);
SELECT throws_ok(
  $$UPDATE public.cloud_projects
       SET data = jsonb_build_object('payload', repeat('x', 6 * 1024 * 1024))
     WHERE id = 'wanderer-big'$$,
  '23514',
  NULL,
  'a direct update above 5 MB violates the table constraint'
);

SELECT * FROM finish();
ROLLBACK;
