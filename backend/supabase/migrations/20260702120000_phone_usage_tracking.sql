-- Real phone-usage fatigue study. The native FatigueIDPro app records, for a chosen
-- window, how much the participant uses/scrolls real social apps (Instagram, Facebook,
-- YouTube, ...) on their own phone: per-app foreground time (Android UsageStats),
-- opens, and scroll-event counts (AccessibilityService). Fatigue is read from how
-- usage/scroll activity drifts across the window. No content is captured - only
-- which app, how long, how many opens, and scroll counts.
begin;

create table if not exists public.phone_usage_sessions (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null,
    platform text,
    app_version text,
    device_info jsonb not null default '{}'::jsonb,
    chosen_duration_min integer,
    self_rating_start integer check (self_rating_start is null or self_rating_start between 1 and 9),
    self_rating_end integer check (self_rating_end is null or self_rating_end between 1 and 9),
    actual_duration_ms bigint,
    total_foreground_ms bigint,
    total_scroll_events integer,
    total_opens integer,
    app_breakdown jsonb,
    scroll_drop_pct numeric,
    engagement_drop_pct numeric,
    status text not null default 'in_progress',
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.app_usage_intervals (
    id uuid primary key default gen_random_uuid(),
    phone_usage_session_id uuid not null references public.phone_usage_sessions(id) on delete cascade,
    participant_code text,
    interval_index integer not null check (interval_index >= 0),
    app_package text not null,
    app_label text,
    app_category text,
    foreground_ms bigint not null default 0,
    scroll_events integer not null default 0,
    opens integer not null default 0,
    bucket_start timestamptz,
    bucket_end timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_phone_usage_sessions_participant on public.phone_usage_sessions(participant_code);
create index if not exists idx_app_usage_intervals_session on public.app_usage_intervals(phone_usage_session_id, interval_index);

alter table public.phone_usage_sessions enable row level security;
alter table public.app_usage_intervals enable row level security;

grant insert on public.phone_usage_sessions to anon;
grant insert on public.app_usage_intervals to anon;
grant select on public.phone_usage_sessions, public.app_usage_intervals to authenticated;

drop policy if exists "anon insert phone usage sessions" on public.phone_usage_sessions;
create policy "anon insert phone usage sessions" on public.phone_usage_sessions
for insert to anon with check (true);

drop policy if exists "anon insert app usage intervals" on public.app_usage_intervals;
create policy "anon insert app usage intervals" on public.app_usage_intervals
for insert to anon with check (true);

drop policy if exists "researchers read phone usage sessions" on public.phone_usage_sessions;
create policy "researchers read phone usage sessions" on public.phone_usage_sessions
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher','viewer')));

drop policy if exists "researchers read app usage intervals" on public.app_usage_intervals;
create policy "researchers read app usage intervals" on public.app_usage_intervals
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher','viewer')));

drop view if exists public.research_phone_usage_sessions_export;
create view public.research_phone_usage_sessions_export
with (security_invoker = true) as
select id, participant_code, platform, app_version, chosen_duration_min,
    self_rating_start, self_rating_end, actual_duration_ms, total_foreground_ms,
    total_scroll_events, total_opens, app_breakdown, scroll_drop_pct, engagement_drop_pct,
    status, started_at, completed_at
from public.phone_usage_sessions;

drop view if exists public.research_app_usage_intervals_export;
create view public.research_app_usage_intervals_export
with (security_invoker = true) as
select id, phone_usage_session_id, participant_code, interval_index, app_package, app_label,
    app_category, foreground_ms, scroll_events, opens, bucket_start, bucket_end
from public.app_usage_intervals;

revoke all on public.research_phone_usage_sessions_export from public, anon;
revoke all on public.research_app_usage_intervals_export from public, anon;
grant select on public.research_phone_usage_sessions_export to authenticated;
grant select on public.research_app_usage_intervals_export to authenticated;

create or replace function public.finalize_phone_usage_session(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.phone_usage_sessions set
        actual_duration_ms   = coalesce((p->>'actual_duration_ms')::bigint, actual_duration_ms),
        total_foreground_ms  = coalesce((p->>'total_foreground_ms')::bigint, total_foreground_ms),
        total_scroll_events  = coalesce((p->>'total_scroll_events')::integer, total_scroll_events),
        total_opens          = coalesce((p->>'total_opens')::integer, total_opens),
        app_breakdown        = coalesce(p->'app_breakdown', app_breakdown),
        scroll_drop_pct      = coalesce((p->>'scroll_drop_pct')::numeric, scroll_drop_pct),
        engagement_drop_pct  = coalesce((p->>'engagement_drop_pct')::numeric, engagement_drop_pct),
        self_rating_end      = coalesce((p->>'self_rating_end')::integer, self_rating_end),
        status               = 'completed',
        completed_at         = now()
        where id = p_id;
end; $$;
revoke all on function public.finalize_phone_usage_session(uuid, jsonb) from public;
grant execute on function public.finalize_phone_usage_session(uuid, jsonb) to anon, authenticated;

commit;
