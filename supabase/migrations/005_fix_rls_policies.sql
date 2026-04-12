-- ============================================================
-- li'l Mappo — Migration 005: Tighten RLS policies
--
-- The original FOR ALL policies allowed authenticated users to
-- UPDATE their own subscriptions and credit_balance rows directly
-- from the browser (e.g. inflating purchased_credits or upgrading
-- their own tier). All writes to these tables are server-side only
-- (service role key bypasses RLS), so clients need SELECT only.
--
-- render_jobs is also restricted to SELECT; INSERTs will be added
-- with an explicit WITH CHECK when a render API endpoint exists.
-- ============================================================

-- subscriptions: read-only for clients
DROP POLICY IF EXISTS "own_subscriptions" ON public.subscriptions;
CREATE POLICY "own_subscriptions_select"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- credit_balance: read-only for clients
DROP POLICY IF EXISTS "own_credit_balance" ON public.credit_balance;
CREATE POLICY "own_credit_balance_select"
  ON public.credit_balance
  FOR SELECT
  USING (auth.uid() = user_id);

-- render_jobs: read-only for clients
DROP POLICY IF EXISTS "own_render_jobs" ON public.render_jobs;
CREATE POLICY "own_render_jobs_select"
  ON public.render_jobs
  FOR SELECT
  USING (auth.uid() = user_id);
