create index audit_documents_created_by_idx on public.audit_documents(created_by);
create index audit_checklists_created_by_idx on public.audit_checklists(created_by);
create index audits_checklist_idx on public.audits(checklist_id);
create index audits_created_by_idx on public.audits(created_by);
create index audit_photos_created_by_idx on public.audit_photos(created_by);
