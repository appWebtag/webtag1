import type { MetaDaily, MetaData } from "./meta";
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
    kind: "ads",
    cost: null,
  });
  const categories = ["Προσφορά", "Νέο μενού", "Εκδήλωση", "Brand awareness", "Εποχική"].map((name, i) => ({
    id: `c${i + 1}`,
    user_id,
    name,
    created_at,
  }));
  const post = (id: string, business_id: string, title: string, channel: Channel, day: number, cost: number | null): Promotion => ({
    ...make(id, business_id, title, channel, day, day, null, "completed"),
    kind: "post",
    cost,
  });
  return {
    businesses,
    categories,
    categoryLinks: [
      ["p1", "c2"], ["p1", "c5"], ["p2", "c1"], ["p3", "c4"], ["p4", "c5"], ["p4", "c1"],
      ["p5", "c3"], ["p6", "c1"], ["p7", "c2"], ["p8", "c4"], ["p9", "c3"], ["p10", "c1"],
    ].map(([promotion_id, category_id]) => ({ promotion_id, category_id })),
    promotions: [
      post("p9", "b4", "Εκδήλωση", "Instagram", -2, null),
      post("p10", "b3", "Προσφορά", "Facebook", -4, 15),
      make(
        "p1",
        "b1",
        "Το νέο φθινοπωρινό μενού",
        "Facebook + Instagram",
        -12,
        2,
        0,
      ),
      { ...make("p2", "b2", "Γνώρισε το νέο σου studio", "Instagram", -8, 5, 3), cost: 60 },
      { ...make("p3", "b3", "Κάθε πρωί, μια καλή αρχή", "Facebook", -7, 1, -1), cost: 40 },
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

// ---------- demo Meta data (fictional) ----------
export function demoMeta(): { meta: MetaData; daily: MetaDaily[] } {
  const today = todayISO();
  const now = new Date().toISOString();
  const ad = (ad_id: string, name: string, campaign_id: string, campaign_name: string, objective: string, business_id: string | null, review_state: "new" | "assigned" | "ignored") => ({
    ad_id, name, campaign_id, campaign_name, objective, business_id, review_state,
    account_id: "act_1234567890", adset_id: `s${campaign_id}`, adset_name: "Αθήνα 25-55",
    effective_status: "ACTIVE", created_time: now, first_seen_at: now,
  });
  const daily: MetaDaily[] = Array.from({ length: 13 }, (_, i) => ({
    ad_id: "a1", date: addDays(today, -12 + i), currency: "EUR",
    spend: 4 + ((i * 7) % 5), impressions: 900 + i * 40, reach: 700, clicks: 30 + i, link_clicks: 18 + (i % 4), actions: {},
  }));
  return {
    daily,
    meta: {
      account: {
        user_id: "demo", ad_account_id: "act_1234567890", name: "WebTag Ads", currency: "EUR",
        timezone_name: "Europe/Athens", account_status: 1, sync_status: "ok",
        last_attempt_at: now, last_success_at: now, last_error: null,
      },
      ads: [
        ad("a1", "Φθινοπωρινό μενού — carousel", "c1", "Olive & Thyme | Φθινόπωρο", "OUTCOME_ENGAGEMENT", "b1", "assigned"),
        ad("a2", "Φθινοπωρινό μενού — reel", "c1", "Olive & Thyme | Φθινόπωρο", "OUTCOME_ENGAGEMENT", "b1", "assigned"),
        ad("a3", "Καλοκαιρινές γεύσεις", "c2", "Olive & Thyme | Καλοκαίρι", "OUTCOME_TRAFFIC", "b1", "assigned"),
        ad("a4", "Νέο studio — video", "c3", "Forma Studio - Οκτώβριος", "OUTCOME_LEADS", null, "new"),
        ad("a5", "Brunch Σαββατοκύριακου", "c4", "Brunch promo", "OUTCOME_AWARENESS", null, "new"),
      ],
      links: [
        { id: "l1", promotion_id: "p1", level: "campaign", meta_id: "c1" },
        { id: "l2", promotion_id: "p7", level: "ad", meta_id: "a3" },
      ],
      results: [
        {
          promotion_id: "p1", since: addDays(today, -12), until: today, currency: "EUR",
          spend: 78.4, impressions: 14820, reach: 9310, clicks: 512, link_clicks: 247,
          actions: { "onsite_conversion.messaging_conversation_started_7d": 31 },
          unavailable: [], ad_count: 2, fetched_at: now,
        },
        {
          promotion_id: "p7", since: addDays(today, -40), until: addDays(today, -15), currency: "EUR",
          spend: 120, impressions: 22110, reach: 15020, clicks: 690, link_clicks: 402,
          actions: {}, unavailable: [], ad_count: 1, fetched_at: now,
        },
      ],
      runs: [
        { id: 2, trigger: "daily", started_at: now, finished_at: now, status: "ok", ads_seen: 5, days_saved: 64, promotions_updated: 2, message: null },
        { id: 1, trigger: "manual", started_at: addDays(today, -1) + "T09:12:00Z", finished_at: null, status: "error", ads_seen: null, days_saved: null, promotions_updated: null, message: "Rate limit — θα ξαναδοκιμάσει αύριο." },
      ],
    },
  };
}
