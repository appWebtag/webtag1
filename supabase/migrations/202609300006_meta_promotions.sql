-- WebTag: every Meta campaign that belongs to a client becomes a promotion automatically
-- (Promotions page and calendar), linked to the campaign so its results are shown.
begin;

-- Campaign dates and state, as Meta reports them (filled by the sync).
alter table public.meta_ads
  add column if not exists campaign_start_time timestamptz,
  add column if not exists campaign_stop_time timestamptz,
  add column if not exists campaign_status text;

-- The Meta campaign a promotion was created from (null for promotions made by hand).
alter table public.promotions add column if not exists meta_campaign_id text
  check (meta_campaign_id is null or meta_campaign_id ~ '^[0-9]{1,30}$');
create unique index if not exists promotions_meta_campaign_key
  on public.promotions(user_id, meta_campaign_id) where meta_campaign_id is not null;

-- Create / refresh the promotions of a user's assigned campaigns.
-- Runs with the caller's rights: a signed-in user only reaches their own rows (RLS);
-- the sync calls it with the server key for the user it is syncing.
create or replace function public.meta_sync_promotions(p_user uuid default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  target uuid := coalesce(p_user, me);
  today date := (now() at time zone 'Europe/Athens')::date;
  c record;
  pid uuid;
  first_day date;
  last_day date;
  st text;
  pub date;
  made integer := 0;
begin
  if target is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if me is not null and target <> me then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  for c in
    with ads as (
      select a.* from public.meta_ads a
      where a.user_id = target and a.review_state = 'assigned' and a.campaign_id is not null
    ),
    owner as (
      -- the client most of the campaign's ads belong to
      select distinct on (campaign_id) campaign_id, business_id
      from (select campaign_id, business_id, count(*) n from ads group by 1, 2) x
      order by campaign_id, n desc, business_id
    ),
    delivery as (
      select a.campaign_id, min(d.date) first_day, max(d.date) last_day, sum(d.spend) spend
      from ads a join public.meta_insights_daily d on d.user_id = a.user_id and d.ad_id = a.ad_id
      where coalesce(d.impressions, 0) > 0 or coalesce(d.spend, 0) > 0
      group by a.campaign_id
    )
    select a.campaign_id,
           o.business_id,
           left(max(coalesce(nullif(btrim(a.campaign_name), ''), 'Καμπάνια ' || a.campaign_id)), 200) as title,
           min((a.campaign_start_time at time zone 'Europe/Athens')::date) as start_meta,
           max((a.campaign_stop_time at time zone 'Europe/Athens')::date) as stop_meta,
           min((a.created_time at time zone 'Europe/Athens')::date) as created_day,
           bool_or(a.effective_status = 'ACTIVE' or a.campaign_status = 'ACTIVE') as active,
           dl.first_day, dl.last_day, dl.spend
    from ads a
    join owner o on o.campaign_id = a.campaign_id
    left join delivery dl on dl.campaign_id = a.campaign_id
    group by a.campaign_id, o.business_id, dl.first_day, dl.last_day, dl.spend
  loop
    -- Only campaigns that ran, or are running / starting.
    continue when c.first_day is null and not coalesce(c.active, false);
    -- Campaigns the user already linked to a promotion by hand stay with that promotion.
    continue when exists (
      select 1 from public.promotion_meta_links l join public.promotions p on p.id = l.promotion_id
      where l.user_id = target and l.level = 'campaign' and l.meta_id = c.campaign_id
        and (p.meta_campaign_id is distinct from c.campaign_id)
    );

    first_day := coalesce(c.start_meta, c.first_day, c.created_day, today);
    last_day := case
      when c.stop_meta is not null then c.stop_meta
      when coalesce(c.active, false) then greatest(today, first_day)
      else coalesce(c.last_day, first_day)
    end;
    if last_day < first_day then last_day := first_day; end if;
    if first_day > today then
      st := 'scheduled'; pub := null;
    elsif last_day < today and not coalesce(c.active, false) then
      st := 'completed'; pub := first_day;
    else
      st := 'published'; pub := first_day;
    end if;

    select id into pid from public.promotions where user_id = target and meta_campaign_id = c.campaign_id;
    if pid is null then
      insert into public.promotions(user_id, business_id, title, channel, starts_on, ends_on, published_on,
                                    status, kind, cost, notes, meta_campaign_id)
      values (target, c.business_id, c.title, 'Facebook + Instagram', first_day, last_day, pub,
              st, 'ads', round(c.spend, 2), 'Δημιουργήθηκε αυτόματα από την καμπάνια της Meta.', c.campaign_id)
      returning id into pid;
      insert into public.promotion_meta_links(user_id, promotion_id, level, meta_id)
      values (target, pid, 'campaign', c.campaign_id)
      on conflict do nothing;
      made := made + 1;
    else
      -- Keep it up to date (a promotion the user cancelled is left alone).
      update public.promotions p set
        starts_on = least(p.starts_on, first_day),
        ends_on = greatest(last_day, least(p.starts_on, first_day)),
        published_on = case when st = 'scheduled' then null else least(coalesce(p.published_on, pub), pub) end,
        status = st,
        cost = coalesce(round(c.spend, 2), p.cost),
        business_id = case
          when exists (select 1 from public.promotions q where q.previous_promotion_id = p.id) then p.business_id
          else c.business_id end
      where p.id = pid and p.status <> 'cancelled';
    end if;
  end loop;
  return made;
end;
$$;
revoke all on function public.meta_sync_promotions(uuid) from public, anon;
grant execute on function public.meta_sync_promotions(uuid) to authenticated, service_role;

-- Linking a Page to a client assigns its ads (see 202609300005) and now also creates the promotions.
create or replace function public.meta_pages_assign_ads()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.business_id is not null and new.business_id is distinct from old.business_id then
    update public.meta_ads set business_id = new.business_id, review_state = 'assigned'
      where user_id = new.user_id and page_id = new.page_id
        and (review_state = 'new' or (old.business_id is not null and business_id = old.business_id));
    perform public.meta_sync_promotions(new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.meta_pages_assign_ads() from public, anon, authenticated;

commit;
