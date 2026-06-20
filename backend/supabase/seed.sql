-- Optional seed after creating a researcher account in Supabase Auth.
-- Replace the UUID with the auth.users.id value from Authentication > Users.

insert into public.researcher_profiles (user_id, full_name, role)
values ('00000000-0000-0000-0000-000000000000', 'Lead Researcher', 'admin')
on conflict (user_id) do update
set full_name = excluded.full_name,
    role = excluded.role;
