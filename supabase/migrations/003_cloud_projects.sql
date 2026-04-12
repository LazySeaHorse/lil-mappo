-- ============================================================
-- li'l Mappo — Migration 003: Cloud project saves
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cloud_projects (
  id           UUID         PRIMARY KEY,  -- same UUID as local project.id
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  data         JSONB        NOT NULL,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- RLS: users can only read/write their own cloud projects
ALTER TABLE public.cloud_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_cloud_projects"
  ON public.cloud_projects
  FOR ALL
  USING (auth.uid() = user_id);

-- Fast user-scoped listing (ordered by updated_at in queries)
CREATE INDEX IF NOT EXISTS idx_cloud_projects_user_updated
  ON public.cloud_projects (user_id, updated_at DESC);
