create type public.finance_transaction_type as enum ('INCOME','EXPENSE');
create type public.finance_transaction_status as enum ('DRAFT','PENDING','APPROVED','REJECTED','VOID');

create table public.finance_categories(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  transaction_type finance_transaction_type not null,
  is_payroll boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.finance_transactions(
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  transaction_date date not null,
  transaction_type finance_transaction_type not null,
  category_id uuid not null references public.finance_categories(id),
  description text not null,
  amount numeric(14,2) not null check(amount > 0),
  status finance_transaction_status not null default 'PENDING',
  payment_method text,
  vendor_customer text,
  receipt_path text,
  created_by uuid not null references public.users(id),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_budgets(
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.finance_categories(id),
  period date not null,
  amount numeric(14,2) not null check(amount >= 0),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique(category_id,period)
);

create table public.finance_period_locks(
  period date primary key,
  locked_by uuid not null references public.users(id),
  locked_at timestamptz not null default now(),
  reason text
);

create index finance_transactions_date_idx on public.finance_transactions(transaction_date desc);
create index finance_transactions_status_idx on public.finance_transactions(status,transaction_date desc);
alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_period_locks enable row level security;

create policy "finance roles read categories" on public.finance_categories for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "admins manage finance categories" on public.finance_categories for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "finance roles read transactions" on public.finance_transactions for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "finance roles create transactions" on public.finance_transactions for insert to authenticated with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER') and created_by=auth.uid());
create policy "admins approve transactions" on public.finance_transactions for update to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "finance roles read budgets" on public.finance_budgets for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "admins manage budgets" on public.finance_budgets for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));
create policy "finance roles read locks" on public.finance_period_locks for select to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER','MANAGER'));
create policy "admins manage locks" on public.finance_period_locks for all to authenticated using(public.current_role() in ('SUPER_ADMIN','HR_MANAGER')) with check(public.current_role() in ('SUPER_ADMIN','HR_MANAGER'));

create or replace function public.audit_finance_transaction() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),tg_op,'finance_transaction',coalesce(new.id,old.id)::text,to_jsonb(old),to_jsonb(new));
  return coalesce(new,old);
end $$;
create trigger finance_transaction_audit after insert or update or delete on public.finance_transactions for each row execute function public.audit_finance_transaction();

insert into public.finance_categories(name,transaction_type,is_payroll) values
('Service revenue','INCOME',false),('Product sales','INCOME',false),('Other income','INCOME',false),
('Salaries','EXPENSE',true),('Rent & facilities','EXPENSE',false),('Software & IT','EXPENSE',false),
('Marketing','EXPENSE',false),('Training','EXPENSE',false),('Travel','EXPENSE',false),
('Utilities','EXPENSE',false),('Other expense','EXPENSE',false);
