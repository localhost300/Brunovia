-- Deterministic payroll runs, compensation snapshots, four-eyes approval,
-- immutable locks, reversals, and private payslip delivery.

create table if not exists public.payroll_compensation_profiles(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  effective_from date not null,
  effective_to date,
  basic_salary numeric(14,2) not null check(basic_salary >= 0),
  fixed_allowances numeric(14,2) not null default 0 check(fixed_allowances >= 0),
  overtime_rate numeric(14,2) not null default 0 check(overtime_rate >= 0),
  bank_name text,
  bank_account_number text check(bank_account_number is null or bank_account_number ~ '^[0-9]{10}$'),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check(effective_to is null or effective_to >= effective_from)
);
create unique index if not exists one_current_compensation_profile on public.payroll_compensation_profiles(employee_id) where effective_to is null;
create index if not exists compensation_profile_dates_idx on public.payroll_compensation_profiles(employee_id,effective_from desc,effective_to);

create table if not exists public.pay_runs(
  id uuid primary key default gen_random_uuid(),
  period date not null unique check(period=date_trunc('month',period)::date),
  payment_date date not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','AWAITING_APPROVAL','REJECTED','APPROVED','LOCKED','PAID','REVERSED')),
  employee_count integer not null default 0,
  gross_total numeric(16,2) not null default 0,
  deduction_total numeric(16,2) not null default 0,
  net_total numeric(16,2) not null default 0,
  prepared_by uuid references public.users(id),
  prepared_at timestamptz,
  submitted_by uuid references public.users(id),
  submitted_at timestamptz,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  locked_by uuid references public.users(id),
  locked_at timestamptz,
  paid_by uuid references public.users(id),
  paid_at timestamptz,
  rejection_reason text,
  calculation_version text not null default '2026.1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payroll add column if not exists pay_run_id uuid references public.pay_runs(id);
alter table public.payroll add column if not exists unpaid_leave_deduction numeric(14,2) not null default 0;
alter table public.payroll add column if not exists calculation_inputs jsonb not null default '{}';
create index if not exists payroll_pay_run_idx on public.payroll(pay_run_id,employee_id);

create table if not exists public.payroll_reversals(
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references public.pay_runs(id),
  reason text not null check(length(trim(reason)) >= 10),
  status text not null default 'REQUESTED' check(status in ('REQUESTED','APPROVED','REJECTED')),
  requested_by uuid not null references public.users(id),
  approved_by uuid references public.users(id),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  check(approved_by is null or approved_by <> requested_by)
);

alter table public.payroll_compensation_profiles enable row level security;
alter table public.pay_runs enable row level security;
alter table public.payroll_reversals enable row level security;

create policy "employees view own compensation" on public.payroll_compensation_profiles for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr manages compensation" on public.payroll_compensation_profiles for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr views pay runs" on public.pay_runs for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "employees view current pay run" on public.pay_runs for select to authenticated using(exists(select 1 from public.payroll p where p.pay_run_id=id and p.employee_id=public.current_employee_record_id()));
create policy "hr views reversals" on public.payroll_reversals for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

drop policy if exists "own payroll or hr" on public.payroll;
create policy "own payroll or hr" on public.payroll for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.refresh_pay_run_totals(p_pay_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update pay_runs r set
    employee_count=s.employee_count,
    gross_total=s.gross_total,
    deduction_total=s.deduction_total,
    net_total=s.net_total,
    updated_at=now()
  from (
    select count(*)::integer employee_count,
      coalesce(sum(basic_salary+allowances+bonuses+overtime),0) gross_total,
    coalesce(sum(deductions+penalty_fee),0) deduction_total,
      coalesce(sum(net_pay),0) net_total
    from payroll where pay_run_id=p_pay_run_id
  ) s where r.id=p_pay_run_id;
end $$;

create or replace function public.calculate_payroll_run(p_period date,p_payment_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare normalized date:=date_trunc('month',p_period)::date; month_end date:=(date_trunc('month',p_period)+interval '1 month'-interval '1 day')::date; target_run uuid; working_days integer;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  if exists(select 1 from pay_runs where period=normalized) then raise exception 'A payroll run already exists for this period'; end if;
  working_days:=public.business_days(normalized,month_end);
  insert into pay_runs(period,payment_date,prepared_by,prepared_at) values(normalized,p_payment_date,auth.uid(),now()) returning id into target_run;

  insert into payroll(pay_run_id,employee_id,period,basic_salary,allowances,deductions,bonuses,overtime,penalty_fee,status,unpaid_leave_deduction,calculation_inputs)
  select target_run,e.id,normalized,c.basic_salary,c.fixed_allowances,
    round((c.basic_salary/greatest(working_days,1))*coalesce(ul.days,0),2),0,
    round(coalesce(ot.hours,0)*c.overtime_rate,2),
    0,'DRAFT',
    round((c.basic_salary/greatest(working_days,1))*coalesce(ul.days,0),2),
    jsonb_build_object('working_days',working_days,'overtime_hours',coalesce(ot.hours,0),'unpaid_leave_days',coalesce(ul.days,0),'compensation_profile_id',c.id)
  from employees e
  join payroll_compensation_profiles c on c.employee_id=e.id and c.effective_from<=month_end and (c.effective_to is null or c.effective_to>=normalized)
  left join lateral (
    select coalesce(sum(greatest(0,extract(epoch from (a.clock_out-a.clock_in))/3600-8)),0)::numeric hours
    from attendance a where a.employee_id=e.id and a.work_date between normalized and month_end and a.clock_out is not null
  ) ot on true
  left join lateral (
    select coalesce(sum(public.business_days(l.start_date,l.end_date)),0)::numeric days
    from leave_requests l join leave_policies lp on lp.id=l.leave_policy_id
    where l.employee_id=e.id and l.status='APPROVED' and lp.annual_allowance=0 and l.start_date<=month_end and l.end_date>=normalized
  ) ul on true
  where e.deleted_at is null and e.status in ('ACTIVE','ON_LEAVE');

  perform public.refresh_pay_run_totals(target_run);
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'CALCULATE_PAYROLL','pay_run',target_run::text,jsonb_build_object('period',normalized,'calculation_version','2026.1'));
  return target_run;
end $$;

create or replace function public.transition_pay_run(p_pay_run_id uuid,p_status text,p_reason text default null)
returns text language plpgsql security definer set search_path=public as $$
declare target pay_runs; allowed boolean:=false;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  select * into target from pay_runs where id=p_pay_run_id for update;
  if target.id is null then raise exception 'Payroll run not found'; end if;
  allowed:=(target.status='DRAFT' and p_status='AWAITING_APPROVAL') or (target.status='AWAITING_APPROVAL' and p_status in ('DRAFT','APPROVED','REJECTED')) or (target.status='REJECTED' and p_status='DRAFT') or (target.status='APPROVED' and p_status='LOCKED') or (target.status='LOCKED' and p_status='PAID');
  if not allowed then raise exception 'Invalid transition from % to %',target.status,p_status; end if;
  if p_status='APPROVED' and target.prepared_by=auth.uid() then raise exception 'The preparer cannot approve the same payroll run'; end if;
  if p_status='REJECTED' and length(trim(coalesce(p_reason,'')))<5 then raise exception 'A rejection reason is required'; end if;
  update pay_runs set status=p_status,updated_at=now(),submitted_by=case when p_status='AWAITING_APPROVAL' then auth.uid() else submitted_by end,submitted_at=case when p_status='AWAITING_APPROVAL' then now() else submitted_at end,approved_by=case when p_status='APPROVED' then auth.uid() else approved_by end,approved_at=case when p_status='APPROVED' then now() else approved_at end,locked_by=case when p_status='LOCKED' then auth.uid() else locked_by end,locked_at=case when p_status='LOCKED' then now() else locked_at end,paid_by=case when p_status='PAID' then auth.uid() else paid_by end,paid_at=case when p_status='PAID' then now() else paid_at end,rejection_reason=case when p_status='REJECTED' then p_reason when p_status='DRAFT' then null else rejection_reason end where id=p_pay_run_id;
  update payroll set status=p_status where pay_run_id=p_pay_run_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),'PAY_RUN_'||p_status,'pay_run',p_pay_run_id::text,jsonb_build_object('status',target.status),jsonb_build_object('status',p_status,'reason',p_reason));
  return p_status;
