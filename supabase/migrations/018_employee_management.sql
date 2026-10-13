-- Production employee-management authorization and immutable audit history.

create index if not exists employees_manager_idx
  on public.employees(manager_id)
  where deleted_at is null;

create index if not exists employees_directory_search_idx
  on public.employees(lower(last_name), lower(first_name), employee_id)
  where deleted_at is null;

drop policy if exists "visible employees" on public.employees;

create or replace function public.current_employee_record_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

revoke all on function public.current_employee_record_id() from public, anon;
grant execute on function public.current_employee_record_id() to authenticated;

create policy "visible employees" on public.employees for select to authenticated
using (
  deleted_at is null
  and (
    user_id = auth.uid()
    or public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER')
    or (
      public.current_role() = 'MANAGER'
      and manager_id = public.current_employee_record_id()
    )
  )
);

drop policy if exists "hr manages employees" on public.employees;
drop policy if exists "hr inserts employees" on public.employees;
drop policy if exists "hr updates employees" on public.employees;
create policy "hr inserts employees" on public.employees for insert to authenticated
with check (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'));
create policy "hr updates employees" on public.employees for update to authenticated
using (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'))
with check (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'));

create or replace function public.audit_employee_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
    values(auth.uid(), 'CREATE_EMPLOYEE', 'employee', new.id::text, to_jsonb(new) - 'emergency_contact');
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
    values(
      auth.uid(),
      case when old.deleted_at is null and new.deleted_at is not null then 'DEACTIVATE_EMPLOYEE' else 'UPDATE_EMPLOYEE' end,
      'employee', new.id::text,
      to_jsonb(old) - 'emergency_contact',
      to_jsonb(new) - 'emergency_contact'
    );
    return new;
  end if;
  return null;
end;
$$;

revoke all on function public.audit_employee_changes() from public, anon, authenticated;

drop trigger if exists employee_change_audit on public.employees;
create trigger employee_change_audit
after insert or update on public.employees
for each row execute function public.audit_employee_changes();

drop policy if exists "administrators view audit logs" on public.audit_logs;
create policy "administrators view audit logs" on public.audit_logs for select to authenticated
using (public.current_role() in ('SUPER_ADMIN', 'HR_MANAGER'));

-- Audit rows are written only by trusted trigger functions; clients cannot mutate them.
revoke insert, update, delete on public.audit_logs from authenticated;
