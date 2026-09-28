-- Promo Desk: apply once to a new Supabase project, through SQL Editor or migrations.
-- Records are private to their owner. Dates use Europe/Athens in the application.
begin;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  contact_name text not null default '' check (char_length(contact_name) <= 150),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 250),
  notes text not null default '' check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  unique(id, user_id)
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  channel text not null check (channel in ('Instagram','Facebook','Facebook + Instagram','TikTok','LinkedIn','Άλλο')),
  starts_on date not null,
  ends_on date not null,
  next_action_on date,
  published_on date,
  status text not null default 'scheduled' check (status in ('scheduled','published','completed','cancelled')),
  notes text not null default '' check (char_length(notes) <= 10000),
  previous_promotion_id uuid,
  created_at timestamptz not null default now(),
  unique(id, business_id, user_id),
  foreign key (business_id,user_id) references public.businesses(id,user_id) on delete restrict,
  foreign key (previous_promotion_id,business_id,user_id) references public.promotions(id,business_id,user_id) on delete restrict,
  check (ends_on >= starts_on),
  check (next_action_on is null or next_action_on >= starts_on),
  check (published_on is null or published_on <= ends_on),
  check (status not in ('published','completed') or published_on is not null),
  check (status <> 'scheduled' or published_on is null),
  check (previous_promotion_id is null or previous_promotion_id <> id)
);

create index businesses_owner_idx on public.businesses(user_id);
create index promotions_owner_idx on public.promotions(user_id);
create index promotions_business_idx on public.promotions(business_id,user_id);
create index promotions_next_action_idx on public.promotions(user_id,next_action_on);
create index promotions_expiry_idx on public.promotions(user_id,ends_on);
-- A cancelled replacement can be replaced again. All historical rows remain.
create unique index one_live_replacement on public.promotions(previous_promotion_id)
  where previous_promotion_id is not null and status <> 'cancelled';

create function public.promo_desk_guard_promotion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.published_on > (now() at time zone 'Europe/Athens')::date then
    raise exception 'Publication date cannot be in the future' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
       or new.previous_promotion_id is distinct from old.previous_promotion_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Promotion identity and history links are immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_promotion before insert or update on public.promotions
  for each row execute function public.promo_desk_guard_promotion();
revoke all on function public.promo_desk_guard_promotion() from public,anon,authenticated;

alter table public.businesses enable row level security;
alter table public.promotions enable row level security;
revoke all on public.businesses,public.promotions from anon,authenticated;
grant select,insert,update on public.businesses,public.promotions to authenticated;

create policy businesses_select_owner on public.businesses for select to authenticated using ((select auth.uid()) = user_id);
create policy businesses_insert_owner on public.businesses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy businesses_update_owner on public.businesses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy promotions_select_owner on public.promotions for select to authenticated using ((select auth.uid()) = user_id);
create policy promotions_insert_owner on public.promotions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy promotions_update_owner on public.promotions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- No DELETE grants or policies: cancelling a promotion retains its history.
commit;
