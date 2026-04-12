-- ============================================================
-- li'l Mappo — Migration 006: Payment idempotency table
--
-- Tracks Dodo payment_ids that have already been processed.
-- The webhook handler inserts here (via service role key) before
-- crediting a topup; a unique-constraint conflict means the event
-- is a replay and should be skipped.
--
-- No RLS needed — this table is never read or written by clients.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processed_payments (
  payment_id   TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
