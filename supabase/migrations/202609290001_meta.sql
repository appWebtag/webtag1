-- WebTag: Meta (Facebook / Instagram) paid-ads analytics.
-- Apply once, after 202609280001_initial.sql. Single transaction.
-- The browser can only read its own rows and change a few user-owned columns;
-- everything that comes from Meta is written by the meta-sync Edge Function (service role).
begin;

-- Needed so links/results can reference (promotion, owner) together.
alter table public.promotions add constraint promotions_id_user_key unique (id, user_id);

-- One ad account per user (the ad account that runs all client ads).
create table public.meta_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]{1,30}$'),
  name text,
  currency text,
  timezone_name text,
  account_status integer,
  sync_status text not null default 'pending'
    check (sync_status in ('pending','running','ok','error','needs_reconnect')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ads seen in the ad account. Meta fields are written by the server;
-- the user decides which client (business) each ad belongs to.
create table public.meta_ads (
  user_id uuid not null references auth.users(id) on delete cascade,
  ad_id text not null check (ad_id ~ '^[0-9]{1,30}$'),
  account_id text not null,
  name text not null default '',
  campaign_id text,
  campaign_name text,
  objective text,
  adset_id text,
  adset_name text,
  effective_status text,
  created_time timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  business_id uuid,
  review_state text not null default 'new' check (review_state in ('new','assigned','ignored')),
  primary key (user_id, ad_id),
  foreign key (business_id, user_id) references public.businesses(id, user_id) on delete restrict,
  check ((review_state = 'assigned') = (business_id is not null))
);
create index meta_ads_campaign_idx on public.meta_ads(user_id, campaign_id);
create index meta_ads_review_idx on public.meta_ads(user_id, review_state);

-- Which Meta campaigns / ads belong to which promotion.
create table public.promotion_meta_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  promotion_id uuid not null,
  level text not null check (level in ('campaign','ad')),
  meta_id text not null check (meta_id ~ '^[0-9]{1,30}$'),
  created_at timestamptz not null default now(),
  unique (promotion_id, level, meta_id),
  foreign key (promotion_id, user_id) references public.promotions(id, user_id) on delete cascade
);
create index promotion_meta_links_owner_idx on public.promotion_meta_links(user_id);

-- Daily results per ad, one row per ad and day (in the ad account's time zone).
-- Re-syncs overwrite the same row, so nothing is counted twice.
-- NULL = Meta did not return the metric; 0 = Meta returned zero.
-- Daily reach must not be summed across days; the promotion total comes from meta_promotion_results.
create table public.meta_insights_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  ad_id text not null,
  date date not null,
  currency text not null,
  spend numeric(14,2),
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  actions jsonb,
  fetched_at timestamptz not null default now(),
  primary key (user_id, ad_id, date)
);

-- Totals for each promotion over its own period, fetched from Meta in one
-- de-duplicated request (correct reach across several ads).
create table public.meta_promotion_results (
  promotion_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  since date not null,
  until date not null,
  currency text,
  spend numeric(14,2),
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  actions jsonb,
  unavailable text[] not null default '{}',
  ad_count integer not null default 0,
  fetched_at timestamptz not null default now(),
  foreign key (promotion_id, user_id) references public.promotions(id, user_id) on delete cascade
);
create index meta_promotion_results_owner_idx on public.meta_promotion_results(user_id);

create table public.meta_sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('manual','daily')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','error','needs_reconnect')),
  ads_seen integer,
  days_saved integer,
  promotions_updated integer,
  message text
);
create index meta_sync_runs_owner_idx on public.meta_sync_runs(user_id, started_at desc);

-- Changing the ad account resets the connection state.
create function public.meta_accounts_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.ad_account_id is distinct from old.ad_account_id then
    new.sync_status := 'pending';
    new.name := null; new.currency := null; new.timezone_name := null;
    new.account_status := null; new.last_error := null; new.last_success_at := null;
  end if;
  return new;
end;
$$;
create trigger meta_accounts_touch before insert or update on public.meta_accounts
  for each row execute function public.meta_accounts_touch();
revoke all on function public.meta_accounts_touch() from public, anon, authenticated;

-- Privileges: read own rows; write only the user-owned columns.
revoke all on public.meta_accounts, public.meta_ads, public.promotion_meta_links,
  public.meta_insights_daily, public.meta_promotion_results, public.meta_sync_runs
  from anon, authenticated;
grant select on public.meta_accounts, public.meta_ads, public.promotion_meta_links,
  public.meta_insights_daily, public.meta_promotion_results, public.meta_sync_runs to authenticated;
grant insert (user_id, ad_account_id), update (ad_account_id) on public.meta_accounts to authenticated;
grant update (business_id, review_state) on public.meta_ads to authenticated;
grant insert (user_id, promotion_id, level, meta_id), delete on public.promotion_meta_links to authenticated;

alter table public.meta_accounts enable row level security;
alter table public.meta_ads enable row level security;
alter table public.promotion_meta_links enable row level security;
alter table public.meta_insights_daily enable row level security;
alter table public.meta_promotion_results enable row level security;
alter table public.meta_sync_runs enable row level security;

create policy meta_accounts_select_owner on public.meta_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy meta_accounts_insert_owner on public.meta_accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy meta_accounts_update_owner on public.meta_accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meta_ads_select_owner on public.meta_ads for select to authenticated using ((select auth.uid()) = user_id);
create policy meta_ads_update_owner on public.meta_ads for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy links_select_owner on public.promotion_meta_links for select to authenticated using ((select auth.uid()) = user_id);
create policy links_insert_owner on public.promotion_meta_links for insert to authenticated with check ((select auth.uid()) = user_id);
create policy links_delete_owner on public.promotion_meta_links for delete to authenticated using ((select auth.uid()) = user_id);
create policy insights_select_owner on public.meta_insights_daily for select to authenticated using ((select auth.uid()) = user_id);
create policy results_select_owner on public.meta_promotion_results for select to authenticated using ((select auth.uid()) = user_id);
create policy runs_select_owner on public.meta_sync_runs for select to authenticated using ((select auth.uid()) = user_id);

-- Secret for the daily scheduled call, kept in Vault; nobody needs to copy it.
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'meta_cron_secret',
  'Shared secret between pg_cron and the meta-sync Edge Function')
where not exists (select 1 from vault.secrets where name = 'meta_cron_secret');

create function public.meta_cron_secret_ok(candidate text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'meta_cron_secret' and decrypted_secret = candidate
  );
$$;
revoke all on function public.meta_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.meta_cron_secret_ok(text) to service_role;

commit;
