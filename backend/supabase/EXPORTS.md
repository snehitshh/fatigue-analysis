# Research Export Views

Run this after the base schema if your Supabase database already exists:

```text
backend/supabase/migrations/2026-06-16_add_research_export_views.sql
```

Fresh setups do not need a separate step because the same views are included in `backend/supabase/schema.sql`.

## Views Created

- `public.research_session_summary` - one row per participant session with assignment, demographics, counts, and average NASA-TLX score.
- `public.research_fitts_export` - flat Fitts trial data.
- `public.research_typing_export` - flat typing trial data.
- `public.research_cognitive_export` - flat cognitive trial data.
- `public.research_nasa_tlx_export` - flat NASA-TLX responses.
- `public.research_physical_export` - flat physical fatigue logs.
- `public.research_event_export` - session events such as overrides, skipped breaks, and completion.

Each export includes `participant_code`, `session_code`, and `record_label` so rows are easy to identify by candidate, session, block, and sequence.

## Useful Queries

Session overview:

```sql
select *
from public.research_session_summary
order by started_at desc;
```

All Fitts trials for one candidate:

```sql
select *
from public.research_fitts_export
where participant_code = 'CANDIDATE_ID_HERE'
order by session_code, block_number, minute_number, trial_in_minute;
```

All typing trials for one candidate:

```sql
select *
from public.research_typing_export
where participant_code = 'CANDIDATE_ID_HERE'
order by session_code, block_number, minute_number, sentence_number;
```

All cognitive trials for one candidate:

```sql
select *
from public.research_cognitive_export
where participant_code = 'CANDIDATE_ID_HERE'
order by session_code, block_number, test_type, phase_label, trial_number;
```

NASA-TLX scores by candidate and block:

```sql
select participant_code, session_code, block_number, overall_score
from public.research_nasa_tlx_export
order by participant_code, session_code, block_number;
```

## Access Control

These views are granted only to `authenticated`, not `anon`.

They use `security_invoker = true`, so the existing Row Level Security policies on the underlying tables still decide whether a signed-in researcher can read the rows. Create a Supabase Auth user and add that user's UUID to `public.researcher_profiles` before expecting data to appear in these views.