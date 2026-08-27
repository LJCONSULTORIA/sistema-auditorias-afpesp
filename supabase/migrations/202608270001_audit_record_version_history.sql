create table if not exists public.audit_record_versions (
  id bigint generated always as identity primary key,
  audit_record_id uuid not null references public.audit_records(id) on delete cascade,
  status text not null,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users(id)
);

create index if not exists audit_record_versions_record_saved_idx
  on public.audit_record_versions (audit_record_id, saved_at desc);
create index if not exists audit_record_versions_saved_by_idx
  on public.audit_record_versions (saved_by);

alter table public.audit_record_versions enable row level security;

create policy "assigned auditors and admins read audit versions"
  on public.audit_record_versions for select
  to authenticated
  using (
    exists (
      select 1
      from public.audit_profiles profile
      where profile.id = (select auth.uid())
        and profile.active
        and (
          profile.role = 'admin'
          or lower(profile.full_name) in (
            select lower(value)
            from jsonb_array_elements_text(coalesce(audit_record_versions.data->'auditors', '[]'::jsonb)) value
          )
        )
    )
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.capture_audit_record_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_record_versions (audit_record_id, status, data, saved_at, saved_by)
  values (old.id, old.status, old.data, old.updated_at, (select auth.uid()));
  return new;
end;
$$;

revoke all on function private.capture_audit_record_version() from public, anon, authenticated;

drop trigger if exists capture_audit_record_version_before_update on public.audit_records;
create trigger capture_audit_record_version_before_update
before update on public.audit_records
for each row execute function private.capture_audit_record_version();
