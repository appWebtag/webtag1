-- WebTag: the user's own details and logo ("Ο λογαριασμός μου"), one row per user.
begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 250),
  company_name text not null default '' check (char_length(company_name) <= 250),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 250),
  website text not null default '' check (char_length(website) <= 250),
  address text not null default '' check (char_length(address) <= 300),
  vat_number text not null default '' check (char_length(vat_number) <= 30),
  logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/profile-[0-9]{1,20}\.png$'),
  updated_at timestamptz not null default now(),
  check (logo_path is null or split_part(logo_path, '/', 1) = user_id::text)
);

revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
