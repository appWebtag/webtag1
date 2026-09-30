// Offline test of the sync logic: fake Meta API + in-memory database.
// Run: deno test -A supabase/functions/meta-sync/sync_test.ts
Deno.env.set("META_SYNC_TEST", "1");
Deno.env.set("META_ACCESS_TOKEN", "test-token");
Deno.env.set("META_APP_SECRET", "test-secret");
const { syncUser } = await import("./index.ts");

type Row = Record<string, any>;
const keys: Record<string, string[]> = {
  meta_ads: ["user_id", "ad_id"],
  meta_insights_daily: ["user_id", "ad_id", "date"],
  meta_pages: ["user_id", "page_id"],
  meta_promotion_results: ["promotion_id"],
  page_insights_monthly: ["user_id", "page_id", "platform", "month"],
};
function fakeDb(tables: Record<string, Row[]>) {
  let nextId = 1;
  const from = (table: string) => {
    tables[table] ||= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
    let payload: any;
    let head = false, countMode = false, single = false, maybe = false, ignoreDup = false;
    const q: any = {
      select(_c?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) head = true;
        if (opts?.count) countMode = true;
        return q;
      },
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      not: (c: string, _op: string, _v: any) => (filters.push((r) => r[c] !== null && r[c] !== undefined), q),
      gt: (c: string, v: any) => (filters.push((r) => r[c] > v), q),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), q),
      order: () => q,
      limit: () => q,
      single: () => ((single = true), q),
      maybeSingle: () => ((maybe = true), q),
      insert: (v: any) => ((op = "insert"), (payload = v), q),
      update: (v: any) => ((op = "update"), (payload = v), q),
      upsert: (v: any, o?: { ignoreDuplicates?: boolean }) => ((op = "upsert"), (payload = v), (ignoreDup = !!o?.ignoreDuplicates), q),
      delete: () => ((op = "delete"), q),
      then(resolve: (x: any) => void) {
        const t = tables[table];
        let data: any = null;
        if (op === "insert") {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: nextId++, status: "running", ...r }));
          t.push(...rows);
          data = rows;
        } else if (op === "upsert") {
          for (const r of Array.isArray(payload) ? payload : [payload]) {
            const k = keys[table];
            const i = t.findIndex((x) => k.every((c) => x[c] === r[c]));
            if (i >= 0) { if (!ignoreDup) t[i] = { ...t[i], ...r }; }
            else t.push({ review_state: "new", business_id: null, ...r });
          }
        } else if (op === "update") {
          for (const r of t.filter((r) => filters.every((f) => f(r)))) Object.assign(r, payload);
        } else if (op === "delete") {
          tables[table] = t.filter((r) => !filters.every((f) => f(r)));
        } else data = t.filter((r) => filters.every((f) => f(r)));
        if (single || maybe) data = Array.isArray(data) ? data[0] ?? null : data;
        resolve({ data: head ? null : data, error: null, count: countMode ? (tables[table].filter((r) => filters.every((f) => f(r)))).length : null });
      },
    };
    return q;
  };
  const rpc = async (name: string, args: unknown) => {
    (tables.__rpc ||= []).push({ name, args } as Row);
    return { data: 0, error: null };
  };
  return { from, rpc } as any;
}

