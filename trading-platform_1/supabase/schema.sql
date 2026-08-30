-- Phase 1 schema. Run this in the Supabase SQL editor after creating your project.

create table if not exists trading_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  style text,
  markets text[],
  sessions text[],
  timeframes text,
  rules jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  plan_id uuid references trading_plans,
  instrument text not null,
  direction text check (direction in ('long','short')) not null,
  entry numeric,
  stop numeric,
  target numeric,
  exit numeric,
  size numeric,
  risk_pct numeric,
  result_usd numeric,
  result_r numeric,
  setup_tag text,
  session text,
  htf_bias text,
  fundamental_bias text,
  reason_entry text,
  reason_exit text,
  emotion_tag text,
  mistake_tag text,
  lesson text,
  followed_plan boolean default true,
  news_nearby boolean default false,
  traded_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists economic_events (
  id uuid primary key default gen_random_uuid(),
  source text,
  event_type text,
  country text,
  currency text,
  scheduled_at timestamptz,
  importance text check (importance in ('high','medium','low')),
  previous numeric,
  forecast numeric,
  actual numeric,
  raw jsonb,
  fetched_at timestamptz default now()
);

create table if not exists event_asset_relevance (
  id serial primary key,
  event_type text not null,
  asset text not null,
  relevance text check (relevance in ('high','medium','low')),
  direction_logic text,
  explainer_text text
);

-- Row level security: each user only sees their own plans/journal entries.
alter table trading_plans enable row level security;
alter table journal_entries enable row level security;

create policy "own plans" on trading_plans for all using (auth.uid() = user_id);
create policy "own journal" on journal_entries for all using (auth.uid() = user_id);

-- economic_events and event_asset_relevance are shared reference data, readable by any signed-in user.
alter table economic_events enable row level security;
alter table event_asset_relevance enable row level security;
create policy "read events" on economic_events for select using (true);
create policy "read relevance" on event_asset_relevance for select using (true);

-- Seed starter rows for the relevance table — expand this as you refine your instrument list.
insert into event_asset_relevance (event_type, asset, relevance, direction_logic, explainer_text) values
('CPI', 'DXY', 'high', 'Above forecast -> hawkish repricing -> USD up. Below forecast -> dovish repricing -> USD down.', 'CPI measures consumer price inflation. Higher-than-expected readings raise the odds of tighter Fed policy, which typically supports the dollar.'),
('CPI', 'GOLD', 'high', 'Above forecast -> real yields up -> bearish gold. Below forecast -> real yields down -> bullish gold.', 'Gold is sensitive to real (inflation-adjusted) yields. Hot CPI tends to push real yields up, pressuring gold; cool CPI tends to do the opposite.'),
('CPI', 'NASDAQ', 'high', 'Above forecast -> higher discount rate expectations -> bearish growth stocks.', 'Tech/growth valuations are sensitive to future rate expectations. Hot inflation raises the odds of higher-for-longer rates, pressuring long-duration growth names.'),
('NFP', 'DXY', 'high', 'Strong jobs -> hawkish -> USD up. Weak jobs -> dovish -> USD down.', 'Nonfarm payrolls is the primary monthly labor market signal the Fed watches for its dual mandate.'),
('NFP', 'GOLD', 'medium', 'Strong jobs -> yields up -> bearish gold. Weak jobs -> yields down -> bullish gold.', 'Employment strength feeds into Fed rate expectations, which move real yields and therefore gold.'),
('FOMC_RATE_DECISION', 'DXY', 'high', 'Hawkish hold/hike -> USD up. Dovish cut/guidance -> USD down.', 'The Fed''s own rate decision and forward guidance is the single largest driver of USD direction over a policy cycle.')
on conflict do nothing;
