-- The rolling monthly budget (Paisa budget handbook): one daily limit from
-- what is left of the month, extra savings at month end, a month-start
-- choice for them, and bills with a paid/unpaid status per budget month.
--
-- Only raw facts are stored. Daily limits, weekly figures and what is left
-- are worked out in the app from these and the ledger, never saved.

-- Where each account stands with the new budget. budget_flow_version is the
-- one-time migration flag: 0 until the account has been through it.
alter table public.profiles
  add column if not exists budget_flow_version smallint not null default 0,
  -- Spending counts from this day: the first day of the cycle for accounts
  -- moved over (what they logged this month counts), the day they joined for
  -- new ones, or the next cycle's first day when they joined in its last days.
  add column if not exists tracking_start date,
  -- What a new account said it had already spent of tracking_start's cycle.
  add column if not exists already_spent numeric(12, 2) not null default 0,
  add column if not exists budget_flow_started_on date,
  add column if not exists budget_flow_source text;

alter table public.profiles
  drop constraint if exists profiles_already_spent_check,
  add constraint profiles_already_spent_check check (already_spent >= 0),
  drop constraint if exists profiles_budget_flow_source_check,
  add constraint profiles_budget_flow_source_check
    check (budget_flow_source is null or budget_flow_source in ('new', 'migrated', 'restart'));

-- A one-off expense marked fixed (fees, repairs) is set aside from the month
-- like a bill instead of coming out of a day's limit.
alter table public.transactions
  add column if not exists is_fixed boolean not null default false;

-- One row per finished budget cycle, written once on the first open after it
-- ends. extra_savings is what was left of the spendable money; it stays
-- savings unless the user chose to add it to the next budget (choice =
-- 'budget', which moves all of it: to_budget). The row is the ledger entry
-- reports show as "Rollover from October".
create table if not exists public.budget_months (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  budget numeric(12, 2) not null default 0,
  savings_goal numeric(12, 2) not null default 0,
  spendable numeric(12, 2) not null default 0,
  spent numeric(12, 2) not null default 0,
  extra_savings numeric(12, 2) not null default 0 check (extra_savings >= 0),
  overspent_by numeric(12, 2) not null default 0 check (overspent_by >= 0),
  -- Tracking began after the cycle's first day.
  partial_from date,
  -- Whether the month-start review asks what to do with the extra.
  prompt boolean not null default true,
  -- Null until the user chooses; null counts as keeping it as savings.
  choice text check (choice is null or choice in ('keep', 'budget')),
  to_budget numeric(12, 2) not null default 0 check (to_budget >= 0),
  applied_cycle_start date,
  handled_at timestamptz,
  reviewed_at timestamptz,
  closed_at timestamptz not null default now(),
  primary key (user_id, cycle_start),
  check (cycle_end >= cycle_start),
  check (to_budget <= extra_savings)
);

-- Money moved into or out of one cycle's spendable amount: a top-up from
-- extra income, or kept extra savings moved to the budget and back.
create table if not exists public.budget_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cycle_start date not null,
  kind text not null check (kind in ('top_up', 'move_to_budget', 'move_to_savings')),
  amount numeric(12, 2) not null check (amount > 0),
  label text,
  created_at timestamptz not null default now()
);

create index if not exists budget_adjustments_user_cycle_idx
  on public.budget_adjustments (user_id, cycle_start);

-- A monthly bill's status in one budget cycle, when it is not the usual
-- "added on its due day". bill_key is the series' first row id, or the ref
-- of a bill still waiting for its first date. A not_paid row stays reserved,
-- and carries into later cycles until it is paid (settled_on says when).
create table if not exists public.bill_months (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bill_key text not null,
  cycle_start date not null,
  status text not null check (status in ('not_paid', 'paid', 'paid_outside', 'skipped')),
  label text not null default '',
  planned_amount numeric(12, 2) not null default 0 check (planned_amount >= 0),
  paid_amount numeric(12, 2) check (paid_amount is null or paid_amount >= 0),
  transaction_id uuid references public.transactions (id) on delete set null,
  settled_on date,
  updated_at timestamptz not null default now(),
  primary key (user_id, bill_key, cycle_start)
);

create index if not exists bill_months_transaction_idx
  on public.bill_months (transaction_id)
  where transaction_id is not null;

alter table public.budget_months enable row level security;
alter table public.budget_adjustments enable row level security;
alter table public.bill_months enable row level security;