const calls: URL[] = [];
globalThis.fetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  calls.push(url);
  if (!url.searchParams.get("appsecret_proof")) throw new Error("missing appsecret_proof");
  const path = url.pathname.replace(/^\/v\d+\.\d+\//, "");
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (path === "act_1") return ok({ name: "WebTag Ads", currency: "EUR", timezone_name: "Europe/Athens", account_status: 1 });
  if (path === "act_1/ads") {
    if (!url.searchParams.get("after"))
      return ok({
        data: [{ id: "11", name: "A", campaign: { id: "c1", name: "Olive | Autumn", objective: "OUTCOME_ENGAGEMENT", start_time: "2026-09-15T10:00:00+0300", effective_status: "ACTIVE" }, adset: { id: "s1", name: "S" }, creative: { effective_object_story_id: "555_999" } }],
        paging: { next: `https://graph.facebook.com/v25.0/act_1/ads?after=x` },
      });
    return ok({ data: [
      { id: "12", name: "B", campaign: { id: "c1", name: "Olive | Autumn" }, adset: { id: "s1", name: "S" }, creative: { object_story_spec: { page_id: "555" } } },
      { id: "13", name: "C", campaign: { id: "c7", name: "Other page" }, creative: { effective_object_story_id: "777_1" } },
    ] });
  }
  if (path === "act_1/insights" && url.searchParams.get("level") === "ad") {
    const fields = url.searchParams.get("fields")!;
    if (fields.includes("reach")) return new Response(JSON.stringify({ error: { code: 100, message: "(#100) reach is not valid for fields param" } }), { status: 400 });
    return ok({
      data: [
        { ad_id: "11", date_start: "2026-09-20", spend: "5.50", impressions: "1000", clicks: "40", inline_link_clicks: "20", account_currency: "EUR", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" }] },
        { ad_id: "12", date_start: "2026-09-20", spend: "2.00", impressions: "300", clicks: "5", inline_link_clicks: "2", account_currency: "EUR" },
        { ad_id: "99", date_start: "2026-09-19", spend: "1.00", impressions: "10", clicks: "0", inline_link_clicks: "0", account_currency: "EUR" },
      ],
    });
  }
  if (path === "act_1/insights" && url.searchParams.get("level") === "account") {
    const filtering = JSON.parse(url.searchParams.get("filtering")!);
    if (filtering[0].field !== "ad.id") throw new Error("expected ad filter");
    if (filtering[0].value.sort().join() !== "11,12") throw new Error("wrong ads " + filtering[0].value);
    return ok({ data: [{ spend: "7.50", impressions: "1300", clicks: "45", inline_link_clicks: "22", account_currency: "EUR" }] });
  }
  if (path === "act_1/promote_pages") return ok({ data: [{ id: "777", name: "Kafe 777" }, { id: "888", name: "Not in ads" }] });
  if (path === "" && url.searchParams.get("fields") === "name") return ok({ "555": { id: "555", name: "Olive Page" } });
  if (path === "" && url.searchParams.get("ids") === "99") return ok({ "99": { id: "99", name: "Old ad", campaign: { id: "c0", name: "Old" } } });
  throw new Error("unexpected " + url);
}) as typeof fetch;

