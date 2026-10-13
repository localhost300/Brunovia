-- Security-definer functions run with elevated database privileges. Restrict
-- direct execution to the roles that need each public RPC; trigger functions
-- do not require client execution privileges.

revoke all on function public.generate_weekly_shift_roster(date) from public;
grant execute on function public.generate_weekly_shift_roster(date) to authenticated;

revoke all on function public.publish_recognition_winner(uuid, uuid) from public;
grant execute on function public.publish_recognition_winner(uuid, uuid) to authenticated;

revoke all on function public.apply_late_attendance_penalty() from public;
revoke all on function public.audit_payroll_adjustment() from public;
revoke all on function public.audit_finance_transaction() from public;
revoke all on function public.handle_new_auth_user() from public;
