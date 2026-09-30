// WebTag — meta-sync Edge Function (Supabase, Deno).
// Reads paid-ads results from the Meta Marketing API with a system-user token
// that lives only in the Edge Function secrets. Never publishes or changes ads.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   META_ACCESS_TOKEN   system user token with ads_read            (required)
//   META_APP_SECRET     app secret, enables appsecret_proof        (recommended)
//   META_API_VERSION    e.g. v25.0                                 (optional)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Calls:
//   POST {action:"status"}   → is the token set, which ad accounts it can read
//   POST {action:"sync"}     → sync the signed-in user's ad account
//   Daily: pg_cron posts {action:"sync",trigger:"daily"} with x-cron-secret.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const VERSION = Deno.env.get("META_API_VERSION")?.trim() || "v25.0";
const GRAPH = "https://graph.facebook.com/" + VERSION;
const TOKEN = Deno.env.get("META_ACCESS_TOKEN")?.trim() || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET")?.trim() || "";
const INITIAL_DAYS = 180; // first sync
const RECHECK_DAYS = 28; // later syncs re-read the last 28 days (late conversions)
const FINAL_AFTER_DAYS = 28; // a promotion's totals stop changing 28 days after it ends
const BASE_FIELDS = ["spend", "impressions", "reach", "clicks", "inline_link_clicks", "actions"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class MetaError extends Error {
  constructor(message: string, public code?: number, public subcode?: number, public reconnect = false) {
    super(message);
  }
}

let proofCache: string | null = null;
async function appsecretProof(): Promise<string | null> {
  if (!APP_SECRET) return null;
  if (proofCache) return proofCache;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(TOKEN));
  proofCache = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return proofCache;
}

async function metaGet(pathOrUrl: string, params: Record<string, string> = {}): Promise<any> {
  const url = pathOrUrl.startsWith("https://") ? new URL(pathOrUrl) : new URL(GRAPH + "/" + pathOrUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", TOKEN);
  const proof = await appsecretProof();
  if (proof) url.searchParams.set("appsecret_proof", proof);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (res.ok && !body.error) return body;
    const e = body.error || {};
    const code = Number(e.code), sub = Number(e.error_subcode);
    const reconnect = code === 190 || code === 102 || code === 200 || code === 10 || (code >= 200 && code < 300) || [458, 459, 460, 463, 464, 467].includes(sub);
    const throttled = [4, 17, 32, 613, 80000, 80004].includes(code);
    if (throttled && attempt < 2) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    throw new MetaError(String(e.message || "Meta HTTP " + res.status), code, sub, reconnect);
  }
}

async function metaAll(path: string, params: Record<string, string>): Promise<any[]> {
  const out: any[] = [];
  let page = await metaGet(path, { limit: "500", ...params });
  for (let i = 0; i < 200; i++) {
    out.push(...(page.data || []));
    const next = page.paging?.next;
    if (!next) break;
    page = await metaGet(next);
  }
  return out;
}