Deno.test("sync writes ads, daily rows, promotion totals without duplicates", async () => {
  const U = "u1";
  const tables: Record<string, Row[]> = {
    meta_accounts: [{ user_id: U, ad_account_id: "act_1", sync_status: "pending" }],
    meta_sync_runs: [],
    meta_ads: [{ user_id: U, ad_id: "11", business_id: "b1", review_state: "assigned", account_id: "act_1" }],
    meta_insights_daily: [],
    promotion_meta_links: [{ user_id: U, promotion_id: "p1", level: "campaign", meta_id: "c1" }],
    promotions: [
      { user_id: U, id: "p1", starts_on: "2026-09-15", ends_on: "2026-10-30", published_on: "2026-09-16", status: "published" },
      { user_id: U, id: "p2", starts_on: "2026-09-15", ends_on: "2026-10-30", published_on: null, status: "scheduled" },
    ],
    meta_promotion_results: [{ user_id: U, promotion_id: "p-old", fetched_at: "2026-01-01", until: "2026-01-01" }],
    meta_pages: [{ user_id: U, page_id: "777", name: null, custom_name: "Δικό μου όνομα", business_id: "b7" }],
  };
  const db = fakeDb(tables);
  const r1 = await syncUser(db, U, "manual");
  if (r1.status !== "ok") throw new Error(JSON.stringify(r1));
  // assignment kept, new ad is "new", archived ad fetched by id
  const ads = tables.meta_ads;
  if (ads.find((a) => a.ad_id === "11")!.review_state !== "assigned") throw new Error("assignment overwritten");
  if (ads.find((a) => a.ad_id === "12")!.review_state !== "new") throw new Error("new ad not new");
  if (ads.find((a) => a.ad_id === "12")!.page_id !== "555" || ads.find((a) => a.ad_id === "11")!.page_id !== "555") throw new Error("page not read");
  // ad of a Page mapped to a client is assigned to it; the mapping itself is kept
  const a13 = ads.find((a) => a.ad_id === "13")!;
  if (a13.review_state !== "assigned" || a13.business_id !== "b7") throw new Error("mapped page not applied " + JSON.stringify(a13));
  const pages = tables.meta_pages;
  if (pages.find((p) => p.page_id === "555")?.name !== "Olive Page" || pages.find((p) => p.page_id === "777")?.business_id !== "b7") throw new Error(JSON.stringify(pages));
  if (!ads.find((a) => a.ad_id === "99" && a.name === "Old ad")) throw new Error("archived ad not fetched");
  // campaigns become promotions (database function), called for this user after the ads are assigned
  if (!(tables.__rpc || []).some((c: any) => c.name === "meta_sync_promotions" && c.args.p_user === U)) throw new Error("promotions not refreshed");
  // Page names: from the Pages the account can promote, then by id; the user's own name is kept
  const p777 = pages.find((p) => p.page_id === "777")!;
  if (p777.name !== "Kafe 777" || p777.custom_name !== "Δικό μου όνομα") throw new Error("page names " + JSON.stringify(p777));
  if (pages.some((p) => p.page_id === "888")) throw new Error("page without ads added");
  // daily rows: reach dropped -> null (unknown), actions absent -> {}
  const d11 = tables.meta_insights_daily.find((x) => x.ad_id === "11")!;
  if (d11.reach !== null || d11.spend !== 5.5 || d11.actions["onsite_conversion.messaging_conversation_started_7d"] !== 3) throw new Error(JSON.stringify(d11));
  // totals from Meta's own aggregation; stale result for unlinked promotion removed
  const res = tables.meta_promotion_results;
  if (res.length !== 1 || res[0].promotion_id !== "p1" || res[0].spend !== 7.5 || res[0].since !== "2026-09-16") throw new Error(JSON.stringify(res));
  if (res[0].reach !== null) throw new Error("missing reach must stay null, not 0");
  // second sync: same number of rows (upsert, no duplicates)
  const before = tables.meta_insights_daily.length;
  const r2 = await syncUser(db, U, "daily");
  if (r2.status !== "ok" || tables.meta_insights_daily.length !== before) throw new Error("duplicates");
  if (tables.meta_accounts[0].sync_status !== "ok" || !tables.meta_accounts[0].last_success_at) throw new Error("status");
  if (tables.meta_sync_runs.filter((r) => r.status === "ok").length !== 2) throw new Error("runs");
  // token never leaves in logs/rows
  if (JSON.stringify(tables).includes("test-token")) throw new Error("token stored");
  if (ads.find((a) => a.ad_id === "11")!.campaign_start_time !== "2026-09-15T10:00:00+0300") throw new Error("campaign dates not stored");
});

Deno.test("invalid token marks reconnect", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: 190, message: "Error validating access token" } }), { status: 400 })) as typeof fetch;
  const tables: Record<string, Row[]> = { meta_accounts: [{ user_id: "u2", ad_account_id: "act_1" }], meta_sync_runs: [] };
  const r = await syncUser(fakeDb(tables), "u2", "daily");
  globalThis.fetch = saved;
  if (r.status !== "needs_reconnect" || tables.meta_accounts[0].sync_status !== "needs_reconnect") throw new Error(JSON.stringify(r));
});

