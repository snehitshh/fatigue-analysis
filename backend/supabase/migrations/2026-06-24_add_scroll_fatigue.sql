-- Scroll-fatigue measurement (standalone app: phone feed / laptop paper reader).
--
-- A participant scrolls in-app for a chosen duration (30 / 60 / 120 min). We record
-- one scroll_sessions row plus per-minute scroll_intervals, so fatigue can be read
-- as the drift in scroll behaviour (speed drop, longer pauses) over the session.
-- Written by the anonymous app (insert only); researchers read via the export views.
--
-- Run once in the Supabase SQL Editor. Fresh setups get this from schema.sql.

begin;

create table if not exists public.scroll_sessions (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null,
    content_mode text not null default 'feed',          -- 'feed' | 'paper'
    chosen_duration_min integer not null check (chosen_duration_min > 0),
    actual_duration_ms integer check (actual_duration_ms is null or actual_duration_ms >= 0),
    total_distance_px numeric(14, 2),
    total_scroll_events integer,
    total_pauses integer,
    mean_speed_px_s numeric(12, 2),
    speed_drop_pct numeric(6, 2),                        -- fatigue indicator (last third vs first third)
    pause_rise_pct numeric(8, 2),                        -- fatigue indicator
    self_rating_start integer check (self_rating_start is null or self_rating_start between 1 and 7),
    self_rating_end integer check (self_rating_end is null or self_rating_end between 1 and 7),
    device_info jsonb not null default '{}'::jsonb,
    participant_code_label text,
    record_label text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.scroll_intervals (
    id uuid primary key default gen_random_uuid(),
    scroll_session_id uuid not null references public.scroll_sessions(id) on delete cascade,
    participant_code text,
    interval_index integer not null check (interval_index >= 0),  -- minute number
    distance_px numeric(14, 2),
    scroll_events integer,
    reversals integer,
    mean_speed_px_s numeric(12, 2),
    max_speed_px_s numeric(12, 2),
    pause_count integer,
    self_rating integer check (self_rating is null or self_rating between 1 and 7),
    created_at timestamptz not null default now(),
    unique (scroll_session_id, interval_index)
);

create index if not exists idx_scroll_sessions_participant on public.scroll_sessions(participant_code);
create index if not exists idx_scroll_intervals_session on public.scroll_intervals(scroll_session_id);

alter table public.scroll_sessions enable row level security;
alter table public.scroll_intervals enable row level security;

grant insert on public.scroll_sessions to anon;
grant insert on public.scroll_intervals to anon;
grant select on public.scroll_sessions, public.scroll_intervals to authenticated;

drop policy if exists "anon insert scroll sessions" on public.scroll_sessions;
create policy "anon insert scroll sessions" on public.scroll_sessions
for insert to anon with check (true);

drop policy if exists "anon insert scroll intervals" on public.scroll_intervals;
create policy "anon insert scroll intervals" on public.scroll_intervals
for insert to anon with check (true);

drop policy if exists "researchers read scroll sessions" on public.scroll_sessions;
create policy "researchers read scroll sessions" on public.scroll_sessions
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher','viewer')));

drop policy if exists "researchers read scroll intervals" on public.scroll_intervals;
create policy "researchers read scroll intervals" on public.scroll_intervals
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher','viewer')));

drop view if exists public.research_scroll_sessions_export;
create or replace view public.research_scroll_sessions_export
with (security_invoker = true) as
select
    ss.id as scroll_session_id, ss.participant_code, ss.content_mode,
    ss.chosen_duration_min, ss.actual_duration_ms, ss.total_distance_px,
    ss.total_scroll_events, ss.total_pauses, ss.mean_speed_px_s,
    ss.speed_drop_pct, ss.pause_rise_pct, ss.self_rating_start, ss.self_rating_end,
    ss.device_info, ss.started_at, ss.completed_at, ss.created_at
from public.scroll_sessions ss;

drop view if exists public.research_scroll_intervals_export;
create or replace view public.research_scroll_intervals_export
with (security_invoker = true) as
select
    si.scroll_session_id, si.participant_code, si.interval_index,
    si.distance_px, si.scroll_events, si.reversals, si.mean_speed_px_s,
    si.max_speed_px_s, si.pause_count, si.self_rating, si.created_at
from public.scroll_intervals si;

revoke all on public.research_scroll_sessions_export from public, anon;
revoke all on public.research_scroll_intervals_export from public, anon;
grant select on public.research_scroll_sessions_export to authenticated;
grant select on public.research_scroll_intervals_export to authenticated;

commit;
