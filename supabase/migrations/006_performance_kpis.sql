create table public.kpis(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  target_value numeric(12,2),
  target_unit text,
  weight numeric(5,2) not null check(weight > 0 and weight <= 100),
  department_id uuid references public.departments(id),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.employee_kpis(
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.kpis(id),
  employee_id uuid not null references public.employees(id),
  period_start date not null,
  period_end date not null,
  actual_value numeric(12,2),
  score numeric(5,2) check(score between 0 and 100),
  status text not null default 'ACTIVE' check(status in ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
  manager_comment text,
  employee_comment text,
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(kpi_id,employee_id,period_start,period_end),
  check(period_end >= period_start)
);
create index employee_kpis_employee_period_idx on public.employee_kpis(employee_id,period_start,period_end);
alter table public.kpis enable row level security;
alter table public.employee_kpis enable row level security;
create policy "staff view assigned kpis" on public.kpis for select to authenticated using(deleted_at is null);
create policy "managers create kpis" on public.kpis for insert to authenticated with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER') and created_by=auth.uid());
create policy "staff view own performance" on public.employee_kpis for select to authenticated using(employee_id in(select id from public.employees where user_id=auth.uid()) or public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "managers assign and review kpis" on public.employee_kpis for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
