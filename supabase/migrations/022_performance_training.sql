-- Performance review lifecycle, development plans, and learning compliance.

alter table public.employee_kpis drop constraint if exists employee_kpis_status_check;
alter table public.employee_kpis add constraint employee_kpis_status_check check(status in ('DRAFT','ACTIVE','SUBMITTED','ACKNOWLEDGED','COMPLETED','CANCELLED'));
alter table public.employee_kpis add column if not exists submitted_at timestamptz;
alter table public.employee_kpis add column if not exists acknowledged_at timestamptz;

create table public.development_plans(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), review_id uuid references public.performance_reviews(id),
  title text not null, actions jsonb not null default '[]', target_date date, status text not null default 'ACTIVE' check(status in ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.training_courses(
  id uuid primary key default gen_random_uuid(), title text not null unique, description text, provider text, delivery_mode text not null default 'ONLINE' check(delivery_mode in ('ONLINE','CLASSROOM','BLENDED','SELF_STUDY')),
  duration_hours numeric(7,2) check(duration_hours is null or duration_hours>=0), validity_months integer check(validity_months is null or validity_months>0), mandatory boolean not null default false,
  active boolean not null default true, created_by uuid references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.training_assignments(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), course_id uuid not null references public.training_courses(id),
  assigned_by uuid not null references public.users(id), assigned_at timestamptz not null default now(), due_date date,
  status text not null default 'ASSIGNED' check(status in ('ASSIGNED','IN_PROGRESS','COMPLETED','EXPIRED','WAIVED')),
  score numeric(5,2) check(score between 0 and 100), completed_at timestamptz, expires_at date, certificate_path text,
  unique(employee_id,course_id,assigned_at)
);
insert into public.training_courses(title,description,provider,delivery_mode,duration_hours,validity_months,mandatory)
values
('Information Security Awareness','Annual security, phishing, and data-handling training.','PeopleFlow Academy','ONLINE',2,12,true),
('Workplace Health and Safety','Core workplace safety and incident-response practices.','PeopleFlow Academy','BLENDED',4,12,true)
on conflict(title) do nothing;
create index development_plans_employee_idx on public.development_plans(employee_id,status);
create index training_assignments_employee_status_idx on public.training_assignments(employee_id,status,due_date);
alter table public.development_plans enable row level security; alter table public.training_courses enable row level security; alter table public.training_assignments enable row level security;

drop policy if exists "staff view own performance" on public.employee_kpis;
drop policy if exists "managers assign and review kpis" on public.employee_kpis;
create policy "visible employee kpis" on public.employee_kpis for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from employees where manager_id=public.current_employee_record_id())));
create policy "visible development plans" on public.development_plans for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from employees where manager_id=public.current_employee_record_id())));
create policy "managers create development plans" on public.development_plans for insert to authenticated with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from employees where manager_id=public.current_employee_record_id())));
create policy "staff view courses" on public.training_courses for select to authenticated using(active or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr manages courses" on public.training_courses for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "visible training assignments" on public.training_assignments for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from employees where manager_id=public.current_employee_record_id())));
create policy "managers assign training" on public.training_assignments for insert to authenticated with check(assigned_by=auth.uid() and (public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from employees where manager_id=public.current_employee_record_id()))));

create or replace function public.create_and_assign_kpi(p_employee_id uuid,p_title text,p_description text,p_category text,p_target_value numeric,p_target_unit text,p_weight numeric,p_period_start date,p_period_end date)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_kpi uuid; assignment uuid;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') then raise exception 'Not authorized'; end if;
  if public.current_role()='MANAGER' and not exists(select 1 from employees where id=p_employee_id and manager_id=public.current_employee_record_id()) then raise exception 'Employee does not report to you'; end if;
  if p_weight<=0 or p_weight>100 or p_period_end<p_period_start then raise exception 'Invalid KPI parameters'; end if;
  insert into kpis(title,description,category,target_value,target_unit,weight,created_by) values(trim(p_title),p_description,trim(p_category),p_target_value,p_target_unit,p_weight,auth.uid()) returning id into target_kpi;
  insert into employee_kpis(kpi_id,employee_id,period_start,period_end,status) values(target_kpi,p_employee_id,p_period_start,p_period_end,'ACTIVE') returning id into assignment;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'ASSIGN_KPI','employee_kpi',assignment::text,jsonb_build_object('employee_id',p_employee_id,'kpi_id',target_kpi));
  return assignment;
