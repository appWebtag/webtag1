export type PromotionStatus =
  "scheduled" | "published" | "completed" | "cancelled";
export type Channel =
  | "Instagram"
  | "Facebook"
  | "Facebook + Instagram"
  | "TikTok"
  | "LinkedIn"
  | "Άλλο";
export const channels: Channel[] = [
  "Instagram",
  "Facebook",
  "Facebook + Instagram",
  "TikTok",
  "LinkedIn",
  "Άλλο",
];
export interface Business {
  id: string;
  user_id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
}
export interface Promotion {
  id: string;
  user_id: string;
  business_id: string;
  title: string;
  channel: Channel;
  starts_on: string;
  ends_on: string;
  next_action_on: string | null;
  published_on: string | null;
  status: PromotionStatus;
  notes: string;
  previous_promotion_id: string | null;
  created_at: string;
}
export interface Data {
  businesses: Business[];
  promotions: Promotion[];
}

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
}
export function dateLabel(iso: string, year = false): string {
  return new Intl.DateTimeFormat("el-GR", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
  }).format(new Date(`${iso}T12:00:00`));
}
export function relativeDay(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  if (days === 0) return "Σήμερα";
  if (days === 1) return "Αύριο";
  if (days === -1) return "Χθες";
  return days < 0 ? `Πριν ${Math.abs(days)} ημέρες` : `Σε ${days} ημέρες`;
}
export function phase(
  p: Promotion,
  today: string,
): "scheduled" | "active" | "expired" | "completed" | "cancelled" {
  if (p.status === "completed" || p.status === "cancelled") return p.status;
  if (p.status === "scheduled") return "scheduled";
  return p.ends_on < today
    ? "expired"
    : p.starts_on > today
      ? "scheduled"
      : "active";
}
export function replacement(
  p: Promotion,
  all: Promotion[],
): Promotion | undefined {
  return all.find(
    (x) => x.previous_promotion_id === p.id && x.status !== "cancelled",
  );
}
export type ActionItem = {
  promotion: Promotion;
  type: "publish" | "renew";
  date: string;
};
export function actions(promotions: Promotion[]): ActionItem[] {
  return promotions
    .flatMap((p) => {
      if (p.status === "cancelled") return [];
      const list: ActionItem[] = [];
      if (p.status === "scheduled")
        list.push({ promotion: p, type: "publish", date: p.starts_on });
      if (p.next_action_on && !replacement(p, promotions))
        list.push({ promotion: p, type: "renew", date: p.next_action_on });
      return list;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function matches(text: string, search: string): boolean {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("el")
      .replace(/ς/g, "σ");
  return normalize(text).includes(normalize(search.trim()));
}
export function validatePromotion(
  p: Pick<
    Promotion,
    | "title"
    | "business_id"
    | "starts_on"
    | "ends_on"
    | "published_on"
    | "next_action_on"
    | "status"
  >,
  today = todayISO(),
): string | null {
  const validDate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
  if (!p.title.trim() || !p.business_id)
    return "Συμπλήρωσε τίτλο και επιχείρηση.";
  if (!validDate(p.starts_on) || !validDate(p.ends_on))
    return "Συμπλήρωσε έγκυρες ημερομηνίες έναρξης και λήξης.";
  if (p.ends_on < p.starts_on)
    return "Η λήξη πρέπει να είναι την ίδια ημέρα ή μετά την έναρξη.";
  if (
    p.next_action_on &&
    (!validDate(p.next_action_on) || p.next_action_on < p.starts_on)
  )
    return "Η επόμενη ενέργεια πρέπει να είναι την ίδια ημέρα ή μετά την έναρξη.";
  if (p.published_on && (!validDate(p.published_on) || p.published_on > today))
    return "Η ημερομηνία δημοσίευσης δεν μπορεί να είναι στο μέλλον.";
  if (p.published_on && p.published_on > p.ends_on)
    return "Η λήξη προηγείται της δημοσίευσης. Διόρθωσε τη διάρκεια προβολής.";
  if ((p.status === "published" || p.status === "completed") && !p.published_on)
    return "Συμπλήρωσε πότε δημοσιεύτηκε η διαφήμιση.";
  if (p.status === "scheduled" && p.published_on)
    return "Μια προγραμματισμένη διαφήμιση δεν έχει ακόμη δημοσιευτεί.";
  return null;
}
