-- Restore the named self-reference used by PostgREST employee embeds.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_manager_id_fkey'
  ) then
    alter table public.employees
      add constraint employees_manager_id_fkey
      foreign key (manager_id)
      references public.employees(id)
      on delete set null;
  end if;
end
$$;

notify pgrst, 'reload schema';
