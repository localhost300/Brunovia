-- Attendance event recording and policy-aware leave workflow.

create table if not exists public.leave_policies(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  annual_allowance integer not null check(annual_allowance >= 0),
  requires_document_after_days integer check(requires_document_after_days is null or requires_document_after_days >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.leave_policies(name, annual_allowance, requires_document_after_days)
values ('Annual leave',20,null),('Sick leave',10,2),('Compassionate leave',5,null),('Unpaid leave',0,null)
on conflict(name) do nothing;

alter table public.leave_requests add column if not exists leave_policy_id uuid references public.leave_policies(id);
alter table public.leave_requests add column if not exists manager_comment text;
alter table public.leave_requests add column if not exists hr_comment text;

create table if not exists public.leave_balances(
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_policy_id uuid not null references public.leave_policies(id),
  balance_year integer not null,
  allowance numeric(6,2) not null default 0 check(allowance >= 0),
  adjustment numeric(6,2) not null default 0,
  primary key(employee_id, leave_policy_id, balance_year)
);

create table if not exists public.organization_holidays(
  holiday_date date primary key,
  name text not null
);

create table if not exists public.attendance_corrections(
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id),
  requested_by uuid not null references public.users(id),
  requested_clock_in timestamptz,
  requested_clock_out timestamptz,
  reason text not null check(length(trim(reason)) >= 5),
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now()
);

create index if not exists leave_requests_employee_dates_idx on public.leave_requests(employee_id,start_date,end_date);
create index if not exists attendance_corrections_status_idx on public.attendance_corrections(status,created_at desc);

alter table public.leave_policies enable row level security;
alter table public.leave_balances enable row level security;
alter table public.organization_holidays enable row level security;
alter table public.attendance_corrections enable row level security;

create policy "staff read active leave policies" on public.leave_policies for select to authenticated using(active or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr manages leave policies" on public.leave_policies for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "staff read holidays" on public.organization_holidays for select to authenticated using(true);
create policy "hr manages holidays" on public.organization_holidays for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "visible leave balances" on public.leave_balances for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from public.employees where manager_id=public.current_employee_record_id())));
create policy "hr manages leave balances" on public.leave_balances for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

drop policy if exists "visible attendance" on public.attendance;
create policy "visible attendance" on public.attendance for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from public.employees where manager_id=public.current_employee_record_id())));

