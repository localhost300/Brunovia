-- HR managers may invite employees without receiving the broader organization
-- member-management permission reserved for Super Admins.
create or replace function public.invite_employee_member(p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  org_id uuid:=public.current_organization_id();
  normalized_email text:=lower(trim(p_email));
  invited_user uuid;
  invitation_id uuid;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then
    raise exception 'Only HR administrators can invite employees';
  end if;
  if org_id is null then raise exception 'No active organization selected'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address';
  end if;

  select id into invited_user from public.users where lower(email)=normalized_email;
  if invited_user is not null then
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
    values(org_id,invited_user,'EMPLOYEE','ACTIVE',now())
    on conflict(organization_id,user_id)
    do update set role='EMPLOYEE',status='ACTIVE';
    return jsonb_build_object('status','ACTIVE','user_id',invited_user);
  end if;

  insert into public.organization_invitations(organization_id,email,role,invited_by)
  values(org_id,normalized_email,'EMPLOYEE',auth.uid())
  on conflict(organization_id,lower(email)) where status='PENDING'
  do update set role='EMPLOYEE',invited_by=excluded.invited_by,expires_at=now()+interval '7 days'
  returning id into invitation_id;
  return jsonb_build_object('status','PENDING','invitation_id',invitation_id);
end $$;

revoke all on function public.invite_employee_member(text) from public,anon;
grant execute on function public.invite_employee_member(text) to authenticated;
