-- Employee changes may be performed by trusted Edge Functions using the
-- service role. Those requests do not have an auth session from which the
-- tenant trigger can infer an organization, so always copy it from the row.
create or replace function public.audit_employee_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(
      organization_id,user_id,action,entity_type,entity_id,new_data
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
      organization_id,user_id,action,entity_type,entity_id,old_data,new_data
    ) values(
      new.organization_id,
      auth.uid(),
      case
        when old.deleted_at is null and new.deleted_at is not null
          then 'DEACTIVATE_EMPLOYEE'
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