end $$;

create or replace function public.guard_locked_payroll()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from pay_runs where id=coalesce(old.pay_run_id,new.pay_run_id) and status in ('LOCKED','PAID','REVERSED')) then raise exception 'Locked payroll records are immutable'; end if;
  return coalesce(new,old);
end $$;
drop trigger if exists guard_locked_payroll_rows on public.payroll;
create trigger guard_locked_payroll_rows before update or delete on public.payroll for each row execute function public.guard_locked_payroll();

create or replace function public.recalculate_payroll_adjustment()
returns trigger language plpgsql security definer set search_path=public as $$
declare run_id uuid;
begin
  select pay_run_id into run_id from payroll where id=new.payroll_id;
  if exists(select 1 from pay_runs where id=run_id and status<>'DRAFT') then raise exception 'Adjustments are allowed only while payroll is in draft'; end if;
  update payroll set deductions=(select coalesce(sum(amount),0) from payroll_adjustments where payroll_id=new.payroll_id and adjustment_type<>'LATE_PENALTY')+unpaid_leave_deduction where id=new.payroll_id;
  perform public.refresh_pay_run_totals(run_id);
  return new;
end $$;
drop trigger if exists recalculate_payroll_after_adjustment on public.payroll_adjustments;
create trigger recalculate_payroll_after_adjustment after insert or update on public.payroll_adjustments for each row execute function public.recalculate_payroll_adjustment();

revoke all on function public.calculate_payroll_run(date,date) from public,anon;
grant execute on function public.calculate_payroll_run(date,date) to authenticated;
revoke all on function public.transition_pay_run(uuid,text,text) from public,anon;
grant execute on function public.transition_pay_run(uuid,text,text) to authenticated;
revoke all on function public.refresh_pay_run_totals(uuid) from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payslips','payslips',false,5242880,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf'];

create policy "employees download own payslips" on storage.objects for select to authenticated
using(bucket_id='payslips' and (public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (storage.foldername(name))[1]=auth.uid()::text));

-- Payslips are uploaded by a trusted server/worker using the service role; browsers receive signed URLs only.
