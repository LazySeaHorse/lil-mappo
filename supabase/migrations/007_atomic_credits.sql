-- ============================================================
-- li'l Mappo — Migration 007: Atomic credit increment
--
-- Replaces the read-then-write pattern in the topup webhook with
-- a single atomic UPDATE, eliminating the race condition where two
-- concurrent topup webhooks for the same user could both read the
-- same balance and one increment would be silently lost.
--
-- Called via: supabase.rpc('increment_purchased_credits', { p_user_id, p_amount })
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_purchased_credits(
  p_user_id UUID,
  p_amount   INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.credit_balance
  SET purchased_credits = purchased_credits + p_amount
  WHERE user_id = p_user_id;

  -- Fallback: row should always exist (created by trigger on sign-up),
  -- but handle gracefully if it somehow doesn't.
  IF NOT FOUND THEN
    INSERT INTO public.credit_balance (user_id, monthly_credits, purchased_credits)
    VALUES (p_user_id, 0, p_amount)
    ON CONFLICT (user_id) DO UPDATE
      SET purchased_credits = credit_balance.purchased_credits + p_amount;
  END IF;
END;
$$;
