-- One employee may clock into both shifts on the same calendar day.
alter table public.attendance add column if not exists shift_id uuid references public.shifts(id);

-- Backfill existing attendance from the employee's active assignment.
update public.attendance a
set shift_id = es.shift_id
from public.employee_shifts es
where a.shift_id is null
  and es.employee_id = a.employee_id
  and es.starts_on <= a.work_date
  and (es.ends_on is null or es.ends_on >= a.work_date);

-- Use Morning Shift as a safe fallback for historical rows without assignments.
update public.attendance
set shift_id = (select id from public.shifts where name='Morning Shift' limit 1)
where shift_id is null;

alter table public.attendance alter column shift_id set not null;
alter table public.attendance drop constraint if exists attendance_employee_id_work_date_key;
alter table public.attendance add constraint attendance_employee_day_shift_unique unique(employee_id,work_date,shift_id);
create index if not exists attendance_shift_day_idx on public.attendance(shift_id,work_date desc);

-- Resolves the active shift occurrence using the business timezone. A new date
-- automatically produces a new attendance scope; previous days never carry over.
create or replace function public.current_shift_attendance(p_employee_id uuid,p_shift_id uuid,p_timezone text default 'Africa/Lagos')
returns setof public.attendance language sql stable security invoker set search_path=public as $$
  select * from public.attendance
  where employee_id=p_employee_id and shift_id=p_shift_id
    and work_date=(now() at time zone p_timezone)::date;
$$;

comment on column public.attendance.shift_id is 'Shift occurrence attended; uniqueness is employee + work date + shift.';
