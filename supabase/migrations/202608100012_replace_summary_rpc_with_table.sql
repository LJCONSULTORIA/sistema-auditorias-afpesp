create table if not exists public.audit_record_summaries (
  id uuid primary key references public.audit_records(id) on delete cascade,
  location_type text not null default '',
  unit text not null default '',
  checklist_name text not null default '',
  auditors jsonb not null default '[]'::jsonb,
  start_date text not null default '',
  end_date text not null default '',
  status text not null,
  updated_at timestamptz not null
);

alter table public.audit_record_summaries enable row level security;
drop policy if exists audit_record_summaries_select_active on public.audit_record_summaries;
create policy audit_record_summaries_select_active on public.audit_record_summaries
for select to authenticated using (private.current_user_is_active());
revoke all on public.audit_record_summaries from anon, authenticated;
grant select on public.audit_record_summaries to authenticated;

create or replace function private.sync_audit_record_summary()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.audit_record_summaries (
    id, location_type, unit, checklist_name, auditors,
    start_date, end_date, status, updated_at
  ) values (
    new.id,
    pg_catalog.coalesce(new.data ->> 'locationType', ''),
    pg_catalog.coalesce(new.data ->> 'unit', ''),
    pg_catalog.coalesce(new.data ->> 'checklistName', ''),
    case when pg_catalog.jsonb_typeof(new.data -> 'auditors') = 'array'
      then new.data -> 'auditors' else '[]'::jsonb end,
    pg_catalog.coalesce(new.data ->> 'startDate', ''),
    pg_catalog.coalesce(new.data ->> 'endDate', ''),
    new.status,
    new.updated_at
  )
  on conflict (id) do update set
    location_type = excluded.location_type,
    unit = excluded.unit,
    checklist_name = excluded.checklist_name,
    auditors = excluded.auditors,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    status = excluded.status,
    updated_at = excluded.updated_at;
  return new;
end;
$function$;

revoke all on function private.sync_audit_record_summary() from public, anon, authenticated;
drop trigger if exists sync_audit_record_summary on public.audit_records;
create trigger sync_audit_record_summary
after insert or update on public.audit_records
for each row execute function private.sync_audit_record_summary();

insert into public.audit_record_summaries (
  id, location_type, unit, checklist_name, auditors,
  start_date, end_date, status, updated_at
)
select
  record.id,
  pg_catalog.coalesce(record.data ->> 'locationType', ''),
  pg_catalog.coalesce(record.data ->> 'unit', ''),
  pg_catalog.coalesce(record.data ->> 'checklistName', ''),
  case when pg_catalog.jsonb_typeof(record.data -> 'auditors') = 'array'
    then record.data -> 'auditors' else '[]'::jsonb end,
  pg_catalog.coalesce(record.data ->> 'startDate', ''),
  pg_catalog.coalesce(record.data ->> 'endDate', ''),
  record.status,
  record.updated_at
from public.audit_records record
on conflict (id) do update set
  location_type = excluded.location_type,
  unit = excluded.unit,
  checklist_name = excluded.checklist_name,
  auditors = excluded.auditors,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  updated_at = excluded.updated_at;

revoke all on function public.list_audit_summaries() from public, anon, authenticated;
