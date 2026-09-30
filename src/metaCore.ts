import { matches, type Business } from "./domain.ts";

export interface MetaAccount {
  user_id: string;
  ad_account_id: string;
  name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
  sync_status: "pending" | "running" | "ok" | "error" | "needs_reconnect";
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
}
export interface MetaAd {
  ad_id: string;
  account_id: string;
  name: string;
  campaign_id: string | null;
  campaign_name: string | null;
  objective: string | null;
  adset_id: string | null;
  adset_name: string | null;
  effective_status: string | null;
  created_time: string | null;
  first_seen_at: string;
  business_id: string | null;
  review_state: "new" | "assigned" | "ignored";
  page_id?: string | null;
}
export interface MetaPage {
  page_id: string;
  name: string | null;
  business_id: string | null;
}
export function pageName(p: MetaPage | undefined, id?: string | null): string {
  return p?.name || (id || p?.page_id ? `Σελίδα ${id || p?.page_id}` : "Άγνωστη σελίδα");
}
export interface MetaLink {
  id: string;
  promotion_id: string;
  level: "campaign" | "ad";
  meta_id: string;
}
export interface MetaNumbers {
  currency: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  link_clicks: number | null;
  actions: Record<string, number> | null;
}
export interface MetaResult extends MetaNumbers {
  promotion_id: string;
  since: string;
  until: string;
  unavailable: string[];
  ad_count: number;
  fetched_at: string;
}
export interface MetaDaily extends MetaNumbers {
  ad_id: string;
  date: string;
}
export interface MetaRun {
  id: number;
  trigger: "manual" | "daily";
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error" | "needs_reconnect";
  ads_seen: number | null;
  days_saved: number | null;
  promotions_updated: number | null;
  message: string | null;
}
export interface MetaData {
  pages: MetaPage[];
  account: MetaAccount | null;
  ads: MetaAd[];
  links: MetaLink[];
  results: MetaResult[];
  runs: MetaRun[];
}
// ---------- presentation helpers ----------
export function money(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: currency || "EUR", maximumFractionDigits: 2 }).format(value);
}
export function count(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("el-GR").format(value);
}
export function costPer(spend: number | null, n: number | null, currency: string | null): string {
  if (spend === null || n === null) return "—";
  if (n === 0) return "—";
  return money(spend / n, currency);
}
// Results that depend on the ad's goal. Shown only when Meta recorded them,
// or when the campaign goal is that result (then a real 0 is meaningful).
export const RESULT_TYPES = [
  {
    key: "messages",
    label: "Μηνύματα",
    types: ["onsite_conversion.messaging_conversation_started_7d"],
    objectives: ["MESSAGES", "OUTCOME_ENGAGEMENT"],
  },
  {
    key: "leads",
    label: "Αιτήματα ενδιαφέροντος",
    types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
    objectives: ["LEAD_GENERATION", "OUTCOME_LEADS"],
  },
  {
    key: "purchases",
    label: "Αγορές",
    types: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
    objectives: ["CONVERSIONS", "OUTCOME_SALES", "PRODUCT_CATALOG_SALES"],
  },
] as const;
export function resultValues(
  actions: Record<string, number> | null,
  objectives: (string | null)[],
): { key: string; label: string; value: number }[] {
  if (!actions) return [];
  return RESULT_TYPES.flatMap((r) => {
    const type = r.types.find((t) => t in actions);
    if (type) return [{ key: r.key, label: r.label, value: actions[type] }];
    if (objectives.some((o) => o && (r.objectives as readonly string[]).includes(o)))
      return [{ key: r.key, label: r.label, value: 0 }];
    return [];
  });
}
export const objectiveLabel: Record<string, string> = {
  OUTCOME_AWARENESS: "Αναγνωρισιμότητα",
  OUTCOME_TRAFFIC: "Επισκεψιμότητα",
  OUTCOME_ENGAGEMENT: "Αλληλεπίδραση",
  OUTCOME_LEADS: "Δυνητικοί πελάτες",
  OUTCOME_APP_PROMOTION: "Προώθηση εφαρμογής",
  OUTCOME_SALES: "Πωλήσεις",
  MESSAGES: "Μηνύματα",
  LINK_CLICKS: "Κλικ",
  REACH: "Απήχηση",
  POST_ENGAGEMENT: "Αλληλεπίδραση",
  LEAD_GENERATION: "Δυνητικοί πελάτες",
  CONVERSIONS: "Μετατροπές",
};
export function suggestBusiness(campaignName: string | null, adName: string, businesses: Business[]): Business | undefined {
  const text = `${campaignName || ""} ${adName}`;
  const hits = businesses.filter((b) => b.name.trim().length >= 3 && matches(text, b.name));
  return hits.length === 1 ? hits[0] : undefined; // only a single, unambiguous match is suggested
}
export function adsForLinks(links: MetaLink[], ads: MetaAd[]): string[] {
  const ids = new Set<string>();
  for (const l of links) {
    if (l.level === "ad") ids.add(l.meta_id);
    else for (const a of ads) if (a.campaign_id === l.meta_id) ids.add(a.ad_id);
  }
  return [...ids];
}
export function dateTimeLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("el-GR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
  }).format(new Date(iso));
}
