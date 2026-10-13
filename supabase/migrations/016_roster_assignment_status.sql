alter table public.employee_shifts
  add column if not exists assignment_type text not null default 'SHIFT'
  check(assignment_type in ('SHIFT','OFF_DUTY','LEAVE'));

alter table public.employee_shifts alter column shift_id drop not null;

alter table public.employee_shifts
  add constraint employee_shift_assignment_valid check(
    (assignment_type='SHIFT' and shift_id is not null) or
    (assignment_type in ('OFF_DUTY','LEAVE') and shift_id is null)
  );

do $$ begin
  alter publication supabase_realtime add table public.employee_shifts;
exception when duplicate_object then null;
end $$;
