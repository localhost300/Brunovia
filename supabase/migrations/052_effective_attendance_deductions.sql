create extension if not exists pg_cron with schema pg_catalog;

alter table public.deduction_policies
  drop constraint if exists deduction_policies_name_key;
create unique index if not exists deduction_policies_organization_name_key
  on public.deduction_policies(organization_id,name);

create or replace function public.seed_attendance_deduction_policies()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.deduction_policies(
    organization_id,name,adjustment_type,grace_minutes,
    amount_per_occurrence,active,tiers,updated_at
  )
  values
    (
      new.id,'Standard late-arrival penalty','LATE_PENALTY',10,1000,true,
      '[{"from_minutes":11,"to_minutes":null,"amount":1000}]'::jsonb,now()
    ),
    (
      new.id,'Standard absence penalty','ABSENCE',0,2500,true,
      '[]'::jsonb,now()
    )
  on conflict(organization_id,name) do update set
    adjustment_type=excluded.adjustment_type,
    grace_minutes=excluded.grace_minutes,
    amount_per_occurrence=excluded.amount_per_occurrence,
    active=true,
    tiers=excluded.tiers,
    updated_at=excluded.updated_at;
  return new;
end $$;

drop trigger if exists seed_attendance_deduction_policies_on_organization
  on public.organizations;
create trigger seed_attendance_deduction_policies_on_organization
after insert on public.organizations
for each row execute function public.seed_attendance_deduction_policies();

update public.deduction_policies
set active=false,updated_at=now()
where adjustment_type in ('LATE_PENALTY','ABSENCE');

insert into public.deduction_policies(
  organization_id,name,adjustment_type,grace_minutes,
  amount_per_occurrence,active,tiers,updated_at
)
select o.id,'Standard late-arrival penalty','LATE_PENALTY',10,1000,true,
  '[{"from_minutes":11,"to_minutes":null,"amount":1000}]'::jsonb,now()
from public.organizations o
on conflict(organization_id,name) do update set
  adjustment_type=excluded.adjustment_type,
  grace_minutes=excluded.grace_minutes,
  amount_per_occurrence=excluded.amount_per_occurrence,
  active=true,tiers=excluded.tiers,updated_at=excluded.updated_at;

insert into public.deduction_policies(
  organization_id,name,adjustment_type,grace_minutes,
  amount_per_occurrence,active,tiers,updated_at
)
select o.id,'Standard absence penalty','ABSENCE',0,2500,true,'[]'::jsonb,now()
from public.organizations o
on conflict(organization_id,name) do update set
  adjustment_type=excluded.adjustment_type,
  grace_minutes=excluded.grace_minutes,
  amount_per_occurrence=excluded.amount_per_occurrence,
  active=true,tiers=excluded.tiers,updated_at=excluded.updated_at;

create or replace function public.recalculate_payroll_adjustment()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_payroll_id uuid;
  run_id uuid;
begin
  target_payroll_id:=case when tg_op='DELETE' then old.payroll_id else new.payroll_id end;
  select pay_run_id into run_id from payroll where id=target_payroll_id;
  if exists(select 1 from pay_runs where id=run_id and status<>'DRAFT') then
    raise exception 'Adjustments are allowed only while payroll is in draft';
  end if;

  update payroll
  set credit_adjustments=(
      select coalesce(sum(amount),0)
      from payroll_adjustments
      where payroll_id=target_payroll_id and direction='CREDIT'
    ),
    deductions=(
      select coalesce(sum(amount),0)
      from payroll_adjustments
      where payroll_id=target_payroll_id
        and direction='DEBIT'
        and adjustment_type not in ('LATE_PENALTY','ABSENCE')
    ),
    penalty_fee=(
      select coalesce(sum(amount),0)
      from payroll_adjustments
      where payroll_id=target_payroll_id
        and direction='DEBIT'
        and adjustment_type in ('LATE_PENALTY','ABSENCE')
    ),
    unpaid_leave_deduction=0,
    calculation_inputs=coalesce(calculation_inputs,'{}'::jsonb)
      -'missed_clock_out_days'
      -'missed_clock_out_deduction'
      -'unpaid_leave_days'
      -'historical_deduction_carry_forward'
  where id=target_payroll_id;

  perform public.refresh_pay_run_totals(run_id);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists recalculate_payroll_after_adjustment
  on public.payroll_adjustments;
create trigger recalculate_payroll_after_adjustment
after insert or update or delete on public.payroll_adjustments
for each row execute function public.recalculate_payroll_adjustment();

create or replace function public.enforce_attendance_deduction_start_date()
returns trigger language plpgsql set search_path=public as $$
declare
  attendance_date date;
  attendance_status public.attendance_status;
  target_organization uuid;
  target_amount numeric(14,2);
