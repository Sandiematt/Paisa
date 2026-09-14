-- Activity swipe actions mark repeating rows; Recurring filter reads this flag.
alter table public.transactions
  add column if not exists is_recurring boolean not null default false;

comment on column public.transactions.is_recurring is
  'User-marked repeating transaction; used by Activity swipe and Recurring filter.';
