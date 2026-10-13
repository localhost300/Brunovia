insert into public.departments(name,description) values('Engineering','Product engineering and infrastructure'),('Product','Product management and design'),('Marketing','Brand and growth'),('People','People operations'),('Finance','Finance and accounting'),('Sales','Revenue organization');
insert into public.shifts(name,start_time,end_time,color,is_rotational)
select values_to_add.* from (values
  ('Morning Shift','07:00'::time,'15:00'::time,'#0d9488',false),
  ('Evening Shift','15:00'::time,'23:00'::time,'#7c3aed',false),
  ('Full Day','07:00'::time,'23:00'::time,'#2563eb',false)
) as values_to_add(name,start_time,end_time,color,is_rotational)
where not exists(select 1 from public.shifts existing where existing.name=values_to_add.name and existing.deleted_at is null);
