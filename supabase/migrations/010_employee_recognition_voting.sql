create table public.recognition_elections(
  id uuid primary key default gen_random_uuid(),title text not null,award_month date not null unique,voting_opens_at timestamptz not null,voting_closes_at timestamptz not null,status text not null default 'DRAFT' check(status in ('DRAFT','OPEN','CLOSED','PUBLISHED')),winner_employee_id uuid references public.employees(id),published_by uuid references public.users(id),published_at timestamptz,created_at timestamptz not null default now(),check(voting_closes_at>voting_opens_at)
);
create table public.recognition_candidates(
  id uuid primary key default gen_random_uuid(),election_id uuid not null references public.recognition_elections(id) on delete cascade,employee_id uuid not null references public.employees(id),nomination_reason text not null,shortlisted_by uuid references public.users(id),created_at timestamptz not null default now(),unique(election_id,employee_id)
);
create table public.recognition_votes(
  id uuid primary key default gen_random_uuid(),election_id uuid not null references public.recognition_elections(id) on delete cascade,candidate_id uuid not null references public.recognition_candidates(id),voter_employee_id uuid not null references public.employees(id),created_at timestamptz not null default now(),unique(election_id,voter_employee_id)
);
alter table public.recognition_elections enable row level security;alter table public.recognition_candidates enable row level security;alter table public.recognition_votes enable row level security;
create policy "employees see published elections" on public.recognition_elections for select to authenticated using(status='PUBLISHED' or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "employees see candidates" on public.recognition_candidates for select to authenticated using(true);
create policy "employee casts one own vote" on public.recognition_votes for insert to authenticated with check(voter_employee_id in(select id from public.employees where user_id=auth.uid()) and exists(select 1 from public.recognition_elections e where e.id=election_id and e.status='OPEN' and now() between e.voting_opens_at and e.voting_closes_at));
create policy "employee sees own vote" on public.recognition_votes for select to authenticated using(voter_employee_id in(select id from public.employees where user_id=auth.uid()) or public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr manages elections" on public.recognition_elections for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "hr manages candidates" on public.recognition_candidates for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.publish_recognition_winner(p_election_id uuid,p_candidate_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare winner_id uuid;
begin
  if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'Only an authorized admin may publish results'; end if;
  select employee_id into winner_id from recognition_candidates where id=p_candidate_id and election_id=p_election_id;
  if winner_id is null then raise exception 'Candidate does not belong to election'; end if;
  update recognition_elections set winner_employee_id=winner_id,status='PUBLISHED',published_by=auth.uid(),published_at=now() where id=p_election_id and status in ('OPEN','CLOSED');
  if not found then raise exception 'Election cannot be published'; end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'PUBLISH_RECOGNITION_WINNER','recognition_election',p_election_id::text,jsonb_build_object('winner_employee_id',winner_id));
end $$;
