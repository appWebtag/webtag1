-- WebTag: daily Meta sync at 06:15 Europe/Athens summer time (03:15 UTC).
-- Replace the project URL if you use a different Supabase project.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('webtag-meta-daily-sync')
where exists (select 1 from cron.job where jobname = 'webtag-meta-daily-sync');

select cron.schedule(
  'webtag-meta-daily-sync',
  '15 3 * * *',
  $job$
  select net.http_post(
    url := 'https://tmalinmtxuefysnuhfgb.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meta_cron_secret')
    ),
    body := '{"action":"sync","trigger":"daily"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
