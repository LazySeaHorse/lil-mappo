-- Synthetic local-development data only. Never copy production rows here.
-- Both accounts use the password: local-test-password

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'local-free@gmail.com',
    crypt('local-test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Local Free User"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'local-wanderer@gmail.com',
    crypt('local-test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Local Wanderer User"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'local-free@gmail.com',
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"local-free@gmail.com"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'local-wanderer@gmail.com',
    '{"sub":"00000000-0000-4000-8000-000000000002","email":"local-wanderer@gmail.com"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO public.subscriptions (
  user_id,
  tier,
  monthly_credits,
  parallel_renders,
  renewal_date,
  dodo_subscription_id,
  status
)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'wanderer',
  100,
  1,
  current_date + 30,
  'local_wanderer_subscription',
  'active'
)
ON CONFLICT (user_id) DO UPDATE SET
  tier = EXCLUDED.tier,
  monthly_credits = EXCLUDED.monthly_credits,
  parallel_renders = EXCLUDED.parallel_renders,
  renewal_date = EXCLUDED.renewal_date,
  dodo_subscription_id = EXCLUDED.dodo_subscription_id,
  status = EXCLUDED.status;

UPDATE public.credit_balance
SET
  monthly_credits = 100,
  purchased_credits = 0,
  monthly_reset_date = current_date + 30,
  updated_at = now()
WHERE user_id = '00000000-0000-4000-8000-000000000002';
