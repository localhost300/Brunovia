-- Requested production reset: remove every tenant-owned record and organization
-- while preserving Super Admin identities so a new organization can be created.
do $$
declare
  target_table record;
begin
  for target_table in
    select c.table_schema,c.table_name
    from information_schema.columns c
    where c.column_name='organization_id'
      and c.table_schema='public'
      and c.table_name not in ('organizations','organization_memberships','users')
    group by c.table_schema,c.table_name
  loop
    execute format('truncate table %I.%I restart identity cascade',target_table.table_schema,target_table.table_name);
  end loop;
end $$;

-- Remove invited/employee authentication accounts after employee records have
-- been cleared. Super Admin authentication accounts are deliberately retained.
delete from auth.users a
where exists(
  select 1 from public.users u
  where u.id=a.id and u.role<>'SUPER_ADMIN'
);

delete from public.organization_memberships;
update public.users
set current_organization_id=null,updated_at=now()
where current_organization_id is not null;
delete from public.organizations;
