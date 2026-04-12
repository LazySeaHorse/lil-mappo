-- ============================================================
-- li'l Mappo — Migration 004: Change cloud_projects.id to TEXT
-- Fixes incompatibility with nanoid-generated project IDs.
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.cloud_projects
  ALTER COLUMN id TYPE TEXT;