drop policy if exists "visible leave" on public.leave_requests;
drop policy if exists "employee creates leave" on public.leave_requests;
drop policy if exists "managers update leave" on public.leave_requests;
create policy "visible leave" on public.leave_requests for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from public.employees where manager_id=public.current_employee_record_id())));
create policy "authorized leave creation" on public.leave_requests for insert to authenticated with check(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create policy "visible attendance corrections" on public.attendance_corrections for select to authenticated using(requested_by=auth.uid() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "staff request attendance correction" on public.attendance_corrections for insert to authenticated with check(requested_by=auth.uid());

create or replace function public.business_days(p_start date,p_end date)
returns integer language sql stable security invoker set search_path=public as $$
  select count(*)::integer from generate_series(p_start,p_end,interval '1 day') day
  where extract(isodow from day) < 6
    and not exists(select 1 from public.organization_holidays h where h.holiday_date=day::date)
$$;

create or replace function public.validate_leave_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare requested_days integer; available_days numeric;
begin
  if new.end_date < new.start_date then raise exception 'End date cannot precede start date'; end if;
  if exists(select 1 from leave_requests r where r.employee_id=new.employee_id and r.id<>new.id and r.status not in ('REJECTED','CANCELLED') and daterange(r.start_date,r.end_date,'[]') && daterange(new.start_date,new.end_date,'[]')) then
    raise exception 'Leave dates overlap an existing request';
  end if;
  requested_days := public.business_days(new.start_date,new.end_date);
  if requested_days < 1 then raise exception 'Leave must include a working day'; end if;
  if new.leave_policy_id is not null then
    select coalesce(b.allowance,p.annual_allowance)+coalesce(b.adjustment,0)-coalesce((select sum(public.business_days(r.start_date,r.end_date)) from leave_requests r where r.employee_id=new.employee_id and r.leave_policy_id=new.leave_policy_id and r.status='APPROVED' and extract(year from r.start_date)=extract(year from new.start_date)),0)
    into available_days from leave_policies p left join leave_balances b on b.leave_policy_id=p.id and b.employee_id=new.employee_id and b.balance_year=extract(year from new.start_date)::integer where p.id=new.leave_policy_id;
    if available_days > 0 and requested_days > available_days then raise exception 'Insufficient leave balance'; end if;
  end if;
  return new;
end $$;

drop trigger if exists validate_leave_request_trigger on public.leave_requests;
create trigger validate_leave_request_trigger before insert or update of start_date,end_date,leave_policy_id on public.leave_requests for each row execute function public.validate_leave_request();

create or replace function public.record_attendance_event(p_employee_id uuid,p_shift_id uuid,p_device_id text,p_location text,p_capture_id text)
returns text language plpgsql security definer set search_path=public as $$
declare today date := (now() at time zone 'Africa/Lagos')::date; current_record attendance; shift_start time; action text;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') and p_employee_id<>public.current_employee_record_id() then raise exception 'Insufficient permission'; end if;
  if not exists(select 1 from employees where id=p_employee_id and deleted_at is null and status='ACTIVE') then raise exception 'Employee is not active'; end if;
  if not exists(select 1 from shifts where id=p_shift_id and deleted_at is null) then raise exception 'Shift is not active'; end if;
  select * into current_record from attendance where employee_id=p_employee_id and shift_id=p_shift_id and work_date=today for update;
  if current_record.id is null then
    select start_time into shift_start from shifts where id=p_shift_id;
    insert into attendance(employee_id,shift_id,work_date,clock_in,location,device_id,status,metadata)
    values(p_employee_id,p_shift_id,today,now(),p_location,p_device_id,case when (now() at time zone 'Africa/Lagos')::time > shift_start+interval '10 minutes' then 'LATE'::attendance_status else 'PRESENT'::attendance_status end,jsonb_build_object('capture_id',p_capture_id));
    action := 'CLOCK_IN_RECORDED';
  elsif current_record.clock_out is null then
    update attendance set clock_out=now(),metadata=metadata||jsonb_build_object('clock_out_capture_id',p_capture_id) where id=current_record.id;
    action := 'CLOCK_OUT_RECORDED';
  else raise exception 'Attendance is already complete for this employee and shift';
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),action,'attendance',coalesce(current_record.id::text,p_employee_id::text),jsonb_build_object('employee_id',p_employee_id,'shift_id',p_shift_id,'device_id',p_device_id));
  return action;
end $$;

create or replace function public.review_leave_request(p_request_id uuid,p_decision text,p_comment text default null)
returns text language plpgsql security definer set search_path=public as $$
declare target leave_requests; next_status leave_status;
begin
  if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid decision'; end if;
  select * into target from leave_requests where id=p_request_id for update;
  if target.id is null then raise exception 'Leave request not found'; end if;
  if target.status='PENDING_MANAGER' then
    if public.current_role()='MANAGER' and not exists(select 1 from employees where id=target.employee_id and manager_id=public.current_employee_record_id()) then raise exception 'This employee does not report to you'; end if;
    if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') then raise exception 'Insufficient permission'; end if;
    next_status := case when p_decision='REJECT' then 'REJECTED' else 'PENDING_HR' end;
    update leave_requests set status=next_status,manager_approved_by=case when p_decision='APPROVE' then public.current_employee_record_id() else null end,manager_comment=p_comment,updated_at=now() where id=p_request_id;
  elsif target.status='PENDING_HR' then
    if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'HR approval required'; end if;
    next_status := case when p_decision='REJECT' then 'REJECTED' else 'APPROVED' end;
    update leave_requests set status=next_status,hr_approved_by=case when p_decision='APPROVE' then public.current_employee_record_id() else null end,hr_comment=p_comment,updated_at=now() where id=p_request_id;
  else raise exception 'This request is no longer pending';
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'REVIEW_LEAVE_REQUEST','leave_request',p_request_id::text,jsonb_build_object('decision',p_decision,'status',next_status,'comment',p_comment));
  return next_status::text;
end $$;

revoke all on function public.record_attendance_event(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.record_attendance_event(uuid,uuid,text,text,text) to authenticated;
revoke all on function public.review_leave_request(uuid,text,text) from public,anon;
grant execute on function public.review_leave_request(uuid,text,text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.leave_requests; exception when duplicate_object then null; end $$;
