-- SPARC procedure adds a BASELINE questionnaire point (before any task), tagged
-- block 0. Allow block_number 0 on the questionnaire tables, and let a NASA-TLX row
-- have no experiment_block (baseline has none). Applied live via execute_sql.
begin;

do $$
declare c record;
begin
  for c in select conname, conrelid::regclass::text as tbl from pg_constraint
    where contype='c'
      and conrelid in ('public.nasa_tlx_responses'::regclass,'public.fatigue_ratings'::regclass)
      and pg_get_constraintdef(oid) like '%block_number >= 1%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.nasa_tlx_responses add constraint nasa_block_range check (block_number between 0 and 3);
alter table public.fatigue_ratings   add constraint fatigue_block_range check (block_number between 0 and 3);
alter table public.nasa_tlx_responses alter column block_id drop not null;

commit;
