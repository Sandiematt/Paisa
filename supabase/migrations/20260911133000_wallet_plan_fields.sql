-- Wallet plan fields on profiles, plus ledger categories for opening/adjustments.
-- Dashboard totals stay derived from transactions.

alter table public.profiles
  add column if not exists starting_balance numeric(12, 2),
  add column if not exists monthly_savings_goal numeric(12, 2);

alter table public.profiles
  drop constraint if exists profiles_starting_balance_nonneg,
  drop constraint if exists profiles_monthly_income_nonneg,
  drop constraint if exists profiles_monthly_budget_nonneg,
  drop constraint if exists profiles_monthly_savings_goal_nonneg;

alter table public.profiles
  add constraint profiles_starting_balance_nonneg
    check (starting_balance is null or starting_balance >= 0),
  add constraint profiles_monthly_income_nonneg
    check (monthly_income is null or monthly_income >= 0),
  add constraint profiles_monthly_budget_nonneg
    check (monthly_budget is null or monthly_budget >= 0),
  add constraint profiles_monthly_savings_goal_nonneg
    check (monthly_savings_goal is null or monthly_savings_goal >= 0);

update public.profiles
set starting_balance = monthly_income
where starting_balance is null
  and monthly_income is not null;

insert into public.categories (user_id, name, icon, color, type, slug)
values
  (null, 'Opening balance', 'bank', '#2F9E63', 'income', 'opening'),
  (null, 'Balance adjustment', 'rotate', '#8E887A', 'income', 'adjustment_in'),
  (null, 'Balance adjustment', 'rotate', '#8E887A', 'expense', 'adjustment_out')
on conflict do nothing;

delete from public.transactions
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id
        order by created_at, id
      ) as rn
    from public.transactions
    where notes = 'opening_balance'
  ) ranked
  where rn > 1
);

create unique index if not exists transactions_one_opening_per_user
  on public.transactions (user_id)
  where notes = 'opening_balance';

create index if not exists transactions_user_notes_idx
  on public.transactions (user_id, notes);
