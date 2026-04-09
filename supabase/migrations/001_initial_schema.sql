-- ============================================================
-- li'l Mappo — Initial Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Subscriptions: one row per paying user (tier 1+)
-- Free users have no row here (they're simply absent)
create table if not exists public.subscriptions (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tier          text not null default 'wanderer',  -- 'wanderer' | 'cartographer' | 'pioneer'
  monthly_credits int not null default 0,
  parallel_renders int not null default 0,
  renewal_date  date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Credit balance: one row per user (created automatically on first sign-in via trigger)
create table if not exists public.credit_balance (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  monthly_credits     int not null default 0,   -- resets on renewal_date
  purchased_credits   int not null default 0,   -- never expire
  monthly_reset_date  date,
  updated_at          timestamptz not null default now()
);

-- Render jobs: one row per cloud render request
create table if not exists public.render_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'queued',  -- 'queued'|'rendering'|'done'|'failed'
  resolution          text,
  duration_sec        float,
  fps                 int,
  gpu                 boolean not null default false,
  credits_cost        int not null default 0,
  output_url          text,
  temp_project_path   text,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz,
  error_message       text
);

-- Feature votes (anonymous OK)
create table if not exists public.feature_votes (
  feature_id  text primary key,
  count       int not null default 0
);

-- ======================
-- Row Level Security
-- ======================

alter table public.subscriptions   enable row level security;
alter table public.credit_balance  enable row level security;
alter table public.render_jobs     enable row level security;
alter table public.feature_votes   enable row level security;

-- Users can only see/edit their own rows
create policy "own_subscriptions"  on public.subscriptions  for all using (auth.uid() = user_id);
create policy "own_credit_balance" on public.credit_balance for all using (auth.uid() = user_id);
create policy "own_render_jobs"    on public.render_jobs    for all using (auth.uid() = user_id);

-- Feature votes: anyone can read, only authenticated users can upsert
create policy "read_feature_votes"   on public.feature_votes for select using (true);
create policy "upsert_feature_votes" on public.feature_votes for insert with check (auth.uid() is not null);

-- ======================
-- Auto-create credit_balance row on first sign-in
-- ======================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.credit_balance (user_id, monthly_credits, purchased_credits)
  values (new.id, 0, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
