-- Compliance evidence, retention governance, security events, and service health.
create table public.data_retention_policies(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  data_category text not null, retention_days integer not null check(retention_days between 30 and 3650),
  legal_hold boolean not null default false, active boolean not null default true,
  updated_by uuid not null references public.users(id), updated_at timestamptz not null default now(),
  unique(organization_id,data_category)
);
create table public.security_events(
  id bigint generated always as identity primary key, organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  severity text not null check(severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')), event_type text not null,
  actor_id uuid references public.users(id), source_ip inet, details jsonb not null default '{}',
  status text not null default 'OPEN' check(status in ('OPEN','INVESTIGATING','RESOLVED','FALSE_POSITIVE')),
  resolved_by uuid references public.users(id), resolved_at timestamptz, created_at timestamptz not null default now()
);
create table public.compliance_exports(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  framework text not null, date_from date not null, date_to date not null, format text not null check(format in ('CSV','PDF','JSON')),
  status text not null default 'QUEUED' check(status in ('QUEUED','PROCESSING','COMPLETED','FAILED')),
  storage_path text, requested_by uuid not null references public.users(id), created_at timestamptz not null default now(), completed_at timestamptz,
  check(date_to>=date_from)
);
create table public.service_health_checks(
  id bigint generated always as identity primary key, organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  service text not null, status text not null check(status in ('OPERATIONAL','DEGRADED','OUTAGE')),
  latency_ms integer check(latency_ms is null or latency_ms>=0), details jsonb not null default '{}', checked_at timestamptz not null default now()
);
create index security_events_org_created_idx on public.security_events(organization_id,created_at desc);
create index audit_logs_org_created_idx on public.audit_logs(organization_id,created_at desc);
create index service_health_org_checked_idx on public.service_health_checks(organization_id,checked_at desc);

alter table public.data_retention_policies enable row level security;
alter table public.security_events enable row level security;
alter table public.compliance_exports enable row level security;
alter table public.service_health_checks enable row level security;
create policy "admins manage retention" on public.data_retention_policies for all to authenticated using(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN') with check(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN');
create policy "admins read security events" on public.security_events for select to authenticated using(organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "admins update security events" on public.security_events for update to authenticated using(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN') with check(organization_id=public.current_organization_id());
create policy "admins manage compliance exports" on public.compliance_exports for all to authenticated using(organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(organization_id=public.current_organization_id() and requested_by=auth.uid());
create policy "admins read health" on public.service_health_checks for select to authenticated using(organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

-- Audit evidence is append-only to authenticated clients.
revoke update,delete,truncate on public.audit_logs from authenticated;

create or replace function public.resolve_security_event(p_event_id bigint,p_status text) returns void language plpgsql security definer set search_path=public as $$
begin
  if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can resolve security events'; end if;
  if p_status not in ('INVESTIGATING','RESOLVED','FALSE_POSITIVE') then raise exception 'Invalid event status'; end if;
  update public.security_events set status=p_status,resolved_by=case when p_status in ('RESOLVED','FALSE_POSITIVE') then auth.uid() else null end,resolved_at=case when p_status in ('RESOLVED','FALSE_POSITIVE') then now() else null end
  where id=p_event_id and organization_id=public.current_organization_id();
  if not found then raise exception 'Security event not found'; end if;
end $$;
revoke all on function public.resolve_security_event(bigint,text) from public;
grant execute on function public.resolve_security_event(bigint,text) to authenticated;

insert into public.data_retention_policies(organization_id,data_category,retention_days,updated_by)
select o.id,v.category,v.days,m.user_id from public.organizations o
join lateral (select user_id from public.organization_memberships where organization_id=o.id and role='SUPER_ADMIN' and status='ACTIVE' limit 1) m on true
cross join (values('AUDIT_LOGS',2555),('PAYROLL',2555),('EMPLOYEE_DOCUMENTS',1825),('RECRUITMENT',730)) v(category,days)
on conflict(organization_id,data_category) do nothing;
