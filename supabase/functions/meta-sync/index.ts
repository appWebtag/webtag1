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
const WINDOW_DAYS = 14; // daily results are asked for in pieces of at most 14 days
const TIME_BUDGET_MS = 105_000; // stay well inside the Edge Function time limit
let deadline = Date.now() + TIME_BUDGET_MS;
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
  get tooMuch() {
    return tooMuchData({ code: this.code, message: this.message });
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
    const throttled = [4, 17, 32, 613, 80000, 80004].includes(code) || (e.is_transient === true && !tooMuchData(e));
    if (throttled && attempt < 2) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    throw new MetaError(String(e.message || "Meta HTTP " + res.status), code, sub, reconnect);
  }
}

// Meta's answer when one request asks for too much at once.
function tooMuchData(e: any): boolean {
  const code = Number(e?.code);
  const msg = String(e?.message || "").toLowerCase();
  return code === 1 || code === 2 || msg.includes("reduce the amount of data") || msg.includes("unknown error");
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
    campaign_start_time: ad.campaign?.start_time ?? null,
    campaign_stop_time: ad.campaign?.stop_time ?? null,
    campaign_status: ad.campaign?.effective_status ?? null,
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
const BASE_AD_FIELDS = "id,name,effective_status,created_time,campaign{id,name,objective,start_time,stop_time,effective_status},adset{id,name}";
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

// Names of the Pages: first the Pages this ad account can promote (works with ads_read),
// then a direct lookup for any still missing. Names are optional: failures are ignored.
async function pageNames(act: string, pageIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = new Set(pageIds);
  try {
    for (const p of await metaAll(act + "/promote_pages", { fields: "id,name" }))
      if (p?.id && p?.name && wanted.has(String(p.id))) out.set(String(p.id), String(p.name));
  } catch (_e) { /* not available for this token */ }
  for (const ids of chunk(pageIds.filter((id) => !out.has(id)), 50)) {
    const names = await metaGet("", { ids: ids.join(","), fields: "name" }).catch(() => null);
    if (names) {
      for (const [id, page] of Object.entries(names))
        if ((page as any)?.name) out.set(id, String((page as any).name));
    } else {
      // One inaccessible Page makes the whole batch fail: ask the first ones one by one.
      for (const id of ids.slice(0, 10)) {
        const page = await metaGet(id, { fields: "name" }).catch(() => null);
        if (page?.name) out.set(id, String(page.name));
      }
    }
  }
  return out;
}

// One ad account: account info, ads, Pages, daily results. Returns counts.
async function syncAccount(db: SupabaseClient, userId: string, account: any, now: string) {
  const act = account.ad_account_id as string;
  const info = await metaGet(act, { fields: "name,currency,timezone_name,account_status" });
  const tz = info.timezone_name || "Europe/Athens";
  await db.from("meta_accounts").update({
    name: info.name ?? null, currency: info.currency ?? null, timezone_name: tz, account_status: info.account_status ?? null,
  }).eq("user_id", userId).eq("ad_account_id", act);

  // 1) Ads (new ones appear as "new"; ads of a Page linked to a client are assigned after the sync).
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
    const found = await pageNames(act, pageIds);
    for (const [id, name] of found) await db.from("meta_pages").update({ name }).eq("user_id", userId).eq("page_id", id);
  }

  // 2) Daily results per ad, in pieces: the last 28 days again every time (late conversions),
  // then older history backwards until 180 days are loaded — continuing in the next sync if needed.
  const today = dayIn(tz);
  const target = addDays(today, -INITIAL_DAYS);
  const recentFrom = addDays(today, -RECHECK_DAYS);
  const currency = info.currency || "EUR";
  const dailyRows: { ad_id: string }[] = [];
  dailyRows.push(...(await loadDaily(db, userId, act, recentFrom, today, currency, now)));
  let historyFrom: string = account.history_from || (account.last_success_at ? target : recentFrom);
  let complete = historyFrom <= target;
  while (!complete && Date.now() < deadline) {
    const from = addDays(historyFrom, -WINDOW_DAYS) < target ? target : addDays(historyFrom, -WINDOW_DAYS);
    dailyRows.push(...(await loadDaily(db, userId, act, from, addDays(historyFrom, -1), currency, now)));
    historyFrom = from;
    complete = historyFrom <= target;
  }
  await db.from("meta_accounts").update({ history_from: historyFrom }).eq("user_id", userId).eq("ad_account_id", act);
  // Ads that had results but are not in the ads list (archived/deleted) — fetch their names once.
  const known = new Set(rows.map((r) => r.ad_id));
  const { data: stored } = await db.from("meta_ads").select("ad_id").eq("user_id", userId);
  for (const x of stored || []) known.add(x.ad_id);
  const missing = [...new Set(dailyRows.map((r) => r.ad_id))].filter((id) => !known.has(id));
  for (const ids of chunk(missing, 50)) {
    const found = await metaGet("", { ids: ids.join(","), fields: AD_FIELDS }).catch(() => ({}));
    const extra = Object.values(found || {}).map((a: any) => adRow(userId, act, a, now));
    if (extra.length) await db.from("meta_ads").upsert(extra, { onConflict: "user_id,ad_id" });
  }
  return { ads: rows.length, days: dailyRows.length, today, currency: info.currency ?? null, complete, historyFrom };
}

