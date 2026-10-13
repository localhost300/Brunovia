-- Organization isolation and membership switching. Apply after 024.
create table public.organizations(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','SUSPENDED','ARCHIVED')),
  plan text not null default 'ENTERPRISE',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations(name,slug)
values('PeopleFlow Organization','peopleflow')
on conflict(slug) do nothing;

alter table public.users add column if not exists current_organization_id uuid references public.organizations(id);

create table public.organization_memberships(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.user_role not null default 'EMPLOYEE',
  status text not null default 'ACTIVE' check(status in ('INVITED','ACTIVE','SUSPENDED')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);

insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
select o.id,u.id,u.role,'ACTIVE',now()
from public.users u cross join lateral (select id from public.organizations where slug='peopleflow') o
on conflict do nothing;

update public.users
set current_organization_id=(select id from public.organizations where slug='peopleflow')
where current_organization_id is null;

create or replace function public.current_organization_id() returns uuid
language sql stable security definer set search_path=public
as $$ select current_organization_id from public.users where id=auth.uid() $$;

create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path=public
as $$
  select coalesce(
    (select m.role from public.organization_memberships m
      where m.user_id=auth.uid() and m.organization_id=public.current_organization_id() and m.status='ACTIVE'),
    (select u.role from public.users u where u.id=auth.uid())
  )
$$;

create or replace function public.switch_organization(p_organization_id uuid) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(
    select 1 from public.organization_memberships
    where organization_id=p_organization_id and user_id=auth.uid() and status='ACTIVE'
  ) then
    raise exception 'You do not have an active membership in this organization';
  end if;
  update public.users set current_organization_id=p_organization_id,updated_at=now() where id=auth.uid();
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'ORGANIZATION_SWITCHED','organization',p_organization_id::text,jsonb_build_object('organization_id',p_organization_id));
end $$;

revoke all on function public.switch_organization(uuid) from public;
grant execute on function public.switch_organization(uuid) to authenticated;

-- Every business row is owned by one organization. Restrictive policies combine
-- with the existing role/ownership policies, so both checks must pass.
do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'departments','employees','attendance','shifts','employee_shifts','performance_reviews',
    'leave_requests','payroll','documents','assets','announcements','notifications',
    'biometric_enrollments','deduction_policies','payroll_adjustments','kpis','employee_kpis',
    'recognitions','employee_awards','report_exports','recognition_elections','recognition_candidates',
    'recognition_votes','finance_categories','finance_transactions','finance_budgets','finance_period_locks',
    'payroll_disputes','leave_policies','leave_balances','organization_holidays','attendance_corrections',
    'payroll_compensation_profiles','pay_runs','payroll_reversals','recruitment_jobs',
    'recruitment_candidates','recruitment_stage_history','recruitment_interviews','interview_evaluations',
    'recruitment_offers','onboarding_templates','employee_onboarding_tasks','development_plans',
    'training_courses','training_assignments','asset_custody_history','asset_maintenance',
    'announcement_acknowledgements','report_definitions','report_schedules','audit_logs'
  ];
  default_org uuid := (select id from public.organizations where slug='peopleflow');
begin
  foreach table_name in array tenant_tables loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)',table_name);
    execute format('update public.%I set organization_id=$1 where organization_id is null',table_name) using default_org;
    execute format('alter table public.%I alter column organization_id set not null',table_name);
    execute format('alter table public.%I alter column organization_id set default public.current_organization_id()',table_name);
    execute format('create index if not exists %I on public.%I(organization_id)',table_name || '_organization_idx',table_name);
    execute format('alter table public.%I enable row level security',table_name);
    execute format('drop policy if exists tenant_isolation on public.%I',table_name);
    execute format('create policy tenant_isolation on public.%I as restrictive for all to authenticated using (organization_id=public.current_organization_id()) with check (organization_id=public.current_organization_id())',table_name);
  end loop;
end $$;

-- Organization settings previously used a singleton boolean key.
alter table public.organization_settings add column if not exists organization_id uuid references public.organizations(id);
update public.organization_settings set organization_id=(select id from public.organizations where slug='peopleflow') where organization_id is null;
alter table public.organization_settings alter column organization_id set not null;
alter table public.organization_settings alter column organization_id set default public.current_organization_id();
alter table public.organization_settings drop constraint if exists organization_settings_pkey;
alter table public.organization_settings add primary key(organization_id);
drop policy if exists tenant_isolation on public.organization_settings;
create policy tenant_isolation on public.organization_settings as restrictive for all to authenticated
using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());

-- Common natural identifiers are unique inside a tenant, rather than globally.
alter table public.departments drop constraint if exists departments_name_key;
alter table public.employees drop constraint if exists employees_employee_id_key;
alter table public.employees drop constraint if exists employees_user_id_key;
alter table public.employees drop constraint if exists employees_email_key;
alter table public.assets drop constraint if exists assets_serial_number_key;
create unique index if not exists departments_org_name_key on public.departments(organization_id,lower(name)) where deleted_at is null;
create unique index if not exists employees_org_employee_id_key on public.employees(organization_id,employee_id) where deleted_at is null;
create unique index if not exists employees_org_user_id_key on public.employees(organization_id,user_id) where user_id is not null and deleted_at is null;
create unique index if not exists employees_org_email_key on public.employees(organization_id,lower(email)) where deleted_at is null;
create unique index if not exists assets_org_serial_number_key on public.assets(organization_id,serial_number) where serial_number is not null and deleted_at is null;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
create policy "members view organizations" on public.organizations for select to authenticated
using(exists(select 1 from public.organization_memberships m where m.organization_id=id and m.user_id=auth.uid() and m.status='ACTIVE'));
create policy "members view own memberships" on public.organization_memberships for select to authenticated
using(user_id=auth.uid() or (organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER')));
create policy "admins manage memberships" on public.organization_memberships for all to authenticated
using(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN')
with check(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN');

create or replace function public.set_tenant_from_session() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is null then new.organization_id:=public.current_organization_id(); end if;
  if new.organization_id is null then raise exception 'No active organization selected'; end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  for table_name in select c.table_name from information_schema.columns c
    where c.table_schema='public' and c.column_name='organization_id'
      and c.table_name not in ('organizations','organization_memberships')
  loop
    execute format('drop trigger if exists set_tenant_from_session on public.%I',table_name);
    execute format('create trigger set_tenant_from_session before insert on public.%I for each row execute function public.set_tenant_from_session()',table_name);
  end loop;
end $$;
