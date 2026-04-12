-- ============================================================
-- li'l Mappo — Migration 008: Webhook event idempotency table
--
-- Guards against Dodo replaying mutating webhook events that have
-- side-effects beyond a simple upsert/update.  Currently used by
-- the subscription.expired handler to ensure the 10-credit grace
-- allowance is only granted once per expiration event.
--
-- The event_key is a namespaced string, e.g.:
--   "subscription.expired:{dodo_subscription_id}"
--
-- No RLS needed — this table is never read or written by clients.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_key    TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
