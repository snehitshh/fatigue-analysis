-- Manual + device measurements (ECG, manual physical results, and later Raspberry Pi).
-- Researchers UPLOAD these from the admin console for a given candidate; the same
-- table also receives automated uploads (source = 'raspberry_pi'). Unlike the
-- participant trial tables (anon insert), this is written by AUTHENTICATED
-- researchers only.
--
-- Run once in the Supabase SQL Editor. Fresh setups get this from schema.sql.

begin;

create table if not exists public.manual_measurements (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null,
    session_id uuid references public.sessions(id) on delete set null,
    block_number integer check (block_number is null or block_number between 1 and 3),
    measurement_type text not null,          -- 'ecg' | 'physical' | other
    source text not null default 'manual',   -- 'manual' | 'raspberry_pi'
    heart_rate_bpm numeric(6, 2) check (heart_rate_bpm is null or heart_rate_bpm >= 0),
    hrv_ms numeric(8, 2) check (hrv_ms is null or hrv_ms >= 0),
    value numeric(14, 4),                     -- generic numeric result (e.g. physical metric)
    unit text,
    notes text,
    data jsonb not null default '{}'::jsonb,  -- raw / extra fields
    recorded_by uuid references auth.users(id) on delete set null,
    recorded_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_manual_meas_participant on public.manual_measurements(participant_code);
create index if not exists idx_manual_meas_session on public.manual_measurements(session_id);
create index if not exists idx_manual_meas_type on public.manual_measurements(measurement_type);

alter table public.manual_measurements enable row level security;
grant insert, select on public.manual_measurements to authenticated;

-- Only authenticated researchers (with a profile) may insert.
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

drop view if exists public.research_manual_measurements_export;
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

commit;
