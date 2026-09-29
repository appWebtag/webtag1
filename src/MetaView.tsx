import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Link2, RefreshCw, EyeOff } from "lucide-react";
import type { Business } from "./domain";
import {
  dateTimeLabel,
  metaStatus,
  objectiveLabel,
  suggestBusiness,
  type MetaAd,
  type MetaData,
  type StatusReply,
} from "./meta";

const syncLabels = {
  pending: "Αναμονή πρώτου συγχρονισμού",
  running: "Συγχρονισμός σε εξέλιξη…",
  ok: "Συνδεδεμένο",
  error: "Ο τελευταίος συγχρονισμός απέτυχε",
  needs_reconnect: "Χρειάζεται επανασύνδεση με τη Meta",
};
const runLabels = { running: "Σε εξέλιξη", ok: "Επιτυχία", error: "Σφάλμα", needs_reconnect: "Επανασύνδεση" };

type CampaignGroup = { campaign_id: string; campaign_name: string; objective: string | null; ads: MetaAd[] };
function groupByCampaign(ads: MetaAd[]): CampaignGroup[] {
  const map = new Map<string, CampaignGroup>();
  for (const a of ads) {
    const id = a.campaign_id || `ad:${a.ad_id}`;
    const g = map.get(id) || { campaign_id: id, campaign_name: a.campaign_name || "Χωρίς καμπάνια", objective: a.objective, ads: [] };
    g.ads.push(a);
    map.set(id, g);
  }
  return [...map.values()];
}

