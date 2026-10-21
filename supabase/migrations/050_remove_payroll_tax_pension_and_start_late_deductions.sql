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

alter table public.payroll disable trigger guard_locked_payroll_rows;
alter table public.payroll drop column if exists net_pay;
do $$
begin
  if (
    select count(*)=2
    from information_schema.columns
    where table_schema='public'
      and table_name='payroll'
      and column_name in ('tax','pension')
  ) then
    execute $sql$
      update public.payroll
      set deductions=coalesce(deductions,0)+coalesce(tax,0)+coalesce(pension,0),
        calculation_inputs=coalesce(calculation_inputs,'{}'::jsonb)
          || jsonb_build_object(
            'historical_deduction_carry_forward',
            coalesce(tax,0)+coalesce(pension,0)
          )
    $sql$;
  end if;
end $$;
alter table public.payroll
  drop column if exists tax,
  drop column if exists pension;
alter table public.payroll
  add column net_pay numeric(14,2) generated always as (
    basic_salary+allowances+bonuses+overtime-deductions-penalty_fee
  ) stored;
alter table public.payroll enable trigger guard_locked_payroll_rows;

alter table public.payroll_compensation_profiles
  drop column if exists tax_rate,
  drop column if exists pension_rate,
  drop column if exists pension_id;

create or replace function public.apply_late_attendance_penalty()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_payroll uuid;
  policy_amount numeric(14,2);
begin
  if new.status <> 'LATE' or new.work_date < date '2026-10-19' then
    return new;
  end if;

  select amount_per_occurrence into policy_amount
  from deduction_policies
  where adjustment_type='LATE_PENALTY' and active=true
  order by updated_at desc
  limit 1;

  select id into target_payroll
  from payroll
  where employee_id=new.employee_id
    and date_trunc('month',period)=date_trunc('month',new.work_date::timestamptz)
    and status='DRAFT'
  limit 1;

  if target_payroll is not null and policy_amount > 0 then
    insert into payroll_adjustments(
      payroll_id,employee_id,adjustment_type,amount,reason,attendance_id
    )
    values(
      target_payroll,new.employee_id,'LATE_PENALTY',policy_amount,
      'Automatic deduction for late arrival',new.id
    )
    on conflict(attendance_id,adjustment_type) do nothing;

    update payroll
    set penalty_fee=(
      select coalesce(sum(amount),0)
      from payroll_adjustments
      where payroll_id=target_payroll and adjustment_type='LATE_PENALTY'
    )
    where id=target_payroll;
  end if;
  return new;
end $$;

create or replace function public.recalculate_payroll_adjustment()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  run_id uuid;
begin
  select pay_run_id into run_id from payroll where id=new.payroll_id;
  if exists(select 1 from pay_runs where id=run_id and status<>'DRAFT') then
    raise exception 'Adjustments are allowed only while payroll is in draft';
  end if;

  update payroll
  set deductions=(
      select coalesce(sum(amount),0)
      from payroll_adjustments
      where payroll_id=new.payroll_id and adjustment_type<>'LATE_PENALTY'
    )+unpaid_leave_deduction
     +coalesce((calculation_inputs->>'missed_clock_out_deduction')::numeric,0)
     +coalesce((calculation_inputs->>'historical_deduction_carry_forward')::numeric,0)
  where id=new.payroll_id;
  perform public.refresh_pay_run_totals(run_id);
  return new;
end $$;

with removed_adjustments as (
  delete from public.payroll_adjustments pa
  using public.attendance a, public.payroll p
  where pa.payroll_id=p.id
    and pa.attendance_id=a.id
    and pa.adjustment_type='LATE_PENALTY'
    and a.work_date >= date '2026-10-01'
    and a.work_date < date '2026-10-19'
    and p.period >= date '2026-10-01'
    and p.period < date '2026-11-01'
    and p.status='DRAFT'
    and (
      p.pay_run_id is null
      or exists(
        select 1 from public.pay_runs r
        where r.id=p.pay_run_id and r.status='DRAFT'
      )
    )
  returning pa.payroll_id
),
affected_payroll as (
  select distinct payroll_id from removed_adjustments
)
update public.payroll p
set penalty_fee=(
  select coalesce(sum(pa.amount),0)
  from public.payroll_adjustments pa
  where pa.payroll_id=p.id and pa.adjustment_type='LATE_PENALTY'
)
from affected_payroll
where p.id=affected_payroll.payroll_id;

insert into public.payroll_adjustments(
  payroll_id,employee_id,adjustment_type,amount,reason,attendance_id
)
select p.id,a.employee_id,'LATE_PENALTY',policy.amount_per_occurrence,
  'Automatic deduction for late arrival',a.id
from public.payroll p
join public.attendance a on a.employee_id=p.employee_id
  and a.work_date>=date '2026-10-19'
  and a.work_date<date '2026-11-01'
  and a.status='LATE'
cross join lateral (
  select amount_per_occurrence
  from public.deduction_policies
  where adjustment_type='LATE_PENALTY'
    and active=true and amount_per_occurrence>0
  order by updated_at desc
  limit 1
) policy
where p.period>=date '2026-10-01'
  and p.period<date '2026-11-01'
  and p.status='DRAFT'
  and (
    p.pay_run_id is null
    or exists(
      select 1 from public.pay_runs r
      where r.id=p.pay_run_id and r.status='DRAFT'
    )
  )
