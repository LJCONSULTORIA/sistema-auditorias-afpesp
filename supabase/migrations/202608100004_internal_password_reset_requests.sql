create table public.audit_password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.audit_profiles(id) on delete cascade,
  status text not null default 'Pendente' check (status in ('Pendente', 'Concluída', 'Cancelada')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.audit_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index audit_password_reset_one_pending_per_user
on public.audit_password_reset_requests (user_id)
where status = 'Pendente';

create index audit_password_reset_status_requested_idx
on public.audit_password_reset_requests (status, requested_at desc);

alter table public.audit_password_reset_requests enable row level security;

revoke all on public.audit_password_reset_requests from anon, authenticated;

comment on table public.audit_password_reset_requests is
'Solicitações internas de redefinição de senha. Acesso somente por Edge Functions com validação administrativa.';
