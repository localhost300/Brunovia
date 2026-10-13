-- Keep leave workflow status assignments strongly typed on PostgreSQL 17.
create or replace function public.review_leave_request(p_request_id uuid,p_decision text,p_comment text default null)
returns text language plpgsql security definer set search_path=public as $$
declare target leave_requests; next_status leave_status;
begin
  if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid decision'; end if;
  select * into target from leave_requests where id=p_request_id for update;
  if target.id is null then raise exception 'Leave request not found'; end if;
  if target.status='PENDING_MANAGER' then
    if public.current_role()='MANAGER' and not exists(select 1 from employees where id=target.employee_id and manager_id=public.current_employee_record_id()) then raise exception 'This employee does not report to you'; end if;
    if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER','MANAGER') then raise exception 'Insufficient permission'; end if;
    next_status := case when p_decision='REJECT' then 'REJECTED'::leave_status else 'PENDING_HR'::leave_status end;
    update leave_requests set status=next_status,manager_approved_by=case when p_decision='APPROVE' then public.current_employee_record_id() else null end,manager_comment=p_comment,updated_at=now() where id=p_request_id;
  elsif target.status='PENDING_HR' then
    if public.current_role() not in ('SUPER_ADMIN','HR_MANAGER') then raise exception 'HR approval required'; end if;
    next_status := case when p_decision='REJECT' then 'REJECTED'::leave_status else 'APPROVED'::leave_status end;
    update leave_requests set status=next_status,hr_approved_by=case when p_decision='APPROVE' then public.current_employee_record_id() else null end,hr_comment=p_comment,updated_at=now() where id=p_request_id;
  else raise exception 'This request is no longer pending';
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'REVIEW_LEAVE_REQUEST','leave_request',p_request_id::text,jsonb_build_object('decision',p_decision,'status',next_status,'comment',p_comment));
  return next_status::text;
end $$;

revoke all on function public.review_leave_request(uuid,text,text) from public,anon;
grant execute on function public.review_leave_request(uuid,text,text) to authenticated;
