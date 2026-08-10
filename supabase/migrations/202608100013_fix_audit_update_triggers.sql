create or replace function private.sync_audit_record_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.audit_record_summaries (
    id, location_type, unit, checklist_name, auditors,
    start_date, end_date, status, updated_at
  ) values (
    new.id,
    coalesce(new.data ->> 'locationType', ''),
    coalesce(new.data ->> 'unit', ''),
    coalesce(new.data ->> 'checklistName', ''),
    case when pg_catalog.jsonb_typeof(new.data -> 'auditors') = 'array'
      then new.data -> 'auditors' else '[]'::jsonb end,
    coalesce(new.data ->> 'startDate', ''),
    coalesce(new.data ->> 'endDate', ''),
    new.status,
    new.updated_at
  )
  on conflict (id) do update set
    location_type = excluded.location_type,
    unit = excluded.unit,
    checklist_name = excluded.checklist_name,
    auditors = excluded.auditors,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    status = excluded.status,
    updated_at = excluded.updated_at;
  return new;
end;
$function$;

create or replace function private.enforce_audit_approval_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    if old.status not in ('Finalizada e aguardando aprovação', 'Finalizada') or not private.current_user_is_admin() then
      raise exception 'Somente o administrador pode devolver ou reabrir uma auditoria para ajustes.' using errcode = '42501';
    end if;
    new.data := pg_catalog.jsonb_set(new.data, '{status}', pg_catalog.to_jsonb(new.status), true);
    audit_name := pg_catalog.concat_ws(' — ', new.data ->> 'locationType', new.data ->> 'unit');
    return_reason := coalesce(nullif(pg_catalog.btrim(new.data ->> 'returnReason'), ''), 'Consulte a auditoria para verificar os ajustes solicitados.');

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

revoke all on function private.sync_audit_record_summary() from public, anon, authenticated;
revoke all on function private.enforce_audit_approval_transition() from public, anon, authenticated;
