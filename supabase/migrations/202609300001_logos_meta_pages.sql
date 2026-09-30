-- WebTag: client logos (private Storage) and Meta Page per client.
-- Apply once, after the earlier migrations. Single transaction.
begin;

-- ---------- Client logos ----------
alter table public.businesses
  add column logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}-[0-9]{1,20}\.(png|jpg|webp)$');

-- Private bucket: files are served only through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-logos', 'business-logos', false, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Each user can only touch files inside the folder named after their own user id.
create policy business_logos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy business_logos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy business_logos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy business_logos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A logo path must live in the owner's folder.
alter table public.businesses add constraint businesses_logo_owner
  check (logo_path is null or split_part(logo_path, '/', 1) = user_id::text);

-- ---------- Meta Page per client ----------
-- The Facebook Page an ad promotes (from the ad creative). Written by the server.
alter table public.meta_ads add column page_id text check (page_id is null or page_id ~ '^[0-9]{1,30}$');
create index meta_ads_page_idx on public.meta_ads(user_id, page_id);

-- Pages seen in the ad account; the user decides which client each Page belongs to.
create table public.meta_pages (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null check (page_id ~ '^[0-9]{1,30}$'),
  name text,
  business_id uuid,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, page_id),
  foreign key (business_id, user_id) references public.businesses(id, user_id) on delete restrict
);
revoke all on public.meta_pages from anon, authenticated;
grant select on public.meta_pages to authenticated;
grant update (business_id) on public.meta_pages to authenticated;
alter table public.meta_pages enable row level security;
create policy meta_pages_select_owner on public.meta_pages for select to authenticated using ((select auth.uid()) = user_id);
create policy meta_pages_update_owner on public.meta_pages for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Linking a Page to a client also assigns that Page's ads that are still waiting for review.
-- Ads the user already assigned or ignored are left as they are.
create function public.meta_pages_assign_ads()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.business_id is not null and new.business_id is distinct from old.business_id then
    update public.meta_ads set business_id = new.business_id, review_state = 'assigned'
      where user_id = new.user_id and page_id = new.page_id and review_state = 'new';
  end if;
  return new;
end;
$$;
create trigger meta_pages_assign_ads after update of business_id on public.meta_pages
  for each row execute function public.meta_pages_assign_ads();
revoke all on function public.meta_pages_assign_ads() from public, anon, authenticated;

commit;
