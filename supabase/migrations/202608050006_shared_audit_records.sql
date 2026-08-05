create table if not exists public.audit_records (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'Programada'
    check (status = any (array['Programada', 'Em andamento', 'Finalizada'])),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_by uuid not null references public.audit_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audit_records_status_idx on public.audit_records(status);
create index if not exists audit_records_updated_idx on public.audit_records(updated_at desc);
alter table public.audit_records enable row level security;

create policy audit_records_select on public.audit_records for select to authenticated
  using (private.current_user_is_active());
create policy audit_records_insert on public.audit_records for insert to authenticated
  with check (private.current_user_is_active() and created_by = (select auth.uid()));
create policy audit_records_update on public.audit_records for update to authenticated
  using (private.current_user_is_active() and (status <> 'Finalizada' or private.current_user_is_admin()))
  with check (private.current_user_is_active());
create policy audit_records_delete on public.audit_records for delete to authenticated
  using (private.current_user_is_active() and (status <> 'Finalizada' or private.current_user_is_admin()));

grant select, insert, update, delete on public.audit_records to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audit-evidence', 'audit-evidence', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy audit_evidence_select on storage.objects for select to authenticated
  using (bucket_id = 'audit-evidence' and private.current_user_is_active());
create policy audit_evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-evidence' and private.current_user_is_active());
create policy audit_evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audit-evidence' and private.current_user_is_active());
