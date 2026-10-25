BEGIN;

SELECT plan(17);

-- Migration 024: the roles hold the table privileges the app uses, granted
-- explicitly rather than through Supabase's old public-schema defaults.
-- Only presence is checked: older local stacks still add the implicit
-- defaults on top.

-- ── Browser (authenticated) ─────────────────────────────────

SELECT ok(
  has_table_privilege('authenticated', 'public.subscriptions', 'SELECT'),
  'signed-in users can read subscriptions (useSubscription)'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.credit_balance', 'SELECT'),
  'signed-in users can read credit_balance (useCredits)'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.render_jobs', 'SELECT'),
  'signed-in users can read render_jobs (useRenderJobs)'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.cloud_projects', 'SELECT'),
  'signed-in users can list and load cloud_projects'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.cloud_projects', 'DELETE'),
  'signed-in users can delete cloud_projects'
);

-- ── Server (service_role) ───────────────────────────────────

SELECT ok(
  has_table_privilege('service_role', 'public.subscriptions', 'SELECT'),
  'the server can read subscriptions'
);
SELECT ok(
  has_table_privilege('service_role', 'public.subscriptions', 'INSERT'),
  'the server can insert subscriptions'
);
SELECT ok(
  has_table_privilege('service_role', 'public.subscriptions', 'UPDATE'),
  'the server can update subscriptions'
);
SELECT ok(
  has_table_privilege('service_role', 'public.subscriptions', 'DELETE'),
  'the server can delete subscriptions'
);

SELECT ok(
  has_table_privilege('service_role', 'public.credit_balance', 'SELECT'),
  'the server can read credit_balance'
);
SELECT ok(
  has_table_privilege('service_role', 'public.credit_balance', 'INSERT'),
  'the server can insert credit_balance'
);
SELECT ok(
  has_table_privilege('service_role', 'public.credit_balance', 'UPDATE'),
  'the server can update credit_balance'
);
SELECT ok(
  has_table_privilege('service_role', 'public.credit_balance', 'DELETE'),
  'the server can delete credit_balance'
);

SELECT ok(
  has_table_privilege('service_role', 'public.render_jobs', 'SELECT'),
  'the server can read render_jobs'
);
SELECT ok(
  has_table_privilege('service_role', 'public.render_jobs', 'INSERT'),
  'the server can insert render_jobs'
);
SELECT ok(
  has_table_privilege('service_role', 'public.render_jobs', 'UPDATE'),
  'the server can update render_jobs'
);
SELECT ok(
  has_table_privilege('service_role', 'public.render_jobs', 'DELETE'),
  'the server can delete render_jobs'
);

SELECT * FROM finish();
ROLLBACK;