Deno.test("several ad accounts: results are added, reach is not, a broken account does not stop the others", async () => {
  const base = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, "");
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (path.startsWith("act_3")) return new Response(JSON.stringify({ error: { code: 100, message: "Unsupported get request" } }), { status: 400 });
    if (path === "act_2") return ok({ name: "Second", currency: "EUR", timezone_name: "Europe/Athens" });
    if (path === "act_2/ads") return ok({ data: [{ id: "21", name: "X", campaign: { id: "c9", name: "Other client" } }] });
    if (path === "act_2/insights" && url.searchParams.get("level") === "ad")
      return ok({ data: [{ ad_id: "21", date_start: "2026-09-21", spend: "3", impressions: "100", clicks: "4", inline_link_clicks: "2", account_currency: "EUR" }] });
    if (path === "act_2/insights") return ok({ data: [{ spend: "3", impressions: "100", reach: "80", clicks: "4", inline_link_clicks: "2", account_currency: "EUR", actions: [{ action_type: "lead", value: "1" }] }] });
    return base(input);
  }) as typeof fetch;
  const U = "u3";
  const tables: Record<string, Row[]> = {
    meta_accounts: [
      { user_id: U, ad_account_id: "act_1", sync_status: "pending" },
      { user_id: U, ad_account_id: "act_2", sync_status: "pending" },
      { user_id: U, ad_account_id: "act_3", sync_status: "pending" },
    ],
    meta_sync_runs: [],
    meta_ads: [],
    meta_insights_daily: [],
    meta_pages: [],
    promotion_meta_links: [
      { user_id: U, promotion_id: "p1", level: "campaign", meta_id: "c1" },
      { user_id: U, promotion_id: "p1", level: "ad", meta_id: "21" },
    ],
    promotions: [{ user_id: U, id: "p1", starts_on: "2026-09-15", ends_on: "2026-10-30", published_on: "2026-09-16", status: "published" }],
    meta_promotion_results: [],
  };
  const r = await syncUser(fakeDb(tables), U, "manual");
  globalThis.fetch = base;
  const st = Object.fromEntries(tables.meta_accounts.map((a) => [a.ad_account_id, a.sync_status]));
  if (st.act_1 !== "ok" || st.act_2 !== "ok" || st.act_3 !== "error") throw new Error(JSON.stringify(st));
  if (r.status !== "error" || !String(r.message).includes("act_3")) throw new Error(JSON.stringify(r));
  const res = tables.meta_promotion_results[0];
  if (res.spend !== 10.5 || res.impressions !== 1400 || res.reach !== null || !res.unavailable.includes("reach")) throw new Error(JSON.stringify(res));
  if (res.actions.lead !== 1 || res.ad_count !== 3) throw new Error(JSON.stringify(res));
  if (tables.meta_ads.find((a) => a.ad_id === "21")?.account_id !== "act_2") throw new Error("account of ad");
});

Deno.test("a big account: Meta refuses large date ranges, the sync splits them and loads all 180 days", async () => {
  const base = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, "");
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (path === "act_4") return ok({ name: "Big", currency: "EUR", timezone_name: "Europe/Athens" });
    if (path === "act_4/ads") return ok({ data: [{ id: "41", name: "Big ad", campaign: { id: "c41", name: "Big" } }] });
    if (path === "act_4/insights") {
      const tr = JSON.parse(url.searchParams.get("time_range")!);
      const days = Math.round((Date.parse(tr.until) - Date.parse(tr.since)) / 86400000) + 1;
      asked.push(tr.since + ".." + tr.until);
      if (days > 7) return new Response(JSON.stringify({ error: { code: 1, message: "An unknown error occurred", is_transient: true } }), { status: 500 });
      const rows = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(tr.since + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + i);
        rows.push({ ad_id: "41", date_start: d.toISOString().slice(0, 10), spend: "1", impressions: "10", clicks: "1", inline_link_clicks: "1", account_currency: "EUR" });
      }
      return ok({ data: rows });
    }
    return base(input);
  }) as typeof fetch;
  const U = "u4";
  const tables: Record<string, Row[]> = {
    meta_accounts: [{ user_id: U, ad_account_id: "act_4", sync_status: "pending", last_success_at: null, history_from: null }],
    meta_sync_runs: [], meta_ads: [], meta_insights_daily: [], meta_pages: [],
    promotion_meta_links: [], promotions: [], meta_promotion_results: [],
  };
  const r = await syncUser(fakeDb(tables), U, "manual");
  globalThis.fetch = base;
  if (r.status !== "ok") throw new Error(JSON.stringify(r));
  const days = new Set(tables.meta_insights_daily.map((d) => d.date));
  if (days.size !== 181) throw new Error("expected 181 days (180 + today), got " + days.size);
  if (tables.meta_insights_daily.length !== 181) throw new Error("duplicates: " + tables.meta_insights_daily.length);
  const acc = tables.meta_accounts[0];
  if (acc.sync_status !== "ok" || !acc.history_from) throw new Error(JSON.stringify(acc));
  if (!asked.some((x) => x.length) || asked.length < 26) throw new Error("expected many small requests, got " + asked.length);
});

