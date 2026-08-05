drop policy if exists audit_document_imports_insert on public.audit_document_imports;
create policy audit_document_imports_insert on public.audit_document_imports
  for insert to authenticated
  with check (private.current_user_is_active() and imported_by = (select auth.uid()));

grant insert on public.audit_document_imports to authenticated;

alter function public.import_audit_master(jsonb, text) security invoker;
