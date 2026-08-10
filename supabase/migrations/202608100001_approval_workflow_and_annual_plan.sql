alter table public.audit_records drop constraint if exists audit_records_status_check;
alter table public.audit_records add constraint audit_records_status_check
  check (status = any (array['Programada', 'Em andamento', 'Finalizada e aguardando aprovação', 'Finalizada']));

create or replace function private.current_user_can_manage_audit(auditors jsonb)
returns boolean language sql stable security definer set search_path = '' as $function$
  select private.current_user_is_admin() or exists (
    select 1 from public.audit_profiles profile
    where profile.id = (select auth.uid()) and profile.active = true
      and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(
          case when pg_catalog.jsonb_typeof(auditors) = 'array' then auditors else '[]'::jsonb end
        ) assigned(name)
        where pg_catalog.lower(pg_catalog.btrim(assigned.name)) = pg_catalog.lower(pg_catalog.btrim(profile.full_name))
      )
  );
$function$;

drop policy if exists audit_records_update on public.audit_records;
create policy audit_records_update on public.audit_records for update to authenticated
using (private.current_user_is_active() and private.current_user_can_manage_audit(data -> 'auditors'))
with check (private.current_user_is_active() and private.current_user_can_manage_audit(data -> 'auditors'));

create table if not exists public.audit_annual_plan_items (
  id uuid primary key default gen_random_uuid(),
  process text not null check (length(btrim(process)) > 0),
  planned_month smallint not null check (planned_month between 1 and 12),
  planned_year smallint not null check (planned_year between 2020 and 2200),
  auditor text not null default '',
  status text not null default 'Planejada'
    check (status in ('Planejada', 'Realizada no prazo', 'Reprogramada', 'Não realizada')),
  audit_record_id uuid references public.audit_records(id) on delete set null,
  notes text not null default '',
  created_by uuid not null references public.audit_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists audit_annual_plan_year_month_idx on public.audit_annual_plan_items(planned_year, planned_month);
create index if not exists audit_annual_plan_audit_record_idx on public.audit_annual_plan_items(audit_record_id);
alter table public.audit_annual_plan_items enable row level security;
create policy audit_annual_plan_select on public.audit_annual_plan_items for select to authenticated
  using (private.current_user_is_active());
create policy audit_annual_plan_insert on public.audit_annual_plan_items for insert to authenticated
  with check (private.current_user_is_admin() and created_by = (select auth.uid()));
create policy audit_annual_plan_update on public.audit_annual_plan_items for update to authenticated
  using (private.current_user_is_admin()) with check (private.current_user_is_admin());
create policy audit_annual_plan_delete on public.audit_annual_plan_items for delete to authenticated
  using (private.current_user_is_admin());
grant select, insert, update, delete on public.audit_annual_plan_items to authenticated;

insert into public.audit_annual_plan_items (process, planned_month, planned_year, auditor, status, created_by)
select seed.process, seed.month, 2026, seed.auditor, 'Planejada', admin.id
from (values
  ('Almoxarifado',6,'Thayse'), ('Refeitório Sede',6,'Thayse'),
  ('Central de Relacionamento',6,'João'), ('Ouvidoria',7,'João'),
  ('Suprimentos e Logística',7,'Thayse'), ('Serviços Gerais',8,'Thayse'),
  ('Turismo',8,'Thayse'), ('UL Guarujá',8,'João'),
  ('UL Poços de Caldas',8,'Leo/Nicolas'), ('UL Appenzell',9,'Leo/Nicolas'),
  ('UL Campos do Jordão',9,'João/Nicolas'), ('UL Caraguatatuba',9,'João'),
  ('UL Saha',9,'Leo/Nicolas'), ('UL Ubatuba',9,'Leo'),
  ('Esportes',9,'Thayse'), ('Gestão de Pessoas',10,'Leo/Thayse'),
  ('Qualidade',10,'Ieda'), ('UL Lindóia',10,'João'),
  ('UL Serra Negra',10,'Leo'), ('UL Socorro',10,'João/Leo')
) as seed(process, month, auditor)
cross join lateral (
  select id from public.audit_profiles where role = 'admin' and active order by created_at limit 1
) admin
where not exists (select 1 from public.audit_annual_plan_items where planned_year = 2026);

update public.audit_annual_plan_items
set status = 'Realizada no prazo'
where planned_year = 2026
  and process in ('Almoxarifado', 'Refeitório Sede', 'Central de Relacionamento', 'Ouvidoria', 'Suprimentos e Logística');
