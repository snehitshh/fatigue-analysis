-- Scrolling Attention Test (SART) trials. Universal step: runs once per
-- block for every session, independent of the cognitive/physical fatigue
-- track. Mirrors cognitive_trials.
begin;

create table if not exists public.sart_trials (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    block_id uuid not null references public.experiment_blocks(id) on delete cascade,
    block_number integer not null check (block_number between 1 and 3),
    trial_number integer not null check (trial_number >= 1),
    digit integer not null check (digit between 0 and 9),
    is_target boolean not null default false,
    responded boolean not null default false,
    correct boolean not null,
    reaction_time_ms numeric(12, 2),
    elapsed_time_in_block_ms integer check (elapsed_time_in_block_ms is null or elapsed_time_in_block_ms >= 0),
    input_method text,
    metric_version text not null default 'sart-v1',
    participant_code text,
    session_code text,
    record_label text,
    created_at timestamptz not null default now(),
    unique (session_id, block_number, trial_number)
);

create index if not exists idx_sart_session_block on public.sart_trials(session_id, block_number);
create index if not exists idx_sart_record_label on public.sart_trials(record_label);

alter table public.sart_trials enable row level security;
grant insert on public.sart_trials to anon;
grant select on public.sart_trials to authenticated;

drop policy if exists "anon can insert sart trials" on public.sart_trials;
create policy "anon can insert sart trials" on public.sart_trials
for insert to anon with check (true);

drop policy if exists "researchers can read sart trials" on public.sart_trials;
create policy "researchers can read sart trials" on public.sart_trials
for select to authenticated using (
    exists (
        select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid())
          and rp.role in ('admin', 'researcher', 'viewer')
    )
);

drop view if exists public.research_sart_export;
create view public.research_sart_export
with (security_invoker = true) as
select
    st.id, st.session_id, st.block_id,
    coalesce(st.participant_code, p.participant_code) as participant_code,
    coalesce(st.session_code, s.session_code) as session_code,
    st.record_label, st.block_number, st.trial_number, st.digit, st.is_target,
    st.responded, st.correct, st.reaction_time_ms, st.elapsed_time_in_block_ms,
    st.input_method, st.metric_version, st.created_at
from public.sart_trials st
join public.sessions s on s.id = st.session_id
join public.participants p on p.id = s.participant_id;

revoke all on public.research_sart_export from public, anon;
grant select on public.research_sart_export to authenticated;

comment on view public.research_sart_export is 'SART scrolling attention-test trials: digit, go/no-go correctness, reaction time.';

commit;
