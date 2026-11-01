-- Rollover cap for the rolling daily limit (src/lib/budgetEngine.ts): a
-- day's limit is at most this many usual days, a usual day being the
-- cycle's day-to-day money over its counted days. Money above it stops
-- carrying forward and ends the month as extra savings. Null is no cap.
--
-- Only the setting is stored; limits are still worked out in the app.
alter table public.profiles
  add column if not exists rollover_cap numeric(3, 1);

alter table public.profiles
  drop constraint if exists profiles_rollover_cap_check,
  add constraint profiles_rollover_cap_check
    check (rollover_cap is null or (rollover_cap >= 1 and rollover_cap <= 10));
