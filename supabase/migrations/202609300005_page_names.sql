-- WebTag: Page names the user can set, and automatic assignment of a Page's ads.
begin;

-- (from 202609300004, repeated so this file is enough on its own)
alter table public.meta_accounts add column if not exists history_from date;

-- A name the user gives to a Page (used when Meta does not tell us the Page's name).
alter table public.meta_pages add column if not exists custom_name text
  check (custom_name is null or char_length(custom_name) between 1 and 120);
revoke update on public.meta_pages from authenticated;
grant update (business_id, custom_name) on public.meta_pages to authenticated;

-- Linking a Page to a client assigns that Page's ads that are waiting for review,
-- and moves the ads that were with the Page's previous client. Ignored ads stay ignored.
create or replace function public.meta_pages_assign_ads()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.business_id is not null and new.business_id is distinct from old.business_id then
    update public.meta_ads set business_id = new.business_id, review_state = 'assigned'
      where user_id = new.user_id and page_id = new.page_id
        and (review_state = 'new' or (old.business_id is not null and business_id = old.business_id));
  end if;
  return new;
end;
$$;
revoke all on function public.meta_pages_assign_ads() from public, anon, authenticated;

commit;
