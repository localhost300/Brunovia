create table public.biometric_enrollments(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  vendor text not null check(vendor in ('ZKTECO','SUPREMA','HIKVISION')),
  device_id text not null,
  template_reference text not null,
  finger_position text not null default 'RIGHT_INDEX',
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(employee_id, finger_position)
);
create index biometric_employee_idx on public.biometric_enrollments(employee_id) where revoked_at is null;
alter table public.biometric_enrollments enable row level security;
create policy "hr manages biometric references" on public.biometric_enrollments for all to authenticated
using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'))
with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
comment on table public.biometric_enrollments is 'Stores opaque vendor template references only. Never store fingerprint images or raw templates.';
