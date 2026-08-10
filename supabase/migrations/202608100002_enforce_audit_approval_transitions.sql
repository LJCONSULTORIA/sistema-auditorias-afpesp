create or replace function private.enforce_audit_approval_transition()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if old.status = 'Finalizada' and not private.current_user_is_admin() then
    new.status := 'Finalizada e aguardando aprovação';
    new.data := jsonb_set(new.data, '{status}', to_jsonb(new.status), true) - 'approvedAt' - 'approvedBy';
  end if;

  if new.status = 'Finalizada' and old.status <> 'Finalizada' and not private.current_user_is_admin() then
    raise exception 'Somente o administrador pode aprovar e finalizar a auditoria.' using errcode = '42501';
  end if;

  if old.status = 'Finalizada e aguardando aprovação'
     and new.status = 'Em andamento'
     and not private.current_user_is_admin() then
    raise exception 'Somente o administrador pode devolver a auditoria para ajustes.' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_audit_approval_transition on public.audit_records;
create trigger enforce_audit_approval_transition
before update on public.audit_records
for each row execute function private.enforce_audit_approval_transition();
