create type public.payroll_adjustment_type as enum ('LATE_PENALTY','DISCIPLINARY','LOAN','DAMAGE','ABSENCE','OTHER');

create table public.deduction_policies(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  adjustment_type payroll_adjustment_type not null,
  grace_minutes integer not null default 10 check(grace_minutes >= 0),
  amount_per_occurrence numeric(14,2) not null check(amount_per_occurrence >= 0),
  active boolean not null default true,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

insert into public.deduction_policies(name,adjustment_type,grace_minutes,amount_per_occurrence)
values('Standard late-arrival penalty','LATE_PENALTY',10,2500)
on conflict(name) do nothing;

create table public.payroll_adjustments(
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.payroll(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  adjustment_type payroll_adjustment_type not null,
  amount numeric(14,2) not null check(amount > 0),
  reason text not null check(length(trim(reason)) >= 5),
  attendance_id uuid references public.attendance(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(attendance_id,adjustment_type)
);
create index payroll_adjustments_payroll_idx on public.payroll_adjustments(payroll_id,employee_id);

alter table public.deduction_policies enable row level security;
alter table public.payroll_adjustments enable row level security;
create policy "staff view deduction policy" on public.deduction_policies for select to authenticated using(true);
create policy "admins manage deduction policy" on public.deduction_policies for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "authorized users view deductions" on public.payroll_adjustments for select to authenticated using(employee_id in(select id from public.employees where user_id=auth.uid()) or public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "managers add manual deductions" on public.payroll_adjustments for insert to authenticated with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER') and adjustment_type <> 'LATE_PENALTY' and created_by=auth.uid());
create policy "admins amend deductions" on public.payroll_adjustments for update to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.apply_late_attendance_penalty() returns trigger language plpgsql security definer set search_path=public as $$
declare target_payroll uuid; policy_amount numeric(14,2);
begin
  if new.status <> 'LATE' or new.work_date < date '2026-10-19' then return new; end if;
  select amount_per_occurrence into policy_amount from deduction_policies where adjustment_type='LATE_PENALTY' and active=true order by updated_at desc limit 1;
  select id into target_payroll from payroll where employee_id=new.employee_id and date_trunc('month',period)=date_trunc('month',new.work_date::timestamptz) and status='DRAFT' limit 1;
  if target_payroll is not null and policy_amount > 0 then
    insert into payroll_adjustments(payroll_id,employee_id,adjustment_type,amount,reason,attendance_id)
    values(target_payroll,new.employee_id,'LATE_PENALTY',policy_amount,'Automatic deduction for late arrival',new.id)
    on conflict(attendance_id,adjustment_type) do nothing;
    update payroll set penalty_fee=(select coalesce(sum(amount),0) from payroll_adjustments where payroll_id=target_payroll and adjustment_type='LATE_PENALTY') where id=target_payroll;
  end if;
  return new;
end $$;
create trigger attendance_late_payroll_adjustment after insert or update of status on public.attendance for each row execute function public.apply_late_attendance_penalty();

create or replace function public.audit_payroll_adjustment() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'CREATE_DEDUCTION','payroll_adjustment',new.id::text,to_jsonb(new)); return new; end $$;
create trigger audit_payroll_adjustments after insert on public.payroll_adjustments for each row execute function public.audit_payroll_adjustment();
