import { useEffect, useMemo, useState } from "react";
import { BarChart3, Link2, X } from "lucide-react";
import { dateLabel, type Business, type Promotion } from "./domain";
import { useLabel } from "./ui";
import {
  adsForLinks,
  costPer,
  count,
  dateTimeLabel,
  loadDaily,
  money,
  pageName,
  resultValues,
  type MetaAd,
  type MetaDaily,
  type MetaData,
  type MetaResult,
} from "./meta";

function objectivesFor(ids: string[], ads: MetaAd[]) {
  return [...new Set(ads.filter((a) => ids.includes(a.ad_id)).map((a) => a.objective))];
}

export function MetricGrid({ result, objectives }: { result: MetaResult; objectives: (string | null)[] }) {
  const cur = result.currency;
  const missing = (f: string) => result.unavailable.includes(f);
  const cells: [string, string, string?][] = [
    ["Δαπάνη", money(result.spend, cur)],
    ["Εμφανίσεις", count(result.impressions)],
    ["Απήχηση", count(result.reach), "Μοναδικοί χρήστες σε όλη την περίοδο της προώθησης"],
    ["Κλικ στον σύνδεσμο", count(result.link_clicks)],
    ["Κόστος ανά κλικ", costPer(result.spend, result.link_clicks, cur), "Δαπάνη ÷ κλικ στον σύνδεσμο"],
    ["Όλα τα κλικ", count(result.clicks)],
  ];
  const outcomes = resultValues(result.actions, objectives);
  return (
    <div className="metric-grid">
      {cells.map(([label, value, hint]) => (
        <div className="metric" key={label} title={value === "—" ? "Δεν διατίθεται από τη Meta για αυτή την περίοδο" : hint}>
          <span>{label}</span>
          <strong className={value === "—" ? "na" : ""}>{value}</strong>
        </div>
      ))}
      {outcomes.map((o) => (
        <div className="metric outcome" key={o.key}>
          <span>{o.label}</span>
          <strong>{count(o.value)}</strong>
          <small>{costPer(result.spend, o.value, cur)} / αποτέλεσμα</small>
        </div>
      ))}
      {missing("actions") && (
        <div className="metric">
          <span>Αποτελέσματα</span>
          <strong className="na">—</strong>
        </div>
      )}
    </div>
  );
}

function DailyBars({ rows, currency }: { rows: MetaDaily[]; currency: string | null }) {
  const byDay = new Map<string, number>();
  for (const r of rows) if (r.spend !== null) byDay.set(r.date, (byDay.get(r.date) || 0) + r.spend);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (days.length < 2) return null;
  const max = Math.max(...days.map(([, v]) => v), 0.01);
  return (
    <div className="daily-bars" aria-label="Ημερήσια δαπάνη">
      <div className="daily-bars-track">
        {days.map(([d, v]) => (
          <span key={d} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} title={`${dateLabel(d)}: ${money(v, currency)}`} />
        ))}
      </div>
      <div className="daily-bars-axis">
        <span>{dateLabel(days[0][0])}</span>
        <span>Ημερήσια δαπάνη</span>
        <span>{dateLabel(days[days.length - 1][0])}</span>
      </div>
    </div>
  );
}

