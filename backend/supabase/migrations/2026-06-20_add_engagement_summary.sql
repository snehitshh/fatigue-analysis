-- Engagement / validation summary (Stage 1: scroll + app-switch signals).
-- One row per test, tagged with block + step, so researchers can judge whether a
-- participant was actually engaged during each measurement. Camera-attention
-- columns (attentive_percent, look_away_count, camera_used) are reserved for a
-- future Stage 2 and stay null/false for now.
--
-- Run once in the Supabase SQL Editor on databases created before this change.
-- Fresh setups get this automatically from schema.sql.

begin;

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

commit;
