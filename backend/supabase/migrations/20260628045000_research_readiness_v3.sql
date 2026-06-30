-- Research-readiness v3. Prepared locally; apply after reviewing the deployment
-- checklist in docs/research/PROTOCOL_V3.md.
begin;

alter table public.sessions
    add column if not exists randomization_seed text,
    add column if not exists protocol_config jsonb not null default '{}'::jsonb,
    add column if not exists client_build text,
    add column if not exists participant_slot_id uuid references public.participant_slots(id) on delete set null;

alter table public.fitts_trials add column if not exists metric_version text not null default 'fitts-v3';
alter table public.typing_trials add column if not exists metric_version text not null default 'typing-v3';
alter table public.cognitive_trials add column if not exists metric_version text not null default 'cognitive-v3';
alter table public.scroll_intervals add column if not exists metric_version text not null default 'scroll-v3';
alter table public.engagement_summary add column if not exists metric_version text not null default 'attention-exploratory-v1';

create index if not exists idx_sessions_participant_slot on public.sessions(participant_slot_id);

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
    if p_status = 'completed' then
        update public.participant_slots ps
            set status = 'completed', session_id = p_session_id, completed_at = now()
            from public.sessions s
            where s.id = p_session_id and ps.id = s.participant_slot_id;
    end if;
end; $$;
revoke all on function public.finalize_session(uuid, text) from public;
grant execute on function public.finalize_session(uuid, text) to anon, authenticated;

alter table public.scroll_sessions drop constraint if exists scroll_sessions_self_rating_start_check;
alter table public.scroll_sessions drop constraint if exists scroll_sessions_self_rating_end_check;
alter table public.scroll_sessions
    add constraint scroll_sessions_self_rating_start_check check (self_rating_start is null or self_rating_start between 1 and 9),
    add constraint scroll_sessions_self_rating_end_check check (self_rating_end is null or self_rating_end between 1 and 9);
alter table public.scroll_intervals drop constraint if exists scroll_intervals_self_rating_check;
alter table public.scroll_intervals
    add constraint scroll_intervals_self_rating_check check (self_rating is null or self_rating between 1 and 9);

create table if not exists public.fatigue_ratings (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid references public.experiment_blocks(id) on delete set null,
    block_number integer not null check (block_number between 1 and 3),
    stage text not null check (stage in ('pre_block', 'post_block')),
    kss_score integer not null check (kss_score between 1 and 9),
    kss_label text not null,
    protocol_version text not null default '3.0.0',
    participant_code text,
    session_code text,
    record_label text,
    recorded_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (session_id, block_number, stage)
);

create index if not exists idx_fatigue_ratings_session_block
    on public.fatigue_ratings(session_id, block_number, stage);

alter table public.fatigue_ratings enable row level security;
grant insert on public.fatigue_ratings to anon;
grant select on public.fatigue_ratings to authenticated;

drop policy if exists "anon insert fatigue ratings" on public.fatigue_ratings;
create policy "anon insert fatigue ratings" on public.fatigue_ratings
for insert to anon with check (true);

drop policy if exists "researchers read fatigue ratings" on public.fatigue_ratings;
create policy "researchers read fatigue ratings" on public.fatigue_ratings
for select to authenticated using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop view if exists public.research_fatigue_ratings_export;
create view public.research_fatigue_ratings_export
with (security_invoker = true) as
select
    fr.id,
    fr.session_id,
    fr.block_id,
    coalesce(fr.participant_code, p.participant_code) as participant_code,
    coalesce(fr.session_code, s.session_code) as session_code,
    fr.block_number,
    fr.stage,
    fr.kss_score,
    fr.kss_label,
    fr.protocol_version,
    s.randomization_seed,
    s.protocol_config,
    fr.recorded_at,
    fr.created_at
from public.fatigue_ratings fr
join public.sessions s on s.id = fr.session_id
join public.participants p on p.id = s.participant_id;

revoke all on public.research_fatigue_ratings_export from public, anon;
grant select on public.research_fatigue_ratings_export to authenticated;

drop view if exists public.research_session_protocol_export;
create view public.research_session_protocol_export
with (security_invoker = true) as
select
    s.id as session_id,
    p.participant_code,
    s.session_code,
    s.randomization_seed,
    s.protocol_config,
    s.client_build,
    s.participant_slot_id,
    s.original_base_task,
    s.original_fatigue_track,
    s.final_base_task,
    s.final_fatigue_track,
    s.started_at,
    s.completed_at
from public.sessions s
join public.participants p on p.id = s.participant_id;
revoke all on public.research_session_protocol_export from public, anon;
grant select on public.research_session_protocol_export to authenticated;

drop view if exists public.research_metric_versions_export;
create view public.research_metric_versions_export
with (security_invoker = true) as
select 'fitts'::text as dataset, id as record_id, session_id, block_number, metric_version from public.fitts_trials
union all select 'typing', id, session_id, block_number, metric_version from public.typing_trials
union all select 'cognitive', id, session_id, block_number, metric_version from public.cognitive_trials
union all select 'engagement', id, session_id, block_number, metric_version from public.engagement_summary;
revoke all on public.research_metric_versions_export from public, anon;
grant select on public.research_metric_versions_export to authenticated;

-- Reserved for a future Edge Function that exchanges a one-time participant
-- capability for validated writes. It is deliberately not exposed to Data API roles.
create table if not exists public.experiment_capabilities (
    session_id uuid primary key references public.sessions(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);
alter table public.experiment_capabilities enable row level security;
revoke all on public.experiment_capabilities from public, anon, authenticated;

-- Aggregate each one-to-many relation before joining so app-switch totals are
-- not multiplied by the number of experiment blocks.
drop view if exists public.research_session_quality;
create view public.research_session_quality
with (security_invoker = true) as
with block_counts as (
    select session_id, count(*) as blocks_started
    from public.experiment_blocks
    group by session_id
), engagement as (
    select
        session_id,
        count(*) as tests_monitored,
        round(avg(attentive_percent) filter (where camera_used), 1) as avg_attentive_pct,
        coalesce(sum(app_switch_count), 0) as total_app_switches,
        coalesce(sum(total_away_ms), 0) as total_away_ms
    from public.engagement_summary
    group by session_id
)
select
    s.id as session_id,
    p.participant_code,
    s.status,
    (s.status = 'completed') as completed,
    s.final_base_task::text as final_base_task,
    s.final_fatigue_track::text as final_fatigue_track,
    coalesce(bc.blocks_started, 0) as blocks_started,
    coalesce(e.tests_monitored, 0) as tests_monitored,
    e.avg_attentive_pct,
    coalesce(e.total_app_switches, 0) as total_app_switches,
    coalesce(e.total_away_ms, 0) as total_away_ms,
    s.started_at,
    s.completed_at
from public.sessions s
join public.participants p on p.id = s.participant_id
left join block_counts bc on bc.session_id = s.id
left join engagement e on e.session_id = s.id;

revoke all on public.research_session_quality from public, anon;
grant select on public.research_session_quality to authenticated;

commit;
