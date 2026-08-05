create table public.audit_allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  full_name text not null,
  role text not null default 'auditor' check (role in ('admin', 'auditor')),
  active boolean not null default true,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.audit_profiles
add column must_change_password boolean not null default true;

create index audit_allowed_users_active_idx on public.audit_allowed_users(active, email);

create trigger set_audit_allowed_users_updated_at
before update on public.audit_allowed_users
for each row execute function private.set_updated_at();

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.audit_profiles
    where id = (select auth.uid())
      and active = true
  );
$$;

revoke all on function private.current_user_is_active() from public;
grant execute on function private.current_user_is_active() to authenticated;

create or replace function private.handle_new_audit_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed public.audit_allowed_users%rowtype;
begin
  select * into allowed
  from public.audit_allowed_users
  where email = lower(new.email)
    and active = true;

  if allowed.id is null then
    raise exception 'E-mail não autorizado para o Sistema de Auditorias AFPESP.';
  end if;

  insert into public.audit_profiles (id, full_name, role, active, must_change_password)
  values (new.id, allowed.full_name, allowed.role, true, true);

  update public.audit_allowed_users
  set auth_user_id = new.id
  where id = allowed.id;

  return new;
end;
$$;

insert into public.audit_allowed_users (email, full_name, role)
values
  ('lejunior@afpesp.org.br', 'Leonardo de Lima Junior', 'admin'),
  ('tolivei@afpesp.org.br', 'Thayse Santos de Oliveira', 'auditor'),
  ('jofuccia@afpesp.org.br', 'João Antonio de Mello Fuccia', 'auditor'),
  ('pmmendon@afpesp.org.br', 'Patricia Maria de Mendonça', 'auditor')
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  active = true;

grant select on public.audit_allowed_users to authenticated;
grant update (full_name, must_change_password) on public.audit_profiles to authenticated;

alter table public.audit_allowed_users enable row level security;

create policy audit_allowed_users_admin_select on public.audit_allowed_users
for select to authenticated using (private.current_user_is_admin());

drop policy audit_profiles_select on public.audit_profiles;
create policy audit_profiles_select on public.audit_profiles
for select to authenticated using (private.current_user_is_active());

drop policy audit_units_select on public.audit_units;
drop policy audit_units_insert on public.audit_units;
drop policy audit_units_update on public.audit_units;
drop policy audit_units_delete on public.audit_units;
create policy audit_units_select on public.audit_units for select to authenticated using (private.current_user_is_active());
create policy audit_units_insert on public.audit_units for insert to authenticated with check (private.current_user_is_active());
create policy audit_units_update on public.audit_units for update to authenticated using (private.current_user_is_active()) with check (private.current_user_is_active());
create policy audit_units_delete on public.audit_units for delete to authenticated using (private.current_user_is_active());

drop policy audit_documents_select on public.audit_documents;
drop policy audit_documents_insert on public.audit_documents;
drop policy audit_documents_update on public.audit_documents;
drop policy audit_documents_delete on public.audit_documents;
create policy audit_documents_select on public.audit_documents for select to authenticated using (private.current_user_is_active());
create policy audit_documents_insert on public.audit_documents for insert to authenticated with check (private.current_user_is_active() and created_by = (select auth.uid()));
create policy audit_documents_update on public.audit_documents for update to authenticated using (private.current_user_is_active()) with check (private.current_user_is_active());
create policy audit_documents_delete on public.audit_documents for delete to authenticated using (private.current_user_is_active());

drop policy audit_checklists_select on public.audit_checklists;
drop policy audit_checklists_insert on public.audit_checklists;
drop policy audit_checklists_update on public.audit_checklists;
drop policy audit_checklists_delete on public.audit_checklists;
create policy audit_checklists_select on public.audit_checklists for select to authenticated using (private.current_user_is_active());
create policy audit_checklists_insert on public.audit_checklists for insert to authenticated with check (private.current_user_is_active() and created_by = (select auth.uid()));
create policy audit_checklists_update on public.audit_checklists for update to authenticated using (private.current_user_is_active()) with check (private.current_user_is_active());
create policy audit_checklists_delete on public.audit_checklists for delete to authenticated
using (private.current_user_is_active() and not exists (select 1 from public.audits where checklist_id = audit_checklists.id));

drop policy audits_select on public.audits;
drop policy audits_insert on public.audits;
drop policy audits_update on public.audits;
drop policy audits_delete on public.audits;
create policy audits_select on public.audits for select to authenticated using (private.current_user_is_active());
create policy audits_insert on public.audits for insert to authenticated with check (private.current_user_is_active() and created_by = (select auth.uid()));
create policy audits_update on public.audits for update to authenticated
using (private.current_user_is_active() and (status <> 'Finalizada' or private.current_user_is_admin()))
with check (private.current_user_is_active() and (status <> 'Finalizada' or private.current_user_is_admin()));
create policy audits_delete on public.audits for delete to authenticated
using (private.current_user_is_active() and (status <> 'Finalizada' or private.current_user_is_admin()));

drop policy audit_answers_select on public.audit_answers;
drop policy audit_answers_insert on public.audit_answers;
drop policy audit_answers_update on public.audit_answers;
drop policy audit_answers_delete on public.audit_answers;
create policy audit_answers_select on public.audit_answers for select to authenticated using (private.current_user_is_active());
create policy audit_answers_insert on public.audit_answers for insert to authenticated
with check (private.current_user_is_active() and exists (select 1 from public.audits where id = audit_id and status <> 'Finalizada'));
create policy audit_answers_update on public.audit_answers for update to authenticated
using (private.current_user_is_active() and exists (select 1 from public.audits where id = audit_id and (status <> 'Finalizada' or private.current_user_is_admin())))
with check (private.current_user_is_active() and exists (select 1 from public.audits where id = audit_id and (status <> 'Finalizada' or private.current_user_is_admin())));
create policy audit_answers_delete on public.audit_answers for delete to authenticated
using (private.current_user_is_active() and exists (select 1 from public.audits where id = audit_id and (status <> 'Finalizada' or private.current_user_is_admin())));

drop policy audit_photos_select on public.audit_photos;
drop policy audit_photos_insert on public.audit_photos;
drop policy audit_photos_delete on public.audit_photos;
create policy audit_photos_select on public.audit_photos for select to authenticated using (private.current_user_is_active());
create policy audit_photos_insert on public.audit_photos for insert to authenticated with check (private.current_user_is_active() and created_by = (select auth.uid()));
create policy audit_photos_delete on public.audit_photos for delete to authenticated
using (private.current_user_is_active() and (created_by = (select auth.uid()) or private.current_user_is_admin()));

drop policy audit_storage_select on storage.objects;
drop policy audit_storage_insert on storage.objects;
drop policy audit_storage_update on storage.objects;
drop policy audit_storage_delete on storage.objects;
create policy audit_storage_select on storage.objects for select to authenticated
using (bucket_id = 'audit-photos' and private.current_user_is_active());
create policy audit_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'audit-photos' and private.current_user_is_active() and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy audit_storage_update on storage.objects for update to authenticated
using (bucket_id = 'audit-photos' and private.current_user_is_active() and owner_id = (select auth.uid())::text)
with check (bucket_id = 'audit-photos' and private.current_user_is_active() and owner_id = (select auth.uid())::text);
create policy audit_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'audit-photos' and private.current_user_is_active() and (owner_id = (select auth.uid())::text or private.current_user_is_admin()));
