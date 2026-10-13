-- Durable asynchronous work, retries, dead letters, schedules, and outbound webhooks.
create table public.background_jobs(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  job_type text not null, payload jsonb not null default '{}', status text not null default 'QUEUED' check(status in ('QUEUED','RUNNING','RETRYING','COMPLETED','DEAD_LETTER','CANCELLED')),
  priority smallint not null default 100, attempts integer not null default 0, max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  run_after timestamptz not null default now(), locked_at timestamptz, locked_by text, last_error text, result jsonb,
  idempotency_key text, created_by uuid references public.users(id), created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
);
create unique index background_jobs_idempotency_key on public.background_jobs(organization_id,idempotency_key) where idempotency_key is not null and status<>'CANCELLED';
create index background_jobs_claim_idx on public.background_jobs(status,run_after,priority,created_at) where status in ('QUEUED','RETRYING');

create table public.webhook_endpoints(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  name text not null, url text not null check(url ~ '^https://'), event_types text[] not null default '{}', signing_secret_ref text not null,
  active boolean not null default true, created_by uuid not null references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,name)
);
create table public.webhook_deliveries(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade, event_type text not null, event_id text not null,
  request_body jsonb not null, response_status integer, response_body text, duration_ms integer, job_id uuid references public.background_jobs(id),
  delivered_at timestamptz, created_at timestamptz not null default now()
);
create index webhook_deliveries_endpoint_idx on public.webhook_deliveries(endpoint_id,created_at desc);

