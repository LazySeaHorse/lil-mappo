-- Migration 011: render_jobs v2 — aspect ratio, resolution preset, render config, credit tracking

-- New columns on render_jobs
ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS aspect_ratio             TEXT,
  ADD COLUMN IF NOT EXISTS resolution_preset        TEXT,
  ADD COLUMN IF NOT EXISTS is_vertical              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS render_config            JSONB,
  ADD COLUMN IF NOT EXISTS project_data             JSONB,
  ADD COLUMN IF NOT EXISTS render_secret_hash       TEXT,
  ADD COLUMN IF NOT EXISTS monthly_credits_charged  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_credits_charged INT NOT NULL DEFAULT 0;

-- ─── deduct_render_credits ────────────────────────────────────────────────────
-- Atomically deducts credits from credit_balance (monthly first, then purchased).
-- Returns (monthly_charged, purchased_charged) for storage in render_jobs so
-- refunds can be precise.
CREATE OR REPLACE FUNCTION deduct_render_credits(
  p_user_id      UUID,
  p_total_credits INT
)
RETURNS TABLE(monthly_charged INT, purchased_charged INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_monthly     INT;
  v_purchased   INT;
  v_monthly_use INT;
  v_purchased_use INT;
BEGIN
  SELECT monthly_credits, purchased_credits
    INTO v_monthly, v_purchased
    FROM credit_balance
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No credit balance for user';
  END IF;

  IF (v_monthly + v_purchased) < p_total_credits THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %',
      (v_monthly + v_purchased), p_total_credits;
  END IF;

  v_monthly_use   := LEAST(v_monthly, p_total_credits);
  v_purchased_use := p_total_credits - v_monthly_use;

  UPDATE credit_balance
     SET monthly_credits   = monthly_credits   - v_monthly_use,
         purchased_credits = purchased_credits - v_purchased_use
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_monthly_use, v_purchased_use;
END;
$$;

-- ─── refund_render_credits ────────────────────────────────────────────────────
-- Atomically refunds the exact amounts debited when a render job fails.
CREATE OR REPLACE FUNCTION refund_render_credits(
  p_user_id         UUID,
  p_monthly_amount  INT,
  p_purchased_amount INT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE credit_balance
     SET monthly_credits   = monthly_credits   + p_monthly_amount,
         purchased_credits = purchased_credits + p_purchased_amount
   WHERE user_id = p_user_id;
END;
$$;

-- Lock both RPCs down — only service_role may call them directly
REVOKE EXECUTE ON FUNCTION deduct_render_credits(UUID, INT)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION refund_render_credits(UUID, INT, INT)
  FROM PUBLIC, anon, authenticated;
