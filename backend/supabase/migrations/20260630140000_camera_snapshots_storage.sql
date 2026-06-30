-- Phase 3: optional camera snapshots to a private Storage bucket.
--
-- When a participant enables the camera AND ticks the photo-capture consent box,
-- the app uploads a low-resolution JPEG every ~15s to the private 'session-frames'
-- bucket and indexes the path here. Frames are readable only by an admin.

begin;

create table if not exists public.session_frames (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.sessions(id) on delete cascade,
    participant_code text,
    block_number integer,
    storage_path text not null,
    captured_at timestamptz not null default now()
);
create index if not exists idx_session_frames_session on public.session_frames(session_id, captured_at);
alter table public.session_frames enable row level security;
grant insert on public.session_frames to anon;
grant select on public.session_frames to authenticated;

drop policy if exists "anon insert session frames" on public.session_frames;
create policy "anon insert session frames" on public.session_frames
for insert to anon with check (true);

drop policy if exists "admins read session frames" on public.session_frames;
create policy "admins read session frames" on public.session_frames
for select to authenticated using (
    exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role = 'admin'));

-- Private bucket (not publicly readable).
insert into storage.buckets (id, name, public)
values ('session-frames', 'session-frames', false)
on conflict (id) do nothing;

-- Participants (anon) may upload into the bucket; only admins may read.
drop policy if exists "anon upload session frames" on storage.objects;
create policy "anon upload session frames" on storage.objects
for insert to anon, authenticated with check (bucket_id = 'session-frames');

drop policy if exists "admins read session frames storage" on storage.objects;
create policy "admins read session frames storage" on storage.objects
for select to authenticated using (
    bucket_id = 'session-frames'
    and exists (select 1 from public.researcher_profiles rp
        where rp.user_id = (select auth.uid()) and rp.role = 'admin'));

commit;
