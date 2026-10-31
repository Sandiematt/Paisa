-- Rows saved from a scanned receipt are tagged 'receipt_scan'. Their
-- external_ref is "receipt:<date>:<type>:<amount cents>:<merchant key>", so the
-- existing (user_id, external_ref) unique constraint stops the same receipt
-- from being saved twice.
alter table public.transactions
  drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'upi_auto', 'receipt_scan'));

comment on column public.transactions.source is
  'manual = entered in the app; upi_auto = detected from a UPI payment on the device; receipt_scan = read from a scanned receipt.';
comment on column public.transactions.external_ref is
  'Stable id of an auto-detected payment or scanned receipt, used to avoid saving it twice.';
