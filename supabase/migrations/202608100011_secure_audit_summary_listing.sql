create or replace function public.list_audit_summaries()
returns table (
  id uuid,
  location_type text,
  unit text,
  checklist_name text,
  auditors jsonb,
  start_date text,
  end_date text,
  status text,
  updated_at timestamptz,
  can_access boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    record.id,
    record.data ->> 'locationType',
    record.data ->> 'unit',
    record.data ->> 'checklistName',
    case when pg_catalog.jsonb_typeof(record.data -> 'auditors') = 'array'
      then record.data -> 'auditors' else '[]'::jsonb end,
    record.data ->> 'startDate',
    record.data ->> 'endDate',
    record.status,
    record.updated_at,
    private.current_user_can_manage_audit(record.data -> 'auditors')
  from public.audit_records record
  where private.current_user_is_active()
  order by record.updated_at desc;
$function$;

revoke all on function public.list_audit_summaries() from public, anon;
grant execute on function public.list_audit_summaries() to authenticated;
