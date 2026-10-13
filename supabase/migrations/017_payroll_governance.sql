-- Production payroll governance: tiered lateness rules, approvals, disputes,
-- employee notifications, audit history, and reporting.

alter table public.deduction_policies
  add column if not exists tiers jsonb not null default '[{"from_minutes":11,"to_minutes":30,"amount":2500},{"from_minutes":31,"to_minutes":60,"amount":5000},{"from_minutes":61,"to_minutes":null,"amount":10000}]'::jsonb;

alter table public.payroll
  add column if not exists submitted_by uuid references public.users(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references public.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists paid_by uuid references public.users(id),
  add column if not exists paid_at timestamptz,
  add column if not exists rejection_reason text;

create table if not exists public.payroll_disputes(
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.payroll(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  adjustment_id uuid references public.payroll_adjustments(id),
  reason text not null check(length(trim(reason)) >= 10),
  evidence_path text,
  status text not null default 'OPEN' check(status in ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolution text,
  created_by uuid not null references public.users(id),
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payroll_disputes_employee_idx on public.payroll_disputes(employee_id,created_at desc);
create index if not exists payroll_disputes_status_idx on public.payroll_disputes(status,created_at desc);

alter table public.payroll_disputes enable row level security;
drop policy if exists "employees view own payroll disputes" on public.payroll_disputes;
create policy "employees view own payroll disputes" on public.payroll_disputes for select to authenticated
using(employee_id in(select id from public.employees where user_id=auth.uid()) or public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
drop policy if exists "employees create own payroll disputes" on public.payroll_disputes;
create policy "employees create own payroll disputes" on public.payroll_disputes for insert to authenticated
with check(created_by=auth.uid() and employee_id in(select id from public.employees where user_id=auth.uid()));
drop policy if exists "hr resolves payroll disputes" on public.payroll_disputes;
create policy "hr resolves payroll disputes" on public.payroll_disputes for update to authenticated
using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.audit_deduction_policy_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'UPDATE_LATENESS_RULE','deduction_policy',new.id::text,to_jsonb(old),to_jsonb(new));
  return new;
end $$;
drop trigger if exists audit_deduction_policy_updates on public.deduction_policies;
create trigger audit_deduction_policy_updates after update on public.deduction_policies
for each row execute function public.audit_deduction_policy_change();

create or replace function public.late_penalty_amount(p_minutes_late integer) returns numeric
language sql stable security definer set search_path=public as $$
  select coalesce((
    select (tier->>'amount')::numeric
    from deduction_policies p cross join lateral jsonb_array_elements(p.tiers) tier
    where p.adjustment_type='LATE_PENALTY' and p.active=true
      and p_minutes_late >= (tier->>'from_minutes')::integer
      and ((tier->>'to_minutes') is null or p_minutes_late <= (tier->>'to_minutes')::integer)
    order by p.updated_at desc,(tier->>'from_minutes')::integer desc limit 1
  ),0)
$$;

create or replace function public.change_payroll_status(p_period date,p_status text,p_reason text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  if p_status not in ('DRAFT','AWAITING_APPROVAL','APPROVED','PAID','REJECTED') then raise exception 'Invalid payroll status'; end if;
  update payroll set
    status=p_status,
    submitted_by=case when p_status='AWAITING_APPROVAL' then auth.uid() else submitted_by end,
    submitted_at=case when p_status='AWAITING_APPROVAL' then now() else submitted_at end,
    approved_by=case when p_status='APPROVED' then auth.uid() else approved_by end,
    approved_at=case when p_status='APPROVED' then now() else approved_at end,
    paid_by=case when p_status='PAID' then auth.uid() else paid_by end,
    paid_at=case when p_status='PAID' then now() else paid_at end,
    rejection_reason=case when p_status='REJECTED' then p_reason else null end
  where date_trunc('month',period)=date_trunc('month',p_period);
  get diagnostics affected=row_count;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'PAYROLL_STATUS_'||p_status,'payroll_period',p_period::text,jsonb_build_object('status',p_status,'affected',affected,'reason',p_reason));
  return affected;
end $$;
revoke all on function public.change_payroll_status(date,text,text) from public;
grant execute on function public.change_payroll_status(date,text,text) to authenticated;

create or replace function public.notify_payroll_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare target_user uuid;
begin
  select user_id into target_user from employees where id=new.employee_id;
  if target_user is not null and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into notifications(user_id,title,body,type)
    values(target_user,
      case when new.status='PAID' then 'Salary payment completed' else 'Payroll status updated' end,
      'Your payroll for '||to_char(new.period,'Month YYYY')||' is now '||replace(new.status,'_',' ')||'.',
      'PAYROLL');
  end if;
  return new;
end $$;
drop trigger if exists payroll_employee_notification on public.payroll;
create trigger payroll_employee_notification after insert or update of status on public.payroll
for each row execute function public.notify_payroll_event();

create or replace view public.workforce_monthly_metrics as
select date_trunc('month',a.work_date)::date as month,
  count(*) as attendance_records,
  count(*) filter(where a.status='LATE') as late_arrivals,
  count(*) filter(where a.status='ABSENT') as absences,
  count(distinct a.employee_id) as active_employees,
  coalesce(sum(extract(epoch from (a.clock_out-a.clock_in))/3600) filter(where a.clock_out is not null),0)::numeric(12,2) as hours_worked
from public.attendance a group by 1;

grant select on public.workforce_monthly_metrics to authenticated;
grant select,insert,update on public.payroll_disputes to authenticated;

