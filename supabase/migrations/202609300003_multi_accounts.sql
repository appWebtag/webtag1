-- WebTag: several Meta ad accounts per user, each can be disconnected.
-- Disconnecting stops syncing that account; results already saved stay in the history.
begin;

alter table public.meta_accounts drop constraint meta_accounts_pkey;
alter table public.meta_accounts add primary key (user_id, ad_account_id);

-- The account id of a row is fixed: to change it, disconnect and add the other one.
drop trigger meta_accounts_touch on public.meta_accounts;
create or replace function public.meta_accounts_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.ad_account_id is distinct from old.ad_account_id then
    raise exception 'The ad account id cannot change' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger meta_accounts_touch before insert or update on public.meta_accounts
  for each row execute function public.meta_accounts_touch();
revoke all on function public.meta_accounts_touch() from public, anon, authenticated;

revoke update on public.meta_accounts from authenticated;
revoke update (ad_account_id) on public.meta_accounts from authenticated;
drop policy meta_accounts_update_owner on public.meta_accounts;
grant delete on public.meta_accounts to authenticated;
create policy meta_accounts_delete_owner on public.meta_accounts for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.meta_sync_runs add column accounts integer;

commit;