alter table public.background_jobs enable row level security; alter table public.webhook_endpoints enable row level security; alter table public.webhook_deliveries enable row level security;
create policy "admins read jobs" on public.background_jobs for select to authenticated using(organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "super admins manage endpoints" on public.webhook_endpoints for all to authenticated using(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN') with check(organization_id=public.current_organization_id() and public.current_role()='SUPER_ADMIN');
create policy "admins read webhook deliveries" on public.webhook_deliveries for select to authenticated using(organization_id=public.current_organization_id() and public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.enqueue_background_job(p_type text,p_payload jsonb default '{}',p_idempotency_key text default null,p_run_after timestamptz default now(),p_priority smallint default 100)
returns uuid language plpgsql security definer set search_path=public as $$ declare job_id uuid; begin
  if auth.uid() is not null and public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Not authorized to enqueue jobs'; end if;
  insert into public.background_jobs(job_type,payload,idempotency_key,run_after,priority,created_by)
  values(p_type,coalesce(p_payload,'{}'),p_idempotency_key,p_run_after,p_priority,auth.uid())
  on conflict(organization_id,idempotency_key) where idempotency_key is not null and status<>'CANCELLED' do update set updated_at=now()
  returning id into job_id; return job_id;
end $$;

create or replace function public.claim_background_jobs(p_worker text,p_limit integer default 10)
returns setof public.background_jobs language plpgsql security definer set search_path=public as $$ begin
  return query with claimed as (
    select id from public.background_jobs where status in ('QUEUED','RETRYING') and run_after<=now()
    order by priority,created_at for update skip locked limit least(greatest(p_limit,1),50)
  ) update public.background_jobs j set status='RUNNING',attempts=attempts+1,locked_at=now(),locked_by=p_worker,started_at=coalesce(started_at,now()),updated_at=now()
  from claimed where j.id=claimed.id returning j.*;
end $$;
create or replace function public.finish_background_job(p_job_id uuid,p_result jsonb default '{}') returns void language sql security definer set search_path=public as $$
 update public.background_jobs set status='COMPLETED',result=coalesce(p_result,'{}'),completed_at=now(),locked_at=null,locked_by=null,updated_at=now() where id=p_job_id and status='RUNNING'
$$;
create or replace function public.fail_background_job(p_job_id uuid,p_error text) returns void language plpgsql security definer set search_path=public as $$ begin
 update public.background_jobs set status=case when attempts>=max_attempts then 'DEAD_LETTER' else 'RETRYING' end,last_error=left(p_error,4000),run_after=case when attempts>=max_attempts then run_after else now()+make_interval(secs=>least(3600,power(2,attempts)::integer*30)) end,locked_at=null,locked_by=null,updated_at=now() where id=p_job_id and status='RUNNING'; end $$;
create or replace function public.retry_background_job(p_job_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can retry jobs'; end if;
 update public.background_jobs set status='QUEUED',attempts=0,run_after=now(),last_error=null,completed_at=null,updated_at=now() where id=p_job_id and organization_id=public.current_organization_id() and status in ('DEAD_LETTER','CANCELLED');
 if not found then raise exception 'Retryable job not found'; end if; end $$;
create or replace function public.cancel_background_job(p_job_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 if public.current_role()<>'SUPER_ADMIN' then raise exception 'Only Super Admins can cancel jobs'; end if;
 update public.background_jobs set status='CANCELLED',completed_at=now(),updated_at=now() where id=p_job_id and organization_id=public.current_organization_id() and status in ('QUEUED','RETRYING');
 if not found then raise exception 'Cancellable job not found'; end if; end $$;

create or replace function public.enqueue_due_report_schedules() returns integer language plpgsql security definer set search_path=public as $$ declare queued integer:=0; schedule record; begin
 for schedule in select s.*,d.organization_id,d.name,d.report_type,d.filters from public.report_schedules s join public.report_definitions d on d.id=s.definition_id where s.active and s.next_run_at<=now() for update of s skip locked loop
   insert into public.background_jobs(organization_id,job_type,payload,idempotency_key,priority)
   values(schedule.organization_id,'SCHEDULED_REPORT',jsonb_build_object('schedule_id',schedule.id,'definition_id',schedule.definition_id,'name',schedule.name,'report_type',schedule.report_type,'filters',schedule.filters,'format',schedule.format,'recipients',schedule.recipients,'created_by',schedule.created_by),schedule.id::text||':'||schedule.next_run_at::text,80) on conflict do nothing;
   update public.report_schedules set next_run_at=case frequency when 'DAILY' then next_run_at+interval '1 day' when 'WEEKLY' then next_run_at+interval '1 week' when 'MONTHLY' then next_run_at+interval '1 month' else next_run_at+interval '3 months' end where id=schedule.id; queued:=queued+1;
 end loop; return queued; end $$;

create or replace function public.queue_invitation_delivery() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.background_jobs(organization_id,job_type,payload,idempotency_key,priority,created_by) values(new.organization_id,'INVITATION_EMAIL',jsonb_build_object('invitation_id',new.id,'email',new.email,'role',new.role,'expires_at',new.expires_at),'invite:'||new.id,30,new.invited_by); return new; end $$;
create trigger queue_invitation_delivery after insert on public.organization_invitations for each row execute function public.queue_invitation_delivery();
create or replace function public.queue_export_generation() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.background_jobs(organization_id,job_type,payload,idempotency_key,priority,created_by) values(new.organization_id,'COMPLIANCE_EXPORT',jsonb_build_object('export_id',new.id),'export:compliance_exports:'||new.id,60,new.requested_by); return new; end $$;
create trigger queue_compliance_export after insert on public.compliance_exports for each row execute function public.queue_export_generation();
create or replace function public.queue_report_export_generation() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.background_jobs(organization_id,job_type,payload,idempotency_key,priority,created_by) values(new.organization_id,'REPORT_EXPORT',jsonb_build_object('export_id',new.id),'export:report_exports:'||new.id,60,new.created_by); return new; end $$;
create trigger queue_report_export after insert on public.report_exports for each row execute function public.queue_report_export_generation();

revoke all on function public.claim_background_jobs(text,integer) from public; revoke all on function public.finish_background_job(uuid,jsonb) from public; revoke all on function public.fail_background_job(uuid,text) from public; revoke all on function public.enqueue_due_report_schedules() from public;
grant execute on function public.claim_background_jobs(text,integer),public.finish_background_job(uuid,jsonb),public.fail_background_job(uuid,text),public.enqueue_due_report_schedules() to service_role;
revoke all on function public.retry_background_job(uuid),public.cancel_background_job(uuid) from public;
grant execute on function public.retry_background_job(uuid),public.cancel_background_job(uuid) to authenticated;

-- Complete pending organization invitations when an invited person registers.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare first_invitation record;
begin
  select organization_id,role into first_invitation from public.organization_invitations
  where lower(email)=lower(new.email) and status='PENDING' and expires_at>now() order by created_at limit 1;
  insert into public.users(id,role,full_name,avatar_url,email,current_organization_id)
  values(new.id,coalesce(first_invitation.role,'EMPLOYEE'),coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url',lower(new.email),first_invitation.organization_id)
  on conflict(id) do update set email=excluded.email,current_organization_id=coalesce(public.users.current_organization_id,excluded.current_organization_id);
  insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
  select organization_id,new.id,role,'ACTIVE',now() from public.organization_invitations
  where lower(email)=lower(new.email) and status='PENDING' and expires_at>now()
  on conflict(organization_id,user_id) do update set role=excluded.role,status='ACTIVE',joined_at=coalesce(public.organization_memberships.joined_at,now());
  update public.organization_invitations set status='ACCEPTED',accepted_at=now()
  where lower(email)=lower(new.email) and status='PENDING' and expires_at>now();
  return new;
end $$;