// Daily results of one account for [since, until], asked in windows of up to 14 days,
// newest first; a window Meta finds too big is split in half (down to one day).
async function loadDaily(db: SupabaseClient, userId: string, act: string, since: string, until: string, currency: string, now: string) {
  const saved: { ad_id: string }[] = [];
  const windows: [string, string][] = [];
  for (let end = until; end >= since; end = addDays(end, -WINDOW_DAYS)) {
    const start = addDays(end, -(WINDOW_DAYS - 1));
    windows.push([start < since ? since : start, end]);
  }
  while (windows.length) {
    const [from, to] = windows.shift()!;
    let daily;
    try {
      daily = await insights(act + "/insights", {
        level: "ad", time_increment: "1", use_unified_attribution_setting: "true",
        time_range: JSON.stringify({ since: from, until: to }),
      }, ["ad_id", "date_start"]);
    } catch (e) {
      if (e instanceof MetaError && e.tooMuch && from < to) {
        const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
        const mid = addDays(from, Math.floor(days / 2));
        windows.unshift([addDays(mid, 1), to], [from, mid]);
        continue;
      }
      throw e;
    }
    const rows = daily.rows.filter((r) => r.ad_id && r.date_start).map((r) => ({
      user_id: userId, ad_id: String(r.ad_id), date: r.date_start,
      currency: r.account_currency || currency,
      ...metrics(r, daily.unavailable), fetched_at: now,
    }));
    for (const part of chunk(rows, 500)) {
      const { error } = await db.from("meta_insights_daily").upsert(part, { onConflict: "user_id,ad_id,date" });
      if (error) throw error;
    }
    saved.push(...rows);
  }
  return saved;
}

function addActions(a: Record<string, number> | null, b: Record<string, number> | null) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return out;
}
const plus = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

