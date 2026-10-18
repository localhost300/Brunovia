create or replace function public.record_attendance_event(p_employee_id uuid,p_shift_id uuid,p_device_id text,p_location text,p_capture_id text)
returns text language plpgsql security definer set search_path=public as $$
declare
  local_now timestamp;
  today date;
  local_time time;
  current_record attendance;
  action text;
begin
  local_now := now() at time zone 'Africa/Lagos';
  today := local_now::date;
  local_time := local_now::time;
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') and p_employee_id<>public.current_employee_record_id() then raise exception 'Insufficient permission'; end if;
  if not exists(select 1 from employees where id=p_employee_id and deleted_at is null and status='ACTIVE') then raise exception 'Employee is not active'; end if;
  if not exists(select 1 from shifts where id=p_shift_id and deleted_at is null) then raise exception 'Shift is not active'; end if;

  select * into current_record from attendance where employee_id=p_employee_id and shift_id=p_shift_id and work_date=today for update;
  if current_record.id is null then
    if extract(isodow from today) in (6,7) and local_time > time '12:00' then
      raise exception 'Weekend clock-in closes at 12:00 PM';
    end if;
    insert into attendance(employee_id,shift_id,work_date,clock_in,location,device_id,status,metadata)
    values(p_employee_id,p_shift_id,today,now(),p_location,p_device_id,
      case when extract(isodow from today) between 1 and 5 and local_time > time '09:20' then 'LATE'::attendance_status else 'PRESENT'::attendance_status end,
      jsonb_build_object('capture_id',p_capture_id));
    action := 'CLOCK_IN_RECORDED';
  elsif current_record.clock_out is null then
    if local_time < time '22:00' then
      raise exception 'Clock-out is available from 10:00 PM';
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