end $$;
create or replace function public.review_employee_kpi(p_employee_kpi_id uuid,p_actual_value numeric,p_score numeric,p_comment text,p_submit boolean)
returns text language plpgsql security definer set search_path=public as $$
declare target employee_kpis; next_status text;
begin
  select * into target from employee_kpis where id=p_employee_kpi_id for update;
  if target.id is null then raise exception 'KPI assignment not found'; end if;
  if public.current_role()='MANAGER' and not exists(select 1 from employees where id=target.employee_id and manager_id=public.current_employee_record_id()) then raise exception 'Employee does not report to you'; end if;
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') then raise exception 'Not authorized'; end if;
  if p_score<0 or p_score>100 or length(trim(coalesce(p_comment,'')))<5 then raise exception 'A valid score and evidence-based feedback are required'; end if;
  next_status:=case when p_submit then 'SUBMITTED' else 'ACTIVE' end;
  update employee_kpis set actual_value=p_actual_value,score=p_score,manager_comment=p_comment,status=next_status,reviewed_by=public.current_employee_record_id(),reviewed_at=now(),submitted_at=case when p_submit then now() else submitted_at end where id=p_employee_kpi_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'REVIEW_KPI','employee_kpi',p_employee_kpi_id::text,jsonb_build_object('score',p_score,'status',next_status)); return next_status;
end $$;
create or replace function public.acknowledge_employee_kpi(p_employee_kpi_id uuid,p_comment text default null)
returns text language plpgsql security definer set search_path=public as $$
begin
  update employee_kpis set status='ACKNOWLEDGED',employee_comment=p_comment,acknowledged_at=now() where id=p_employee_kpi_id and employee_id=public.current_employee_record_id() and status='SUBMITTED';
  if not found then raise exception 'Submitted KPI review not found'; end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'ACKNOWLEDGE_KPI','employee_kpi',p_employee_kpi_id::text,jsonb_build_object('comment',p_comment)); return 'ACKNOWLEDGED';
end $$;
create or replace function public.complete_training_assignment(p_assignment_id uuid,p_score numeric)
returns text language plpgsql security definer set search_path=public as $$
declare target training_assignments; validity integer;
begin
  select * into target from training_assignments where id=p_assignment_id for update;
  if target.id is null then raise exception 'Training assignment not found'; end if;
  if public.current_role()='EMPLOYEE' and target.employee_id<>public.current_employee_record_id() then raise exception 'Not authorized'; end if;
  if public.current_role()='MANAGER' and not exists(select 1 from employees where id=target.employee_id and manager_id=public.current_employee_record_id()) then raise exception 'Not authorized'; end if;
  if p_score<0 or p_score>100 then raise exception 'Score must be from 0 to 100'; end if;
  select validity_months into validity from training_courses where id=target.course_id;
  update training_assignments set status='COMPLETED',score=p_score,completed_at=now(),expires_at=case when validity is null then null else (current_date+(validity||' months')::interval)::date end where id=p_assignment_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'COMPLETE_TRAINING','training_assignment',p_assignment_id::text,jsonb_build_object('score',p_score)); return 'COMPLETED';
end $$;
revoke all on function public.create_and_assign_kpi(uuid,text,text,text,numeric,text,numeric,date,date) from public,anon; grant execute on function public.create_and_assign_kpi(uuid,text,text,text,numeric,text,numeric,date,date) to authenticated;
revoke all on function public.review_employee_kpi(uuid,numeric,numeric,text,boolean) from public,anon; grant execute on function public.review_employee_kpi(uuid,numeric,numeric,text,boolean) to authenticated;
revoke all on function public.acknowledge_employee_kpi(uuid,text) from public,anon; grant execute on function public.acknowledge_employee_kpi(uuid,text) to authenticated;
revoke all on function public.complete_training_assignment(uuid,numeric) from public,anon; grant execute on function public.complete_training_assignment(uuid,numeric) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('training-certificates','training-certificates',false,5242880,array['application/pdf','image/png','image/jpeg']) on conflict(id) do update set public=false,file_size_limit=5242880;
create policy "employees read own training certificates" on storage.objects for select to authenticated using(bucket_id='training-certificates' and (public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (storage.foldername(name))[1]=auth.uid()::text));
