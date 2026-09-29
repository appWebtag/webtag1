import { test } from "node:test";
import assert from "node:assert/strict";
import { adsForLinks, costPer, count, resultValues, suggestBusiness, type MetaAd } from "../src/metaCore.ts";

const ad = (ad_id: string, campaign_id: string): MetaAd => ({
  ad_id, campaign_id, account_id: "act_1", name: ad_id, campaign_name: null, objective: null, adset_id: null,
  adset_name: null, effective_status: null, created_time: null, first_seen_at: "", business_id: null, review_state: "new",
});

test("missing data is shown as a dash, zero stays zero", () => {
  assert.equal(count(null), "—");
  assert.equal(count(0), "0");
  assert.equal(costPer(10, 0, "EUR"), "—");
  assert.equal(costPer(null, 5, "EUR"), "—");
  assert.match(costPer(10, 4, "EUR"), /2,50/);
});

test("results appear only when recorded or when they are the campaign goal", () => {
  assert.deepEqual(resultValues({}, ["OUTCOME_TRAFFIC"]), []);
  assert.deepEqual(resultValues(null, ["OUTCOME_LEADS"]), []);
  assert.deepEqual(resultValues({}, ["OUTCOME_LEADS"]).map((r) => [r.key, r.value]), [["leads", 0]]);
  assert.deepEqual(
    resultValues({ "onsite_conversion.messaging_conversation_started_7d": 12, omni_purchase: 3, purchase: 3 }, []).map((r) => [r.key, r.value]),
    [["messages", 12], ["purchases", 3]],
  );
});

test("campaign links expand to their ads without duplicates", () => {
  const ads = [ad("1", "c1"), ad("2", "c1"), ad("3", "c2")];
  const ids = adsForLinks(
    [
      { id: "x", promotion_id: "p", level: "campaign", meta_id: "c1" },
      { id: "y", promotion_id: "p", level: "ad", meta_id: "2" },
    ],
    ads,
  );
  assert.deepEqual(ids.sort(), ["1", "2"]);
});

test("a client is suggested only on a single unambiguous name match", () => {
  const b = (id: string, name: string) => ({ id, name, user_id: "u", contact_name: "", phone: "", email: "", notes: "", created_at: "" });
  const list = [b("1", "Forma Studio"), b("2", "Olive & Thyme"), b("3", "Olive")];
  assert.equal(suggestBusiness("FORMA STUDIO - Οκτώβριος", "", list)?.id, "1");
  assert.equal(suggestBusiness("Olive & Thyme | Φθινόπωρο", "", list), undefined); // matches two
  assert.equal(suggestBusiness("Brunch promo", "", list), undefined);
});
