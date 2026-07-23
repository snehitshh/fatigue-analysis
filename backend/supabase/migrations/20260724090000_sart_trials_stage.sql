-- Add a pre_session scroll test (before block 1 starts) alongside the
-- existing post_block ones, so a session gets 4 scroll tests total:
-- start, block 1, block 2, block 3 (= end). Mirrors fatigue_ratings/
-- borg_ratings' block_number + stage pattern so the same block_number can be
-- reused by both the pre_session and post_block instance for block 1.
begin;

alter table public.sart_trials
    add column if not exists stage text not null default 'post_block'
    check (stage in ('pre_session', 'post_block'));

alter table public.sart_trials drop constraint if exists sart_trials_session_id_block_number_trial_number_key;
alter table public.sart_trials
    add constraint sart_trials_session_block_stage_trial_key
    unique (session_id, block_number, stage, trial_number);

drop view if exists public.research_sart_export;
create view public.research_sart_export
with (security_invoker = true) as
select
    st.id, st.session_id, st.block_id,
    coalesce(st.participant_code, p.participant_code) as participant_code,
    coalesce(st.session_code, s.session_code) as session_code,
    st.record_label, st.block_number, st.stage, st.trial_number, st.digit,
    st.is_target, st.responded, st.correct, st.reaction_time_ms,
    st.elapsed_time_in_block_ms, st.input_method, st.metric_version, st.created_at
from public.sart_trials st
join public.sessions s on s.id = st.session_id
join public.participants p on p.id = s.participant_id;

revoke all on public.research_sart_export from public, anon;
grant select on public.research_sart_export to authenticated;

comment on view public.research_sart_export is 'SART scrolling attention-test trials: digit, go/no-go correctness, reaction time, pre_session/post_block stage.';

commit;
