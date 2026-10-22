create or replace function public.delete_employee(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_organization_id uuid := public.current_organization_id();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.current_role() not in ('SUPER_ADMIN', 'HR_MANAGER') then
    raise exception 'Only Super Admins and HR Managers can delete employees';
  end if;

  if active_organization_id is null then
    raise exception 'No active organization selected';
  end if;

  update public.employees
  set status = 'INACTIVE',
      deleted_at = now(),
      updated_at = now()
  where id = p_employee_id
    and organization_id = active_organization_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee not found in the active organization or already deleted';
  end if;
end;
$$;

revoke all on function public.delete_employee(uuid) from public, anon;
grant execute on function public.delete_employee(uuid) to authenticated;

create or replace function public.audit_employee_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(
      organization_id, user_id, action, entity_type, entity_id, new_data
    ) values(
      new.organization_id,
      auth.uid(),
      'CREATE_EMPLOYEE',
      'employee',
      new.id::text,
      to_jsonb(new) - 'emergency_contact'
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs(
      organization_id, user_id, action, entity_type, entity_id, old_data, new_data
    ) values(
      new.organization_id,
      auth.uid(),
      case
        when old.deleted_at is null and new.deleted_at is not null
          then 'DELETE_EMPLOYEE'
        else 'UPDATE_EMPLOYEE'
      end,
      'employee',
      new.id::text,
      to_jsonb(old) - 'emergency_contact',
      to_jsonb(new) - 'emergency_contact'
    );
    return new;
  end if;
  return null;
end;
$$;

revoke all on function public.audit_employee_changes()
from public, anon, authenticated;
