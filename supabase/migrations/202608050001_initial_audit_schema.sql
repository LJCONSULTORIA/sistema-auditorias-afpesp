create schema if not exists private;

create table public.audit_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'auditor' check (role in ('admin', 'auditor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_units (
  id uuid primary key default gen_random_uuid(),
  location_type text not null check (location_type in ('Unidade de Lazer', 'Sede Social')),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_type, name)
);

create table public.audit_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('Procedimento Operacional', 'Instrução de Trabalho', 'Especificação', 'MOD G', 'Legislação', 'Norma')),
  code text not null,
  title text not null,
  version text not null,
  active boolean not null default true,
  created_by uuid references public.audit_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type, code, title, version)
);

create table public.audit_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_name text not null,
  location_type text not null check (location_type in ('Unidade de Lazer', 'Sede Social')),
  unit_id uuid not null references public.audit_units(id),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_by uuid not null references public.audit_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.audit_units(id),
  checklist_id uuid not null references public.audit_checklists(id),
  auditor_id uuid not null references public.audit_profiles(id),
  start_date date not null,
  end_date date,
  scope text not null default '',
  objective text not null default '',
  status text not null default 'Programada' check (status in ('Programada', 'Em andamento', 'Finalizada')),
  created_by uuid not null references public.audit_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_answers (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  item_number integer not null,
  process text not null default '',
  requirement text not null default '',
  question text not null,
  documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),
  classification text check (classification in ('Conforme', 'Não Conforme', 'Oportunidade de Melhoria', 'Risco')),
  finding text not null default '',
  recommendation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, item_number)
);

create table public.audit_photos (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.audit_answers(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  created_by uuid not null references public.audit_profiles(id),
  created_at timestamptz not null default now()
);

create index audit_units_type_idx on public.audit_units(location_type, active);
create index audit_documents_type_idx on public.audit_documents(document_type, active);
create index audit_checklists_unit_idx on public.audit_checklists(unit_id, created_at desc);
create index audits_status_date_idx on public.audits(status, start_date desc);
create index audits_unit_idx on public.audits(unit_id, start_date desc);
create index audits_auditor_idx on public.audits(auditor_id, start_date desc);
create index audit_answers_classification_idx on public.audit_answers(classification);
create index audit_answers_requirement_idx on public.audit_answers(requirement);
create index audit_photos_answer_idx on public.audit_photos(answer_id);

create or replace function private.current_user_is_admin()
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
      and role = 'admin'
      and active = true
  );
$$;

revoke all on function private.current_user_is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

create or replace function private.handle_new_audit_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

revoke all on function private.handle_new_audit_user() from public;

create trigger on_audit_user_created
after insert on auth.users
for each row execute function private.handle_new_audit_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_audit_profiles_updated_at before update on public.audit_profiles for each row execute function private.set_updated_at();
create trigger set_audit_units_updated_at before update on public.audit_units for each row execute function private.set_updated_at();
create trigger set_audit_documents_updated_at before update on public.audit_documents for each row execute function private.set_updated_at();
create trigger set_audit_checklists_updated_at before update on public.audit_checklists for each row execute function private.set_updated_at();
create trigger set_audits_updated_at before update on public.audits for each row execute function private.set_updated_at();
create trigger set_audit_answers_updated_at before update on public.audit_answers for each row execute function private.set_updated_at();

grant select on public.audit_profiles to authenticated;
grant update (full_name) on public.audit_profiles to authenticated;
grant select, insert, update, delete on public.audit_units to authenticated;
grant select, insert, update, delete on public.audit_documents to authenticated;
grant select, insert, update, delete on public.audit_checklists to authenticated;
grant select, insert, update, delete on public.audits to authenticated;
grant select, insert, update, delete on public.audit_answers to authenticated;
grant select, insert, delete on public.audit_photos to authenticated;

alter table public.audit_profiles enable row level security;
alter table public.audit_units enable row level security;
alter table public.audit_documents enable row level security;
alter table public.audit_checklists enable row level security;
alter table public.audits enable row level security;
alter table public.audit_answers enable row level security;
alter table public.audit_photos enable row level security;

create policy audit_profiles_select on public.audit_profiles for select to authenticated using (true);
create policy audit_profiles_update_own on public.audit_profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy audit_units_select on public.audit_units for select to authenticated using (true);
create policy audit_units_insert on public.audit_units for insert to authenticated with check (true);
create policy audit_units_update on public.audit_units for update to authenticated using (true) with check (true);
create policy audit_units_delete on public.audit_units for delete to authenticated using (true);

create policy audit_documents_select on public.audit_documents for select to authenticated using (true);
create policy audit_documents_insert on public.audit_documents for insert to authenticated with check (created_by = (select auth.uid()));
create policy audit_documents_update on public.audit_documents for update to authenticated using (true) with check (true);
create policy audit_documents_delete on public.audit_documents for delete to authenticated using (true);