begin
  if new.adjustment_type not in ('LATE_PENALTY','ABSENCE')
    or new.attendance_id is null then
    return new;
  end if;

  select a.work_date,a.status,p.organization_id
  into attendance_date,attendance_status,target_organization
  from attendance a
  join payroll p on p.id=new.payroll_id and p.employee_id=a.employee_id
    and p.organization_id=a.organization_id
  where a.id=new.attendance_id;
  if attendance_date is null or attendance_date<date '2026-10-22'
    or (new.adjustment_type='LATE_PENALTY' and attendance_status<>'LATE')
    or (new.adjustment_type='ABSENCE' and attendance_status<>'ABSENT') then
    return null;
  end if;

  select amount_per_occurrence into target_amount
  from deduction_policies
  where organization_id=target_organization
    and adjustment_type=new.adjustment_type and active=true
  order by updated_at desc
  limit 1;
  if target_amount is null or target_amount<=0 then return null; end if;
  new.organization_id:=target_organization;
  new.amount:=target_amount;
  new.direction:='DEBIT';
  return new;
end $$;

drop trigger if exists enforce_attendance_deduction_start_date
  on public.payroll_adjustments;
create trigger enforce_attendance_deduction_start_date
before insert or update on public.payroll_adjustments
for each row execute function public.enforce_attendance_deduction_start_date();

create or replace function public.apply_attendance_payroll_deduction()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_payroll uuid;
  target_organization uuid;
  target_type public.payroll_adjustment_type;
  target_amount numeric(14,2);
begin
  if new.work_date < date '2026-10-22' then return new; end if;
  if new.status='LATE' then
    target_type:='LATE_PENALTY';
  elsif new.status='ABSENT' then
    target_type:='ABSENCE';
  else
    return new;
  end if;

  select p.id,p.organization_id into target_payroll,target_organization
  from payroll p
  where p.employee_id=new.employee_id
    and p.organization_id=new.organization_id
    and date_trunc('month',p.period)=date_trunc('month',new.work_date::timestamp)
    and p.status='DRAFT'
    and (p.pay_run_id is null or exists(
      select 1 from pay_runs r where r.id=p.pay_run_id and r.status='DRAFT'
    ))
  limit 1;
  if target_payroll is null then return new; end if;

  select amount_per_occurrence into target_amount
  from deduction_policies
  where organization_id=target_organization
    and adjustment_type=target_type and active=true
  order by updated_at desc
  limit 1;
  if target_amount is null or target_amount<=0 then return new; end if;

  delete from payroll_adjustments
  where payroll_id=target_payroll
    and attendance_id=new.id
    and adjustment_type in ('LATE_PENALTY','ABSENCE')
    and adjustment_type<>target_type;

  insert into payroll_adjustments(
    payroll_id,employee_id,organization_id,adjustment_type,direction,
    amount,reason,attendance_id
  )
  values(
    target_payroll,new.employee_id,target_organization,target_type,
    'DEBIT',target_amount,
    case target_type
      when 'LATE_PENALTY' then 'Late arrival'
      else 'Absent from scheduled shift'
    end,
    new.id
  )
  on conflict(attendance_id,adjustment_type) do update
  set direction='DEBIT',amount=excluded.amount,reason=excluded.reason;
  return new;
end $$;

drop trigger if exists attendance_payroll_penalty on public.attendance;
create trigger attendance_payroll_penalty
after insert or update of status on public.attendance
for each row execute function public.apply_attendance_payroll_deduction();

create or replace function public.reset_new_payroll_deductions()
returns trigger language plpgsql set search_path=public as $$
begin
  new.deductions:=0;
  new.penalty_fee:=0;
  new.unpaid_leave_deduction:=0;
  new.calculation_inputs:=coalesce(new.calculation_inputs,'{}'::jsonb)
    -'missed_clock_out_days'
    -'missed_clock_out_deduction'
    -'unpaid_leave_days'
    -'historical_deduction_carry_forward';
  return new;
end $$;

drop trigger if exists reset_payroll_deductions_before_insert on public.payroll;
create trigger reset_payroll_deductions_before_insert
before insert on public.payroll
for each row execute function public.reset_new_payroll_deductions();

create or replace function public.apply_payroll_attendance_deductions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into payroll_adjustments(
    payroll_id,employee_id,organization_id,adjustment_type,direction,
    amount,reason,attendance_id
  )
  select new.id,a.employee_id,new.organization_id,
    case a.status
      when 'LATE' then 'LATE_PENALTY'::public.payroll_adjustment_type
      else 'ABSENCE'::public.payroll_adjustment_type
    end,
    'DEBIT',policy.amount_per_occurrence,
    case a.status
      when 'LATE' then 'Late arrival'
      else 'Absent from scheduled shift'
    end,
    a.id
  from attendance a
  join lateral (
    select amount_per_occurrence
    from deduction_policies dp
    where dp.organization_id=new.organization_id
      and dp.adjustment_type=case a.status
      when 'LATE' then 'LATE_PENALTY'::public.payroll_adjustment_type
      else 'ABSENCE'::public.payroll_adjustment_type
    end
      and dp.active=true and dp.amount_per_occurrence>0
    limit 1
  ) policy on true
  where a.employee_id=new.employee_id
    and a.organization_id=new.organization_id
    and a.work_date>=date '2026-10-22'
    and a.work_date>=date_trunc('month',new.period)::date
    and a.work_date<(date_trunc('month',new.period)+interval '1 month')::date
    and a.status in ('LATE','ABSENT')
  on conflict(attendance_id,adjustment_type) do update
  set direction='DEBIT',amount=excluded.amount,reason=excluded.reason;
  return new;
