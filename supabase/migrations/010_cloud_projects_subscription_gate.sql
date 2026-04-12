-- ============================================================
-- li'l Mappo — Migration 010: Enforce subscription gate on cloud_projects
--
-- The original FOR ALL policy only checked auth.uid() = user_id,
-- allowing any authenticated user to INSERT/UPDATE cloud projects
-- regardless of subscription or credit balance — bypassing the
-- canCloudSave() frontend gate entirely.
--
-- This migration replaces it with two policies:
--
--   1. SELECT / DELETE — ownership check only (unchanged behaviour).
--      Users must be able to read and delete their own projects even
--      after a subscription lapses.
--
--   2. INSERT / UPDATE — ownership + subscription gate, mirroring
--      canCloudSave() exactly:
--        • Any active/cancelling non-nomad subscription → allowed.
--        • Nomad tier (active/cancelling) + purchased_credits > 0 → allowed.
--        • Everything else → denied.
-- ============================================================

DROP POLICY IF EXISTS "own_cloud_projects" ON public.cloud_projects;

-- Read and delete are gated on ownership only
CREATE POLICY "cloud_projects_select"
  ON public.cloud_projects
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cloud_projects_delete"
  ON public.cloud_projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Writes require an active subscription (matching canCloudSave logic)
CREATE POLICY "cloud_projects_write"
  ON public.cloud_projects
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status IN ('active', 'cancelling')
        AND (
          s.tier <> 'nomad'
          OR EXISTS (
            SELECT 1
            FROM public.credit_balance cb
            WHERE cb.user_id = auth.uid()
              AND cb.purchased_credits > 0
          )
        )
    )
  );

CREATE POLICY "cloud_projects_update"
  ON public.cloud_projects
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status IN ('active', 'cancelling')
        AND (
          s.tier <> 'nomad'
          OR EXISTS (
            SELECT 1
            FROM public.credit_balance cb
            WHERE cb.user_id = auth.uid()
              AND cb.purchased_credits > 0
          )
        )
    )
  );
