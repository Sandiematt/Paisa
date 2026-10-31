-- Per-user hourly quota for Edge Functions that call paid AI APIs
-- (scan-receipt: Gemini OCR, generate-insights: OpenRouter summary).
-- The limits live here, not in the caller, so a client calling the RPC
-- directly can only use up its own allowance.

create table if not exists private.function_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  function_name text not null,
  window_start timestamptz not null,
  calls integer not null default 0,
  primary key (user_id, function_name, window_start)
);

alter table private.function_usage enable row level security;
revoke all on table private.function_usage from anon, authenticated, public;

-- Counts one call by the signed-in user and returns whether it is within the
-- hourly limit. Unknown function names are always refused.
create or replace function public.consume_function_quota(p_function text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_limit integer;
  v_window timestamptz := date_trunc('hour', now());
  v_calls integer;
begin
  v_limit := case p_function
    when 'scan-receipt' then 30
    when 'generate-insights' then 120
    else 0
  end;
  if v_user is null or v_limit = 0 then
    return false;
  end if;

  insert into private.function_usage as usage (user_id, function_name, window_start, calls)
  values (v_user, p_function, v_window, 1)
  on conflict (user_id, function_name, window_start)
    do update set calls = usage.calls + 1
  returning calls into v_calls;

  delete from private.function_usage
  where user_id = v_user
    and function_name = p_function
    and window_start < v_window;

  return v_calls <= v_limit;
end;
$$;

revoke all on function public.consume_function_quota(text) from public, anon;
grant execute on function public.consume_function_quota(text) to authenticated;