export default function MetaView({
  meta,
  metaError,
  businesses,
  demo,
  busy,
  onSaveAccount,
  onSync,
  onReview,
}: {
  meta: MetaData;
  metaError: string;
  businesses: Business[];
  demo: boolean;
  busy: boolean;
  onSaveAccount: (adAccountId: string) => Promise<void>;
  onSync: () => Promise<void>;
  onReview: (adIds: string[], businessId: string | null) => Promise<void>;
}) {
  const [status, setStatus] = useState<StatusReply | null>(null);
  const [statusError, setStatusError] = useState("");
  const [manualId, setManualId] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [showAssigned, setShowAssigned] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) {
      setStatus({ configured: true, accounts: [{ id: "act_1234567890", name: "WebTag Ads", currency: "EUR", timezone_name: "Europe/Athens", account_status: 1 }] });
      return;
    }
    let active = true;
    metaStatus()
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatusError("Η υπηρεσία συγχρονισμού δεν απαντά ακόμη. Ίσως δεν έχει εγκατασταθεί η λειτουργία meta-sync στο Supabase."));
    return () => {
      active = false;
    };
  }, [demo]);

  const account = meta.account;
  const currentAds = useMemo(
    () => meta.ads.filter((a) => !account || a.account_id === account.ad_account_id),
    [meta.ads, account],
  );
  const pending = groupByCampaign(currentAds.filter((a) => a.review_state === "new"));
  const assigned = groupByCampaign(currentAds.filter((a) => a.review_state !== "new"));
  const businessName = (id: string | null) => businesses.find((b) => b.id === id)?.name || "—";

  const run = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || "Η ενέργεια δεν ολοκληρώθηκε.");
    }
  };
  const pickAccount = (id: string) => {
    const clean = id.trim().replace(/^(?!act_)/, "act_");
    if (!/^act_\d{1,30}$/.test(clean)) {
      setError("Ο κωδικός λογαριασμού έχει τη μορφή act_ και αριθμούς.");
      return;
    }
    run(() => onSaveAccount(clean));
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FACEBOOK & INSTAGRAM</div>
          <h1>
            Αποτελέσματα Meta<span className="purple-text">.</span>
          </h1>
          <p>Τα στατιστικά των πληρωμένων διαφημίσεων, αυτόματα κάθε πρωί.</p>
        </div>
        {account && (
          <button className="button primary" onClick={() => run(onSync)} disabled={busy || account.sync_status === "running"}>
            <RefreshCw size={16} />
            {busy ? "Συγχρονισμός…" : "Συγχρονισμός τώρα"}
          </button>
        )}
      </div>
      {metaError && (
        <div className="notice error" role="alert">
          <CircleAlert size={18} />
          {metaError}
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          <CircleAlert size={18} />
          {error}
        </div>
      )}

      <section className="panel meta-connection">
        <div className="section-heading">
          <div>
            <h2>Σύνδεση</h2>
            <p>Ο διαφημιστικός λογαριασμός από τον οποίο τρέχουν οι διαφημίσεις των πελατών σου.</p>
          </div>
        </div>
        <div className="meta-connection-body">
          {status && !status.configured && (
            <div className="notice">
              <CircleAlert size={18} />
              Δεν έχει οριστεί ακόμη το κλειδί πρόσβασης της Meta στον server. Ακολούθησε τις οδηγίες σύνδεσης.
            </div>
          )}
          {status?.reconnect && (
            <div className="notice error">
              <CircleAlert size={18} />
              Η Meta δεν δέχεται το κλειδί πρόσβασης. Δημιούργησε νέο token και αντικατέστησέ το στο Supabase.
            </div>
          )}
          {statusError && !demo && (
            <div className="notice">
              <CircleAlert size={18} />
              {statusError}
            </div>
          )}
          {account ? (
            <dl className="promotion-meta meta-account">
              <div>
                <dt>Λογαριασμός</dt>
                <dd>
                  {account.name || account.ad_account_id}
                  <small>{account.ad_account_id}</small>
                </dd>
              </div>
              <div>
                <dt>Κατάσταση</dt>
                <dd className={`sync-${account.sync_status}`}>
                  {account.sync_status === "ok" ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
                  {syncLabels[account.sync_status]}
                </dd>
              </div>
              <div>
                <dt>Τελευταίος επιτυχημένος συγχρονισμός</dt>
                <dd>{dateTimeLabel(account.last_success_at)}</dd>
              </div>
              <div>
                <dt>Νόμισμα · ζώνη ώρας</dt>
                <dd>
                  {account.currency || "—"} · {account.timezone_name || "—"}
                </dd>
              </div>
            </dl>
          ) : null}
          {account?.last_error && account.sync_status !== "ok" && (
            <p className="form-error">Μήνυμα Meta: {account.last_error}</p>
          )}
          {(!account || (status?.accounts.length ?? 0) > 1) && (
            <div className="meta-account-picker">
              {status?.accounts.length ? (
                <label className="field">
                  {account ? "Αλλαγή λογαριασμού" : "Επίλεξε διαφημιστικό λογαριασμό"}
                  <select
                    value={account?.ad_account_id || ""}
                    onChange={(e) => e.target.value && pickAccount(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Επιλογή…</option>
                    {status.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.id}, {a.currency})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                !account && (
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      pickAccount(manualId);
                    }}
                  >
                    <label className="field">
                      Κωδικός διαφημιστικού λογαριασμού (act_…)
                      <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="act_1234567890" />
                    </label>
                    <button className="button secondary" disabled={busy}>
                      Αποθήκευση
                    </button>
                  </form>
                )
              )}
            </div>
          )}
        </div>
      </section>

      {account && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>
                Νέες διαφημίσεις προς αντιστοίχιση <span className="count">{pending.reduce((n, g) => n + g.ads.length, 0)}</span>
              </h2>
              <p>Διάλεξε σε ποιον πελάτη ανήκει κάθε καμπάνια. Τίποτα δεν αντιστοιχίζεται χωρίς την επιβεβαίωσή σου.</p>
            </div>
          </div>
          {pending.length === 0 ? (
            <p className="meta-empty">Δεν υπάρχουν νέες διαφημίσεις.</p>
          ) : (
            <ul className="meta-review-list">
              {pending.map((g) => {
                const suggestion = suggestBusiness(g.campaign_name, g.ads.map((a) => a.name).join(" "), businesses);
                const selected = choice[g.campaign_id] ?? suggestion?.id ?? "";
                return (
                  <li key={g.campaign_id}>
                    <div className="meta-review-main">
                      <strong>{g.campaign_name}</strong>
                      <span>
                        {g.ads.length} {g.ads.length === 1 ? "διαφήμιση" : "διαφημίσεις"}
                        {g.objective && ` · ${objectiveLabel[g.objective] || g.objective}`}
                      </span>
                      <small>{g.ads.map((a) => a.name).join(" · ")}</small>
                      {suggestion && <small className="meta-suggestion">Πρόταση από το όνομα: {suggestion.name}</small>}
                    </div>
                    <div className="meta-review-actions">
                      <select
                        aria-label={`Πελάτης για ${g.campaign_name}`}
                        value={selected}
                        onChange={(e) => setChoice((c) => ({ ...c, [g.campaign_id]: e.target.value }))}
                      >
                        <option value="">Διάλεξε πελάτη…</option>
                        {[...businesses]
                          .sort((a, b) => a.name.localeCompare(b.name, "el"))
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                      <button
                        className="button primary small"
                        disabled={!selected || busy}
                        onClick={() => run(() => onReview(g.ads.map((a) => a.ad_id), selected))}
                      >
                        <Link2 size={14} />
                        Αντιστοίχιση
                      </button>
                      <button
                        className="button secondary small"
                        disabled={busy}
                        title="Δεν αφορά πελάτη"
                        onClick={() => run(() => onReview(g.ads.map((a) => a.ad_id), null))}
                      >
                        <EyeOff size={14} />
                        Παράβλεψη
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {assigned.length > 0 && (
            <div className="meta-assigned">
              <button className="text-action" onClick={() => setShowAssigned((v) => !v)}>
                {showAssigned ? "Απόκρυψη" : "Προβολή"} αντιστοιχισμένων ({assigned.length} καμπάνιες)
              </button>
              {showAssigned && (
                <ul className="meta-review-list compact">
                  {assigned.map((g) => (
                    <li key={g.campaign_id}>
                      <div className="meta-review-main">
                        <strong>{g.campaign_name}</strong>
                        <span>
                          {g.ads[0].review_state === "ignored" ? "Παραβλέφθηκε" : businessName(g.ads[0].business_id)}
                        </span>
                      </div>
                      <div className="meta-review-actions">
                        <select
                          aria-label={`Αλλαγή πελάτη για ${g.campaign_name}`}
                          value={g.ads[0].business_id || ""}
                          disabled={busy}
                          onChange={(e) => run(() => onReview(g.ads.map((a) => a.ad_id), e.target.value || null))}
                        >
                          <option value="">Δεν αφορά πελάτη</option>
                          {businesses.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {meta.runs.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Ιστορικό συγχρονισμών</h2>
              <p>Ο αυτόματος συγχρονισμός τρέχει κάθε πρωί. Ξαναδιαβάζει τις τελευταίες 28 ημέρες για καθυστερημένα αποτελέσματα.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ΠΟΤΕ</th>
                  <th>ΤΡΟΠΟΣ</th>
                  <th>ΑΠΟΤΕΛΕΣΜΑ</th>
                  <th>ΛΕΠΤΟΜΕΡΕΙΕΣ</th>
                </tr>
              </thead>
              <tbody>
                {meta.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{dateTimeLabel(r.started_at)}</td>
                    <td>{r.trigger === "daily" ? "Αυτόματα" : "Χειροκίνητα"}</td>
                    <td>
                      <span className={`run-status ${r.status}`}>{runLabels[r.status]}</span>
                    </td>
                    <td className="run-detail">
                      {r.status === "ok"
                        ? `${r.ads_seen ?? 0} διαφημίσεις · ${r.days_saved ?? 0} ημερήσιες εγγραφές · ${r.promotions_updated ?? 0} προωθήσεις`
                        : r.message || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
