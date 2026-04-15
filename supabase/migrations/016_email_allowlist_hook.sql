-- ============================================================
-- li'l Mappo — Migration 016: Email allowlist Postgres Auth Hook
--
-- Rejects sign-ups from domains not on the trusted list.
-- Deploy steps (no CLI required):
--
--   1. Run this migration in the Supabase Dashboard SQL editor.
--   2. Go to: Authentication → Hooks
--   3. Add a hook for "before user creation" (signup hook)
--      pointing to: public.check_email_domain_before_signup
--
-- The function returns a JSON object:
--   { "decision": "continue" }           — allowed
--   { "decision": "reject",
--     "message": "..." }                 — blocked
--
-- Supabase Auth Hooks v1 protocol:
--   The function receives a JSONB `event` argument and returns JSONB.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_email_domain_before_signup(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   text;
  v_domain  text;
  v_allowed text[] := ARRAY[
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'hotmail.co.uk',
    'live.com',
    'yahoo.com',
    'yahoo.co.uk',
    'icloud.com',
    'me.com',
    'mac.com',
    'proton.me',
    'protonmail.com',
    'pm.me'
  ];
BEGIN
  -- Extract the email from the event payload
  v_email  := lower(trim(event->>'email'));
  v_domain := split_part(v_email, '@', 2);

  IF v_domain = ANY(v_allowed) THEN
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  RETURN jsonb_build_object(
    'decision', 'reject',
    'message',  'Sign-ups are limited to major email providers. Please use a Gmail, Outlook, iCloud, or similar address.'
  );
END;
$$;

-- Only callable by the Supabase auth service (supabase_auth_admin role) and service_role
REVOKE ALL ON FUNCTION public.check_email_domain_before_signup(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_domain_before_signup(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.check_email_domain_before_signup(jsonb) TO service_role;
