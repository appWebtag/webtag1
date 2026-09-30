-- WebTag: how far back each ad account's daily results have been loaded.
-- Large accounts load their history in pieces, newest first, over one or more syncs.
alter table public.meta_accounts add column if not exists history_from date;
