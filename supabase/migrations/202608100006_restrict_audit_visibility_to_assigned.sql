drop policy if exists audit_records_select on public.audit_records;
create policy audit_records_select
on public.audit_records
for select
to authenticated
using (
  private.current_user_is_active()
  and private.current_user_can_manage_audit(data -> 'auditors')
);

drop policy if exists audit_evidence_select on storage.objects;
create policy audit_evidence_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'audit-evidence'
  and private.current_user_is_active()
  and exists (
    select 1
    from public.audit_records record
    where record.id::text = pg_catalog.split_part(storage.objects.name, '/', 1)
      and private.current_user_can_manage_audit(record.data -> 'auditors')
  )
);

comment on policy audit_records_select on public.audit_records is
'Administradores consultam todas as auditorias; auditores consultam somente auditorias em que estão designados.';
