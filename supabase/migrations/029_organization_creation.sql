-- Transactional organization provisioning for existing Super Admins.
create or replace function public.create_organization(p_name text,p_slug text)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  new_organization_id uuid;
  normalized_name text:=trim(p_name);
  normalized_slug text:=lower(trim(p_slug));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can create organizations'; end if;
  if length(normalized_name)<2 or length(normalized_name)>120 then raise exception 'Organization name must contain 2 to 120 characters'; end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(normalized_slug)>63 then raise exception 'Slug must use lowercase letters, numbers, and single hyphens'; end if;

  insert into public.organizations(name,slug) values(normalized_name,normalized_slug) returning id into new_organization_id;
  insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
    values(new_organization_id,auth.uid(),'SUPER_ADMIN','ACTIVE',now());
  insert into public.organization_settings(organization_id,organization_name,updated_by)
    values(new_organization_id,normalized_name,auth.uid());
  insert into public.organization_security_policies(organization_id,updated_by)
    values(new_organization_id,auth.uid());
  insert into public.data_retention_policies(organization_id,data_category,retention_days,updated_by)
    values(new_organization_id,'AUDIT_LOGS',2555,auth.uid()),(new_organization_id,'PAYROLL',2555,auth.uid()),(new_organization_id,'EMPLOYEE_DOCUMENTS',1825,auth.uid()),(new_organization_id,'RECRUITMENT',730,auth.uid());
  update public.users set current_organization_id=new_organization_id,updated_at=now() where id=auth.uid();
  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_data)
    values(new_organization_id,auth.uid(),'ORGANIZATION_CREATED','organization',new_organization_id::text,jsonb_build_object('name',normalized_name,'slug',normalized_slug));
  return new_organization_id;
exception when unique_violation then
  raise exception 'That organization slug is already in use';
end $$;

revoke all on function public.create_organization(text,text) from public;
grant execute on function public.create_organization(text,text) to authenticated;
