alter table public.employees add column if not exists rotation_group smallint check(rotation_group in (0,1));

with numbered as (
  select id,(row_number() over(order by employment_date,id)-1)%2 as group_no
  from public.employees where deleted_at is null
)
update public.employees e set rotation_group=n.group_no from numbered n
where e.id=n.id and e.rotation_group is null;

alter table public.employee_shifts add column if not exists is_override boolean not null default false;
alter table public.employee_shifts add column if not exists published_at timestamptz;
alter table public.employee_shifts add constraint employee_shift_week_unique unique(employee_id,starts_on);

create or replace function public.generate_weekly_shift_roster(p_week_start date)
returns integer language plpgsql security definer set search_path=public as $$
declare normalized_week date; inserted_count integer; morning_id uuid; evening_id uuid;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') then raise exception 'Insufficient permission'; end if;
  normalized_week := date_trunc('week',p_week_start::timestamp)::date;
  select id into morning_id from shifts where name='Morning Shift' and deleted_at is null limit 1;
  select id into evening_id from shifts where name='Evening Shift' and deleted_at is null limit 1;
  if morning_id is null or evening_id is null then raise exception 'Morning and Evening shifts must exist'; end if;
  insert into employee_shifts(employee_id,shift_id,starts_on,ends_on,is_override,published_at)
  select e.id,
    case when mod(extract(week from normalized_week)::integer + coalesce(e.rotation_group,0),2)=0 then morning_id else evening_id end,
    normalized_week,normalized_week+6,false,now()
  from employees e where e.deleted_at is null and e.status='ACTIVE'
  on conflict(employee_id,starts_on) do update set
    shift_id=case when employee_shifts.is_override then employee_shifts.shift_id else excluded.shift_id end,
    ends_on=excluded.ends_on,published_at=now();
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create or replace function public.employee_shift_for_date(p_employee_id uuid,p_work_date date)
returns table(shift_id uuid,shift_name text,start_time time,end_time time,is_override boolean)
language sql stable security invoker set search_path=public as $$
  select s.id,s.name,s.start_time,s.end_time,es.is_override
  from employee_shifts es join shifts s on s.id=es.shift_id
  where es.employee_id=p_employee_id and p_work_date between es.starts_on and es.ends_on
  order by es.is_override desc,es.created_at desc limit 1;
$$;

create policy "staff view shift roster" on public.employee_shifts for select to authenticated
using(employee_id in(select id from public.employees where user_id=auth.uid()) or public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "managers manage weekly roster" on public.employee_shifts for all to authenticated
using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'))
with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));

comment on column public.employees.rotation_group is 'Alternating group used to switch Morning/Evening shift every ISO week.';
