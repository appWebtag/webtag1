import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Link2, RefreshCw, EyeOff, Pencil, Plus, Unplug } from "lucide-react";
import type { Business } from "./domain";
import {
  dateTimeLabel,
  metaStatus,
  objectiveLabel,
  pageHint,
  pageName,
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
  onAddAccount,
  onRemoveAccount,
  onSync,
  onReview,
  onMapPage,
  onRenamePage,
}: {
  meta: MetaData;
  metaError: string;
  businesses: Business[];
  demo: boolean;
  busy: boolean;
  onAddAccount: (adAccountId: string) => Promise<void>;
  onRemoveAccount: (adAccountId: string) => Promise<void>;
  onSync: () => Promise<void>;
  onReview: (adIds: string[], businessId: string | null) => Promise<void>;
  onMapPage: (pageId: string, businessId: string | null) => Promise<void>;
  onRenamePage: (pageId: string, name: string) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [showMappedPages, setShowMappedPages] = useState(false);
  const [status, setStatus] = useState<StatusReply | null>(null);
  const [statusError, setStatusError] = useState("");
  const [manualId, setManualId] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [showAssigned, setShowAssigned] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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

  const accounts = meta.accounts;
  const connected = useMemo(() => new Set(accounts.map((a) => a.ad_account_id)), [accounts]);
  const currentAds = useMemo(() => meta.ads.filter((a) => connected.has(a.account_id)), [meta.ads, connected]);
  const running = accounts.some((a) => a.sync_status === "running");
  const available = (status?.accounts || []).filter((a) => !connected.has(a.id));
  const pending = groupByCampaign(currentAds.filter((a) => a.review_state === "new"));
  const assigned = groupByCampaign(currentAds.filter((a) => a.review_state !== "new"));
  const pageRows = meta.pages
    .map((p) => ({ page: p, hint: pageHint(p.page_id, currentAds) }))
    .filter((r) => r.hint.count > 0 || r.page.business_id)
    .sort((a, b) => b.hint.count - a.hint.count);
  const unmappedPages = pageRows.filter((r) => !r.page.business_id);
  const visiblePages = showMappedPages ? pageRows : unmappedPages;
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
    if (connected.has(clean)) {
      setError("Αυτός ο λογαριασμός είναι ήδη συνδεδεμένος.");
      return;
    }
    run(async () => {
      await onAddAccount(clean);
      setManualId("");
    });
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
        {accounts.length > 0 && (
          <button className="button primary" onClick={() => run(onSync)} disabled={busy || running}>
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
          {accounts.length > 0 && (
            <ul className="meta-accounts">
              {accounts.map((acc) => (
                <li key={acc.ad_account_id}>
                  <div className="meta-account-main">
                    <strong>{acc.name || acc.ad_account_id}</strong>
                    <small>
                      {acc.ad_account_id}
                      {acc.currency ? ` · ${acc.currency}` : ""}
                      {acc.timezone_name ? ` · ${acc.timezone_name}` : ""}
                    </small>
                    {acc.last_error && acc.sync_status !== "ok" && <small className="form-error">Μήνυμα Meta: {acc.last_error}</small>}
                  </div>
                  <div className={`meta-account-status sync-${acc.sync_status}`}>
                    {acc.sync_status === "ok" ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
                    <span>
                      {syncLabels[acc.sync_status]}
                      <small>Τελευταίος: {dateTimeLabel(acc.last_success_at)}</small>
                    </span>
                  </div>
                  {confirmRemove === acc.ad_account_id ? (
                    <div className="meta-account-confirm">
                      <span>Αποσύνδεση; Δεν θα συγχρονίζεται πια. Όσα έχουν ήδη αποθηκευτεί μένουν στο ιστορικό.</span>
                      <button
                        className="button danger small"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await onRemoveAccount(acc.ad_account_id);
                            setConfirmRemove(null);
                          })
                        }
                      >
                        Αποσύνδεση
                      </button>
                      <button className="button secondary small" disabled={busy} onClick={() => setConfirmRemove(null)}>
                        Άκυρο
                      </button>
                    </div>
                  ) : (
                    <button className="button secondary small" disabled={busy} onClick={() => setConfirmRemove(acc.ad_account_id)}>
                      <Unplug size={14} />
                      Αποσύνδεση
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="meta-account-picker">
            <h4>{accounts.length ? "Προσθήκη κι άλλου λογαριασμού" : "Πρόσθεσε διαφημιστικό λογαριασμό"}</h4>
            {available.length > 0 && (
              <label className="field">
                Από τους λογαριασμούς που βλέπει η σύνδεση με τη Meta
                <select value="" onChange={(e) => e.target.value && pickAccount(e.target.value)} disabled={busy}>
                  <option value="">Διάλεξε λογαριασμό…</option>
                  {available.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id}, {a.currency})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                pickAccount(manualId);
              }}
            >
              <label className="field">
                {available.length ? "ή γράψε τον αριθμό του λογαριασμού" : "Αριθμός διαφημιστικού λογαριασμού (Ad account ID)"}
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value.replace(/\s|-/g, ""))}
                  placeholder="π.χ. 123456789012345"
                  inputMode="numeric"
                />
              </label>
              <button className="button secondary" disabled={busy || !manualId.trim()}>
                <Plus size={15} />
                Προσθήκη
              </button>
            </form>
          </div>
        </div>
      </section>

      {accounts.length > 0 && pageRows.length > 0 && (
        <section className="panel meta-pages-panel">
          <div className="section-heading">
            <div>
              <h2>
                Σελίδες Facebook <span className="count">{unmappedPages.length} χωρίς πελάτη</span>
              </h2>
              <p>
                Διάλεξε σε ποιον πελάτη ανήκει κάθε σελίδα μία φορά: όλες οι καμπάνιες της, και οι νέες σε κάθε συγχρονισμό, πηγαίνουν
                αυτόματα σε εκείνον τον πελάτη. Με το μολύβι δίνεις όνομα σε μια σελίδα που φαίνεται με αριθμό.
              </p>
            </div>
            <button className="text-action" onClick={() => setShowMappedPages((v) => !v)}>
              {showMappedPages ? "Μόνο χωρίς πελάτη" : `Όλες οι σελίδες (${pageRows.length})`}
            </button>
          </div>
          {visiblePages.length === 0 ? (
            <p className="meta-empty">Όλες οι σελίδες έχουν πελάτη.</p>
          ) : (
            <ul className="meta-review-list compact">
              {visiblePages.map(({ page: p, hint }) => (
                <li key={p.page_id}>
                  <div className="meta-review-main">
                    {renaming?.id === p.page_id ? (
                      <form
                        className="meta-rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(async () => {
                            await onRenamePage(p.page_id, renaming.name);
                            setRenaming(null);
                          });
                        }}
                      >
                        <input
                          autoFocus
                          aria-label="Όνομα σελίδας"
                          maxLength={120}
                          placeholder={p.name || "Όνομα σελίδας"}
                          value={renaming.name}
                          onChange={(e) => setRenaming({ id: p.page_id, name: e.target.value })}
                        />
                        <button className="button primary small" disabled={busy}>
                          Αποθήκευση
                        </button>
                        <button type="button" className="button secondary small" onClick={() => setRenaming(null)}>
                          Άκυρο
                        </button>
                      </form>
                    ) : (
                      <strong>
                        {pageName(p)}{" "}
                        <button
                          className="icon-button"
                          aria-label={`Μετονομασία ${pageName(p)}`}
                          title="Μετονομασία"
                          disabled={busy}
                          onClick={() => setRenaming({ id: p.page_id, name: p.custom_name || p.name || "" })}
                        >
                          <Pencil size={13} />
                        </button>
                      </strong>
                    )}
                    <span>
                      {hint.count} {hint.count === 1 ? "διαφήμιση" : "διαφημίσεις"}
                      {hint.campaign && <> · τελευταία καμπάνια: «{hint.campaign}»</>}
                    </span>
                  </div>
                  <div className="meta-review-actions">
                    <select
                      aria-label={`Πελάτης για ${pageName(p)}`}
                      value={p.business_id || ""}
                      disabled={busy}
                      onChange={(e) => run(() => onMapPage(p.page_id, e.target.value || null))}
                    >
                      <option value="">Χωρίς πελάτη</option>
                      {[...businesses]
                        .sort((a, b) => a.name.localeCompare(b.name, "el"))
                        .map((b) => (
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
        </section>
      )}

      {accounts.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>
                Νέες διαφημίσεις προς αντιστοίχιση <span className="count">{pending.reduce((n, g) => n + g.ads.length, 0)}</span>
              </h2>
              <p>Καμπάνιες από σελίδες που δεν έχουν ακόμη πελάτη. Αντιστοίχισε τη σελίδα από πάνω για να πηγαίνουν αυτόματα, ή διάλεξε πελάτη εδώ για μία καμπάνια.</p>
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
                      {g.ads.find((a) => a.page_id) && (
                        <small>
                          Σελίδα:{" "}
                          {pageName(
                            meta.pages.find((p) => p.page_id === g.ads.find((a) => a.page_id)!.page_id),
                            g.ads.find((a) => a.page_id)!.page_id,
                          )}
                        </small>
                      )}
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