end $$;

drop trigger if exists payroll_attendance_deduction_backfill on public.payroll;
create trigger payroll_attendance_deduction_backfill
after insert on public.payroll
for each row execute function public.apply_payroll_attendance_deductions();

delete from public.payroll_adjustments pa
using public.payroll p
where pa.payroll_id=p.id
  and pa.direction='DEBIT'
  and p.status='DRAFT'
  and (p.pay_run_id is null or exists(
    select 1 from public.pay_runs r where r.id=p.pay_run_id and r.status='DRAFT'
  ));

update public.payroll p
set deductions=0,
  penalty_fee=0,
  unpaid_leave_deduction=0,
  calculation_inputs=coalesce(calculation_inputs,'{}'::jsonb)
    -'missed_clock_out_days'
    -'missed_clock_out_deduction'
    -'unpaid_leave_days'
    -'historical_deduction_carry_forward'
where p.status='DRAFT'
  and (p.pay_run_id is null or exists(
    select 1 from public.pay_runs r where r.id=p.pay_run_id and r.status='DRAFT'
  ));

insert into public.payroll_adjustments(
  payroll_id,employee_id,organization_id,adjustment_type,direction,
  amount,reason,attendance_id
)
select p.id,a.employee_id,p.organization_id,
  case a.status
    when 'LATE' then 'LATE_PENALTY'::public.payroll_adjustment_type
    else 'ABSENCE'::public.payroll_adjustment_type
  end,
  'DEBIT',dp.amount_per_occurrence,
  case a.status
    when 'LATE' then 'Late arrival'
    else 'Absent from scheduled shift'
  end,
  a.id
from public.payroll p
join public.attendance a on a.employee_id=p.employee_id
  and a.organization_id=p.organization_id
  and a.work_date>=date '2026-10-22'
  and a.work_date>=date_trunc('month',p.period)::date
  and a.work_date<(date_trunc('month',p.period)+interval '1 month')::date
  and a.status in ('LATE','ABSENT')
join public.deduction_policies dp
  on dp.organization_id=p.organization_id
  and dp.adjustment_type=case a.status
    when 'LATE' then 'LATE_PENALTY'::public.payroll_adjustment_type
    else 'ABSENCE'::public.payroll_adjustment_type
  end
  and dp.active=true and dp.amount_per_occurrence>0
where p.status='DRAFT'
  and (p.pay_run_id is null or exists(
    select 1 from public.pay_runs r where r.id=p.pay_run_id and r.status='DRAFT'
  ))
on conflict(attendance_id,adjustment_type) do update
set direction='DEBIT',amount=excluded.amount,reason=excluded.reason;

create or replace function public.mark_unclosed_attendance_absent()
returns integer language plpgsql security definer set search_path=public as $$
declare
  affected integer;
begin
  update attendance a
  set status='ABSENT',
    metadata=coalesce(a.metadata,'{}'::jsonb)
      || jsonb_build_object('auto_absent_reason','Clock-out was not recorded after shift end')
  from shifts s
  where s.id=a.shift_id
    and a.work_date>=date '2026-10-22'
    and a.work_date <= (now() at time zone 'Africa/Lagos')::date
    and a.status<>'ABSENT'
    and a.clock_in is not null
    and a.clock_out is null
    and (
      case
        when s.end_time<=s.start_time
          then (a.work_date+1)+s.end_time
        else a.work_date+s.end_time
      end
    ) at time zone 'Africa/Lagos' <= now();
  get diagnostics affected=row_count;
  return affected;
end $$;

do $$
declare
  scheduled_job record;
begin
  for scheduled_job in
    select jobid from cron.job where jobname='mark-unclosed-attendance-absent'
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
  perform cron.schedule(
    'mark-unclosed-attendance-absent',
    '*/15 * * * *',
    'select public.mark_unclosed_attendance_absent();'
  );
end $$;

do $$
declare
  target_run uuid;
begin
  for target_run in
    select id from public.pay_runs where status='DRAFT'
  loop
    perform public.refresh_pay_run_totals(target_run);
  end loop;
end $$;

notify pgrst, 'reload schema';
