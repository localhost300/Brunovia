-- Full Day is an explicit roster option for employees scheduled across both
-- standard shifts. Weekly rotation continues to alternate Morning/Evening;
-- Full Day is assigned as a manager override.
insert into public.shifts(name,start_time,end_time,color,is_rotational)
select 'Full Day','07:00','23:00','#2563eb',false
where not exists(select 1 from public.shifts where name='Full Day' and deleted_at is null);
