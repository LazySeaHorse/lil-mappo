-- ============================================================
-- li'l Mappo — Migration 015: Cloud projects — free tier support
--
-- Replaces the subscription-gated INSERT/UPDATE policies from
-- migration 010 with new rules that support the free tier:
--
--   INSERT  — Wanderer (active/cancelling) OR
--             free user with fewer than 3 existing cloud saves
--
--   UPDATE  — ownership only; no subscription required.
--             Free users can still update their existing saves
--             after cancelling or never subscribing.
--
--   SELECT  — ownership only (unchanged from 010)
--   DELETE  — ownership only (unchanged from 010)
-- ============================================================

-- Drop policies from migration 010 that we're replacing
DROP POLICY IF EXISTS "cloud_projects_write"  ON public.cloud_projects;
DROP POLICY IF EXISTS "cloud_projects_update" ON public.cloud_projects;

-- ── INSERT: Wanderer OR (free user with < 3 saves) ────────────────────────────
CREATE POLICY "cloud_projects_insert"
  ON public.cloud_projects
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Paid (Wanderer) with active/cancelling subscription
      EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.user_id = auth.uid()
          AND s.status IN ('active', 'cancelling')
          AND s.tier = 'wanderer'
      )
      OR
      -- Free user: allow if they have fewer than 3 cloud saves
      (
        NOT EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = auth.uid()
            AND s.status IN ('active', 'cancelling')
        )
        AND (
          SELECT COUNT(*)
          FROM public.cloud_projects cp
          WHERE cp.user_id = auth.uid()
        ) < 3
      )
    )
  );

-- ── UPDATE: ownership only — any authenticated user can update their own saves ─
CREATE POLICY "cloud_projects_update"
  ON public.cloud_projects
  FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
