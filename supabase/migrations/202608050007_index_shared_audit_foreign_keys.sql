create index if not exists audit_document_imports_imported_by_idx
  on public.audit_document_imports(imported_by);

create index if not exists audit_records_created_by_idx
  on public.audit_records(created_by);
