import {
  addDays,
  todayISO,
  type Data,
  type Promotion,
  type Channel,
} from "./domain";

export function demoData(): Data {
  const today = todayISO();
  const user_id = "demo";
  const created_at = new Date().toISOString();
  const businesses = [
    ["b1", "Olive & Thyme", "Εστιατόριο · Αθήνα", "Μαρία Παπαδοπούλου"],
    ["b2", "Forma Studio", "Pilates & ευεξία", "Άννα Γεωργίου"],
    ["b3", "The Daily Grind", "Coffee & brunch", "Νίκος Δημητρίου"],
    ["b4", "Luna Boutique", "Μόδα & αξεσουάρ", "Ελένη Νικολάου"],
    ["b5", "Bloom Flowers", "Ανθοπωλείο", "Σοφία Αντωνίου"],
  ].map(([id, name, notes, contact_name]) => ({
    id,
    name,
    notes,
    contact_name,
    user_id,
    phone: "",
    email: "",
    created_at,
  }));
  const make = (
    id: string,
    business_id: string,
    title: string,
    channel: Channel,
    start: number,
    end: number,
    next: number | null,
    status: Promotion["status"] = "published",
  ): Promotion => ({
    id,
    user_id,
    business_id,
    title,
    channel,
    starts_on: addDays(today, start),
    ends_on: addDays(today, end),
    next_action_on: next === null ? null : addDays(today, next),
    published_on: status === "scheduled" ? null : addDays(today, start),
    status,
    notes: "",
    previous_promotion_id: null,
    created_at,
  });
  return {
    businesses,
    promotions: [
      make(
        "p1",
        "b1",
        "Το νέο φθινοπωρινό μενού",
        "Facebook + Instagram",
        -12,
        2,
        0,
      ),
      make("p2", "b2", "Γνώρισε το νέο σου studio", "Instagram", -8, 5, 3),
      make("p3", "b3", "Κάθε πρωί, μια καλή αρχή", "Facebook", -7, 1, -1),
      make("p4", "b4", "Autumn essentials", "Instagram", -5, 9, 7),
      make(
        "p5",
        "b5",
        "Λίγα λουλούδια, πολλή χαρά",
        "Facebook + Instagram",
        1,
        15,
        14,
        "scheduled",
      ),
      make(
        "p6",
        "b2",
        "Νέα τμήματα Οκτωβρίου",
        "Instagram",
        3,
        17,
        null,
        "scheduled",
      ),
      make(
        "p7",
        "b1",
        "Καλοκαιρινές γεύσεις",
        "Instagram",
        -40,
        -15,
        null,
        "completed",
      ),
      make(
        "p8",
        "b3",
        "Brunch του Σαββατοκύριακου",
        "Facebook",
        -28,
        -12,
        null,
        "completed",
      ),
    ],
  };
}
