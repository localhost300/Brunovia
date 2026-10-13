-- Repair profiles that have an active membership but no selected organization.
update public.users u
set current_organization_id=(
  select m.organization_id
  from public.organization_memberships m
  where m.user_id=u.id and m.status='ACTIVE'
  order by m.joined_at nulls last,m.created_at
  limit 1
),updated_at=now()
where u.current_organization_id is null
  and exists(
    select 1 from public.organization_memberships m
    where m.user_id=u.id and m.status='ACTIVE'
  );

-- Restore the default Brunovia organization for an orphaned administrator.
with default_organization as (
  select id from public.organizations where status='ACTIVE' order by created_at limit 1
), repaired as (
  update public.users u
  set current_organization_id=o.id,updated_at=now()
  from default_organization o
  where u.current_organization_id is null
    and u.role in ('SUPER_ADMIN','HR_MANAGER')
  returning u.id,u.role,u.current_organization_id
)
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
select current_organization_id,id,role,'ACTIVE',now() from repaired
on conflict(organization_id,user_id) do update
set role=excluded.role,status='ACTIVE',joined_at=coalesce(public.organization_memberships.joined_at,now());

create or replace function public.current_organization_id() returns uuid
language sql stable security definer set search_path=public as $$
  select coalesce(
    (select u.current_organization_id from public.users u where u.id=auth.uid()),
    (select m.organization_id from public.organization_memberships m
      where m.user_id=auth.uid() and m.status='ACTIVE'
      order by m.joined_at nulls last,m.created_at limit 1)
  )
$$;

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
  update public.users set current_organization_id=org_id,updated_at=now()
  where id=auth.uid() and current_organization_id is null;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address';
  end if;
  select id into invited_user from public.users where lower(email)=normalized_email;
  if invited_user is not null then
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
    values(org_id,invited_user,'EMPLOYEE','ACTIVE',now())
    on conflict(organization_id,user_id) do update set role='EMPLOYEE',status='ACTIVE';
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
