alter table public.audit_documents
  drop constraint if exists audit_documents_document_type_check;

alter table public.audit_documents
  add constraint audit_documents_document_type_check check (
    document_type = any (array[
      'Procedimento Operacional', 'Instrução de Trabalho', 'Especificação',
      'MOD G', 'Manual', 'Política', 'Escopo', 'Organograma',
      'Legislação', 'Norma', 'Outros documentos controlados'
    ])
  ),
  add column if not exists normalized_code text not null default '',
  add column if not exists source_status text not null default 'Ativo'
    check (source_status = any (array['Ativo', 'Inativo', 'Em elaboração'])),
  add column if not exists source_file text,
  add column if not exists imported_at timestamptz;

update public.audit_documents
set normalized_code = upper(regexp_replace(code, '[^[:alnum:]]', '', 'g'))
where normalized_code = '';

create index if not exists audit_documents_normalized_code_idx
  on public.audit_documents (normalized_code);

create table if not exists public.audit_document_imports (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  imported_by uuid not null references public.audit_profiles(id),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_document_imports enable row level security;

drop policy if exists audit_document_imports_select on public.audit_document_imports;
create policy audit_document_imports_select on public.audit_document_imports
  for select to authenticated
  using (private.current_user_is_active());

drop policy if exists audit_document_imports_insert on public.audit_document_imports;
create policy audit_document_imports_insert on public.audit_document_imports
  for insert to authenticated
  with check (private.current_user_is_active() and imported_by = (select auth.uid()));

grant select, insert on public.audit_document_imports to authenticated;

create or replace function public.import_audit_master(
  p_documents jsonb,
  p_source_file text
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_document record;
  v_existing public.audit_documents%rowtype;
  v_code_exists boolean;
  v_affected integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_inactivated integer := 0;
  v_unchanged integer := 0;
  v_drafting integer := 0;
  v_summary jsonb;
begin
  if v_user is null or not private.current_user_is_active() then
    raise exception 'Usuário não autorizado.';
  end if;
  if jsonb_typeof(p_documents) <> 'array' then
    raise exception 'A relação de documentos precisa ser uma lista.';
  end if;
  if jsonb_array_length(p_documents) > 2000 then
    raise exception 'A Lista Mestra excede o limite de 2.000 documentos.';
  end if;

  for v_document in
    select * from jsonb_to_recordset(p_documents) as x(
      document_type text,
      code text,
      normalized_code text,
      title text,
      version text,
      source_status text
    )
  loop
    if coalesce(trim(v_document.code), '') = ''
      or coalesce(trim(v_document.normalized_code), '') = ''
      or coalesce(trim(v_document.title), '') = ''
      or coalesce(trim(v_document.version), '') = '' then
      raise exception 'A Lista Mestra contém documento sem código, título ou versão.';
    end if;
    if v_document.document_type not in (
      'Procedimento Operacional', 'Instrução de Trabalho', 'Especificação',
      'MOD G', 'Manual', 'Política', 'Escopo', 'Organograma',
      'Legislação', 'Norma', 'Outros documentos controlados'
    ) then
      raise exception 'Tipo de documento inválido: %', v_document.document_type;
    end if;
    if v_document.source_status not in ('Ativo', 'Inativo', 'Em elaboração') then
      raise exception 'Situação de documento inválida: %', v_document.source_status;
    end if;

    select exists (
      select 1 from public.audit_documents
      where normalized_code = v_document.normalized_code
    ) into v_code_exists;

    if v_document.source_status = 'Ativo' then
      select * into v_existing
      from public.audit_documents
      where normalized_code = v_document.normalized_code
        and version = v_document.version
      order by created_at desc
      limit 1;

      update public.audit_documents
      set active = false, updated_at = now()
      where normalized_code = v_document.normalized_code
        and active
        and (v_existing.id is null or id <> v_existing.id);

      if v_existing.id is not null then
        if v_existing.active
          and v_existing.document_type = v_document.document_type
          and v_existing.code = v_document.code
          and v_existing.title = v_document.title
          and v_existing.source_status = 'Ativo' then
          v_unchanged := v_unchanged + 1;
        else
          v_updated := v_updated + 1;
        end if;
        update public.audit_documents set
          document_type = v_document.document_type,
          code = v_document.code,
          title = v_document.title,
          active = true,
          source_status = 'Ativo',
          source_file = p_source_file,
          imported_at = now(),
          updated_at = now()
        where id = v_existing.id;
      else
        insert into public.audit_documents (
          document_type, code, normalized_code, title, version, active,
          source_status, source_file, imported_at, created_by
        ) values (
          v_document.document_type, v_document.code, v_document.normalized_code,
          v_document.title, v_document.version, true, 'Ativo',
          p_source_file, now(), v_user
        );
        if v_code_exists then v_updated := v_updated + 1;
        else v_inserted := v_inserted + 1;
        end if;
      end if;
    elsif v_document.source_status = 'Inativo' then
      update public.audit_documents set
        active = false,
        source_status = 'Inativo',
        source_file = p_source_file,
        imported_at = now(),
        updated_at = now()
      where normalized_code = v_document.normalized_code and active;
      get diagnostics v_affected = row_count;
      if v_affected > 0 then v_inactivated := v_inactivated + 1; end if;
    else
      update public.audit_documents set
        active = false,
        source_status = 'Em elaboração',
        source_file = p_source_file,
        imported_at = now(),
        updated_at = now()
      where normalized_code = v_document.normalized_code and active;
      v_drafting := v_drafting + 1;
    end if;
  end loop;

  v_summary := jsonb_build_object(
    'inseridos', v_inserted,
    'atualizados', v_updated,
    'inativados', v_inactivated,
    'mantidos', v_unchanged,
    'em_elaboracao', v_drafting,
    'processados', jsonb_array_length(p_documents)
  );
  insert into public.audit_document_imports (source_file, imported_by, summary)
  values (p_source_file, v_user, v_summary);
  return v_summary;
end;
$$;

revoke all on function public.import_audit_master(jsonb, text) from public;
revoke all on function public.import_audit_master(jsonb, text) from anon;
grant execute on function public.import_audit_master(jsonb, text) to authenticated;
