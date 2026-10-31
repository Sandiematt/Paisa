-- Lets sign-up tell someone on its first step that an email already has an
-- account, instead of after they have filled in every step.
--
-- This answers "is this email registered?" for anyone who asks, which is the
-- trade-off of checking before sign-up. Only a yes/no comes back, never any
-- account data, and the comparison ignores case and surrounding spaces the
-- way GoTrue stores emails.

create or replace function public.email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;
