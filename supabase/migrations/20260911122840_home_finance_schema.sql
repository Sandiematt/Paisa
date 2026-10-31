-- Home finance schema: profiles, shared default categories, and user transactions.
-- Calculated dashboard totals are derived in the client from transactions.

create schema if not exists private;

revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, currency)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'currency', ''), 'INR')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create type public.money_flow as enum ('income', 'expense');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  currency text not null default 'INR',
  monthly_income numeric(12, 2),
  monthly_budget numeric(12, 2),
  goal text,
  category_ids text[] not null default '{}'::text[],
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default 'tag',
  color text not null,
  type public.money_flow not null,
  slug text,
  created_at timestamptz not null default now(),
  constraint categories_name_not_blank check (char_length(btrim(name)) > 0)
);

create unique index categories_default_slug_key
  on public.categories (slug)
  where user_id is null and slug is not null;

create unique index categories_user_name_type_key
  on public.categories (user_id, lower(name), type)
  where user_id is not null;

create index categories_user_id_idx on public.categories (user_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.money_flow not null,
  amount numeric(12, 2) not null,
  category_id uuid references public.categories (id) on delete set null,
  description text,
  merchant text,
  transaction_date date not null default (timezone('utc', now()))::date,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_positive check (amount > 0)
);

create index transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc);

create index transactions_user_category_idx
  on public.transactions (user_id, category_id);

create index transactions_category_id_idx
  on public.transactions (category_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function private.set_updated_at();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row
  execute function private.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

insert into public.categories (user_id, name, icon, color, type, slug)
values
  (null, 'Housing', 'home', '#E9A63C', 'expense', 'housing'),
  (null, 'Dining', 'utensils', '#E4573D', 'expense', 'dining'),
  (null, 'Groceries', 'cart', '#12998B', 'expense', 'groceries'),
  (null, 'Shopping', 'bag', '#2F9E63', 'expense', 'shopping'),
  (null, 'Transport', 'car', '#7A6BC4', 'expense', 'transport'),
  (null, 'Bills', 'file', '#8E887A', 'expense', 'bills'),
  (null, 'Health', 'heart', '#E4573D', 'expense', 'health'),
  (null, 'Travel', 'plane', '#12998B', 'expense', 'travel'),
  (null, 'Subscriptions', 'repeat', '#E9A63C', 'expense', 'subscriptions'),
  (null, 'Education', 'book', '#7A6BC4', 'expense', 'education'),
  (null, 'Salary', 'bank', '#2F9E63', 'income', 'salary'),
  (null, 'Freelance', 'laptop', '#12998B', 'income', 'freelance'),
  (null, 'Refund', 'rotate', '#7A6BC4', 'income', 'refund'),
  (null, 'Other', 'tag', '#8E887A', 'income', 'other');

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

alter table public.profiles force row level security;
alter table public.categories force row level security;
alter table public.transactions force row level security;

revoke all on table public.profiles from anon, public;
revoke all on table public.categories from anon, public;
revoke all on table public.transactions from anon, public;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can read default and own categories"
  on public.categories
  for select
  to authenticated
  using (user_id is null or user_id = (select auth.uid()));

create policy "Users can insert own categories"
  on public.categories
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update own categories"
  on public.categories
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete own categories"
  on public.categories
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read own transactions"
  on public.transactions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      category_id is null
      or exists (
        select 1
        from public.categories as category
        where category.id = category_id
          and (
            category.user_id is null
            or category.user_id = (select auth.uid())
          )
      )
    )
  );

create policy "Users can update own transactions"
  on public.transactions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      category_id is null
      or exists (
        select 1
        from public.categories as category
        where category.id = category_id
          and (
            category.user_id is null
            or category.user_id = (select auth.uid())
          )
      )
    )
  );

create policy "Users can delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
