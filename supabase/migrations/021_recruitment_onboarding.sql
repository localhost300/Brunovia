-- Auditable recruitment pipeline and candidate-to-employee onboarding.

create table public.recruitment_jobs(
  id uuid primary key default gen_random_uuid(), title text not null, department_id uuid references public.departments(id),
  employment_type text not null check(employment_type in ('FULL_TIME','PART_TIME','CONTRACT','INTERN')),
  location text, description text, hiring_manager_id uuid references public.employees(id), openings integer not null default 1 check(openings>0),
  status text not null default 'DRAFT' check(status in ('DRAFT','OPEN','PAUSED','CLOSED')),
  closing_date date, created_by uuid not null default auth.uid() references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.recruitment_candidates(
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.recruitment_jobs(id), first_name text not null, last_name text not null,
  email text not null, phone text, source text, resume_path text, stage text not null default 'APPLIED' check(stage in ('APPLIED','SCREENING','INTERVIEW','OFFER','HIRED','REJECTED','WITHDRAWN')),
  consent_at timestamptz, retention_until date, converted_employee_id uuid references public.employees(id), applied_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(job_id,email)
);
create table public.recruitment_stage_history(
  id bigint generated always as identity primary key, candidate_id uuid not null references public.recruitment_candidates(id) on delete cascade,
  from_stage text, to_stage text not null, note text, changed_by uuid not null references public.users(id), changed_at timestamptz not null default now()
);
create table public.recruitment_interviews(
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.recruitment_candidates(id) on delete cascade,
  scheduled_at timestamptz not null, duration_minutes integer not null default 60 check(duration_minutes between 15 and 480), location text,
  interviewer_id uuid not null references public.employees(id), status text not null default 'SCHEDULED' check(status in ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW')), created_at timestamptz not null default now()
);
create table public.interview_evaluations(
  id uuid primary key default gen_random_uuid(), interview_id uuid not null references public.recruitment_interviews(id) on delete cascade,
  evaluator_id uuid not null references public.employees(id), score numeric(3,2) not null check(score between 1 and 5), recommendation text not null check(recommendation in ('STRONG_NO','NO','YES','STRONG_YES')),
  strengths text, concerns text, submitted_at timestamptz not null default now(), unique(interview_id,evaluator_id)
);
create table public.recruitment_offers(
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null unique references public.recruitment_candidates(id), offered_salary numeric(14,2) not null check(offered_salary>=0),
  proposed_start_date date not null, status text not null default 'DRAFT' check(status in ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','WITHDRAWN')),
  offer_path text, sent_at timestamptz, responded_at timestamptz, created_by uuid not null references public.users(id), created_at timestamptz not null default now()
);
create table public.onboarding_templates(
  id uuid primary key default gen_random_uuid(), name text not null unique, tasks jsonb not null default '[]', active boolean not null default true, created_at timestamptz not null default now()
);
create table public.employee_onboarding_tasks(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete cascade, title text not null,
  owner_role text not null, due_date date, status text not null default 'PENDING' check(status in ('PENDING','IN_PROGRESS','COMPLETED','WAIVED')),
  completed_by uuid references public.users(id), completed_at timestamptz, created_at timestamptz not null default now()
);
insert into public.onboarding_templates(name,tasks) values('Standard onboarding','[{"title":"Verify identity and employment documents","owner_role":"HR_MANAGER","days":0},{"title":"Provision email and system access","owner_role":"SUPER_ADMIN","days":1},{"title":"Assign equipment","owner_role":"HR_MANAGER","days":1},{"title":"Complete manager orientation","owner_role":"MANAGER","days":3},{"title":"Acknowledge company policies","owner_role":"EMPLOYEE","days":5}]') on conflict(name) do nothing;

create index recruitment_candidates_job_stage_idx on public.recruitment_candidates(job_id,stage,applied_at desc);
create index recruitment_interviews_schedule_idx on public.recruitment_interviews(scheduled_at,interviewer_id);
create index onboarding_employee_status_idx on public.employee_onboarding_tasks(employee_id,status);
alter table public.recruitment_jobs enable row level security; alter table public.recruitment_candidates enable row level security; alter table public.recruitment_stage_history enable row level security;
alter table public.recruitment_interviews enable row level security; alter table public.interview_evaluations enable row level security; alter table public.recruitment_offers enable row level security;
alter table public.onboarding_templates enable row level security; alter table public.employee_onboarding_tasks enable row level security;

create policy "recruiters view jobs" on public.recruitment_jobs for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "hr manages jobs" on public.recruitment_jobs for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "recruiters view candidates" on public.recruitment_candidates for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and job_id in(select id from recruitment_jobs where hiring_manager_id=public.current_employee_record_id())));
create policy "hr creates candidates" on public.recruitment_candidates for insert to authenticated with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "recruiters view stage history" on public.recruitment_stage_history for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "participants view interviews" on public.recruitment_interviews for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or interviewer_id=public.current_employee_record_id());
create policy "hr manages interviews" on public.recruitment_interviews for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "evaluators view evaluations" on public.interview_evaluations for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or evaluator_id=public.current_employee_record_id());
create policy "interviewers submit evaluations" on public.interview_evaluations for insert to authenticated with check(evaluator_id=public.current_employee_record_id());
create policy "hr manages offers" on public.recruitment_offers for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "staff view onboarding templates" on public.onboarding_templates for select to authenticated using(active or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr manages onboarding templates" on public.onboarding_templates for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "visible onboarding tasks" on public.employee_onboarding_tasks for select to authenticated using(employee_id=public.current_employee_record_id() or public.current_role() in ('SUPER_ADMIN','HR_MANAGER') or (public.current_role()='MANAGER' and employee_id in(select id from employees where manager_id=public.current_employee_record_id())));

create or replace function public.move_recruitment_candidate(p_candidate_id uuid,p_stage text,p_note text default null)
returns text language plpgsql security definer set search_path=public as $$
declare candidate recruitment_candidates; allowed boolean:=false;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  select * into candidate from recruitment_candidates where id=p_candidate_id for update;
  if candidate.id is null then raise exception 'Candidate not found'; end if;
  allowed := (candidate.stage='APPLIED' and p_stage in ('SCREENING','REJECTED','WITHDRAWN')) or (candidate.stage='SCREENING' and p_stage in ('INTERVIEW','REJECTED','WITHDRAWN')) or (candidate.stage='INTERVIEW' and p_stage in ('OFFER','REJECTED','WITHDRAWN')) or (candidate.stage='OFFER' and p_stage in ('HIRED','REJECTED','WITHDRAWN'));
  if not allowed then raise exception 'Invalid candidate stage transition'; end if;
  update recruitment_candidates set stage=p_stage,updated_at=now() where id=p_candidate_id;
  insert into recruitment_stage_history(candidate_id,from_stage,to_stage,note,changed_by) values(p_candidate_id,candidate.stage,p_stage,p_note,auth.uid());
  insert into audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),'MOVE_CANDIDATE','recruitment_candidate',p_candidate_id::text,jsonb_build_object('stage',candidate.stage),jsonb_build_object('stage',p_stage,'note',p_note));
  return p_stage;
