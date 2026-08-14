create or replace function private.audit_checklist_is_in_use(checklist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1
      from public.audit_records record
      where record.data ->> 'checklistId' = checklist_id::text
    )
    or exists (
      select 1
      from public.audits audit
      where audit.checklist_id = checklist_id
    );
$function$;

revoke all on function private.audit_checklist_is_in_use(uuid) from public, anon;
grant execute on function private.audit_checklist_is_in_use(uuid) to authenticated;

drop policy if exists audit_checklists_delete on public.audit_checklists;
create policy audit_checklists_delete
on public.audit_checklists
for delete
to authenticated
using (
  private.current_user_is_active()
  and not private.audit_checklist_is_in_use(id)
);

comment on function private.audit_checklist_is_in_use(uuid) is
'Impede a exclusão de checklists vinculados tanto ao modelo atual audit_records quanto às tabelas legadas.';

create index if not exists audit_notifications_audit_record_id_idx
on public.audit_notifications(audit_record_id);
