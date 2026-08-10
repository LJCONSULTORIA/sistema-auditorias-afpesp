create index audit_password_reset_resolved_by_idx
on public.audit_password_reset_requests (resolved_by)
where resolved_by is not null;
