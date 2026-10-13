-- Bring existing draft payroll runs in line with the missed clock-out rule.
-- Approved, locked, paid, and reversed runs remain immutable.

with missed as (
  select
    p.id as payroll_id,
    count(a.id)::numeric as missed_days,
    round(
      (p.basic_salary/greatest(coalesce((p.calculation_inputs->>'working_days')::numeric,1),1))
      *count(a.id),
      2
    ) as missed_deduction
  from public.payroll p
  join public.pay_runs r on r.id=p.pay_run_id and r.status='DRAFT'
  left join public.attendance a on a.employee_id=p.employee_id
    and a.work_date between p.period and (date_trunc('month',p.period)+interval '1 month'-interval '1 day')::date
    and a.work_date<current_date
    and a.clock_in is not null
    and a.clock_out is null
  group by p.id,p.basic_salary,p.calculation_inputs
)
update public.payroll p
set
  deductions=(
    select coalesce(sum(pa.amount),0)
    from public.payroll_adjustments pa
    where pa.payroll_id=p.id and pa.adjustment_type<>'LATE_PENALTY'
  )+p.unpaid_leave_deduction+missed.missed_deduction,
  calculation_inputs=p.calculation_inputs||jsonb_build_object(
    'missed_clock_out_days',missed.missed_days,
    'missed_clock_out_deduction',missed.missed_deduction
  )
from missed
where p.id=missed.payroll_id;

do $$
declare target_run record;
begin
  for target_run in select id from public.pay_runs where status='DRAFT' loop
    perform public.refresh_pay_run_totals(target_run.id);
  end loop;
end $$;