Deno.test("Page statistics: Facebook and Instagram per month, with the Page token; no access is shown on the Page", async () => {
  const base = globalThis.fetch;
  const tokens = new Set<string>();
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, "");
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const bad = (code: number, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status: 400 });
    if (!url.searchParams.get("appsecret_proof")) throw new Error("missing appsecret_proof");
    if (path === "act_9") return ok({ name: "Ads", currency: "EUR", timezone_name: "Europe/Athens" });
    if (path === "act_9/ads") return ok({ data: [] });
    if (path === "act_9/insights") return ok({ data: [] });
    if (path === "444") return bad(10, "(#10) Requires pages_read_engagement permission");
    if (path === "555")
      return ok({ id: "555", name: "Olive Page", access_token: "page-token", followers_count: 1200,
        instagram_business_account: { id: "1784", username: "olive", followers_count: 900 } });
    if (path === "555/insights") {
      tokens.add(url.searchParams.get("access_token")!);
      const metric = url.searchParams.get("metric")!;
      if (metric.includes("page_follows") && metric.includes(",")) return bad(100, "(#100) The value must be a valid insights metric");
      if (metric === "page_follows") return bad(100, "(#100) The value must be a valid insights metric");
      const day = (v: number) => [{ value: v, end_time: "x" }, { value: v, end_time: "y" }];
      return ok({ data: metric.split(",").map((m) => ({ name: m, period: "day", values: day(m === "page_media_view" ? 50 : m === "page_post_engagements" ? 7 : 2) })) });
    }
    if (path === "1784/insights") {
      tokens.add(url.searchParams.get("access_token")!);
      if (url.searchParams.get("metric_type") !== "total_value") throw new Error("expected total_value");
      const since = Number(url.searchParams.get("since")), until = Number(url.searchParams.get("until"));
      if (until - since > 30 * 86400) throw new Error("more than 30 days asked");
      const metric = url.searchParams.get("metric")!;
      if (metric === "follows_and_unfollows")
        return ok({ data: [{ name: metric, total_value: { breakdowns: [{ results: [{ dimension_values: ["FOLLOWER"], value: 12 }, { dimension_values: ["NON_FOLLOWER"], value: 3 }] }] } }] });
      return ok({ data: metric.split(",").map((m) => ({ name: m, total_value: { value: m === "views" ? 300 : m === "reach" ? 120 : 40 } })) });
    }
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  const U = "u9";
  const tables: Record<string, Row[]> = {
    meta_accounts: [{ user_id: U, ad_account_id: "act_9", sync_status: "pending", history_from: "2020-01-01" }],
    meta_sync_runs: [], meta_ads: [], meta_insights_daily: [], promotion_meta_links: [], promotions: [], meta_promotion_results: [],
    meta_pages: [
      { user_id: U, page_id: "555", name: null, business_id: "b1" },
      { user_id: U, page_id: "444", name: null, business_id: "b2" },
      { user_id: U, page_id: "333", name: null, business_id: null },
    ],
    page_insights_monthly: [],
  };
  const r = await syncUser(fakeDb(tables), U, "manual");
  globalThis.fetch = base;
  if (r.status !== "ok") throw new Error("page statistics must not fail the sync " + JSON.stringify(r));
  const p555 = tables.meta_pages.find((p) => p.page_id === "555")!;
  const p444 = tables.meta_pages.find((p) => p.page_id === "444")!;
  if (p555.name !== "Olive Page" || p555.insights_status !== "ok" || p555.instagram_username !== "olive" || p555.followers !== 1200) throw new Error(JSON.stringify(p555));
  if (p444.insights_status !== "no_access" || !String(p444.insights_error).includes("pages_read_engagement")) throw new Error(JSON.stringify(p444));
  const rows = tables.page_insights_monthly;
  if (rows.some((x) => x.page_id !== "555")) throw new Error("unmapped / no-access Page read");
  const fb = rows.filter((x) => x.platform === "facebook"), ig = rows.filter((x) => x.platform === "instagram");
  if (fb.length !== 6 || ig.length !== 6) throw new Error("6 months each " + fb.length + "/" + ig.length);
  const month = (list: Row[]) => list.sort((a, b) => b.month.localeCompare(a.month))[0];
  const f = month(fb), i = month(ig);
  if (f.views !== 100 || f.engagements !== 14 || f.new_followers !== 4 || f.followers !== 1200) throw new Error(JSON.stringify(f));
  if (i.views === null || i.reach !== 120 || i.new_followers !== 12 || i.followers !== 900) throw new Error(JSON.stringify(i));
  if ([...tokens].some((t) => t !== "page-token")) throw new Error("statistics must use the Page token");
  if (JSON.stringify(tables).includes("page-token")) throw new Error("Page token stored");
  // second sync: finished months are not asked again, no duplicate rows
  const before = rows.length;
  await syncUser(fakeDb(tables), U, "daily");
  if (tables.page_insights_monthly.length !== before) throw new Error("duplicates");
});