// Asks Meta for insights; if a metric is no longer offered, drop it and remember it as unavailable.
async function insights(path: string, params: Record<string, string>, extra: string[] = []) {
  let fields = [...BASE_FIELDS];
  const unavailable: string[] = [];
  for (;;) {
    try {
      const rows = await metaAll(path, { ...params, fields: [...extra, ...fields, "account_currency"].join(",") });
      return { rows, unavailable };
    } catch (e) {
      const bad = e instanceof MetaError && e.code === 100 ? fields.find((f) => e.message.includes(f)) : undefined;
      if (!bad) throw e;
      fields = fields.filter((f) => f !== bad);
      unavailable.push(bad);
    }
  }
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
const int = (v: unknown) => (v === undefined || v === null || v === "" ? null : Math.round(Number(v)));
function actionMap(list: any): Record<string, number> | null {
  if (!Array.isArray(list)) return null;
  const out: Record<string, number> = {};
  for (const a of list) if (a?.action_type) out[a.action_type] = Number(a.value) || 0;
  return out;
}
function metrics(row: any, unavailable: string[]) {
  const pick = <T>(field: string, value: T, missingAsZero: T) =>
    unavailable.includes(field) ? null : row ? value : missingAsZero;
  return {
    spend: pick("spend", num(row?.spend), 0),
    impressions: pick("impressions", int(row?.impressions), 0),
    reach: pick("reach", int(row?.reach), 0),
    clicks: pick("clicks", int(row?.clicks), 0),
    link_clicks: pick("inline_link_clicks", int(row?.inline_link_clicks), 0),
    actions: pick("actions", actionMap(row?.actions) ?? {}, {}),
  };
}

function dayIn(tz: string, offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const chunk = <T>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function adRow(userId: string, accountId: string, ad: any, now: string) {
  return {
    user_id: userId,
    ad_id: String(ad.id),
    account_id: accountId,
    name: ad.name || "",
    campaign_id: ad.campaign?.id ?? ad.campaign_id ?? null,
    campaign_name: ad.campaign?.name ?? null,
    objective: ad.campaign?.objective ?? null,
    adset_id: ad.adset?.id ?? ad.adset_id ?? null,
    adset_name: ad.adset?.name ?? null,
    effective_status: ad.effective_status ?? null,
    created_time: ad.created_time ?? null,
    page_id: pageOf(ad),
    last_seen_at: now,
  };
}
// The Facebook Page an ad promotes: from the creative, when Meta provides it.
function pageOf(ad: any): string | null {
  const c = ad.creative || {};
  const id = c.object_story_spec?.page_id || String(c.effective_object_story_id || "").split("_")[0] || c.actor_id;
  return id && /^[0-9]{1,30}$/.test(String(id)) ? String(id) : null;
}
const BASE_AD_FIELDS = "id,name,effective_status,created_time,campaign{id,name,objective},adset{id,name}";
const AD_FIELDS = BASE_AD_FIELDS + ",creative{effective_object_story_id,actor_id,object_story_spec{page_id}}";
// Ads list; if Meta refuses the creative fields, fall back to the basic list (no Page info).
async function listAds(act: string): Promise<any[]> {
  try {
    return await metaAll(act + "/ads", { fields: AD_FIELDS });
  } catch (e) {
    if (e instanceof MetaError && e.code === 100) return await metaAll(act + "/ads", { fields: BASE_AD_FIELDS });
    throw e;
  }
}

export async function syncUser(db: SupabaseClient, userId: string, trigger: "manual" | "daily") {
  const { data: account, error: accErr } = await db.from("meta_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (accErr) throw accErr;
  if (!account) return { status: "error", message: "Δεν έχει επιλεγεί διαφημιστικός λογαριασμός." };

  const recent = await db.from("meta_sync_runs").select("id")
    .eq("user_id", userId).eq("status", "running").gt("started_at", new Date(Date.now() - 5 * 60000).toISOString());
  if (recent.data?.length) return { status: "running", message: "Ο συγχρονισμός τρέχει ήδη." };

  const { data: run } = await db.from("meta_sync_runs").insert({ user_id: userId, trigger }).select("id").single();
  const startedAt = new Date().toISOString();
  await db.from("meta_accounts").update({ sync_status: "running", last_attempt_at: startedAt }).eq("user_id", userId);

  try {
    if (!TOKEN) throw new MetaError("Δεν έχει οριστεί το META_ACCESS_TOKEN στον server.", undefined, undefined, true);
    const act = account.ad_account_id as string;
    const info = await metaGet(act, { fields: "name,currency,timezone_name,account_status" });
    const tz = info.timezone_name || "Europe/Athens";
    await db.from("meta_accounts").update({
      name: info.name ?? null, currency: info.currency ?? null, timezone_name: tz, account_status: info.account_status ?? null,
    }).eq("user_id", userId);

    // 1) Ads (new ones appear as "new" for the user to assign — nothing is assigned automatically).
    const now = new Date().toISOString();
    const ads = await listAds(act);
    const rows = ads.map((a) => adRow(userId, act, a, now));
    for (const part of chunk(rows, 500)) {
      const { error } = await db.from("meta_ads").upsert(part, { onConflict: "user_id,ad_id" });
      if (error) throw error;
    }
    // Pages seen in the ads: remember them (new ones only), with their names when Meta gives them.
    const pageIds = [...new Set(rows.map((r) => r.page_id).filter((x): x is string => !!x))];
    if (pageIds.length) {
      const { error } = await db.from("meta_pages").upsert(
        pageIds.map((page_id) => ({ user_id: userId, page_id })),
        { onConflict: "user_id,page_id", ignoreDuplicates: true },
      );
      if (error) throw error;
      for (const ids of chunk(pageIds, 50)) {
        const names = await metaGet("", { ids: ids.join(","), fields: "name" }).catch(() => ({}));
        for (const [id, page] of Object.entries(names || {}))
          if ((page as any)?.name) await db.from("meta_pages").update({ name: (page as any).name }).eq("user_id", userId).eq("page_id", id);
      }
    }
    // Ads of a Page the user linked to a client go to that client (only ads still waiting for review).
    const { data: mapped } = await db.from("meta_pages").select("page_id,business_id").eq("user_id", userId).not("business_id", "is", null);
    for (const m of mapped || [])
      await db.from("meta_ads").update({ business_id: m.business_id, review_state: "assigned" })
        .eq("user_id", userId).eq("page_id", m.page_id).eq("review_state", "new");

    // 2) Daily results per ad (re-read window so late conversions are captured; upsert = no duplicates).
    const today = dayIn(tz);
    const { count } = await db.from("meta_insights_daily").select("ad_id", { count: "exact", head: true }).eq("user_id", userId);
    const since = addDays(today, -((count ?? 0) > 0 ? RECHECK_DAYS : INITIAL_DAYS));
    const daily = await insights(act + "/insights", {
      level: "ad", time_increment: "1", use_unified_attribution_setting: "true",
      time_range: JSON.stringify({ since, until: today }),
    }, ["ad_id", "date_start"]);
    const dailyRows = daily.rows.filter((r) => r.ad_id && r.date_start).map((r) => ({
      user_id: userId, ad_id: String(r.ad_id), date: r.date_start,
      currency: r.account_currency || info.currency || "EUR",
      ...metrics(r, daily.unavailable), fetched_at: now,
    }));
    for (const part of chunk(dailyRows, 500)) {
      const { error } = await db.from("meta_insights_daily").upsert(part, { onConflict: "user_id,ad_id,date" });
      if (error) throw error;
    }
    // Ads that had results but are not in the ads list (archived/deleted) — fetch their names once.
    const known = new Set(rows.map((r) => r.ad_id));
    const { data: stored } = await db.from("meta_ads").select("ad_id").eq("user_id", userId);
    for (const s of stored || []) known.add(s.ad_id);
    const missing = [...new Set(dailyRows.map((r) => r.ad_id))].filter((id) => !known.has(id));
    for (const ids of chunk(missing, 50)) {
      const found = await metaGet("", { ids: ids.join(","), fields: AD_FIELDS }).catch(() => ({}));
      const extra = Object.values(found || {}).map((a: any) => adRow(userId, act, a, now));
      if (extra.length) await db.from("meta_ads").upsert(extra, { onConflict: "user_id,ad_id" });
    }

    // 3) Totals per linked promotion, over the promotion's own dates, de-duplicated by Meta.
    const [{ data: links }, { data: promos }, { data: results }, { data: allAds }] = await Promise.all([
      db.from("promotion_meta_links").select("promotion_id,level,meta_id").eq("user_id", userId),
      db.from("promotions").select("id,starts_on,ends_on,published_on,status").eq("user_id", userId),
      db.from("meta_promotion_results").select("promotion_id,fetched_at,until").eq("user_id", userId),
      db.from("meta_ads").select("ad_id,campaign_id").eq("user_id", userId),
    ]);
    const byPromotion = new Map<string, { level: string; meta_id: string }[]>();
    for (const l of links || []) byPromotion.set(l.promotion_id, [...(byPromotion.get(l.promotion_id) || []), l]);
    const unlinked = (results || []).filter((r) => !byPromotion.has(r.promotion_id)).map((r) => r.promotion_id);
    if (unlinked.length) await db.from("meta_promotion_results").delete().eq("user_id", userId).in("promotion_id", unlinked);

    let promotionsUpdated = 0;
    for (const p of promos || []) {
      const own = byPromotion.get(p.id);
      if (!own || p.status === "cancelled") continue;
      const start = p.published_on || p.starts_on;
      if (start > today) continue;
      const until = p.ends_on < today ? p.ends_on : today;
      const previous = (results || []).find((r) => r.promotion_id === p.id);
      const settled = addDays(p.ends_on, FINAL_AFTER_DAYS) < today;
      if (settled && previous && previous.until === until && previous.fetched_at.slice(0, 10) > addDays(p.ends_on, FINAL_AFTER_DAYS)) continue;
      const adIds = new Set<string>();
      for (const l of own) {
        if (l.level === "ad") adIds.add(l.meta_id);
        else for (const a of allAds || []) if (a.campaign_id === l.meta_id) adIds.add(a.ad_id);
      }
      const campaignOnly = own.filter((l) => l.level === "campaign" && !(allAds || []).some((a) => a.campaign_id === l.meta_id));
      const filtering = adIds.size
        ? [{ field: "ad.id", operator: "IN", value: [...adIds] }]
        : campaignOnly.length
          ? [{ field: "campaign.id", operator: "IN", value: campaignOnly.map((l) => l.meta_id) }]
          : null;
      if (!filtering) continue;
      const total = await insights(act + "/insights", {
        level: "account", use_unified_attribution_setting: "true",
        time_range: JSON.stringify({ since: start, until }), filtering: JSON.stringify(filtering),
      });
      const row = total.rows[0];
      const { error } = await db.from("meta_promotion_results").upsert({
        promotion_id: p.id, user_id: userId, since: start, until,
        currency: row?.account_currency || info.currency || null,
        ...metrics(row, total.unavailable), unavailable: total.unavailable,
        ad_count: adIds.size, fetched_at: now,
      }, { onConflict: "promotion_id" });
      if (error) throw error;
      promotionsUpdated++;
    }

    const done = new Date().toISOString();
    await db.from("meta_accounts").update({ sync_status: "ok", last_success_at: done, last_error: null }).eq("user_id", userId);
    await db.from("meta_sync_runs").update({
      status: "ok", finished_at: done, ads_seen: rows.length, days_saved: dailyRows.length, promotions_updated: promotionsUpdated,
    }).eq("id", run?.id);
    return { status: "ok", ads: rows.length, days: dailyRows.length, promotions: promotionsUpdated };
  } catch (e) {
    const reconnect = e instanceof MetaError && e.reconnect;
    const message = e instanceof Error ? e.message.slice(0, 500) : "Άγνωστο σφάλμα";
    const status = reconnect ? "needs_reconnect" : "error";
    await db.from("meta_accounts").update({ sync_status: status, last_error: message }).eq("user_id", userId);
    await db.from("meta_sync_runs").update({ status, finished_at: new Date().toISOString(), message }).eq("id", run?.id);
    return { status, message };
  }
}

function secretKeyFromList(): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || Object.values(keys)[0] as string | undefined;
  } catch {
    return undefined;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKeyFromList();
  if (!serviceKey) return json({ error: "server key missing" }, 500);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await req.json().catch(() => ({}));
  const action = body?.action === "status" ? "status" : "sync";

  // Daily scheduled call.
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: ok } = await db.rpc("meta_cron_secret_ok", { candidate: cronSecret });
    if (ok !== true) return json({ error: "forbidden" }, 403);
    const { data: accounts } = await db.from("meta_accounts").select("user_id");
    const out = [];
    for (const a of accounts || []) out.push(await syncUser(db, a.user_id, "daily"));
    return json({ results: out });
  }

  // Signed-in user.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer +/i, "").trim();
  const { data: auth, error } = await db.auth.getUser(jwt);
  if (error || !auth?.user) return json({ error: "unauthorized" }, 401);

  if (action === "status") {
    if (!TOKEN) return json({ configured: false, accounts: [] });
    try {
      const accounts = await metaAll("me/adaccounts", { fields: "id,name,currency,timezone_name,account_status" });
      return json({ configured: true, version: VERSION, accounts });
    } catch (e) {
      return json({ configured: true, reconnect: e instanceof MetaError && e.reconnect, error: (e as Error).message, accounts: [] });
    }
  }
  return json(await syncUser(db, auth.user.id, "manual"));
}

if (!Deno.env.get("META_SYNC_TEST")) Deno.serve(handler);
