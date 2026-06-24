-- Finalize functions so the anonymous app can mark a session done without UPDATE
-- rights on the tables. SECURITY DEFINER + WHERE id = <the row the app created>,
-- so the app can only finalize its own row (whose UUID it generated).
--
-- Why: without this, sessions.status / completed_at stay stale ('in_progress'
-- forever) and analysts can't tell which sessions truly finished. The scroll app
-- can now upload intervals live and set the session totals at the end.

begin;

-- Main experiment: mark a session completed or abandoned.
create or replace function public.finalize_session(p_session_id uuid, p_status text default 'completed')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_status not in ('completed', 'abandoned', 'invalid') then
        raise exception 'invalid status %', p_status;
    end if;
    update public.sessions
        set status = p_status::public.session_status,
            completed_at = case when p_status = 'completed' then now() else completed_at end
        where id = p_session_id;
end;
$$;

revoke all on function public.finalize_session(uuid, text) from public;
grant execute on function public.finalize_session(uuid, text) to anon, authenticated;

-- Scroll study: set the session totals + end rating after live interval uploads.
create or replace function public.finalize_scroll_session(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;

revoke all on function public.finalize_scroll_session(uuid, jsonb) from public;
grant execute on function public.finalize_scroll_session(uuid, jsonb) to anon, authenticated;

commit;
