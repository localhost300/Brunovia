create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.users(id,role,full_name,avatar_url)
  values(new.id,'EMPLOYEE',coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.set_user_role(p_user_id uuid,p_role public.user_role) returns void
language plpgsql security definer set search_path=public as $$
begin
  if public.current_role() <> 'SUPER_ADMIN' then raise exception 'Only a Super Admin may assign roles'; end if;
  update public.users set role=p_role,updated_at=now() where id=p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'CHANGE_USER_ROLE','user',p_user_id::text,jsonb_build_object('role',p_role));
end $$;
revoke all on function public.set_user_role(uuid,public.user_role) from public;
grant execute on function public.set_user_role(uuid,public.user_role) to authenticated;

create policy "super admin updates user profiles" on public.users for update to authenticated
using(public.current_role()='SUPER_ADMIN') with check(public.current_role()='SUPER_ADMIN');
