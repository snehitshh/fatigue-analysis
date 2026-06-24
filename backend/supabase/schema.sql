-- Fatigue Analysis Supabase schema
-- Paste this full file into the Supabase SQL Editor and run it once.
-- It creates tables, constraints, indexes, grants, and Row Level Security policies.

begin;

create extension if not exists pgcrypto;

do $$
begin
    create type public.base_task_type as enum ('fitts', 'typing');
exception
    when duplicate_object then null;
end $$;

do $$
begin
    create type public.fatigue_track_type as enum ('cognitive', 'physical');
exception
    when duplicate_object then null;
end $$;

do $$
begin
    create type public.session_status as enum ('started', 'in_progress', 'completed', 'abandoned', 'invalid');
exception
    when duplicate_object then null;
end $$;

do $$
begin
    create type public.researcher_role as enum ('admin', 'researcher', 'viewer');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.studies (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    protocol_version text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.researcher_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    role public.researcher_role not null default 'viewer',
    created_at timestamptz not null default now()
);

create table if not exists public.participants (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null unique,
    age integer check (age between 16 and 100),
    gender text,
    input_device text,
    dominant_hand text,
    eye_correction text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.sessions (
    id uuid primary key default gen_random_uuid(),
    study_id uuid not null references public.studies(id) on delete restrict,
    participant_id uuid not null references public.participants(id) on delete restrict,
    session_code text not null unique,
    status public.session_status not null default 'started',
    original_base_task public.base_task_type not null,
    original_fatigue_track public.fatigue_track_type not null,
    final_base_task public.base_task_type not null,
    final_fatigue_track public.fatigue_track_type not null,
    app_version text not null default 'v2',
    device_info jsonb not null default '{}'::jsonb,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    notes text
);

create table if not exists public.experiment_blocks (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    base_task public.base_task_type not null,
    fatigue_track public.fatigue_track_type not null,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    unique (session_id, block_number)
);

create table if not exists public.session_events (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid references public.experiment_blocks(id) on delete set null,
    event_type text not null,
    event_payload jsonb not null default '{}'::jsonb,
    elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
    occurred_at timestamptz not null default now()
);

create table if not exists public.fitts_trials (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid not null references public.experiment_blocks(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    minute_number integer not null check (minute_number between 1 and 10),
    trial_in_minute integer not null check (trial_in_minute >= 1),
    difficulty_level integer check (difficulty_level between 1 and 5),
    target_size_px numeric(10, 2),
    target_distance_px numeric(10, 2),
    rendered_arena_width_px numeric(10, 2),
    rendered_arena_height_px numeric(10, 2),
    avg_index_of_difficulty numeric(10, 4),
    targets_clicked integer not null check (targets_clicked >= 0),
    misclicks integer not null default 0 check (misclicks >= 0),
    total_time_ms numeric(12, 2) check (total_time_ms is null or total_time_ms >= 0),
    throughput_bps numeric(10, 4),
    avg_movement_time_ms numeric(12, 2),
    error_rate_percent numeric(6, 2),
    elapsed_time_in_block_ms integer check (elapsed_time_in_block_ms is null or elapsed_time_in_block_ms >= 0),
    success boolean not null,
    input_method text,
    created_at timestamptz not null default now(),
    unique (session_id, block_number, minute_number, trial_in_minute)
);

create table if not exists public.typing_trials (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid not null references public.experiment_blocks(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    minute_number integer not null check (minute_number between 1 and 10),
    sentence_number integer not null check (sentence_number >= 1),
    original_sentence text not null,
    typed_text text not null,
    wpm numeric(8, 2),
    error_distance numeric(10, 2),
    error_percentage numeric(6, 2),
    iki_ms numeric(10, 2),
    kspc numeric(10, 4),
    backspace_count integer not null default 0 check (backspace_count >= 0),
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    elapsed_time_in_block_ms integer check (elapsed_time_in_block_ms is null or elapsed_time_in_block_ms >= 0),
    input_method text,
    created_at timestamptz not null default now(),
    unique (session_id, block_number, minute_number, sentence_number)
);

create table if not exists public.nasa_tlx_responses (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid not null references public.experiment_blocks(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    mental_demand integer not null check (mental_demand between 1 and 20),
    physical_demand integer not null check (physical_demand between 1 and 20),
    temporal_demand integer not null check (temporal_demand between 1 and 20),
    performance integer not null check (performance between 1 and 20),
    effort integer not null check (effort between 1 and 20),
    frustration integer not null check (frustration between 1 and 20),
    overall_score numeric(5, 2) generated always as (
        (
            mental_demand +
            physical_demand +
            temporal_demand +
            performance +
            effort +
            frustration
        )::numeric / 6.0
    ) stored,
    created_at timestamptz not null default now(),
    unique (session_id, block_number)
);

create table if not exists public.cognitive_trials (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid not null references public.experiment_blocks(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    test_type text not null check (test_type in ('stroop', 'axcpt')),
    phase_label text not null,
    trial_number integer not null check (trial_number >= 1),
    stimulus text,
    correct_response text,
    participant_response text,
    correct boolean not null,
    reaction_time_ms numeric(12, 2),
    elapsed_time_in_phase_ms integer check (elapsed_time_in_phase_ms is null or elapsed_time_in_phase_ms >= 0),
    elapsed_time_in_block_ms integer check (elapsed_time_in_block_ms is null or elapsed_time_in_block_ms >= 0),
    is_timeout boolean not null default false,
    input_method text,
    created_at timestamptz not null default now(),
    unique (session_id, block_number, test_type, phase_label, trial_number)
);

create table if not exists public.physical_fatigue_logs (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid not null references public.experiment_blocks(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    target_duration_seconds integer not null default 720 check (target_duration_seconds > 0),
    active_duration_seconds integer not null default 0 check (active_duration_seconds >= 0),
    paused_duration_seconds integer not null default 0 check (paused_duration_seconds >= 0),
    pause_count integer not null default 0 check (pause_count >= 0),
    completed boolean not null default false,
    finish_reason text,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    notes text,
    unique (session_id, block_number)
);

alter table public.experiment_blocks
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.session_events
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.fitts_trials
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.typing_trials
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.nasa_tlx_responses
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.cognitive_trials
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.physical_fatigue_logs
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

create index if not exists idx_blocks_record_label on public.experiment_blocks(record_label);
create index if not exists idx_events_record_label on public.session_events(record_label);
create index if not exists idx_fitts_record_label on public.fitts_trials(record_label);
create index if not exists idx_typing_record_label on public.typing_trials(record_label);
create index if not exists idx_nasa_record_label on public.nasa_tlx_responses(record_label);
create index if not exists idx_cognitive_record_label on public.cognitive_trials(record_label);
create index if not exists idx_physical_record_label on public.physical_fatigue_logs(record_label);

insert into public.studies (slug, name, protocol_version, is_active)
values ('fatigue-analysis', 'Fatigue Analysis through Interaction Analysis', 'v2', true)
on conflict (slug) do update
set name = excluded.name,
    protocol_version = excluded.protocol_version,
    is_active = excluded.is_active;

create index if not exists idx_researcher_profiles_role on public.researcher_profiles(role);
create index if not exists idx_participants_code on public.participants(participant_code);
create index if not exists idx_sessions_study_id on public.sessions(study_id);
create index if not exists idx_sessions_participant_id on public.sessions(participant_id);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_blocks_session_id on public.experiment_blocks(session_id);
create index if not exists idx_events_session_id on public.session_events(session_id);
create index if not exists idx_events_type on public.session_events(event_type);
create index if not exists idx_fitts_session_block on public.fitts_trials(session_id, block_number);
create index if not exists idx_typing_session_block on public.typing_trials(session_id, block_number);
create index if not exists idx_nasa_session_block on public.nasa_tlx_responses(session_id, block_number);
create index if not exists idx_cognitive_session_block on public.cognitive_trials(session_id, block_number);
create index if not exists idx_physical_session_block on public.physical_fatigue_logs(session_id, block_number);

alter table public.studies enable row level security;
alter table public.researcher_profiles enable row level security;
alter table public.participants enable row level security;
alter table public.sessions enable row level security;
alter table public.experiment_blocks enable row level security;
alter table public.session_events enable row level security;
alter table public.fitts_trials enable row level security;
alter table public.typing_trials enable row level security;
alter table public.nasa_tlx_responses enable row level security;
alter table public.cognitive_trials enable row level security;
alter table public.physical_fatigue_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant usage on type
    public.base_task_type,
    public.fatigue_track_type,
    public.session_status,
    public.researcher_role
to anon, authenticated;

grant select on public.studies to anon, authenticated;
grant insert on public.participants to anon;
grant insert on public.sessions to anon;
grant insert on public.experiment_blocks to anon;
grant insert on public.session_events to anon;
grant insert on public.fitts_trials to anon;
grant insert on public.typing_trials to anon;
grant insert on public.nasa_tlx_responses to anon;
grant insert on public.cognitive_trials to anon;
grant insert on public.physical_fatigue_logs to anon;

grant select on
    public.studies,
    public.researcher_profiles,
    public.participants,
    public.sessions,
    public.experiment_blocks,
    public.session_events,
    public.fitts_trials,
    public.typing_trials,
    public.nasa_tlx_responses,
    public.cognitive_trials,
    public.physical_fatigue_logs
to authenticated;

drop policy if exists "anon can read active studies" on public.studies;
create policy "anon can read active studies"
on public.studies
for select
to anon
using (is_active = true);

drop policy if exists "researchers can read their own profile" on public.researcher_profiles;
create policy "researchers can read their own profile"
on public.researcher_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "anon can insert participants" on public.participants;
create policy "anon can insert participants"
on public.participants
for insert
to anon
with check (true);

drop policy if exists "anon can insert sessions" on public.sessions;
create policy "anon can insert sessions"
on public.sessions
for insert
to anon
with check (true);

drop policy if exists "anon can insert experiment blocks" on public.experiment_blocks;
create policy "anon can insert experiment blocks"
on public.experiment_blocks
for insert
to anon
with check (true);

drop policy if exists "anon can insert session events" on public.session_events;
create policy "anon can insert session events"
on public.session_events
for insert
to anon
with check (true);

drop policy if exists "anon can insert fitts trials" on public.fitts_trials;
create policy "anon can insert fitts trials"
on public.fitts_trials
for insert
to anon
with check (true);

drop policy if exists "anon can insert typing trials" on public.typing_trials;
create policy "anon can insert typing trials"
on public.typing_trials
for insert
to anon
with check (true);

drop policy if exists "anon can insert nasa tlx responses" on public.nasa_tlx_responses;
create policy "anon can insert nasa tlx responses"
on public.nasa_tlx_responses
for insert
to anon
with check (true);

drop policy if exists "anon can insert cognitive trials" on public.cognitive_trials;
create policy "anon can insert cognitive trials"
on public.cognitive_trials
for insert
to anon
with check (true);

drop policy if exists "anon can insert physical fatigue logs" on public.physical_fatigue_logs;
create policy "anon can insert physical fatigue logs"
on public.physical_fatigue_logs
for insert
to anon
with check (true);

drop policy if exists "researchers can read studies" on public.studies;
create policy "researchers can read studies"
on public.studies
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read participants" on public.participants;
create policy "researchers can read participants"
on public.participants
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read sessions" on public.sessions;
create policy "researchers can read sessions"
on public.sessions
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read experiment blocks" on public.experiment_blocks;
create policy "researchers can read experiment blocks"
on public.experiment_blocks
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read session events" on public.session_events;
create policy "researchers can read session events"
on public.session_events
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read fitts trials" on public.fitts_trials;
create policy "researchers can read fitts trials"
on public.fitts_trials
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read typing trials" on public.typing_trials;
create policy "researchers can read typing trials"
on public.typing_trials
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read nasa tlx responses" on public.nasa_tlx_responses;
create policy "researchers can read nasa tlx responses"
on public.nasa_tlx_responses
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read cognitive trials" on public.cognitive_trials;
create policy "researchers can read cognitive trials"
on public.cognitive_trials
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop policy if exists "researchers can read physical fatigue logs" on public.physical_fatigue_logs;
create policy "researchers can read physical fatigue logs"
on public.physical_fatigue_logs
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

-- Researcher export views for clean Supabase review/download.
-- Views are authenticated-only and use security_invoker so existing table RLS policies still apply.

drop view if exists public.research_event_export;
drop view if exists public.research_physical_export;
drop view if exists public.research_nasa_tlx_export;
drop view if exists public.research_cognitive_export;
drop view if exists public.research_typing_export;
drop view if exists public.research_fitts_export;
drop view if exists public.research_session_summary;

create or replace view public.research_session_summary
with (security_invoker = true) as
select
    s.id as session_id,
    s.session_code,
    p.participant_code,
    st.slug as study_slug,
    st.protocol_version,
    s.status,
    s.original_base_task::text as original_base_task,
    s.original_fatigue_track::text as original_fatigue_track,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    s.app_version,
    p.age,
    p.gender,
    p.input_device,
    p.dominant_hand,
    p.eye_correction,
    s.started_at,
    s.completed_at,
    count(distinct b.id) as block_count,
    count(distinct n.id) as nasa_tlx_count,
    round(avg(n.overall_score), 2) as avg_nasa_tlx_score,
    (select count(*) from public.fitts_trials ft where ft.session_id = s.id) as fitts_trial_count,
    (select count(*) from public.typing_trials tt where tt.session_id = s.id) as typing_trial_count,
    (select count(*) from public.cognitive_trials ct where ct.session_id = s.id) as cognitive_trial_count,
    (select count(*) from public.physical_fatigue_logs pfl where pfl.session_id = s.id) as physical_log_count,
    (select count(*) from public.session_events se where se.session_id = s.id) as event_count,
    s.device_info,
    p.metadata as participant_metadata
from public.sessions s
join public.participants p on p.id = s.participant_id
join public.studies st on st.id = s.study_id
left join public.experiment_blocks b on b.session_id = s.id
left join public.nasa_tlx_responses n on n.session_id = s.id
group by
    s.id,
    s.session_code,
    p.participant_code,
    st.slug,
    st.protocol_version,
    s.status,
    s.original_base_task,
    s.original_fatigue_track,
    s.final_base_task,
    s.final_fatigue_track,
    s.app_version,
    p.age,
    p.gender,
    p.input_device,
    p.dominant_hand,
    p.eye_correction,
    s.started_at,
    s.completed_at,
    s.device_info,
    p.metadata;

create or replace view public.research_fitts_export
with (security_invoker = true) as
select
    ft.record_label,
    coalesce(ft.participant_code, p.participant_code) as participant_code,
    coalesce(ft.session_code, s.session_code) as session_code,
    ft.session_id,
    ft.block_id,
    ft.block_number,
    ft.minute_number,
    ft.trial_in_minute,
    ft.difficulty_level,
    ft.target_size_px,
    ft.target_distance_px,
    ft.rendered_arena_width_px,
    ft.rendered_arena_height_px,
    ft.avg_index_of_difficulty,
    ft.targets_clicked,
    ft.misclicks,
    ft.total_time_ms,
    ft.throughput_bps,
    ft.avg_movement_time_ms,
    ft.error_rate_percent,
    ft.elapsed_time_in_block_ms,
    ft.success,
    ft.input_method,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    ft.created_at
from public.fitts_trials ft
join public.sessions s on s.id = ft.session_id
join public.participants p on p.id = s.participant_id;

create or replace view public.research_typing_export
with (security_invoker = true) as
select
    tt.record_label,
    coalesce(tt.participant_code, p.participant_code) as participant_code,
    coalesce(tt.session_code, s.session_code) as session_code,
    tt.session_id,
    tt.block_id,
    tt.block_number,
    tt.minute_number,
    tt.sentence_number,
    tt.original_sentence,
    tt.typed_text,
    tt.wpm,
    tt.error_distance,
    tt.error_percentage,
    tt.iki_ms,
    tt.kspc,
    tt.backspace_count,
    tt.duration_ms,
    tt.elapsed_time_in_block_ms,
    tt.input_method,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    tt.created_at
from public.typing_trials tt
join public.sessions s on s.id = tt.session_id
join public.participants p on p.id = s.participant_id;

create or replace view public.research_cognitive_export
with (security_invoker = true) as
select
    ct.record_label,
    coalesce(ct.participant_code, p.participant_code) as participant_code,
    coalesce(ct.session_code, s.session_code) as session_code,
    ct.session_id,
    ct.block_id,
    ct.block_number,
    ct.test_type,
    ct.phase_label,
    ct.trial_number,
    ct.stimulus,
    ct.correct_response,
    ct.participant_response,
    ct.correct,
    ct.reaction_time_ms,
    ct.elapsed_time_in_phase_ms,
    ct.elapsed_time_in_block_ms,
    ct.is_timeout,
    ct.input_method,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    ct.created_at
from public.cognitive_trials ct
join public.sessions s on s.id = ct.session_id
join public.participants p on p.id = s.participant_id;

create or replace view public.research_nasa_tlx_export
with (security_invoker = true) as
select
    n.record_label,
    coalesce(n.participant_code, p.participant_code) as participant_code,
    coalesce(n.session_code, s.session_code) as session_code,
    n.session_id,
    n.block_id,
    n.block_number,
    n.mental_demand,
    n.physical_demand,
    n.temporal_demand,
    n.performance,
    n.effort,
    n.frustration,
    n.overall_score,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    n.created_at
from public.nasa_tlx_responses n
join public.sessions s on s.id = n.session_id
join public.participants p on p.id = s.participant_id;

create or replace view public.research_physical_export
with (security_invoker = true) as
select
    pfl.record_label,
    coalesce(pfl.participant_code, p.participant_code) as participant_code,
    coalesce(pfl.session_code, s.session_code) as session_code,
    pfl.session_id,
    pfl.block_id,
    pfl.block_number,
    pfl.target_duration_seconds,
    pfl.active_duration_seconds,
    pfl.paused_duration_seconds,
    pfl.pause_count,
    pfl.completed,
    pfl.finish_reason,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    pfl.started_at,
    pfl.ended_at,
    pfl.notes
from public.physical_fatigue_logs pfl
join public.sessions s on s.id = pfl.session_id
join public.participants p on p.id = s.participant_id;

create or replace view public.research_event_export
with (security_invoker = true) as
select
    se.record_label,
    coalesce(se.participant_code, p.participant_code) as participant_code,
    coalesce(se.session_code, s.session_code) as session_code,
    se.session_id,
    se.block_id,
    b.block_number,
    se.event_type,
    se.event_payload,
    se.elapsed_ms,
    se.occurred_at,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track
from public.session_events se
join public.sessions s on s.id = se.session_id
join public.participants p on p.id = s.participant_id
left join public.experiment_blocks b on b.id = se.block_id;

revoke all on public.research_session_summary from public;
revoke all on public.research_fitts_export from public;
revoke all on public.research_typing_export from public;
revoke all on public.research_cognitive_export from public;
revoke all on public.research_nasa_tlx_export from public;
revoke all on public.research_physical_export from public;
revoke all on public.research_event_export from public;

revoke all on public.research_session_summary from anon;
revoke all on public.research_fitts_export from anon;
revoke all on public.research_typing_export from anon;
revoke all on public.research_cognitive_export from anon;
revoke all on public.research_nasa_tlx_export from anon;
revoke all on public.research_physical_export from anon;
revoke all on public.research_event_export from anon;

grant select on public.research_session_summary to authenticated;
grant select on public.research_fitts_export to authenticated;
grant select on public.research_typing_export to authenticated;
grant select on public.research_cognitive_export to authenticated;
grant select on public.research_nasa_tlx_export to authenticated;
grant select on public.research_physical_export to authenticated;
grant select on public.research_event_export to authenticated;

comment on view public.research_session_summary is 'One row per experiment session with participant, assignment, and result counts.';
comment on view public.research_fitts_export is 'Flat Fitts trial export with candidate/session labels.';
comment on view public.research_typing_export is 'Flat typing trial export with candidate/session labels.';
comment on view public.research_cognitive_export is 'Flat cognitive trial export with candidate/session labels.';
comment on view public.research_nasa_tlx_export is 'Flat NASA-TLX export with candidate/session labels.';
comment on view public.research_physical_export is 'Flat physical fatigue export with candidate/session labels.';
comment on view public.research_event_export is 'Flat session event export with candidate/session labels.';

-- Engagement / validation summary (per test: app-switch / time-away + opt-in camera attention).
create table if not exists public.engagement_summary (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid references public.experiment_blocks(id) on delete set null,
    block_number integer check (block_number between 1 and 3),
    step text,
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    app_switch_count integer not null default 0 check (app_switch_count >= 0),
    total_away_ms integer not null default 0 check (total_away_ms >= 0),
    longest_away_ms integer not null default 0 check (longest_away_ms >= 0),
    attentive_percent numeric(6, 2),
    look_away_count integer check (look_away_count is null or look_away_count >= 0),
    camera_used boolean not null default false,
    input_method text,
    participant_code text,
    session_code text,
    record_label text,
    created_at timestamptz not null default now()
);

create index if not exists idx_engagement_session_block on public.engagement_summary(session_id, block_number);
create index if not exists idx_engagement_record_label on public.engagement_summary(record_label);

alter table public.engagement_summary enable row level security;
grant insert on public.engagement_summary to anon;
grant select on public.engagement_summary to authenticated;

drop policy if exists "anon can insert engagement summary" on public.engagement_summary;
create policy "anon can insert engagement summary"
on public.engagement_summary
for insert
to anon
with check (true);

drop policy if exists "researchers can read engagement summary" on public.engagement_summary;
create policy "researchers can read engagement summary"
on public.engagement_summary
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

create or replace view public.research_engagement_export
with (security_invoker = true) as
select
    es.record_label,
    coalesce(es.participant_code, p.participant_code) as participant_code,
    coalesce(es.session_code, s.session_code) as session_code,
    es.session_id,
    es.block_id,
    es.block_number,
    es.step,
    es.duration_ms,
    es.app_switch_count,
    es.total_away_ms,
    es.longest_away_ms,
    es.attentive_percent,
    es.look_away_count,
    es.camera_used,
    es.input_method,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    es.created_at
from public.engagement_summary es
join public.sessions s on s.id = es.session_id
join public.participants p on p.id = s.participant_id;

revoke all on public.research_engagement_export from public;
revoke all on public.research_engagement_export from anon;
grant select on public.research_engagement_export to authenticated;

comment on view public.research_engagement_export is 'Flat per-test engagement/validation export (app-switch / time-away + opt-in camera attention).';

-- Manual + device measurements (ECG / manual physical / Raspberry Pi), written by
-- authenticated researchers from the admin console.
create table if not exists public.manual_measurements (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null,
    session_id uuid references public.sessions(id) on delete set null,
    block_number integer check (block_number is null or block_number between 1 and 3),
    measurement_type text not null,
    source text not null default 'manual',
    heart_rate_bpm numeric(6, 2) check (heart_rate_bpm is null or heart_rate_bpm >= 0),
    hrv_ms numeric(8, 2) check (hrv_ms is null or hrv_ms >= 0),
    value numeric(14, 4),
    unit text,
    notes text,
    data jsonb not null default '{}'::jsonb,
    recorded_by uuid references auth.users(id) on delete set null,
    recorded_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_manual_meas_participant on public.manual_measurements(participant_code);
create index if not exists idx_manual_meas_session on public.manual_measurements(session_id);
create index if not exists idx_manual_meas_type on public.manual_measurements(measurement_type);

alter table public.manual_measurements enable row level security;
grant insert, select on public.manual_measurements to authenticated;

drop policy if exists "researchers can insert manual measurements" on public.manual_measurements;
create policy "researchers can insert manual measurements"
on public.manual_measurements
for insert
to authenticated
with check (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher')
    )
);

drop policy if exists "researchers can read manual measurements" on public.manual_measurements;
create policy "researchers can read manual measurements"
on public.manual_measurements
for select
to authenticated
using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

create or replace view public.research_manual_measurements_export
with (security_invoker = true) as
select
    mm.participant_code,
    mm.session_id,
    mm.block_number,
    mm.measurement_type,
    mm.source,
    mm.heart_rate_bpm,
    mm.hrv_ms,
    mm.value,
    mm.unit,
    mm.notes,
    mm.data,
    mm.recorded_by,
    mm.recorded_at,
    mm.created_at
from public.manual_measurements mm;

revoke all on public.research_manual_measurements_export from public;
revoke all on public.research_manual_measurements_export from anon;
grant select on public.research_manual_measurements_export to authenticated;

comment on view public.research_manual_measurements_export is 'Manual + device (ECG / physical / Raspberry Pi) measurements per candidate.';

-- Participant ID pool (enrollment slots). Researchers pre-generate codes; the
-- participant app claims one atomically. participant_code is intentionally NOT
-- unique so a revoked code can be released and reused.
alter table public.participants drop constraint if exists participants_participant_code_key;

create table if not exists public.participant_slots (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    status text not null default 'available'
        check (status in ('available', 'assigned', 'completed', 'revoked')),
    batch text,
    session_id uuid references public.sessions(id) on delete set null,
    notes text,
    assigned_at timestamptz,
    completed_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_participant_slots_status on public.participant_slots(status);

alter table public.participant_slots enable row level security;
grant select, insert, update on public.participant_slots to authenticated;

drop policy if exists "researchers read slots" on public.participant_slots;
create policy "researchers read slots" on public.participant_slots
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher','viewer')));

drop policy if exists "researchers insert slots" on public.participant_slots;
create policy "researchers insert slots" on public.participant_slots
for insert to authenticated with check (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher')));

drop policy if exists "researchers update slots" on public.participant_slots;
create policy "researchers update slots" on public.participant_slots
for update to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher')));

create or replace function public.claim_participant_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    update public.participant_slots
        set status = 'assigned', assigned_at = now()
        where code = p_code and status = 'available'
        returning id into v_id;

    if v_id is not null then
        return jsonb_build_object('ok', true, 'slot_id', v_id);
    elsif exists (select 1 from public.participant_slots where code = p_code) then
        return jsonb_build_object('ok', false, 'reason', 'taken');
    else
        return jsonb_build_object('ok', false, 'reason', 'unknown');
    end if;
end;
$$;

revoke all on function public.claim_participant_code(text) from public;
grant execute on function public.claim_participant_code(text) to anon, authenticated;

-- Scroll-fatigue measurement (standalone app: phone feed / laptop paper reader).
create table if not exists public.scroll_sessions (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null,
    content_mode text not null default 'feed',
    chosen_duration_min integer not null check (chosen_duration_min > 0),
    actual_duration_ms integer check (actual_duration_ms is null or actual_duration_ms >= 0),
    total_distance_px numeric(14, 2),
    total_scroll_events integer,
    total_pauses integer,
    mean_speed_px_s numeric(12, 2),
    speed_drop_pct numeric(6, 2),
    pause_rise_pct numeric(8, 2),
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
    interval_index integer not null check (interval_index >= 0),
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

create or replace view public.research_scroll_sessions_export
with (security_invoker = true) as
select
    ss.id as scroll_session_id, ss.participant_code, ss.content_mode,
    ss.chosen_duration_min, ss.actual_duration_ms, ss.total_distance_px,
    ss.total_scroll_events, ss.total_pauses, ss.mean_speed_px_s,
    ss.speed_drop_pct, ss.pause_rise_pct, ss.self_rating_start, ss.self_rating_end,
    ss.device_info, ss.started_at, ss.completed_at, ss.created_at
from public.scroll_sessions ss;

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

-- Finalize functions (anon-callable) so the app can mark its own session done.
create or replace function public.finalize_session(p_session_id uuid, p_status text default 'completed')
returns void language plpgsql security definer set search_path = public as $$
begin
    if p_status not in ('completed', 'abandoned', 'invalid') then
        raise exception 'invalid status %', p_status;
    end if;
    update public.sessions
        set status = p_status::public.session_status,
            completed_at = case when p_status = 'completed' then now() else completed_at end
        where id = p_session_id;
end; $$;
revoke all on function public.finalize_session(uuid, text) from public;
grant execute on function public.finalize_session(uuid, text) to anon, authenticated;

create or replace function public.finalize_scroll_session(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.scroll_sessions set
        actual_duration_ms  = coalesce((p->>'actual_duration_ms')::integer, actual_duration_ms),
        total_distance_px   = coalesce((p->>'total_distance_px')::numeric, total_distance_px),
        total_scroll_events = coalesce((p->>'total_scroll_events')::integer, total_scroll_events),
        total_pauses        = coalesce((p->>'total_pauses')::integer, total_pauses),
        mean_speed_px_s     = coalesce((p->>'mean_speed_px_s')::numeric, mean_speed_px_s),
        speed_drop_pct      = coalesce((p->>'speed_drop_pct')::numeric, speed_drop_pct),
        pause_rise_pct      = coalesce((p->>'pause_rise_pct')::numeric, pause_rise_pct),
        self_rating_end     = coalesce((p->>'self_rating_end')::integer, self_rating_end),
        completed_at        = now()
        where id = p_id;
end; $$;
revoke all on function public.finalize_scroll_session(uuid, jsonb) from public;
grant execute on function public.finalize_scroll_session(uuid, jsonb) to anon, authenticated;

-- Per-session data-quality snapshot (completion + attention + app-switch signals).
create or replace view public.research_session_quality
with (security_invoker = true) as
select
    s.id as session_id,
    p.participant_code,
    s.status,
    (s.status = 'completed') as completed,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    count(distinct b.id) as blocks_started,
    count(es.id) as tests_monitored,
    round(avg(es.attentive_percent) filter (where es.camera_used), 1) as avg_attentive_pct,
    coalesce(sum(es.app_switch_count), 0) as total_app_switches,
    coalesce(sum(es.total_away_ms), 0) as total_away_ms,
    s.started_at,
    s.completed_at
from public.sessions s
join public.participants p on p.id = s.participant_id
left join public.experiment_blocks b on b.session_id = s.id
left join public.engagement_summary es on es.session_id = s.id
group by s.id, p.participant_code, s.status, s.final_base_task, s.final_fatigue_track, s.started_at, s.completed_at;

revoke all on public.research_session_quality from public;
revoke all on public.research_session_quality from anon;
grant select on public.research_session_quality to authenticated;

comment on view public.research_session_quality is 'Per-session quality snapshot: completion + attention + app-switch signals.';

commit;
