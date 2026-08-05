drop policy if exists audit_records_delete on public.audit_records;

create policy audit_records_delete
on public.audit_records
for delete
to authenticated
using (
  private.current_user_is_active()
  and private.current_user_is_admin()
);

drop policy if exists audits_delete on public.audits;

create policy audits_delete
on public.audits
for delete
to authenticated
using (
  private.current_user_is_active()
  and private.current_user_is_admin()
);
