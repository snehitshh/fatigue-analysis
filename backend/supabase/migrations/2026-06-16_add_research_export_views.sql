-- Researcher export views for clean Supabase review/download.
-- Paste this into Supabase SQL Editor after schema.sql and record-label migration.
-- Views are authenticated-only and use security_invoker so existing table RLS policies still apply.

begin;

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

commit;