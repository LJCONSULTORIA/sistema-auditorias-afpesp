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
    if old.status not in ('Finalizada e aguardando aprovação', 'Finalizada') or not private.current_user_is_admin() then
      raise exception 'Somente o administrador pode devolver ou reabrir uma auditoria para ajustes.' using errcode = '42501';
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
