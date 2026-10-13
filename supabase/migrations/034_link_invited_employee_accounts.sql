-- Link newly invited Auth users to their existing employee record.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare first_invitation record;
begin
  select organization_id,role into first_invitation from public.organization_invitations
  where lower(email)=lower(new.email) and status='PENDING' and expires_at>now() order by created_at limit 1;
  insert into public.users(id,role,full_name,avatar_url,email,current_organization_id)
  values(new.id,coalesce(first_invitation.role,'EMPLOYEE'),coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url',lower(new.email),first_invitation.organization_id)
  on conflict(id) do update set email=excluded.email,current_organization_id=coalesce(public.users.current_organization_id,excluded.current_organization_id);
  insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
  select organization_id,new.id,role,'ACTIVE',now() from public.organization_invitations
  where lower(email)=lower(new.email) and status='PENDING' and expires_at>now()
  on conflict(organization_id,user_id) do update set role=excluded.role,status='ACTIVE',joined_at=coalesce(public.organization_memberships.joined_at,now());
  update public.employees
  set user_id=new.id,updated_at=now()
  where organization_id=first_invitation.organization_id
    and lower(email)=lower(new.email)
    and user_id is null
    and deleted_at is null;
  update public.organization_invitations set status='ACCEPTED',accepted_at=now()
  where lower(email)=lower(new.email) and status='PENDING' and expires_at>now();
  return new;
end $$;
