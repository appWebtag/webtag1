import test from "node:test";
import assert from "node:assert/strict";
import {
  actions,
  addDays,
  daysBetween,
  matches,
  phase,
  todayISO,
  validatePromotion,
  applyFilters,
  emptyFilters,
  promotionLabel,
  type Promotion,
} from "../src/domain.ts";
const base: Promotion = {
  id: "p1",
  user_id: "u1",
  business_id: "b1",
  title: "Προσφορά",
  channel: "Instagram",
  starts_on: "2026-09-01",
  ends_on: "2026-09-28",
  next_action_on: "2026-09-28",
  published_on: "2026-09-01",
  status: "published",
  notes: "",
  previous_promotion_id: null,
  created_at: "2026-09-01T00:00:00Z",
  kind: "ads",
  cost: null,
};
test("expiry is inclusive, then automatically becomes history the following day", () => {
  assert.equal(phase(base, "2026-09-28"), "active");
  assert.equal(phase(base, "2026-09-29"), "expired");
  assert.equal(
    phase({ ...base, status: "cancelled" }, "2026-09-28"),
    "cancelled",
  );
});
test("unpublished promotions remain pending even after their planned date", () => {
  const p = { ...base, status: "scheduled" as const, published_on: null };
  assert.equal(phase(p, "2026-10-01"), "scheduled");
  assert.ok(
    actions([p]).some((a) => a.type === "publish" && a.date === "2026-09-01"),
  );
});
test("Athens midnight and DST use local business dates", () => {
  assert.equal(todayISO(new Date("2026-09-28T21:30:00Z")), "2026-09-29");
  assert.equal(todayISO(new Date("2026-12-01T22:30:00Z")), "2026-12-02");
  assert.equal(addDays("2026-03-29", 1), "2026-03-30");
  assert.equal(addDays("2026-10-25", -1), "2026-10-24");
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
});
test("replacement resolves its parent action without removing the original record", () => {
  const next = {
    ...base,
    id: "p2",
    status: "scheduled" as const,
    published_on: null,
    starts_on: "2026-09-29",
    ends_on: "2026-10-15",
    next_action_on: null,
    previous_promotion_id: "p1",
  };
  const list = [base, next];
  assert.deepEqual(
    actions(list).map((a) => [a.promotion.id, a.type]),
    [["p2", "publish"]],
  );
  assert.equal(list[0].published_on, "2026-09-01");
  assert.ok(
    actions([base, { ...next, status: "cancelled" }]).some(
      (a) => a.promotion.id === "p1" && a.type === "renew",
    ),
  );
});
test("completion preserves a pending renewal; cancellation removes it", () => {
  assert.equal(actions([{ ...base, status: "completed" }]).length, 1);
  assert.equal(actions([{ ...base, status: "cancelled" }]).length, 0);
});
test("date validation rejects invalid ranges and fabricated publication history", () => {
  assert.equal(validatePromotion(base, "2026-09-28"), null);
  assert.ok(
    validatePromotion({ ...base, ends_on: "2026-08-31" }, "2026-09-28"),
  );
  assert.ok(
    validatePromotion({ ...base, published_on: "2026-09-29" }, "2026-09-28"),
  );
  assert.ok(
    validatePromotion(
      { ...base, ends_on: "2026-09-20", published_on: "2026-09-25" },
      "2026-09-28",
    ),
  );
  assert.ok(
    validatePromotion({ ...base, starts_on: "2026-02-30" }, "2026-09-28"),
  );
  assert.ok(validatePromotion({ ...base, published_on: null }, "2026-09-28"));
  assert.ok(
    validatePromotion({ ...base, next_action_on: "2026-08-30" }, "2026-09-28"),
  );
});
test("Greek search ignores accents, case and final sigma", () => {
  assert.ok(matches("Επιχείρηση Καφές", "καφεσ"));
  assert.ok(matches("Μαρία Νικολάου", "ΜΑΡΙΑ"));
});

test("a post is one completed day; cost must be a positive amount", () => {
  const post: Promotion = {
    ...base, kind: "post", status: "completed",
    starts_on: "2026-09-20", ends_on: "2026-09-20", published_on: "2026-09-20", next_action_on: null,
  };
  assert.equal(validatePromotion(post, "2026-09-29"), null);
  assert.match(validatePromotion({ ...post, status: "scheduled", published_on: null }, "2026-09-29") || "", /ημερομηνία|ολοκληρωμένο/);
  assert.match(validatePromotion({ ...post, ends_on: "2026-09-21" }, "2026-09-29") || "", /μία ημερομηνία/);
  assert.match(validatePromotion({ ...post, starts_on: "2026-10-01", ends_on: "2026-10-01", published_on: "2026-10-01" }, "2026-09-29") || "", /μέλλον/);
  assert.equal(validatePromotion({ ...base, cost: 45.5 }, "2026-09-29"), null);
  assert.match(validatePromotion({ ...base, cost: -1 }, "2026-09-29") || "", /κόστος/);
  assert.match(validatePromotion({ ...base, title: "" }, "2026-09-29") || "", /κατηγορία/);
});

test("filters combine kind, categories (any), channel, client and overlapping dates", () => {
  const a = { ...base, id: "a", kind: "ads" as const, starts_on: "2026-09-01", ends_on: "2026-09-10" };
  const b = { ...base, id: "b", kind: "post" as const, status: "completed" as const, starts_on: "2026-09-15", ends_on: "2026-09-15", published_on: "2026-09-15", channel: "Facebook" as const };
  const c = { ...base, id: "c", business_id: "b2", starts_on: "2026-08-01", ends_on: "2026-08-20" };
  const links = [{ promotion_id: "a", category_id: "x" }, { promotion_id: "b", category_id: "y" }, { promotion_id: "c", category_id: "x" }];
  const ids = (f: Partial<typeof emptyFilters>) => applyFilters([a, b, c], { ...emptyFilters, ...f }, links).map((p) => p.id);
  assert.deepEqual(ids({}), ["a", "b", "c"]);
  assert.deepEqual(ids({ kind: "post" }), ["b"]);
  assert.deepEqual(ids({ categories: ["x"] }), ["a", "c"]);
  assert.deepEqual(ids({ categories: ["x", "y"] }), ["a", "b", "c"]);
  assert.deepEqual(ids({ channel: "Facebook" }), ["b"]);
  assert.deepEqual(ids({ business: "b2" }), ["c"]);
  assert.deepEqual(ids({ from: "2026-09-05", to: "2026-09-12" }), ["a"]);
  assert.deepEqual(ids({ from: "2026-09-11" }), ["b"]);
  assert.deepEqual(ids({ to: "2026-08-31" }), ["c"]);
});

test("a promotion is named by its categories, or by its older title", () => {
  const data = {
    categories: [
      { id: "x", user_id: "u", name: "Προσφορά", created_at: "" },
      { id: "y", user_id: "u", name: "Εκδήλωση", created_at: "" },
    ],
    categoryLinks: [{ promotion_id: "p1", category_id: "x" }, { promotion_id: "p1", category_id: "y" }],
  };
  assert.equal(promotionLabel(base, data), "Εκδήλωση · Προσφορά");
  assert.equal(promotionLabel({ ...base, id: "old", title: "Παλιός τίτλος" }, data), "Παλιός τίτλος");
});
