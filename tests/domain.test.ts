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
