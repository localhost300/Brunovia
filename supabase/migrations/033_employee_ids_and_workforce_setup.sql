-- Generate organization-scoped employee numbers when callers do not supply one.
create or replace function public.assign_employee_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  if nullif(trim(new.employee_id), '') is not null then
    new.employee_id := upper(trim(new.employee_id));
    return new;
  end if;

  if new.organization_id is null then
    new.organization_id := public.current_organization_id();
  end if;
  if new.organization_id is null then
    raise exception 'An organization is required to generate an employee ID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
  select coalesce(max((regexp_match(employee_id, '^BRU-([0-9]+)$'))[1]::integer), 0) + 1
    into next_number
  from public.employees
  where organization_id = new.organization_id;

  new.employee_id := 'BRU-' || lpad(next_number::text, 4, '0');
  return new;
end
$$;

drop trigger if exists employees_assign_number on public.employees;
create trigger employees_assign_number
before insert on public.employees
for each row execute function public.assign_employee_number();

drop policy if exists "hr manages departments" on public.departments;
create policy "hr manages departments" on public.departments
for all to authenticated
using (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'))
with check (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'));

drop policy if exists "authenticated read shifts" on public.shifts;
create policy "authenticated read shifts" on public.shifts
for select to authenticated using (deleted_at is null);

drop policy if exists "hr manages shifts" on public.shifts;
create policy "hr manages shifts" on public.shifts
for all to authenticated
using (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'))
with check (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'));

notify pgrst, 'reload schema';
