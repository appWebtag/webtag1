-- WebTag: organic statistics of the clients' Facebook Pages and Instagram accounts, per month.
-- Written only by the meta-sync function (server key); each user reads only their own rows.
begin;

alter table public.meta_pages
  add column if not exists insights_status text check (insights_status is null or insights_status in ('ok','no_access')),
  add column if not exists insights_error text,
  add column if not exists insights_checked_at timestamptz,
  add column if not exists instagram_id text check (instagram_id is null or instagram_id ~ '^[0-9]{1,30}$'),
  add column if not exists instagram_username text,
  add column if not exists followers bigint,
  add column if not exists instagram_followers bigint;

create table if not exists public.page_insights_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null check (page_id ~ '^[0-9]{1,30}$'),
  platform text not null check (platform in ('facebook','instagram')),
  month date not null check (extract(day from month) = 1),
  views bigint,
  reach bigint,
  engagements bigint,
  new_followers bigint,
  followers bigint,
  fetched_at timestamptz not null default now(),
  primary key (user_id, page_id, platform, month)
);

revoke all on public.page_insights_monthly from anon, authenticated;
grant select on public.page_insights_monthly to authenticated;
alter table public.page_insights_monthly enable row level security;
drop policy if exists page_insights_select_owner on public.page_insights_monthly;
create policy page_insights_select_owner on public.page_insights_monthly for select to authenticated
  using ((select auth.uid()) = user_id);

commit;
