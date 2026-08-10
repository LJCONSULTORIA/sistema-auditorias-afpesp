alter table public.audit_records drop constraint if exists audit_records_status_check;
alter table public.audit_records add constraint audit_records_status_check
  check (status = any (array['Programada', 'Em andamento', 'Finalizada e aguardando aprovação', 'Devolvido para ajustes', 'Finalizada']));

create table if not exists public.audit_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.audit_profiles(id) on delete cascade,
  audit_record_id uuid not null references public.audit_records(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists audit_notifications_user_unread_idx
  on public.audit_notifications (user_id, created_at) where read_at is null;
alter table public.audit_notifications enable row level security;
drop policy if exists audit_notifications_select_own on public.audit_notifications;
create policy audit_notifications_select_own on public.audit_notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists audit_notifications_update_own on public.audit_notifications;
create policy audit_notifications_update_own on public.audit_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.audit_notifications to authenticated;
grant update (read_at) on public.audit_notifications to authenticated;

create or replace function private.enforce_audit_approval_transition()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  audit_name text;
  return_reason text;
begin
  if old.status = 'Finalizada' and not private.current_user_is_admin() then
    new.status := 'Finalizada e aguardando aprovação';
    new.data := pg_catalog.jsonb_set(new.data, '{status}', pg_catalog.to_jsonb(new.status), true) - 'approvedAt' - 'approvedBy';
  end if;

  if new.status = 'Finalizada' and old.status <> 'Finalizada' and not private.current_user_is_admin() then
    raise exception 'Somente o administrador pode aprovar e finalizar a auditoria.' using errcode = '42501';
  end if;

  if new.status = 'Devolvido para ajustes' then
    if old.status <> 'Finalizada e aguardando aprovação' or not private.current_user_is_admin() then
      raise exception 'Somente o administrador pode devolver uma auditoria que aguarda aprovação.' using errcode = '42501';
    end if;
    new.data := pg_catalog.jsonb_set(new.data, '{status}', pg_catalog.to_jsonb(new.status), true);
    audit_name := pg_catalog.concat_ws(' — ', new.data ->> 'locationType', new.data ->> 'unit');
    return_reason := pg_catalog.coalesce(pg_catalog.nullif(pg_catalog.btrim(new.data ->> 'returnReason'), ''), 'Consulte a auditoria para verificar os ajustes solicitados.');

    insert into public.audit_notifications (user_id, audit_record_id, title, message)
    select profile.id, new.id, 'Auditoria devolvida para ajustes',
      pg_catalog.concat(audit_name, E'\n\nAjustes solicitados: ', return_reason)
    from public.audit_profiles profile
    where profile.active = true
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(
          case when pg_catalog.jsonb_typeof(new.data -> 'auditors') = 'array' then new.data -> 'auditors' else '[]'::jsonb end
        ) assigned(name)
        where pg_catalog.lower(pg_catalog.btrim(assigned.name)) = pg_catalog.lower(pg_catalog.btrim(profile.full_name))
      );
  end if;

  if old.status = 'Finalizada e aguardando aprovação'
     and new.status not in ('Finalizada', 'Devolvido para ajustes')
     and not private.current_user_is_admin() then
    raise exception 'Somente o administrador pode aprovar ou devolver a auditoria.' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_audit_approval_transition on public.audit_records;
create trigger enforce_audit_approval_transition
before update on public.audit_records
for each row execute function private.enforce_audit_approval_transition();
