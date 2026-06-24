-- Per-session data-quality view for the console (go / no-go at a glance).
-- Combines session completion with the engagement signals so a researcher can tell,
-- per candidate, whether the data is trustworthy: did they finish, were they looking
-- at the screen, did they keep leaving the app.
--
-- Run once in the Supabase SQL Editor (fresh setups get it from schema.sql).

begin;

drop view if exists public.research_session_quality;
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