end $$;

create or replace function public.convert_candidate_to_employee(p_candidate_id uuid,p_employee_code text,p_employment_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare candidate recruitment_candidates; job recruitment_jobs; new_employee uuid; template_tasks jsonb; task jsonb;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  select * into candidate from recruitment_candidates where id=p_candidate_id for update;
  if candidate.stage<>'OFFER' then raise exception 'Candidate must be at offer stage'; end if;
  if not exists(select 1 from recruitment_offers where candidate_id=p_candidate_id and status='ACCEPTED') then raise exception 'An accepted offer is required'; end if;
  select * into job from recruitment_jobs where id=candidate.job_id;
  insert into employees(employee_id,department_id,manager_id,first_name,last_name,email,phone,position,employment_type,employment_date,status)
  values(upper(trim(p_employee_code)),job.department_id,job.hiring_manager_id,candidate.first_name,candidate.last_name,candidate.email,candidate.phone,job.title,job.employment_type,p_employment_date,'ACTIVE') returning id into new_employee;
  update recruitment_candidates set stage='HIRED',converted_employee_id=new_employee,updated_at=now() where id=p_candidate_id;
  insert into recruitment_stage_history(candidate_id,from_stage,to_stage,note,changed_by) values(p_candidate_id,'OFFER','HIRED','Converted to employee',auth.uid());
  select tasks into template_tasks from onboarding_templates where active=true order by created_at limit 1;
  for task in select * from jsonb_array_elements(coalesce(template_tasks,'[]')) loop
    insert into employee_onboarding_tasks(employee_id,title,owner_role,due_date) values(new_employee,task->>'title',task->>'owner_role',p_employment_date+coalesce((task->>'days')::integer,0));
  end loop;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'HIRE_CANDIDATE','employee',new_employee::text,jsonb_build_object('candidate_id',p_candidate_id,'employee_id',p_employee_code));
  return new_employee;
end $$;

create or replace function public.accept_offer_and_convert_candidate(p_candidate_id uuid,p_employee_code text,p_employment_date date,p_offered_salary numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_employee uuid;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized'; end if;
  if p_offered_salary<0 then raise exception 'Invalid offered salary'; end if;
  insert into recruitment_offers(candidate_id,offered_salary,proposed_start_date,status,sent_at,responded_at,created_by)
  values(p_candidate_id,p_offered_salary,p_employment_date,'ACCEPTED',now(),now(),auth.uid())
  on conflict(candidate_id) do update set offered_salary=excluded.offered_salary,proposed_start_date=excluded.proposed_start_date,status='ACCEPTED',responded_at=now();
  new_employee:=public.convert_candidate_to_employee(p_candidate_id,p_employee_code,p_employment_date);
  return new_employee;
end $$;
revoke all on function public.move_recruitment_candidate(uuid,text,text) from public,anon; grant execute on function public.move_recruitment_candidate(uuid,text,text) to authenticated;
revoke all on function public.convert_candidate_to_employee(uuid,text,date) from public,anon; grant execute on function public.convert_candidate_to_employee(uuid,text,date) to authenticated;
revoke all on function public.accept_offer_and_convert_candidate(uuid,text,date,numeric) from public,anon; grant execute on function public.accept_offer_and_convert_candidate(uuid,text,date,numeric) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('candidate-documents','candidate-documents',false,10485760,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do update set public=false,file_size_limit=10485760;
create policy "recruiters read candidate documents" on storage.objects for select to authenticated using(bucket_id='candidate-documents' and public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
