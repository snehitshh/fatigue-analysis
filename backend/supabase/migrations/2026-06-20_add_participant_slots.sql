-- Participant ID pool (enrollment slots).
--
-- Researchers pre-generate a pool of participant codes from the admin console.
-- A participant claims their assigned code atomically via claim_participant_code()
-- (so two people can never share a code, and unknown codes are rejected). When a
-- participant is revoked, the code can be RELEASED back to 'available' for reuse.
--
-- To allow that reuse, participants.participant_code is no longer unique (the real
-- key is the participant id / unique session_code); a released code can therefore
-- be reused without clashing with the prior (revoked) participant's data.
--
-- Run once in the Supabase SQL Editor. Fresh setups get this from schema.sql.

begin;

-- Allow a code to be reused after revoke (drop the unique, keep a plain index).
alter table public.participants drop constraint if exists participants_participant_code_key;
create index if not exists idx_participants_code on public.participants(participant_code);

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

-- Researchers manage the pool (generate / revoke / release).
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

-- Atomic claim for the (anonymous) participant app. SECURITY DEFINER so it can
-- update the slot without exposing the whole pool to anon. Returns a JSON result.
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

commit;
