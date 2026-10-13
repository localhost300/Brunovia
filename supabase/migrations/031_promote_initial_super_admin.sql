-- Bootstrap the most recently created Auth account as Brunovia's initial Super Admin.
do $$
declare
  target_user_id uuid;
  target_organization_id uuid;
begin
  select id into target_user_id
  from auth.users
  order by created_at desc
  limit 1;

  if target_user_id is null then
    raise exception 'No Auth user exists to promote';
  end if;

  select coalesce(
    (select current_organization_id from public.users where id = target_user_id),
    (select id from public.organizations order by created_at limit 1)
  ) into target_organization_id;

  if target_organization_id is null then
    raise exception 'No organization exists for the Super Admin membership';
  end if;

  update public.users
  set role = 'SUPER_ADMIN',
      current_organization_id = target_organization_id,
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'The newest Auth user does not have a public.users profile';
  end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, joined_at
  ) values (
    target_organization_id, target_user_id, 'SUPER_ADMIN', 'ACTIVE', now()
  )
  on conflict (organization_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      joined_at = coalesce(public.organization_memberships.joined_at, excluded.joined_at);
end
$$;
