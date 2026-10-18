alter table public.employee_shift_days
  drop constraint if exists employee_shift_days_assignment_type_check;
alter table public.employee_shift_days
  add constraint employee_shift_days_assignment_type_check
  check(assignment_type in ('SHIFT','OFF_DUTY','LEAVE','UNPAID_LEAVE'));
alter table public.employee_shift_days
  drop constraint if exists employee_shift_days_check;
alter table public.employee_shift_days
  add constraint employee_shift_days_shift_required
  check(
    (assignment_type='SHIFT' and shift_id is not null) or
    (assignment_type in ('OFF_DUTY','LEAVE','UNPAID_LEAVE') and shift_id is null)
  );

create or replace function public.enforce_three_weekly_off_days()
returns trigger language plpgsql set search_path=public as $$
declare
  week_start date := date_trunc('week',new.work_date::timestamp)::date;
  existing_off_days integer;
begin
  if new.assignment_type <> 'OFF_DUTY' then return new; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.employee_id::text || ':' || week_start::text,0)
  );
  select count(*) into existing_off_days
  from public.employee_shift_days
  where employee_id=new.employee_id
    and work_date >= week_start and work_date < week_start+7
    and assignment_type='OFF_DUTY'
    and id is distinct from new.id;
  if existing_off_days >= 3 then
    raise exception 'An employee may have at most three Off duty days per week';
  end if;
  return new;
end $$;

drop trigger if exists enforce_three_weekly_off_days_trigger
  on public.employee_shift_days;
create trigger enforce_three_weekly_off_days_trigger
before insert or update of employee_id,work_date,assignment_type
on public.employee_shift_days
for each row execute function public.enforce_three_weekly_off_days();

create or replace function public.record_attendance_event(p_employee_id uuid,p_shift_id uuid,p_device_id text,p_location text,p_capture_id text)
returns text language plpgsql security definer set search_path=public as $$
declare
  local_now timestamp;
  today date;
  local_time time;
  shift_start time;
  shift_end time;
  full_day_id uuid;
  assigned_type text;
  assigned_shift_id uuid;
  current_record attendance;
  action text;
begin
  local_now := now() at time zone 'Africa/Lagos';
  today := local_now::date;
  local_time := local_now::time;
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') and p_employee_id<>public.current_employee_record_id() then raise exception 'Insufficient permission'; end if;
  if not exists(select 1 from employees where id=p_employee_id and deleted_at is null and status='ACTIVE') then raise exception 'Employee is not active'; end if;

  select start_time,end_time into shift_start,shift_end
  from shifts where id=p_shift_id and deleted_at is null;
  if not found then raise exception 'Shift is not active'; end if;
  select id into full_day_id from shifts where name='Full Day' and deleted_at is null limit 1;

  select * into current_record from attendance where employee_id=p_employee_id and shift_id=p_shift_id and work_date=today for update;
  if current_record.id is null then
    select assignment_type,shift_id into assigned_type,assigned_shift_id
    from employee_shift_days
    where employee_id=p_employee_id and work_date=today;
    if found then
      if assigned_type in ('OFF_DUTY','LEAVE','UNPAID_LEAVE') then
        raise exception 'Attendance is unavailable for this Off duty or leave assignment';
      end if;
      if extract(isodow from today) in (6,7) and assigned_shift_id is distinct from full_day_id then
        raise exception 'Saturday and Sunday attendance must use the Full Day shift';
      end if;
      if assigned_shift_id is distinct from p_shift_id then
        raise exception 'Employee is assigned to a different shift today';
      end if;
    elsif extract(isodow from today) in (6,7) then
      if full_day_id is null then raise exception 'Full Day shift is not configured'; end if;
      if p_shift_id is distinct from full_day_id then
        raise exception 'Saturday and Sunday attendance must use the Full Day shift';
      end if;
    else
      select assignment_type,shift_id into assigned_type,assigned_shift_id
      from employee_shifts
      where employee_id=p_employee_id
        and today between starts_on and coalesce(ends_on,'infinity'::date)
      order by is_override desc,created_at desc
      limit 1;
      if not found then
        raise exception 'Employee has no shift assignment for today';
      elsif assigned_type in ('OFF_DUTY','LEAVE') then
        raise exception 'Attendance is unavailable for this Off duty or leave assignment';
      elsif assigned_type <> 'SHIFT' or assigned_shift_id is distinct from p_shift_id then
        raise exception 'Employee is assigned to a different shift today';
      end if;
    end if;

    if extract(isodow from today) in (6,7) and local_time > time '12:00' then
      raise exception 'Weekend clock-in closes at 12:00 PM';
    end if;
    insert into attendance(employee_id,shift_id,work_date,clock_in,location,device_id,status,metadata)
    values(p_employee_id,p_shift_id,today,now(),p_location,p_device_id,
      case when extract(isodow from today) between 1 and 5 and local_time > shift_start + interval '20 minutes' then 'LATE'::attendance_status else 'PRESENT'::attendance_status end,
      jsonb_build_object('capture_id',p_capture_id));
    action := 'CLOCK_IN_RECORDED';
  elsif current_record.clock_out is null then
    if local_time < shift_end then
      raise exception 'Clock-out is available from %', to_char(shift_end,'FMHH12:MI AM');
    end if;
    update attendance set clock_out=now(),metadata=metadata||jsonb_build_object('clock_out_capture_id',p_capture_id) where id=current_record.id;
    action := 'CLOCK_OUT_RECORDED';
  else raise exception 'This employee has already clocked in and out for this shift today';
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),action,'attendance',coalesce(current_record.id::text,p_employee_id::text),jsonb_build_object('employee_id',p_employee_id,'shift_id',p_shift_id,'device_id',p_device_id));
  return action;
end $$;

revoke all on function public.record_attendance_event(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.record_attendance_event(uuid,uuid,text,text,text) to authenticated;

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
        and not exists(select 1 from organization_holidays h where h.holiday_date=generated_day::date)
    ) unpaid_leave_dates
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
    jsonb_build_object('period',normalized,'calculation_version','2026.3'));
  return target_run;
end $$;

revoke all on function public.calculate_payroll_run(date,date) from public,anon;
grant execute on function public.calculate_payroll_run(date,date) to authenticated;

notify pgrst, 'reload schema';