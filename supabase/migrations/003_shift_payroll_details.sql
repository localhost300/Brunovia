alter table public.payroll add column if not exists penalty_fee numeric(14,2) not null default 0;
alter table public.payroll add column if not exists penalty_reason text;
alter table public.payroll add column if not exists net_pay numeric(14,2) generated always as (basic_salary + allowances + bonuses + overtime - deductions - penalty_fee) stored;

delete from public.shifts where name in ('Regular Shift','Night Shift');
insert into public.shifts(name,start_time,end_time,color,is_rotational)
values('Evening Shift','15:00','23:00','#7c3aed',false)
on conflict do nothing;

create index if not exists employee_shifts_active_idx on public.employee_shifts(employee_id,starts_on,ends_on);
