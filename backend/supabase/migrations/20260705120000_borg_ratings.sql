-- Borg CR10 perceived-exertion ratings, compulsory alongside NASA-TLX and KSS.
-- Mirrors fatigue_ratings (KSS). borg_score is 0-10 (Borg CR10 allows 0 and 0.5).
begin;

create table if not exists public.borg_ratings (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.sessions(id) on delete cascade,
    block_id uuid references public.experiment_blocks(id) on delete set null,
    block_number integer,
    stage text,
    borg_score numeric not null check (borg_score between 0 and 10),
    borg_label text,
    protocol_version text default '3.0.0',
    participant_code text,
    session_code text,
    record_label text,
    recorded_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);
create index if not exists idx_borg_ratings_session on public.borg_ratings(session_id, block_number, stage);
alter table public.borg_ratings enable row level security;
grant insert on public.borg_ratings to anon;
grant select on public.borg_ratings to authenticated;

drop policy if exists "anon insert borg ratings" on public.borg_ratings;
create policy "anon insert borg ratings" on public.borg_ratings
for insert to anon with check (true);

drop policy if exists "researchers read borg ratings" on public.borg_ratings;
create policy "researchers read borg ratings" on public.borg_ratings
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role in ('admin','researcher','viewer')));

drop view if exists public.research_borg_ratings_export;
create view public.research_borg_ratings_export
with (security_invoker = true) as
select br.id, br.session_id, br.block_id, coalesce(br.participant_code, p.participant_code) as participant_code,
    coalesce(br.session_code, s.session_code) as session_code, br.block_number, br.stage,
    br.borg_score, br.borg_label, br.protocol_version, br.recorded_at, br.created_at
from public.borg_ratings br
left join public.sessions s on s.id = br.session_id
left join public.participants p on p.id = s.participant_id;
revoke all on public.research_borg_ratings_export from public, anon;
grant select on public.research_borg_ratings_export to authenticated;

commit;
