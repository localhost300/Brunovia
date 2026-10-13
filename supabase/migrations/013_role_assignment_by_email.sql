alter table public.users add column if not exists email text;
create unique index if not exists users_email_unique_idx on public.users(lower(email)) where email is not null;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.users(id,role,full_name,avatar_url,email)
  values(new.id,'EMPLOYEE',coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url',lower(new.email))
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;

update public.users u set email=lower(a.email)
from auth.users a where u.id=a.id and u.email is null;

create or replace function public.set_user_role_by_email(p_email text,p_role public.user_role) returns void
language plpgsql security definer set search_path=public as $$
declare v_user_id uuid;
begin
  if public.current_role() <> 'SUPER_ADMIN' then raise exception 'Only a Super Admin may assign roles'; end if;
  select id into v_user_id from public.users where lower(email)=lower(trim(p_email));
  if v_user_id is null then raise exception 'No registered user found with this email'; end if;
  update public.users set role=p_role,updated_at=now() where id=v_user_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
  values(auth.uid(),'CHANGE_USER_ROLE','user',v_user_id::text,jsonb_build_object('email',lower(trim(p_email)),'role',p_role));
end $$;
revoke all on function public.set_user_role_by_email(text,public.user_role) from public;
grant execute on function public.set_user_role_by_email(text,public.user_role) to authenticated;