on conflict(attendance_id,adjustment_type) do nothing;

update public.payroll p
set penalty_fee=(
  select coalesce(sum(pa.amount),0)
  from public.payroll_adjustments pa
  where pa.payroll_id=p.id and pa.adjustment_type='LATE_PENALTY'
)
where p.period>=date '2026-10-01'
  and p.period<date '2026-11-01'
  and p.status='DRAFT'
  and (
    p.pay_run_id is null
    or exists(
      select 1 from public.pay_runs r
      where r.id=p.pay_run_id and r.status='DRAFT'
    )
  );

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

create or replace function public.calculate_payroll_run(p_period date,p_payment_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  normalized date:=date_trunc('month',p_period)::date;
  month_end date:=(date_trunc('month',p_period)+interval '1 month'-interval '1 day')::date;
  target_run uuid;
  working_days integer;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then
    raise exception 'Not authorized';
  end if;
  if exists(select 1 from pay_runs where period=normalized) then
    raise exception 'A payroll run already exists for this period';
  end if;

  working_days:=public.business_days(normalized,month_end);
  insert into pay_runs(period,payment_date,prepared_by,prepared_at)
  values(normalized,p_payment_date,auth.uid(),now())
  returning id into target_run;

  insert into payroll(
    pay_run_id,employee_id,period,basic_salary,allowances,deductions,bonuses,
    overtime,penalty_fee,status,unpaid_leave_deduction,calculation_inputs
  )
  select target_run,e.id,normalized,c.basic_salary,c.fixed_allowances,
    round((c.basic_salary/greatest(working_days,1))*(coalesce(ul.days,0)+coalesce(mc.days,0)),2),
    0,
    round(coalesce(ot.hours,0)*c.overtime_rate,2),
    0,'DRAFT',
    round((c.basic_salary/greatest(working_days,1))*coalesce(ul.days,0),2),
    jsonb_build_object(
      'working_days',working_days,
      'overtime_hours',coalesce(ot.hours,0),
      'unpaid_leave_days',coalesce(ul.days,0),
      'missed_clock_out_days',coalesce(mc.days,0),
      'missed_clock_out_deduction',round((c.basic_salary/greatest(working_days,1))*coalesce(mc.days,0),2),
      'compensation_profile_id',c.id
    )
  from employees e
  join payroll_compensation_profiles c on c.employee_id=e.id
    and c.effective_from<=month_end
    and (c.effective_to is null or c.effective_to>=normalized)
  left join lateral (
    select coalesce(sum(greatest(0,extract(epoch from (a.clock_out-a.clock_in))/3600-8)),0)::numeric hours
    from attendance a
    where a.employee_id=e.id and a.work_date between normalized and month_end
      and a.clock_out is not null
  ) ot on true
  left join lateral (
    select count(*)::numeric days
    from (
      select d.work_date as leave_date
      from employee_shift_days d
      where d.employee_id=e.id and d.assignment_type='UNPAID_LEAVE'
        and d.work_date between normalized and month_end
      union
      select generated_day::date as leave_date
      from leave_requests l
      join leave_policies lp on lp.id=l.leave_policy_id
      cross join lateral generate_series(
        greatest(l.start_date,normalized)::timestamp,
        least(l.end_date,month_end)::timestamp,
        interval '1 day'
      ) generated_day
      where l.employee_id=e.id and l.status='APPROVED' and lp.annual_allowance=0
        and l.start_date<=month_end and l.end_date>=normalized
        and extract(isodow from generated_day)<6
        and not exists(
          select 1 from organization_holidays h
          where h.holiday_date=generated_day::date
        )
    ) unpaid_leave_dates
  ) ul on true
  left join lateral (
    select count(*)::numeric days
    from attendance a
    where a.employee_id=e.id and a.work_date between normalized and month_end
      and a.work_date<current_date and a.clock_in is not null and a.clock_out is null
  ) mc on true
  where e.deleted_at is null and e.status in ('ACTIVE','ON_LEAVE');

  insert into payroll_adjustments(
    payroll_id,employee_id,adjustment_type,amount,reason,attendance_id
  )
  select p.id,a.employee_id,'LATE_PENALTY',policy.amount_per_occurrence,
    'Automatic deduction for late arrival',a.id
  from payroll p
  join attendance a on a.employee_id=p.employee_id
    and a.work_date between normalized and month_end
    and a.work_date>=date '2026-10-19'
    and a.status='LATE'
  cross join lateral (
    select amount_per_occurrence
    from deduction_policies
    where adjustment_type='LATE_PENALTY'
      and active=true and amount_per_occurrence>0
    order by updated_at desc
    limit 1
  ) policy
  where p.pay_run_id=target_run
  on conflict(attendance_id,adjustment_type) do nothing;

  update payroll p
  set penalty_fee=(
    select coalesce(sum(pa.amount),0)
    from payroll_adjustments pa
    where pa.payroll_id=p.id and pa.adjustment_type='LATE_PENALTY'
  )
  where p.pay_run_id=target_run;

  perform public.refresh_pay_run_totals(target_run);
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'CALCULATE_PAYROLL','pay_run',target_run::text,
    jsonb_build_object('period',normalized,'calculation_version','2026.4'));
  return target_run;
end $$;

revoke all on function public.calculate_payroll_run(date,date) from public,anon;
grant execute on function public.calculate_payroll_run(date,date) to authenticated;

notify pgrst, 'reload schema';