// 3) Totals per linked promotion, over its own dates. Within one ad account Meta de-duplicates
// (correct reach); across several accounts the totals are added and reach is left empty.
async function promotionTotals(db: SupabaseClient, userId: string, connected: string[], today: string, now: string) {
  const [{ data: links }, { data: promos }, { data: results }, { data: allAds }] = await Promise.all([
    db.from("promotion_meta_links").select("promotion_id,level,meta_id").eq("user_id", userId),
    db.from("promotions").select("id,starts_on,ends_on,published_on,status").eq("user_id", userId),
    db.from("meta_promotion_results").select("promotion_id,fetched_at,until").eq("user_id", userId),
    db.from("meta_ads").select("ad_id,campaign_id,account_id").eq("user_id", userId),
  ]);
  const byPromotion = new Map<string, { level: string; meta_id: string }[]>();
  for (const l of links || []) byPromotion.set(l.promotion_id, [...(byPromotion.get(l.promotion_id) || []), l]);
  const unlinked = (results || []).filter((r) => !byPromotion.has(r.promotion_id)).map((r) => r.promotion_id);
  if (unlinked.length) await db.from("meta_promotion_results").delete().eq("user_id", userId).in("promotion_id", unlinked);

  let updated = 0;
  for (const p of promos || []) {
    const own = byPromotion.get(p.id);
    if (!own || p.status === "cancelled") continue;
    const start = p.published_on || p.starts_on;
    if (start > today) continue;
    const until = p.ends_on < today ? p.ends_on : today;
    const previous = (results || []).find((r) => r.promotion_id === p.id);
    const settled = addDays(p.ends_on, FINAL_AFTER_DAYS) < today;
    if (settled && previous && previous.until === until && previous.fetched_at.slice(0, 10) > addDays(p.ends_on, FINAL_AFTER_DAYS)) continue;
    // Ads of this promotion, grouped by the connected ad account they belong to.
    const byAccount = new Map<string, Set<string>>();
    let adCount = 0;
    for (const l of own) {
      const hits = l.level === "ad"
        ? (allAds || []).filter((a) => a.ad_id === l.meta_id)
        : (allAds || []).filter((a) => a.campaign_id === l.meta_id);
      for (const a of hits) {
        if (!connected.includes(a.account_id)) continue;
        const set = byAccount.get(a.account_id) || new Set<string>();
        set.add(a.ad_id);
        byAccount.set(a.account_id, set);
      }
    }
    const requests: { act: string; filtering: unknown[] }[] = [];
    for (const [act, ids] of byAccount) {
      requests.push({ act, filtering: [{ field: "ad.id", operator: "IN", value: [...ids] }] });
      adCount += ids.size;
    }
    const campaignOnly = own.filter((l) => l.level === "campaign" && !(allAds || []).some((a) => a.campaign_id === l.meta_id));
    if (campaignOnly.length)
      for (const act of connected)
        requests.push({ act, filtering: [{ field: "campaign.id", operator: "IN", value: campaignOnly.map((l) => l.meta_id) }] });
    if (!requests.length) continue;

    let total: any = null;
    let currency: string | null = null;
    const unavailable = new Set<string>();
    let delivered = 0;
    for (const r of requests) {
      const res = await insights(r.act + "/insights", {
        level: "account", use_unified_attribution_setting: "true",
        time_range: JSON.stringify({ since: start, until }), filtering: JSON.stringify(r.filtering),
      });
      res.unavailable.forEach((f) => unavailable.add(f));
      const row = res.rows[0];
      if (row) delivered++;
      const m = metrics(row, res.unavailable);
      currency = currency || row?.account_currency || null;
      total = total
        ? {
            spend: plus(total.spend, m.spend), impressions: plus(total.impressions, m.impressions), reach: null,
            clicks: plus(total.clicks, m.clicks), link_clicks: plus(total.link_clicks, m.link_clicks),
            actions: addActions(total.actions, m.actions),
          }
        : m;
    }
    // Reach cannot be added across accounts (the same person would be counted twice).
    if (delivered > 1) {
      total.reach = null;
      unavailable.add("reach");
    }
    const { error } = await db.from("meta_promotion_results").upsert({
      promotion_id: p.id, user_id: userId, since: start, until, currency,
      ...total, unavailable: [...unavailable], ad_count: adCount, fetched_at: now,
    }, { onConflict: "promotion_id" });
    if (error) throw error;
    updated++;
  }
  return updated;
}

