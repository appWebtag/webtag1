-- WebTag: user-defined categories (many per promotion), kind (post / ads) and advertising cost.
-- Apply once, after the earlier migrations. Single transaction.
begin;

-- Kind and cost on promotions. Existing rows become "ads".
alter table public.promotions
  add column kind text not null default 'ads' check (kind in ('post','ads')),
  add column cost numeric(12,2) check (cost is null or (cost >= 0 and cost <= 10000000));
-- A post is a single-day publication that is recorded as completed (or later cancelled).
alter table public.promotions add constraint promotions_post_shape
  check (kind <> 'post' or (starts_on = ends_on and status in ('completed','cancelled')));

-- Categories the user creates.
create table public.promotion_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index promotion_categories_name_key on public.promotion_categories(user_id, lower(btrim(name)));

-- Which categories each promotion has (any number).
create table public.promotion_category_links (
  promotion_id uuid not null,
  category_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (promotion_id, category_id),
  foreign key (promotion_id, user_id) references public.promotions(id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.promotion_categories(id, user_id) on delete cascade
);
create index promotion_category_links_owner_idx on public.promotion_category_links(user_id);
create index promotion_category_links_category_idx on public.promotion_category_links(category_id);

revoke all on public.promotion_categories, public.promotion_category_links from anon, authenticated;
grant select, delete on public.promotion_categories to authenticated;
grant insert (id, user_id, name), update (name) on public.promotion_categories to authenticated;
grant select, insert, delete on public.promotion_category_links to authenticated;

alter table public.promotion_categories enable row level security;
alter table public.promotion_category_links enable row level security;
create policy categories_select_owner on public.promotion_categories for select to authenticated using ((select auth.uid()) = user_id);
create policy categories_insert_owner on public.promotion_categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy categories_update_owner on public.promotion_categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy categories_delete_owner on public.promotion_categories for delete to authenticated using ((select auth.uid()) = user_id);
create policy category_links_select_owner on public.promotion_category_links for select to authenticated using ((select auth.uid()) = user_id);
create policy category_links_insert_owner on public.promotion_category_links for insert to authenticated with check ((select auth.uid()) = user_id);
create policy category_links_delete_owner on public.promotion_category_links for delete to authenticated using ((select auth.uid()) = user_id);

-- Replace a promotion's categories in one step (runs with the caller's rights, so RLS applies).
create function public.set_promotion_categories(p_promotion uuid, p_categories uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.promotion_category_links
    where promotion_id = p_promotion and user_id = me and not (category_id = any(p_categories));
  insert into public.promotion_category_links(promotion_id, category_id, user_id)
    select p_promotion, c, me from unnest(p_categories) as c
    on conflict (promotion_id, category_id) do nothing;
end;
$$;
revoke all on function public.set_promotion_categories(uuid, uuid[]) from public, anon;
grant execute on function public.set_promotion_categories(uuid, uuid[]) to authenticated;

commit;