export function PromotionMetaPanel({
  promotion,
  meta,
  userId,
  demo,
  demoDaily,
  onLink,
  onUnlink,
  onOpenMeta,
}: {
  promotion: Promotion;
  meta: MetaData;
  userId: string;
  demo: boolean;
  demoDaily?: MetaDaily[];
  onLink: (level: "campaign" | "ad", metaId: string) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
  onOpenMeta: () => void;
}) {
  const links = meta.links.filter((l) => l.promotion_id === promotion.id);
  const result = meta.results.find((r) => r.promotion_id === promotion.id);
  const [picking, setPicking] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [daily, setDaily] = useState<MetaDaily[]>([]);
  const adIds = useMemo(() => adsForLinks(links, meta.ads), [links, meta.ads]);

  useEffect(() => {
    if (!result || !adIds.length) return setDaily([]);
    if (demo) return setDaily(demoDaily || []);
    let active = true;
    loadDaily(userId, adIds, result.since, result.until)
      .then((rows) => active && setDaily(rows))
      .catch(() => active && setDaily([]));
    return () => {
      active = false;
    };
  }, [result?.fetched_at, adIds.join(","), userId, demo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meta.account)
    return (
      <div className="meta-panel muted">
        <BarChart3 size={16} />
        <span>Σύνδεσε τον διαφημιστικό λογαριασμό Meta για να βλέπεις αποτελέσματα εδώ.</span>
        <button className="text-action" onClick={onOpenMeta}>
          Ρυθμίσεις Meta
        </button>
      </div>
    );

  // Campaigns and ads: this client's first, then unassigned, then the rest.
  const rank = (a: MetaAd) => (a.business_id === promotion.business_id ? 0 : a.review_state === "new" ? 1 : 2);
  const ads = meta.ads.filter((a) => a.account_id === meta.account!.ad_account_id).sort((a, b) => rank(a) - rank(b));
  const campaigns = new Map<string, { name: string; rank: number }>();
  for (const a of ads)
    if (a.campaign_id && !campaigns.has(a.campaign_id)) campaigns.set(a.campaign_id, { name: a.campaign_name || a.campaign_id, rank: rank(a) });
  const nameOf = (level: string, id: string) =>
    level === "campaign" ? campaigns.get(id)?.name || `Καμπάνια ${id}` : ads.find((a) => a.ad_id === id)?.name || `Διαφήμιση ${id}`;
  const groupLabel = ["Αυτού του πελάτη", "Χωρίς αντιστοίχιση", "Άλλοι πελάτες"];

  const submit = async () => {
    const [level, id] = value.split(":") as ["campaign" | "ad", string];
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await onLink(level, id);
      setPicking(false);
      setValue("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="meta-panel">
      <div className="meta-panel-head">
        <h4>
          <BarChart3 size={15} /> Αποτελέσματα Meta
        </h4>
        {result && (
          <small>
            {dateLabel(result.since)} – {dateLabel(result.until, true)} · ενημέρωση {dateTimeLabel(result.fetched_at)}
          </small>
        )}
      </div>
      {links.length > 0 && (
        <ul className="meta-links">
          {links.map((l) => (
            <li key={l.id}>
              <span className="meta-level">{l.level === "campaign" ? "Καμπάνια" : "Διαφήμιση"}</span>
              {nameOf(l.level, l.meta_id)}
              <button
                className="icon-button"
                aria-label="Αφαίρεση σύνδεσης"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onUnlink(l.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picking ? (
        <div className="meta-link-form">
          <select aria-label="Καμπάνια ή διαφήμιση Meta" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Διάλεξε καμπάνια ή διαφήμιση…</option>
            {[0, 1, 2].map((r) => {
              const cs = [...campaigns.entries()].filter(([, c]) => c.rank === r);
              const as = ads.filter((a) => rank(a) === r);
              if (!cs.length && !as.length) return null;
              return (
                <optgroup key={r} label={groupLabel[r]}>
                  {cs.map(([id, c]) => (
                    <option key={`c${id}`} value={`campaign:${id}`} disabled={links.some((l) => l.level === "campaign" && l.meta_id === id)}>
                      Καμπάνια · {c.name}
                    </option>
                  ))}
                  {as.map((a) => (
                    <option key={`a${a.ad_id}`} value={`ad:${a.ad_id}`} disabled={links.some((l) => l.level === "ad" && l.meta_id === a.ad_id)}>
                      Διαφήμιση · {a.name}
                      {a.campaign_name ? ` (${a.campaign_name})` : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <button className="button primary small" disabled={!value || busy} onClick={submit}>
            Σύνδεση
          </button>
          <button className="button secondary small" disabled={busy} onClick={() => setPicking(false)}>
            Άκυρο
          </button>
        </div>
      ) : (
        <button className="text-action" onClick={() => setPicking(true)} disabled={!ads.length}>
          <Link2 size={13} />
          {ads.length ? (links.length ? "Σύνδεση κι άλλης καμπάνιας/διαφήμισης" : "Σύνδεση με καμπάνια ή διαφήμιση Meta") : "Δεν έχουν συγχρονιστεί ακόμη διαφημίσεις"}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      {links.length > 0 && !result && (
        <p className="meta-note">Τα αποτελέσματα θα εμφανιστούν μετά τον επόμενο συγχρονισμό.</p>
      )}
      {links.length > 0 && result && (
        <>
          <MetricGrid result={result} objectives={objectivesFor(adIds, meta.ads)} />
          <DailyBars rows={daily} currency={result.currency} />
          <p className="meta-note">
            Περίοδος: από τη δημοσίευση έως τη λήξη της προώθησης. Τα ποσά είναι σε {result.currency || "νόμισμα λογαριασμού"}. «—» σημαίνει ότι η Meta δεν
            δίνει την τιμή· το 0 είναι πραγματικό μηδέν.
          </p>
        </>
      )}
    </section>
  );
}

export function BusinessMetaComparison({
  business,
  promotions,
  meta,
  onOpen,
}: {
  business: Business;
  promotions: Promotion[];
  meta: MetaData;
  onOpen: (p: Promotion) => void;
}) {
  const { label } = useLabel();
  const rows = promotions
    .map((p) => ({ p, r: meta.results.find((x) => x.promotion_id === p.id) }))
    .filter((x): x is { p: Promotion; r: MetaResult } => !!x.r)
    .sort((a, b) => b.r.since.localeCompare(a.r.since));
  if (!rows.length) return null;
  const currencies = new Set(rows.map((x) => x.r.currency));
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Σύγκριση αποτελεσμάτων Meta</h2>
          <p>
            Οι προωθήσεις της επιχείρησης {business.name} που είναι συνδεδεμένες με διαφημίσεις.
            {currencies.size > 1 && " Προσοχή: διαφορετικά νομίσματα."}
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>ΠΡΟΩΘΗΣΗ</th>
              <th>ΔΑΠΑΝΗ</th>
              <th>ΕΜΦΑΝΙΣΕΙΣ</th>
              <th>ΑΠΗΧΗΣΗ</th>
              <th>ΚΛΙΚ</th>
              <th>ΚΟΣΤΟΣ/ΚΛΙΚ</th>
              <th>ΑΠΟΤΕΛΕΣΜΑΤΑ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, r }) => {
              const ids = adsForLinks(meta.links.filter((l) => l.promotion_id === p.id), meta.ads);
              const outcomes = resultValues(r.actions, objectivesFor(ids, meta.ads));
              return (
                <tr key={p.id}>
                  <td>
                    <button className="text-link" onClick={() => onOpen(p)}>
                      {label(p)}
                    </button>
                    <span className="table-subtitle">
                      {dateLabel(r.since)} – {dateLabel(r.until, true)}
                    </span>
                  </td>
                  <td>{money(r.spend, r.currency)}</td>
                  <td>{count(r.impressions)}</td>
                  <td>{count(r.reach)}</td>
                  <td>{count(r.link_clicks)}</td>
                  <td>{costPer(r.spend, r.link_clicks, r.currency)}</td>
                  <td>{outcomes.length ? outcomes.map((o) => `${o.label}: ${count(o.value)}`).join(" · ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** On a client's page: which Facebook Page(s) and campaigns belong to this client in Meta. */
export function BusinessMetaPanel({
  business,
  meta,
  onMapPage,
  onAssign,
  onOpenMeta,
}: {
  business: Business;
  meta: MetaData;
  onMapPage: (pageId: string, businessId: string | null) => Promise<void>;
  onAssign: (adIds: string[], businessId: string | null) => Promise<void>;
  onOpenMeta: () => void;
}) {
  const [pagePick, setPagePick] = useState("");
  const [campaignPick, setCampaignPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!meta.account)
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Meta (Facebook & Instagram)</h2>
            <p>Σύνδεσε πρώτα τον διαφημιστικό λογαριασμό Meta.</p>
          </div>
          <button className="text-action" onClick={onOpenMeta}>
            Ρυθμίσεις Meta
          </button>
        </div>
      </section>
    );
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ads = meta.ads.filter((a) => a.account_id === meta.account!.ad_account_id);
  const ownPages = meta.pages.filter((p) => p.business_id === business.id);
  const freePages = meta.pages.filter((p) => !p.business_id);
  const otherPages = meta.pages.filter((p) => p.business_id && p.business_id !== business.id);
  const campaigns = new Map<string, { name: string; ads: MetaAd[] }>();
  for (const a of ads) {
    const id = a.campaign_id || `ad:${a.ad_id}`;
    const c = campaigns.get(id) || { name: a.campaign_name || a.name, ads: [] };
    c.ads.push(a);
    campaigns.set(id, c);
  }
  const ownCampaigns = [...campaigns.entries()].filter(([, c]) => c.ads.some((a) => a.business_id === business.id));
  const openCampaigns = [...campaigns.entries()].filter(([, c]) => c.ads.every((a) => a.business_id !== business.id));
  const pageOfAds = (list: MetaAd[]) => {
    const id = list.find((a) => a.page_id)?.page_id;
    return id ? pageName(meta.pages.find((p) => p.page_id === id), id) : null;
  };
  return (
    <section className="panel business-meta">
      <div className="section-heading">
        <div>
          <h2>Meta (Facebook & Instagram)</h2>
          <p>Ποια σελίδα και ποιες καμπάνιες της Meta ανήκουν σε αυτόν τον πελάτη.</p>
        </div>
      </div>
      <div className="business-meta-body">
        <div>
          <h4>Σελίδα Facebook του πελάτη</h4>
          <p className="meta-note">Οι νέες διαφημίσεις αυτής της σελίδας θα αντιστοιχίζονται αυτόματα σε αυτόν τον πελάτη.</p>
          <ul className="meta-links">
            {ownPages.map((p) => (
              <li key={p.page_id}>
                <span className="meta-level">Σελίδα</span>
                {pageName(p)}
                <button className="icon-button" aria-label="Αφαίρεση σελίδας" disabled={busy} onClick={() => run(() => onMapPage(p.page_id, null))}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          {meta.pages.length === 0 ? (
            <p className="meta-note">Οι σελίδες εμφανίζονται μετά τον πρώτο συγχρονισμό.</p>
          ) : (
            <div className="meta-link-form">
              <select aria-label="Σελίδα Facebook" value={pagePick} onChange={(e) => setPagePick(e.target.value)}>
                <option value="">Διάλεξε σελίδα…</option>
                {freePages.length > 0 && (
                  <optgroup label="Χωρίς πελάτη">
                    {freePages.map((p) => (
                      <option key={p.page_id} value={p.page_id}>
                        {pageName(p)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherPages.length > 0 && (
                  <optgroup label="Σε άλλον πελάτη (θα μεταφερθεί)">
                    {otherPages.map((p) => (
                      <option key={p.page_id} value={p.page_id}>
                        {pageName(p)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                className="button primary small"
                disabled={!pagePick || busy}
                onClick={() =>
                  run(async () => {
                    await onMapPage(pagePick, business.id);
                    setPagePick("");
                  })
                }
              >
                <Link2 size={14} /> Αντιστοίχιση
              </button>
            </div>
          )}
        </div>
        <div>
          <h4>Καμπάνιες του πελάτη</h4>
          {ownCampaigns.length ? (
            <ul className="meta-links">
              {ownCampaigns.map(([id, c]) => (
                <li key={id} title={pageOfAds(c.ads) || undefined}>
                  <span className="meta-level">Καμπάνια</span>
                  {c.name}
                  <button
                    className="icon-button"
                    aria-label="Αφαίρεση καμπάνιας από τον πελάτη"
                    disabled={busy}
                    onClick={() => run(() => onAssign(c.ads.filter((a) => a.business_id === business.id).map((a) => a.ad_id), null))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta-note">Δεν υπάρχουν ακόμη καμπάνιες για αυτόν τον πελάτη.</p>
          )}
          {openCampaigns.length > 0 && (
            <div className="meta-link-form">
              <select aria-label="Καμπάνια Meta" value={campaignPick} onChange={(e) => setCampaignPick(e.target.value)}>
                <option value="">Πρόσθεσε καμπάνια…</option>
                {openCampaigns.map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.name}
                    {c.ads[0].review_state === "new" ? " · νέα" : c.ads[0].business_id ? " · σε άλλον πελάτη" : ""}
                    {pageOfAds(c.ads) ? ` · ${pageOfAds(c.ads)}` : ""}
                  </option>
                ))}
              </select>
              <button
                className="button primary small"
                disabled={!campaignPick || busy}
                onClick={() =>
                  run(async () => {
                    await onAssign(campaigns.get(campaignPick)!.ads.map((a) => a.ad_id), business.id);
                    setCampaignPick("");
                  })
                }
              >
                <Link2 size={14} /> Προσθήκη
              </button>
            </div>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </section>
  );
}