export async function syncUser(db: SupabaseClient, userId: string, trigger: "manual" | "daily") {
  const { data: accounts, error: accErr } = await db.from("meta_accounts").select("*").eq("user_id", userId);
  if (accErr) throw accErr;
  if (!accounts?.length) return { status: "error", message: "Δεν έχει προστεθεί διαφημιστικός λογαριασμός." };

  const recent = await db.from("meta_sync_runs").select("id")
    .eq("user_id", userId).eq("status", "running").gt("started_at", new Date(Date.now() - 5 * 60000).toISOString());
  if (recent.data?.length) return { status: "running", message: "Ο συγχρονισμός τρέχει ήδη." };

  const { data: run } = await db.from("meta_sync_runs").insert({ user_id: userId, trigger, accounts: accounts.length }).select("id").single();
  const now = new Date().toISOString();
  await db.from("meta_accounts").update({ sync_status: "running", last_attempt_at: now }).eq("user_id", userId);

  deadline = Date.now() + TIME_BUDGET_MS;
  let ads = 0, days = 0, promotions = 0;
  const problems: string[] = [];
  const notes: string[] = [];
  let reconnect = false;
  let today = dayIn("Europe/Athens");
  const okAccounts: string[] = [];
  // Each account on its own: one failing account does not stop the others.
  for (const account of accounts) {
    try {
      if (!TOKEN) throw new MetaError("Δεν έχει οριστεί το META_ACCESS_TOKEN στον server.", undefined, undefined, true);
      const r = await syncAccount(db, userId, account, now);
      ads += r.ads;
      days += r.days;
      today = r.today;
      if (!r.complete) notes.push(account.ad_account_id + ": ιστορικό έως " + r.historyFrom + ", συνεχίζει στον επόμενο συγχρονισμό");
      okAccounts.push(account.ad_account_id);
      await db.from("meta_accounts").update({ sync_status: "ok", last_success_at: new Date().toISOString(), last_error: null })
        .eq("user_id", userId).eq("ad_account_id", account.ad_account_id);
    } catch (e) {
      const again = e instanceof MetaError && e.reconnect;
      reconnect = reconnect || again;
      const message = e instanceof Error ? e.message.slice(0, 400) : "Άγνωστο σφάλμα";
      problems.push(account.ad_account_id + ": " + message);
      await db.from("meta_accounts").update({ sync_status: again ? "needs_reconnect" : "error", last_error: message })
        .eq("user_id", userId).eq("ad_account_id", account.ad_account_id);
    }
  }
  try {
    // Ads of a Page the user linked to a client go to that client (only ads still waiting for review).
    const { data: mapped } = await db.from("meta_pages").select("page_id,business_id").eq("user_id", userId).not("business_id", "is", null);
    for (const m of mapped || [])
      await db.from("meta_ads").update({ business_id: m.business_id, review_state: "assigned" })
        .eq("user_id", userId).eq("page_id", m.page_id).eq("review_state", "new");
    // Every assigned campaign becomes (or updates) a promotion — Promotions page and calendar.
    const made = await db.rpc("meta_sync_promotions", { p_user: userId });
    if (made.error) notes.push("Αυτόματες προωθήσεις: " + made.error.message);
    else if (made.data) notes.push("Νέες προωθήσεις από καμπάνιες: " + made.data);
    if (okAccounts.length) promotions = await promotionTotals(db, userId, okAccounts, today, now);
  } catch (e) {
    problems.push(e instanceof Error ? e.message.slice(0, 400) : "Άγνωστο σφάλμα");
  }

  const status = problems.length ? (reconnect ? "needs_reconnect" : "error") : "ok";
  const message = problems.length || notes.length ? [...problems, ...notes].join(" | ").slice(0, 1000) : null;
  await db.from("meta_sync_runs").update({
    status, finished_at: new Date().toISOString(), ads_seen: ads, days_saved: days, promotions_updated: promotions, message,
  }).eq("id", run?.id);
  return status === "ok"
    ? { status, accounts: accounts.length, ads, days, promotions }
    : { status, message, accounts: accounts.length, synced: okAccounts.length };
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
    for (const uid of new Set((accounts || []).map((a) => a.user_id))) out.push(await syncUser(db, uid, "daily"));
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
