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
  meta_promotion_results: ["promotion_id"],
};
function fakeDb(tables: Record<string, Row[]>) {
  let nextId = 1;
  const from = (table: string) => {
    tables[table] ||= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
    let payload: any;
    let head = false, countMode = false, single = false, maybe = false;
    const q: any = {
      select(_c?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) head = true;
        if (opts?.count) countMode = true;
        return q;
      },
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      gt: (c: string, v: any) => (filters.push((r) => r[c] > v), q),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), q),
      order: () => q,
      limit: () => q,
      single: () => ((single = true), q),
      maybeSingle: () => ((maybe = true), q),
      insert: (v: any) => ((op = "insert"), (payload = v), q),
      update: (v: any) => ((op = "update"), (payload = v), q),
      upsert: (v: any) => ((op = "upsert"), (payload = v), q),
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
            if (i >= 0) t[i] = { ...t[i], ...r };
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
  return { from } as any;
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
        data: [{ id: "11", name: "A", campaign: { id: "c1", name: "Olive | Autumn", objective: "OUTCOME_ENGAGEMENT" }, adset: { id: "s1", name: "S" } }],
        paging: { next: `https://graph.facebook.com/v25.0/act_1/ads?after=x` },
      });
    return ok({ data: [{ id: "12", name: "B", campaign: { id: "c1", name: "Olive | Autumn" }, adset: { id: "s1", name: "S" } }] });
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
  };
  const db = fakeDb(tables);
  const r1 = await syncUser(db, U, "manual");
  if (r1.status !== "ok") throw new Error(JSON.stringify(r1));
  // assignment kept, new ad is "new", archived ad fetched by id
  const ads = tables.meta_ads;
  if (ads.find((a) => a.ad_id === "11")!.review_state !== "assigned") throw new Error("assignment overwritten");
  if (ads.find((a) => a.ad_id === "12")!.review_state !== "new") throw new Error("new ad not new");
  if (!ads.find((a) => a.ad_id === "99" && a.name === "Old ad")) throw new Error("archived ad not fetched");
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
