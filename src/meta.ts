import { supabase } from "./data";
import type { MetaAccount, MetaAd, MetaLink, MetaResult, MetaRun, MetaDaily, MetaData, MetaNumbers, MetaPage, PageMonth } from "./metaCore";

export const emptyMeta: MetaData = { accounts: [], ads: [], links: [], results: [], runs: [], pages: [] };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function normalizeNumbers<T extends MetaNumbers>(r: T): T {
  return {
    ...r,
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    link_clicks: num(r.link_clicks),
  };
}

export async function loadMeta(userId: string): Promise<MetaData> {
  if (!supabase) throw new Error("Not configured");
  const [account, ads, links, results, runs] = await Promise.all([
    supabase.from("meta_accounts").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("meta_ads").select("*").eq("user_id", userId).order("created_time", { ascending: false }).limit(5000),
    supabase.from("promotion_meta_links").select("id,promotion_id,level,meta_id").eq("user_id", userId),
    supabase.from("meta_promotion_results").select("*").eq("user_id", userId),
    supabase.from("meta_sync_runs").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(10),
  ]);
  for (const r of [account, ads, links, results, runs]) if (r.error) throw r.error;
  // Pages are optional: if that table is not there yet, the rest still works.
  let pages: { data: unknown[] | null; error: unknown } = await supabase
    .from("meta_pages")
    .select("page_id,name,custom_name,business_id,insights_status,insights_error,insights_checked_at,instagram_username,followers,instagram_followers")
    .eq("user_id", userId);
  if (pages.error)
    pages = await supabase.from("meta_pages").select("page_id,name,custom_name,business_id").eq("user_id", userId);
  if (pages.error) pages = await supabase.from("meta_pages").select("page_id,name,business_id").eq("user_id", userId);
  // Page statistics are optional too.
  const stats = await supabase
    .from("page_insights_monthly")
    .select("page_id,platform,month,views,reach,engagements,new_followers,followers,fetched_at")
    .eq("user_id", userId)
    .order("month");
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    pages: pages.error ? [] : ((pages.data || []) as MetaPage[]),
    pageStats: stats.error
      ? []
      : ((stats.data || []) as PageMonth[]).map((r) => ({
          ...r,
          views: n(r.views),
          reach: n(r.reach),
          engagements: n(r.engagements),
          new_followers: n(r.new_followers),
          followers: n(r.followers),
        })),
    accounts: (account.data || []) as MetaAccount[],
    ads: (ads.data || []) as MetaAd[],
    links: (links.data || []) as MetaLink[],
    results: ((results.data || []) as MetaResult[]).map(normalizeNumbers),
    runs: (runs.data || []) as MetaRun[],
  };
}
export async function loadDaily(userId: string, adIds: string[], since: string, until: string): Promise<MetaDaily[]> {
  if (!supabase || !adIds.length) return [];
  const { data, error } = await supabase
    .from("meta_insights_daily")
    .select("ad_id,date,currency,spend,impressions,reach,clicks,link_clicks,actions")
    .eq("user_id", userId)
    .in("ad_id", adIds)
    .gte("date", since)
    .lte("date", until)
    .order("date");
  if (error) throw error;
  return ((data || []) as MetaDaily[]).map(normalizeNumbers);
}
export async function addAccount(userId: string, adAccountId: string) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase.from("meta_accounts").insert({ user_id: userId, ad_account_id: adAccountId });
  if (error) throw error;
}
export async function removeAccount(userId: string, adAccountId: string) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase.from("meta_accounts").delete().eq("user_id", userId).eq("ad_account_id", adAccountId);
  if (error) throw error;
}
/** Create / refresh the promotions of the assigned campaigns (database function). */
export async function syncPromotions() {
  if (!supabase) return;
  const { error } = await supabase.rpc("meta_sync_promotions");
  // Older database without the function: assignment still works, promotions come with the next update.
  if (error && error.code !== "PGRST202" && error.code !== "42883") throw error;
}
export async function reviewAds(userId: string, adIds: string[], businessId: string | null) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase
    .from("meta_ads")
    .update({ business_id: businessId, review_state: businessId ? "assigned" : "ignored" })
    .eq("user_id", userId)
    .in("ad_id", adIds);
  if (error) throw error;
  if (businessId) await syncPromotions();
}
export async function addLink(userId: string, promotionId: string, level: "campaign" | "ad", metaId: string): Promise<MetaLink> {
  if (!supabase) throw new Error("Not configured");
  const { data, error } = await supabase
    .from("promotion_meta_links")
    .insert({ user_id: userId, promotion_id: promotionId, level, meta_id: metaId })
    .select("id,promotion_id,level,meta_id")
    .single();
  if (error) throw error;
  return data as MetaLink;
}
export async function removeLink(userId: string, id: string) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase.from("promotion_meta_links").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
export interface StatusReply {
  configured: boolean;
  reconnect?: boolean;
  error?: string;
  version?: string;
  accounts: { id: string; name: string; currency: string; timezone_name: string; account_status: number }[];
}
export async function metaStatus(): Promise<StatusReply> {
  if (!supabase) throw new Error("Not configured");
  const { data, error } = await supabase.functions.invoke("meta-sync", { body: { action: "status" } });
  if (error) throw error;
  return data as StatusReply;
}
export async function metaSync(): Promise<{ status: string; message?: string }> {
  if (!supabase) throw new Error("Not configured");
  const { data, error } = await supabase.functions.invoke("meta-sync", { body: { action: "sync" } });
  if (error) throw error;
  return data;
}

export async function mapPage(userId: string, pageId: string, businessId: string | null) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase
    .from("meta_pages")
    .update({ business_id: businessId })
    .eq("user_id", userId)
    .eq("page_id", pageId);
  if (error) throw error;
}
/** The user's own name for a Page (empty = use Meta's name / the id). */
export async function renamePage(userId: string, pageId: string, name: string) {
  if (!supabase) throw new Error("Not configured");
  const clean = name.trim().slice(0, 120);
  const { error } = await supabase
    .from("meta_pages")
    .update({ custom_name: clean || null })
    .eq("user_id", userId)
    .eq("page_id", pageId);
  if (error) throw error;
}
export * from "./metaCore";
/** Assign ads to a client (or send them back to "new" when businessId is null). */
export async function assignAds(userId: string, adIds: string[], businessId: string | null) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase
    .from("meta_ads")
    .update({ business_id: businessId, review_state: businessId ? "assigned" : "new" })
    .eq("user_id", userId)
    .in("ad_id", adIds);
  if (error) throw error;
  if (businessId) await syncPromotions();
}