create policy audit_checklists_select on public.audit_checklists for select to authenticated using (true);
create policy audit_checklists_insert on public.audit_checklists for insert to authenticated with check (created_by = (select auth.uid()));
create policy audit_checklists_update on public.audit_checklists for update to authenticated using (true) with check (true);
create policy audit_checklists_delete on public.audit_checklists for delete to authenticated
using (not exists (select 1 from public.audits where checklist_id = audit_checklists.id));

create policy audits_select on public.audits for select to authenticated using (true);
create policy audits_insert on public.audits for insert to authenticated with check (created_by = (select auth.uid()));
create policy audits_update on public.audits for update to authenticated
using (status <> 'Finalizada' or private.current_user_is_admin())
with check (status <> 'Finalizada' or private.current_user_is_admin());
create policy audits_delete on public.audits for delete to authenticated
using (status <> 'Finalizada' or private.current_user_is_admin());

create policy audit_answers_select on public.audit_answers for select to authenticated using (true);
create policy audit_answers_insert on public.audit_answers for insert to authenticated
with check (exists (select 1 from public.audits where id = audit_id and status <> 'Finalizada'));
create policy audit_answers_update on public.audit_answers for update to authenticated
using (exists (select 1 from public.audits where id = audit_id and (status <> 'Finalizada' or private.current_user_is_admin())))
with check (exists (select 1 from public.audits where id = audit_id and (status <> 'Finalizada' or private.current_user_is_admin())));
create policy audit_answers_delete on public.audit_answers for delete to authenticated
using (exists (select 1 from public.audits where id = audit_id and (status <> 'Finalizada' or private.current_user_is_admin())));

create policy audit_photos_select on public.audit_photos for select to authenticated using (true);
create policy audit_photos_insert on public.audit_photos for insert to authenticated with check (created_by = (select auth.uid()));
create policy audit_photos_delete on public.audit_photos for delete to authenticated
using (created_by = (select auth.uid()) or private.current_user_is_admin());

insert into public.audit_units (location_type, name)
select location_type, name
from (values
  ('Sede Social', 'Administrativo'), ('Sede Social', 'Almoxarifado'), ('Sede Social', 'Assistência à Saúde'),
  ('Sede Social', 'Áudio Visual'), ('Sede Social', 'Central de Relacionamento'), ('Sede Social', 'Controladoria'),
  ('Sede Social', 'Educação e Cultura'), ('Sede Social', 'Departamento Pessoal'), ('Sede Social', 'Esportes'),
  ('Sede Social', 'Eventos'), ('Sede Social', 'Gestão de Pessoas'), ('Sede Social', 'Marketing'),
  ('Sede Social', 'Meio Ambiente'), ('Sede Social', 'Obras'), ('Sede Social', 'Ouvidoria'),
  ('Sede Social', 'Qualidade'), ('Sede Social', 'Restaurante'), ('Sede Social', 'Serviços Gerais'),
  ('Sede Social', 'Social'), ('Sede Social', 'Tecnologia da Informação'), ('Sede Social', 'Transportes'),
  ('Sede Social', 'Turismo'), ('Sede Social', 'Patrimônio'), ('Sede Social', 'Suprimentos e Logística'),
  ('Unidade de Lazer', 'Boraceia'), ('Unidade de Lazer', 'Caraguatatuba'), ('Unidade de Lazer', 'Guarujá'),
  ('Unidade de Lazer', 'Itanhaém'), ('Unidade de Lazer', 'Maresias'), ('Unidade de Lazer', 'Peruíbe I'),
  ('Unidade de Lazer', 'Peruíbe II'), ('Unidade de Lazer', 'Ubatuba'), ('Unidade de Lazer', 'Areado'),
  ('Unidade de Lazer', 'Avaré'), ('Unidade de Lazer', 'Amparo'), ('Unidade de Lazer', 'Lindóia'),
  ('Unidade de Lazer', 'São Lourenço'), ('Unidade de Lazer', 'Serra Negra'), ('Unidade de Lazer', 'Socorro'),
  ('Unidade de Lazer', 'Appenzell Campos do Jordão'), ('Unidade de Lazer', 'Campos do Jordão'),
  ('Unidade de Lazer', 'Monte Verde'), ('Unidade de Lazer', 'Poços de Caldas I'),
  ('Unidade de Lazer', 'Poços de Caldas II'), ('Unidade de Lazer', 'Saha Campos do Jordão'),
  ('Unidade de Lazer', 'São Pedro'), ('Unidade de Lazer', 'Termas de Ibirá'),
  ('Unidade de Lazer', 'Fazenda de Ibirá'), ('Unidade de Lazer', 'Dois Córregos'),
  ('Unidade de Lazer', 'Unidade Capital')
) as seed(location_type, name)
on conflict (location_type, name) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audit-photos', 'audit-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy audit_storage_select on storage.objects for select to authenticated
using (bucket_id = 'audit-photos');
create policy audit_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'audit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy audit_storage_update on storage.objects for update to authenticated
using (bucket_id = 'audit-photos' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'audit-photos' and owner_id = (select auth.uid())::text);
create policy audit_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'audit-photos' and (owner_id = (select auth.uid())::text or private.current_user_is_admin()));
