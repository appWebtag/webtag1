import { supabase } from "./data";
import type { MetaAccount, MetaAd, MetaLink, MetaResult, MetaRun, MetaDaily, MetaData, MetaNumbers } from "./metaCore";

export const emptyMeta: MetaData = { account: null, ads: [], links: [], results: [], runs: [] };

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
    supabase.from("meta_accounts").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("meta_ads").select("*").eq("user_id", userId).order("created_time", { ascending: false }).limit(5000),
    supabase.from("promotion_meta_links").select("id,promotion_id,level,meta_id").eq("user_id", userId),
    supabase.from("meta_promotion_results").select("*").eq("user_id", userId),
    supabase.from("meta_sync_runs").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(10),
  ]);
  for (const r of [account, ads, links, results, runs]) if (r.error) throw r.error;
  return {
    account: account.data as MetaAccount | null,
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
export async function saveAccount(userId: string, adAccountId: string, exists: boolean) {
  if (!supabase) throw new Error("Not configured");
  const q = exists
    ? supabase.from("meta_accounts").update({ ad_account_id: adAccountId }).eq("user_id", userId)
    : supabase.from("meta_accounts").insert({ user_id: userId, ad_account_id: adAccountId });
  const { error } = await q;
  if (error) throw error;
}
export async function reviewAds(userId: string, adIds: string[], businessId: string | null) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase
    .from("meta_ads")
    .update({ business_id: businessId, review_state: businessId ? "assigned" : "ignored" })
    .eq("user_id", userId)
    .in("ad_id", adIds);
  if (error) throw error;
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

export * from "./metaCore";
