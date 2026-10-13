-- Keep the auth.users trigger deliberately small. Cross-table organization and
-- employee linking is completed by the trusted invitation Edge Function after
-- Auth has successfully created the invited user.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.users(id,role,full_name,avatar_url,email)
  values(
    new.id,
    'EMPLOYEE',
    coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url',
    lower(new.email)
  )
  on conflict(id) do update set
    full_name=excluded.full_name,
    avatar_url=coalesce(excluded.avatar_url,public.users.avatar_url),
    email=excluded.email,
    updated_at=now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_auth_user();
