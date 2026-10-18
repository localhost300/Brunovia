create table public.employee_shift_days(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  work_date date not null,
  assignment_type text not null default 'SHIFT'
    check(assignment_type in ('SHIFT','OFF_DUTY','LEAVE')),
  shift_id uuid references public.shifts(id),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id,work_date),
  check(
    (assignment_type='SHIFT' and shift_id is not null) or
    (assignment_type in ('OFF_DUTY','LEAVE') and shift_id is null)
  )
);

alter table public.employee_shift_days enable row level security;
create policy employee_shift_days_tenant_isolation
  on public.employee_shift_days as restrictive for all to authenticated
  using(organization_id=public.current_organization_id())
  with check(organization_id=public.current_organization_id());
create policy employee_shift_days_manage
  on public.employee_shift_days for all to authenticated
  using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'))
  with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create index employee_shift_days_employee_date_idx
  on public.employee_shift_days(employee_id,work_date);

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
      if assigned_type in ('OFF_DUTY','LEAVE') then
        raise exception 'Attendance is unavailable because this employee is marked off duty or on leave';
      end if;
      if extract(isodow from today) in (6,7) and assigned_shift_id is distinct from full_day_id then
        raise exception 'Saturday and Sunday attendance must use the Full Day shift';
      end if;
      if assigned_shift_id is distinct from p_shift_id then
        raise exception 'Employee is assigned to a different shift today';
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
        raise exception 'Attendance is unavailable because this employee is marked off duty or on leave';
      end if;
      if extract(isodow from today) in (6,7) then
        if full_day_id is null then raise exception 'Full Day shift is not configured'; end if;
        if p_shift_id is distinct from full_day_id then
          raise exception 'Saturday and Sunday attendance must use the Full Day shift';
        end if;
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
  else raise exception 'Attendance is already complete for this employee and shift';
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),action,'attendance',coalesce(current_record.id::text,p_employee_id::text),jsonb_build_object('employee_id',p_employee_id,'shift_id',p_shift_id,'device_id',p_device_id));
  return action;
end $$;

revoke all on function public.record_attendance_event(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.record_attendance_event(uuid,uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';