alter table public.finance_categories
  drop constraint if exists finance_categories_name_key;

create unique index if not exists finance_categories_organization_name_key
  on public.finance_categories(organization_id, name);

create or replace function public.seed_finance_categories_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_categories(organization_id,name,transaction_type,is_payroll)
  values
    (new.id,'Service revenue','INCOME',false),
    (new.id,'Product sales','INCOME',false),
    (new.id,'Other income','INCOME',false),
    (new.id,'Salaries','EXPENSE',true),
    (new.id,'Rent & facilities','EXPENSE',false),
    (new.id,'Software & IT','EXPENSE',false),
    (new.id,'Marketing','EXPENSE',false),
    (new.id,'Training','EXPENSE',false),
    (new.id,'Travel','EXPENSE',false),
    (new.id,'Utilities','EXPENSE',false),
    (new.id,'Other expense','EXPENSE',false)
  on conflict (organization_id,name) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_finance_categories_after_organization_insert
  on public.organizations;

create trigger seed_finance_categories_after_organization_insert
after insert on public.organizations
for each row execute function public.seed_finance_categories_for_organization();

insert into public.finance_categories(organization_id,name,transaction_type,is_payroll)
select organization.id, category.name, category.transaction_type, category.is_payroll
from public.organizations as organization
cross join (
  values
    ('Service revenue','INCOME'::public.finance_transaction_type,false),
    ('Product sales','INCOME'::public.finance_transaction_type,false),
    ('Other income','INCOME'::public.finance_transaction_type,false),
    ('Salaries','EXPENSE'::public.finance_transaction_type,true),
    ('Rent & facilities','EXPENSE'::public.finance_transaction_type,false),
    ('Software & IT','EXPENSE'::public.finance_transaction_type,false),
    ('Marketing','EXPENSE'::public.finance_transaction_type,false),
    ('Training','EXPENSE'::public.finance_transaction_type,false),
    ('Travel','EXPENSE'::public.finance_transaction_type,false),
    ('Utilities','EXPENSE'::public.finance_transaction_type,false),
    ('Other expense','EXPENSE'::public.finance_transaction_type,false)
) as category(name,transaction_type,is_payroll)
on conflict (organization_id,name) do nothing;
