import { createClient } from "@supabase/supabase-js";
import type { Business, Category, CategoryLink, Data, Promotion } from "./domain";

export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
function validConfig(): boolean {
  if (
    !url ||
    !key ||
    key.includes("YOUR_") ||
    url.includes("YOUR_") ||
    key.startsWith("sb_secret_")
  )
    return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !(
        ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
        parsed.protocol === "http:"
      )
    )
      return false;
    if (
      key.startsWith("eyJ") &&
      JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
        .role !== "anon"
    )
      return false;
    return key.startsWith("sb_publishable_") || key.startsWith("eyJ");
  } catch {
    return false;
  }
}
export const supabase =
  !demoMode && validConfig()
    ? createClient(url!, key!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "23505" && /categor/i.test((error as { message?: string })?.message || ""))
    return "Υπάρχει ήδη κατηγορία με αυτό το όνομα.";
  if (code === "23505")
    return "Έχει ήδη καταχωριστεί νέα προώθηση για αυτή την ανανέωση. Ανανέωσε τη σελίδα.";
  if (code === "42501")
    return "Δεν υπάρχει δικαίωμα πρόσβασης σε αυτή την εγγραφή. Έλεγξε τη σύνδεσή σου.";
  if (code === "23503")
    return "Η επιχείρηση ή η προηγούμενη προώθηση δεν είναι πλέον διαθέσιμη. Ανανέωσε τη σελίδα.";
  if (code === "23514")
    return "Έλεγξε τις ημερομηνίες και την κατάσταση της προώθησης.";
  if (code === "PGRST205" || code === "42P01")
    return "Δεν έχουν ακόμη δημιουργηθεί οι πίνακες της εφαρμογής στη βάση δεδομένων.";
  return "Η ενέργεια δεν ολοκληρώθηκε. Έλεγξε τη σύνδεση στο διαδίκτυο και δοκίμασε ξανά. Τα στοιχεία της φόρμας παραμένουν εδώ.";
}
async function fetchAll(
  table: "businesses" | "promotions" | "promotion_categories" | "promotion_category_links",
  userId: string,
) {
  if (!supabase) throw new Error("Not configured");
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order(table === "promotion_category_links" ? "promotion_id" : "id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
export async function loadData(userId: string): Promise<Data> {
  const [businesses, promotions, categories, categoryLinks] = await Promise.all([
    fetchAll("businesses", userId),
    fetchAll("promotions", userId),
    fetchAll("promotion_categories", userId),
    fetchAll("promotion_category_links", userId),
  ]);
  return {
    businesses: businesses as Business[],
    promotions: (promotions as Promotion[]).map((p) => ({
      ...p,
      cost: p.cost === null || p.cost === undefined ? null : Number(p.cost),
    })),
    categories: categories as Category[],
    categoryLinks: (categoryLinks as (CategoryLink & { user_id: string })[]).map(
      ({ promotion_id, category_id }) => ({ promotion_id, category_id }),
    ),
  };
}
export async function saveBusiness(
  business: Business,
  exists: boolean,
): Promise<Business> {
  if (!supabase) throw new Error("Not configured");
  const query = exists
    ? supabase
        .from("businesses")
        .update(business)
        .eq("id", business.id)
        .eq("user_id", business.user_id)
    : supabase.from("businesses").insert(business);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Business;
}
export async function savePromotion(
  promotion: Promotion,
  exists: boolean,
): Promise<Promotion> {
  if (!supabase) throw new Error("Not configured");
  const query = exists
    ? supabase
        .from("promotions")
        .update(promotion)
        .eq("id", promotion.id)
        .eq("user_id", promotion.user_id)
    : supabase.from("promotions").insert(promotion);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Promotion;
}
export async function saveCategory(category: Category, exists: boolean): Promise<Category> {
  if (!supabase) throw new Error("Not configured");
  const query = exists
    ? supabase
        .from("promotion_categories")
        .update({ name: category.name })
        .eq("id", category.id)
        .eq("user_id", category.user_id)
    : supabase
        .from("promotion_categories")
        .insert({ id: category.id, user_id: category.user_id, name: category.name });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Category;
}
export async function deleteCategory(id: string, userId: string) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase
    .from("promotion_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
export async function setPromotionCategories(promotionId: string, categoryIds: string[]) {
  if (!supabase) throw new Error("Not configured");
  const { error } = await supabase.rpc("set_promotion_categories", {
    p_promotion: promotionId,
    p_categories: categoryIds,
  });
  if (error) throw error;
}
