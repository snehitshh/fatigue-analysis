-- Phase 1: researcher access approval queue + append-only audit log.
--
-- New accounts default to the 'pending' role, which is outside the allowed set
-- ('admin','researcher','viewer') used by every researcher RLS policy, so a
-- pending/denied account is automatically denied all study data with no policy
-- changes. An admin approves an account by granting it a real role.

-- Enum values must be added and committed before they are used below. These run
-- outside the transaction (ADD VALUE cannot be used in the same transaction it
-- is created in).
alter type public.researcher_role add value if not exists 'pending';
alter type public.researcher_role add value if not exists 'denied';

begin;

-- Approval metadata; default new rows to 'pending'.
alter table public.researcher_profiles
    add column if not exists requested_at timestamptz not null default now(),
    add column if not exists approved_by uuid references auth.users(id),
    add column if not exists approved_at timestamptz;
alter table public.researcher_profiles alter column role set default 'pending';

-- Append-only audit trail.
create table if not exists public.audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references auth.users(id),
    actor_email text,
    action text not null,
    target text,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

drop policy if exists "admins read audit log" on public.audit_log;
create policy "admins read audit log" on public.audit_log
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role = 'admin'));

-- Write an audit entry (approved researchers only); append-only via definer fn.
create or replace function public.log_audit(p_action text, p_target text default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_email text;
begin
    if v_uid is null then raise exception 'must be signed in'; end if;
    if not exists (select 1 from public.researcher_profiles rp
        where rp.user_id = v_uid and rp.role in ('admin','researcher','viewer')) then
        raise exception 'not authorized';
    end if;
    select email into v_email from auth.users where id = v_uid;
    insert into public.audit_log(actor_user_id, actor_email, action, target, detail)
    values (v_uid, v_email, p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end; $$;
revoke all on function public.log_audit(text, text, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, jsonb) to authenticated;

-- A signed-in user with no profile requests access (creates a pending row).
create or replace function public.request_researcher_access(p_full_name text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
    if v_uid is null then raise exception 'must be signed in'; end if;
    insert into public.researcher_profiles(user_id, full_name, role, requested_at)
    values (v_uid, nullif(trim(coalesce(p_full_name, '')), ''), 'pending', now())
    on conflict (user_id) do nothing;
    return (select role::text from public.researcher_profiles where user_id = v_uid);
end; $$;
revoke all on function public.request_researcher_access(text) from public, anon;
grant execute on function public.request_researcher_access(text) to authenticated;

-- Admin: list all researcher accounts (with emails) for the approval queue.
create or replace function public.admin_list_researchers()
returns table (user_id uuid, email text, full_name text, role text, requested_at timestamptz, approved_at timestamptz, approved_by_email text)
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role = 'admin') then
        raise exception 'admin only';
    end if;
    return query
    select rp.user_id, u.email::text, rp.full_name, rp.role::text, rp.requested_at, rp.approved_at, au.email::text
    from public.researcher_profiles rp
    join auth.users u on u.id = rp.user_id
    left join auth.users au on au.id = rp.approved_by
    order by (rp.role = 'pending') desc, rp.requested_at desc;
end; $$;
revoke all on function public.admin_list_researchers() from public, anon;
grant execute on function public.admin_list_researchers() to authenticated;

-- Admin: approve a pending account with a role.
create or replace function public.approve_researcher(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := (select auth.uid());
begin
    if not exists (select 1 from public.researcher_profiles rp
        where rp.user_id = v_admin and rp.role = 'admin') then
        raise exception 'admin only';
    end if;
    if p_role not in ('admin','researcher','viewer') then raise exception 'invalid role %', p_role; end if;
    update public.researcher_profiles
        set role = p_role::public.researcher_role, approved_by = v_admin, approved_at = now()
        where user_id = p_user_id;
    perform public.log_audit('approve_researcher', p_user_id::text, jsonb_build_object('role', p_role));
end; $$;
revoke all on function public.approve_researcher(uuid, text) from public, anon;
grant execute on function public.approve_researcher(uuid, text) to authenticated;

-- Admin: deny / revoke an account (cannot deny self).
create or replace function public.set_researcher_denied(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := (select auth.uid());
begin
    if not exists (select 1 from public.researcher_profiles rp
        where rp.user_id = v_admin and rp.role = 'admin') then
        raise exception 'admin only';
    end if;
    if p_user_id = v_admin then raise exception 'cannot deny your own account'; end if;
    update public.researcher_profiles
        set role = 'denied', approved_by = v_admin, approved_at = now()
        where user_id = p_user_id;
    perform public.log_audit('deny_researcher', p_user_id::text, '{}'::jsonb);
end; $$;
revoke all on function public.set_researcher_denied(uuid) from public, anon;
grant execute on function public.set_researcher_denied(uuid) to authenticated;

commit;
