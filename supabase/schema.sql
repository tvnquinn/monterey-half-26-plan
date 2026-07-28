-- Run this in the Supabase SQL editor for your project.
-- Single-user personal coach store (service role used by Vercel server routes).

create table if not exists public.runs (
  id text primary key,
  source text not null check (source in ('strava', 'seed', 'manual')),
  strava_id bigint unique,
  name text not null,
  start_date timestamptz not null,
  distance_mi double precision not null,
  moving_time_sec integer not null,
  elapsed_time_sec integer not null,
  pace_sec_per_mi integer not null,
  elevation_ft double precision not null default 0,
  average_heartrate double precision,
  max_heartrate double precision,
  average_cadence double precision,
  calories double precision,
  suffer_score double precision,
  splits jsonb,
  raw jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists runs_start_date_idx on public.runs (start_date desc);
create index if not exists runs_strava_id_idx on public.runs (strava_id);

create table if not exists public.strava_tokens (
  id integer primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  athlete jsonb,
  updated_at timestamptz not null default now()
);

-- Optional: lock tables down for anon; app uses service role on the server.
alter table public.runs enable row level security;
alter table public.strava_tokens enable row level security;