alter table public.budget_months force row level security;
alter table public.budget_adjustments force row level security;
alter table public.bill_months force row level security;

revoke all on table public.budget_months from anon, public;
revoke all on table public.budget_adjustments from anon, public;
revoke all on table public.bill_months from anon, public;

grant select, insert, update on table public.budget_months to authenticated;
-- Adjustments are written only through add_budget_adjustment, which checks
-- a move never takes more than the savings hold.
grant select on table public.budget_adjustments to authenticated;
grant select, insert, update, delete on table public.bill_months to authenticated;

create policy "Users can read own budget months"
  on public.budget_months
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert own budget months"
  on public.budget_months
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update own budget months"
  on public.budget_months
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can read own budget adjustments"
  on public.budget_adjustments
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read own bill months"
  on public.bill_months
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert own bill months"
  on public.bill_months
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      transaction_id is null
      or exists (
        select 1
        from public.transactions as txn
        where txn.id = transaction_id
          and txn.user_id = (select auth.uid())
      )
    )
  );

create policy "Users can update own bill months"
  on public.bill_months
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      transaction_id is null
      or exists (
        select 1
        from public.transactions as txn
        where txn.id = transaction_id
          and txn.user_id = (select auth.uid())
      )
    )
  );

create policy "Users can delete own bill months"
  on public.bill_months
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Records the month-start choice for a finished cycle, once. 'budget' moves
-- all of its extra savings (recounted by the app as it chooses, so payments
-- synced after the month closed are in it) into p_applied_cycle_start.
-- Returns the row, or nothing when the choice was already made.
create or replace function public.apply_month_choice(
  p_cycle_start date,
  p_choice text,
  p_extra_savings numeric,
  p_applied_cycle_start date
)
returns setof public.budget_months
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_choice is null or p_choice not in ('keep', 'budget') then
    raise exception 'Unknown choice %', p_choice;
  end if;

  return query
  update public.budget_months
  set
    extra_savings = greatest(0, round(coalesce(p_extra_savings, extra_savings), 2)),
    choice = p_choice,
    to_budget = case
      when p_choice = 'budget' then greatest(0, round(coalesce(p_extra_savings, extra_savings), 2))
      else 0
    end,
    applied_cycle_start = case when p_choice = 'budget' then p_applied_cycle_start else null end,
    handled_at = now()
  where user_id = (select auth.uid())
    and cycle_start = p_cycle_start
    and choice is null
  returning *;
end;
$$;

revoke all on function public.apply_month_choice(date, text, numeric, date) from public, anon;
grant execute on function public.apply_month_choice(date, text, numeric, date) to authenticated;

-- Adds money to a cycle's budget or moves it back to savings. A move to the
-- budget may not take more than the extra savings kept so far; concurrent
-- moves by one user are serialised so two devices cannot both spend it.
create or replace function public.add_budget_adjustment(
  p_cycle_start date,
  p_kind text,
  p_amount numeric,
  p_label text default null
)
returns public.budget_adjustments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_pool numeric;
  v_row public.budget_adjustments;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_kind is null
    or p_kind not in ('top_up', 'move_to_budget', 'move_to_savings')
    or v_amount is null
    or v_amount <= 0
    or p_cycle_start is null then
    raise exception 'Invalid budget adjustment';
  end if;

  if p_kind = 'move_to_budget' then
    perform pg_advisory_xact_lock(hashtextextended('budget_adjustments:' || v_user::text, 0));
    select
      coalesce((
        select sum(month.extra_savings - month.to_budget)
        from public.budget_months as month
        where month.user_id = v_user
      ), 0)
      - coalesce((
        select sum(adjustment.amount)
        from public.budget_adjustments as adjustment
        where adjustment.user_id = v_user
          and adjustment.kind = 'move_to_budget'
      ), 0)
      + coalesce((
        select sum(adjustment.amount)
        from public.budget_adjustments as adjustment
        where adjustment.user_id = v_user
          and adjustment.kind = 'move_to_savings'
      ), 0)
    into v_pool;
    if v_amount > v_pool then
      raise exception 'That is more than your extra savings';
    end if;
  end if;

  insert into public.budget_adjustments (user_id, cycle_start, kind, amount, label)
  values (v_user, p_cycle_start, p_kind, v_amount, nullif(btrim(coalesce(p_label, '')), ''))
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.add_budget_adjustment(date, text, numeric, text) from public, anon;
grant execute on function public.add_budget_adjustment(date, text, numeric, text) to authenticated;
