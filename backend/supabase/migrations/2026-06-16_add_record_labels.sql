-- Add human-readable identifiers to experiment result tables.
-- Paste this into Supabase SQL Editor if you already ran backend/supabase/schema.sql before this migration existed.

begin;

alter table public.experiment_blocks
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.session_events
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.fitts_trials
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.typing_trials
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.nasa_tlx_responses
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.cognitive_trials
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

alter table public.physical_fatigue_logs
    add column if not exists participant_code text,
    add column if not exists session_code text,
    add column if not exists record_label text;

create index if not exists idx_blocks_record_label on public.experiment_blocks(record_label);
create index if not exists idx_events_record_label on public.session_events(record_label);
create index if not exists idx_fitts_record_label on public.fitts_trials(record_label);
create index if not exists idx_typing_record_label on public.typing_trials(record_label);
create index if not exists idx_nasa_record_label on public.nasa_tlx_responses(record_label);
create index if not exists idx_cognitive_record_label on public.cognitive_trials(record_label);
create index if not exists idx_physical_record_label on public.physical_fatigue_logs(record_label);

commit;
