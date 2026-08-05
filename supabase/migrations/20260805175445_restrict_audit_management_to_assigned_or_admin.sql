create or replace function private.current_user_can_manage_audit(auditors jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.current_user_is_admin()
    or exists (
      select 1
      from public.audit_profiles profile
      where profile.id = (select auth.uid())
        and profile.active = true
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements_text(
            case
              when pg_catalog.jsonb_typeof(auditors) = 'array' then auditors
              else '[]'::jsonb
            end
          ) assigned(name)
          where pg_catalog.lower(pg_catalog.btrim(assigned.name))
              = pg_catalog.lower(pg_catalog.btrim(profile.full_name))
        )
    );
$function$;

revoke all on function private.current_user_can_manage_audit(jsonb) from public;
grant execute on function private.current_user_can_manage_audit(jsonb) to authenticated;

drop policy if exists audit_records_update on public.audit_records;

create policy audit_records_update
on public.audit_records
for update
to authenticated
using (
  private.current_user_is_active()
  and (
    (status <> 'Finalizada' and private.current_user_can_manage_audit(data -> 'auditors'))
    or (status = 'Finalizada' and private.current_user_is_admin())
  )
)
with check (private.current_user_is_active());
