-- Deduct one basic-salary workday for every past attendance record where an
-- employee clocked in but did not clock out. Current-day open shifts are not
-- penalized because the employee may still be working.

create or replace function public.calculate_payroll_run(p_period date,p_payment_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  normalized date:=date_trunc('month',p_period)::date;
  month_end date:=(date_trunc('month',p_period)+interval '1 month'-interval '1 day')::date;
  target_run uuid;
  working_days integer;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  if exists(select 1 from pay_runs where period=normalized) then raise exception 'A payroll run already exists for this period'; end if;
  working_days:=public.business_days(normalized,month_end);
  insert into pay_runs(period,payment_date,prepared_by,prepared_at)
  values(normalized,p_payment_date,auth.uid(),now()) returning id into target_run;

  insert into payroll(
    pay_run_id,employee_id,period,basic_salary,allowances,deductions,bonuses,
    overtime,tax,pension,penalty_fee,status,unpaid_leave_deduction,
    calculation_inputs
  )
  select target_run,e.id,normalized,c.basic_salary,c.fixed_allowances,
    round((c.basic_salary/greatest(working_days,1))*(coalesce(ul.days,0)+coalesce(mc.days,0)),2),
    0,
    round(coalesce(ot.hours,0)*c.overtime_rate,2),
    round((c.basic_salary+c.fixed_allowances+coalesce(ot.hours,0)*c.overtime_rate)*c.tax_rate,2),
    round(c.basic_salary*c.pension_rate,2),0,'DRAFT',
    round((c.basic_salary/greatest(working_days,1))*coalesce(ul.days,0),2),
    jsonb_build_object(
      'working_days',working_days,
      'overtime_hours',coalesce(ot.hours,0),
      'unpaid_leave_days',coalesce(ul.days,0),
      'missed_clock_out_days',coalesce(mc.days,0),
      'missed_clock_out_deduction',round((c.basic_salary/greatest(working_days,1))*coalesce(mc.days,0),2),
      'tax_rate',c.tax_rate,
      'pension_rate',c.pension_rate,
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
    select coalesce(sum(public.business_days(l.start_date,l.end_date)),0)::numeric days
    from leave_requests l join leave_policies lp on lp.id=l.leave_policy_id
    where l.employee_id=e.id and l.status='APPROVED' and lp.annual_allowance=0
      and l.start_date<=month_end and l.end_date>=normalized
  ) ul on true
  left join lateral (
    select count(*)::numeric days
    from attendance a
    where a.employee_id=e.id and a.work_date between normalized and month_end
      and a.work_date<current_date and a.clock_in is not null and a.clock_out is null
  ) mc on true
  where e.deleted_at is null and e.status in ('ACTIVE','ON_LEAVE');

  perform public.refresh_pay_run_totals(target_run);
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'CALCULATE_PAYROLL','pay_run',target_run::text,
    jsonb_build_object('period',normalized,'calculation_version','2026.2'));
  return target_run;
end $$;

create or replace function public.recalculate_payroll_adjustment()
returns trigger language plpgsql security definer set search_path=public as $$
declare run_id uuid;
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
  where id=new.payroll_id;
  perform public.refresh_pay_run_totals(run_id);
  return new;
end $$;

revoke all on function public.calculate_payroll_run(date,date) from public,anon;
grant execute on function public.calculate_payroll_run(date,date) to authenticated;
