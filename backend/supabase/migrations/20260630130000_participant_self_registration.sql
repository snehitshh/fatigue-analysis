-- Phase 2: participant self-registration with an auto-assigned ID, de-duplicated
-- by email (no verification step). Contact details live in their own table,
-- separate from the research tables (which only ever see participant_code), and
-- are readable only by an admin.

begin;

create table if not exists public.participant_contacts (
    id uuid primary key default gen_random_uuid(),
    participant_code text not null unique,
    email_normalized text not null unique,
    email text not null,
    full_name text,
    phone text,
    created_at timestamptz not null default now()
);
alter table public.participant_contacts enable row level security;
revoke all on public.participant_contacts from public, anon, authenticated;
grant select on public.participant_contacts to authenticated;

drop policy if exists "admins read participant contacts" on public.participant_contacts;
create policy "admins read participant contacts" on public.participant_contacts
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role = 'admin'));

-- Auto-issue a unique participant code; re-registering the same email returns
-- the same code so a person can never hold two IDs. Anon-callable (the SECURITY
-- DEFINER function bypasses RLS to write the admin-only contacts table).
create or replace function public.register_participant(p_email text, p_full_name text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_existing text;
    v_code text;
    v_try int := 0;
begin
    if v_email = '' or position('@' in v_email) = 0
       or position('.' in split_part(v_email, '@', 2)) = 0 then
        raise exception 'invalid email';
    end if;

    select participant_code into v_existing from public.participant_contacts where email_normalized = v_email;
    if v_existing is not null then
        return jsonb_build_object('code', v_existing, 'already_registered', true);
    end if;

    loop
        v_try := v_try + 1;
        v_code := 'FP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        exit when not exists (select 1 from public.participant_contacts where participant_code = v_code)
              and not exists (select 1 from public.participants where participant_code = v_code);
        if v_try > 20 then raise exception 'could not allocate a participant code'; end if;
    end loop;

    insert into public.participant_contacts(participant_code, email_normalized, email, full_name, phone)
    values (v_code, v_email, trim(p_email), nullif(trim(coalesce(p_full_name, '')), ''), nullif(trim(coalesce(p_phone, '')), ''));

    return jsonb_build_object('code', v_code, 'already_registered', false);
exception when unique_violation then
    select participant_code into v_existing from public.participant_contacts where email_normalized = v_email;
    return jsonb_build_object('code', v_existing, 'already_registered', true);
end; $$;
revoke all on function public.register_participant(text, text, text) from public;
grant execute on function public.register_participant(text, text, text) to anon, authenticated;

commit;
