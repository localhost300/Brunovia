-- Enterprise identity policy, invitations, and organization membership lifecycle.
create table public.organization_security_policies(
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  require_mfa boolean not null default false,
  session_timeout_minutes integer not null default 480 check(session_timeout_minutes between 15 and 10080),
  allowed_email_domains text[] not null default '{}',
  sso_enforced boolean not null default false,
  sso_provider text,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table public.organization_invitations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.user_role not null default 'EMPLOYEE',
  status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  invited_by uuid not null references public.users(id),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index organization_pending_invitation_key
  on public.organization_invitations(organization_id,lower(email)) where status='PENDING';

insert into public.organization_security_policies(organization_id)
select id from public.organizations on conflict do nothing;

alter table public.organization_security_policies enable row level security;
alter table public.organization_invitations enable row level security;
create policy "members read identity policy" on public.organization_security_policies for select to authenticated
using(organization_id=public.current_organization_id());
create policy "super admins manage identity policy" on public.organization_security_policies for all to authenticated
using(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN')
with check(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN');
create policy "admins view invitations" on public.organization_invitations for select to authenticated
using(organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.invite_organization_member(p_email text,p_role public.user_role)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  org_id uuid:=public.current_organization_id();
  normalized_email text:=lower(trim(p_email));
  invited_user uuid;
  invitation_id uuid;
begin
  if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can invite members'; end if;
  if org_id is null then raise exception 'No active organization selected'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email address'; end if;

  select id into invited_user from public.users where lower(email)=normalized_email;
  if invited_user is not null then
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
    values(org_id,invited_user,p_role,'ACTIVE',now())
    on conflict(organization_id,user_id) do update set role=excluded.role,status='ACTIVE';
    return jsonb_build_object('status','ACTIVE','user_id',invited_user);
  end if;

  insert into public.organization_invitations(organization_id,email,role,invited_by)
  values(org_id,normalized_email,p_role,auth.uid())
  on conflict(organization_id,lower(email)) where status='PENDING'
  do update set role=excluded.role,invited_by=excluded.invited_by,expires_at=now()+interval '7 days'
  returning id into invitation_id;
  return jsonb_build_object('status','PENDING','invitation_id',invitation_id);
end $$;

create or replace function public.update_organization_member(p_user_id uuid,p_role public.user_role,p_status text default 'ACTIVE')
returns void language plpgsql security definer set search_path=public as $$
declare org_id uuid:=public.current_organization_id();
begin
  if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can manage memberships'; end if;
  if p_status not in ('ACTIVE','SUSPENDED') then raise exception 'Invalid membership status'; end if;
  if p_user_id=auth.uid() and (p_role<>'SUPER_ADMIN' or p_status<>'ACTIVE') and
    (select count(*) from public.organization_memberships where organization_id=org_id and role='SUPER_ADMIN' and status='ACTIVE')<=1
  then raise exception 'The last active Super Admin cannot be demoted or suspended'; end if;
  update public.organization_memberships set role=p_role,status=p_status
    where organization_id=org_id and user_id=p_user_id;
  if not found then raise exception 'Membership not found'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'MEMBERSHIP_UPDATED','organization_membership',p_user_id::text,jsonb_build_object('role',p_role,'status',p_status));
end $$;

create or replace function public.cancel_organization_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can revoke invitations'; end if;
  update public.organization_invitations set status='REVOKED'
  where id=p_invitation_id and organization_id=public.current_organization_id() and status='PENDING';
  if not found then raise exception 'Pending invitation not found'; end if;
end $$;

revoke all on function public.invite_organization_member(text,public.user_role) from public;
revoke all on function public.update_organization_member(uuid,public.user_role,text) from public;
revoke all on function public.cancel_organization_invitation(uuid) from public;
grant execute on function public.invite_organization_member(text,public.user_role) to authenticated;
grant execute on function public.update_organization_member(uuid,public.user_role,text) to authenticated;
grant execute on function public.cancel_organization_invitation(uuid) to authenticated;
