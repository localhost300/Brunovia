create or replace function public.biometric_clock(
  p_employee_id uuid,
  p_shift_id uuid,
  p_device_id text,
  p_location text default null,
  p_timezone text default 'Africa/Lagos'
) returns public.attendance
language plpgsql security definer set search_path=public as $$
declare
  work_day date := (now() at time zone p_timezone)::date;
  existing public.attendance;
  shift_start time;
  policy_grace integer := 10;
  result public.attendance;
begin
  -- Physical device gateways normally call this with the service role. A direct
  -- authenticated call may only clock the employee linked to that account.
  if auth.role() <> 'service_role' and not exists(
    select 1 from employees where id=p_employee_id and user_id=auth.uid()
  ) then raise exception 'Cannot clock attendance for another employee'; end if;

  if not exists(select 1 from employee_shifts where employee_id=p_employee_id and shift_id=p_shift_id and work_day between starts_on and ends_on) then
    raise exception 'Employee is not assigned to this shift for the current week';
  end if;

  select * into existing from attendance
  where employee_id=p_employee_id and shift_id=p_shift_id and work_date=work_day
  for update;

  if existing.id is null then
    select start_time into shift_start from shifts where id=p_shift_id;
    select grace_minutes into policy_grace from deduction_policies where adjustment_type='LATE_PENALTY' and active=true order by updated_at desc limit 1;
    insert into attendance(employee_id,shift_id,work_date,clock_in,location,device_id,status)
    values(p_employee_id,p_shift_id,work_day,now(),p_location,p_device_id,
      case when (now() at time zone p_timezone)::time > shift_start + make_interval(mins=>coalesce(policy_grace,10)) then 'LATE'::attendance_status else 'PRESENT'::attendance_status end)
    returning * into result;
    return result;
  end if;

  if existing.clock_out is null then
    update attendance set clock_out=now(),location=coalesce(p_location,location),device_id=p_device_id
    where id=existing.id returning * into result;
    return result;
  end if;

  raise exception 'This employee has already clocked in and out for this shift today';
end $$;

revoke all on function public.biometric_clock(uuid,uuid,text,text,text) from public;
grant execute on function public.biometric_clock(uuid,uuid,text,text,text) to authenticated,service_role;

comment on function public.biometric_clock is 'First verified scan clocks in; second verified scan clocks out; further scans are rejected.';
