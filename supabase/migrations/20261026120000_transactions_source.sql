-- Rows saved by the on-device UPI detector (Auto-tracking) are tagged so they
-- can be told apart from hand-entered ones and never inserted twice.
alter table public.transactions
  add column if not exists source text not null default 'manual';

alter table public.transactions
  drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'upi_auto'));

-- external_ref is the detector's stable id ("upi:<installId>:<epoch>:<localId>"); upi_ref
-- is the UPI reference number once the payment app shows one.
alter table public.transactions
  add column if not exists external_ref text;
alter table public.transactions
  add column if not exists upi_ref text;

-- Not partial, so PostgREST can use it for onConflict. Postgres treats nulls as
-- distinct, so manual rows (external_ref is null) are never affected.
alter table public.transactions
  drop constraint if exists transactions_user_external_ref_key;
alter table public.transactions
  add constraint transactions_user_external_ref_key
  unique (user_id, external_ref);

comment on column public.transactions.source is
  'manual = entered in the app; upi_auto = detected from a UPI payment on the device.';
comment on column public.transactions.external_ref is
  'Stable id of an auto-detected payment, used to avoid saving it twice.';
comment on column public.transactions.upi_ref is
  'UPI reference number of an auto-detected payment, when known.';
