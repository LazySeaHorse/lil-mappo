-- ============================================================
-- li'l Mappo — Migration 002: Add Dodo Payments fields
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS dodo_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Fast lookups in the webhook handler (subscription.renewed / cancelled / expired)
CREATE INDEX IF NOT EXISTS idx_subscriptions_dodo_id
  ON public.subscriptions (dodo_subscription_id)
  WHERE dodo_subscription_id IS NOT NULL;
