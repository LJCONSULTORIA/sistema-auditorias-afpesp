alter table public.audit_annual_plan_items drop constraint if exists audit_annual_plan_items_status_check;
alter table public.audit_annual_plan_items add constraint audit_annual_plan_items_status_check
  check (status in ('Planejada', 'Realizada no prazo', 'Realizada em atraso', 'Reprogramada', 'Não realizada'));
