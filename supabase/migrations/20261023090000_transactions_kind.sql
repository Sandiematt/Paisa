alter table public.transactions
  add column if not exists kind text not null default 'regular';

alter table public.transactions
  drop constraint if exists transactions_kind_check;
alter table public.transactions
  add constraint transactions_kind_check
  check (kind in ('regular', 'opening_balance', 'balance_adjustment'));

update public.transactions
set kind = notes
where notes in ('opening_balance', 'balance_adjustment')
  and kind = 'regular';

update public.transactions
set notes = null
where kind in ('opening_balance', 'balance_adjustment')
  and notes in ('opening_balance', 'balance_adjustment');

drop index if exists public.transactions_one_opening_per_user;

create unique index if not exists transactions_one_opening_per_user
  on public.transactions (user_id)
  where kind = 'opening_balance';
