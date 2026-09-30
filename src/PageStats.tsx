import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import type { Business } from "./domain";
import { change, count, dateTimeLabel, pageName, type MetaData, type MetaPage, type PageMonth } from "./meta";

type Platform = "facebook" | "instagram";
type Metric = "followers" | "new_followers" | "views" | "reach" | "engagements";
const labels: Record<Metric, string> = {
  followers: "Ακόλουθοι",
  new_followers: "Νέοι ακόλουθοι",
  views: "Προβολές",
  reach: "Απήχηση",
  engagements: "Αλληλεπιδράσεις",
};
const hints: Record<Metric, string> = {
  followers: "Σύνολο ακολούθων στο τέλος του μήνα (για τον τρέχοντα μήνα: σήμερα).",
  new_followers: "Όσοι άρχισαν να ακολουθούν μέσα στον μήνα.",
  views: "Πόσες φορές προβλήθηκε το περιεχόμενο της σελίδας.",
  reach: "Μοναδικοί λογαριασμοί που είδαν περιεχόμενο (έως 30 ημέρες του μήνα).",
  engagements: "Αντιδράσεις, σχόλια, κοινοποιήσεις, αποθηκεύσεις και κλικ.",
};
const monthLabel = (m: string, long = false) =>
  new Intl.DateTimeFormat("el-GR", { month: long ? "long" : "short", year: long ? "numeric" : undefined }).format(
    new Date(`${m}T12:00:00`),
  );

export default function PageStatsPanel({ business, meta }: { business: Business; meta: MetaData }) {
  const pages = meta.pages.filter((p) => p.business_id === business.id);
  if (!meta.accounts.length || !pages.length) return null;
  return (
    <section className="panel page-stats">
      <div className="section-heading">
        <div>
          <h2>Στατιστικά σελίδας</h2>
          <p>Η οργανική πορεία της σελίδας Facebook και του Instagram του πελάτη, ανά μήνα. Ενημερώνονται σε κάθε συγχρονισμό.</p>
        </div>
      </div>
      {pages.map((p) => (
        <PageBlock key={p.page_id} page={p} rows={(meta.pageStats || []).filter((r) => r.page_id === p.page_id)} />
      ))}
    </section>
  );
}

function PageBlock({ page, rows }: { page: MetaPage; rows: PageMonth[] }) {
  const hasIg = rows.some((r) => r.platform === "instagram");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const shown: Platform = platform === "instagram" && !hasIg ? "facebook" : platform;
  const list = useMemo(
    () => rows.filter((r) => r.platform === shown).sort((a, b) => a.month.localeCompare(b.month)),
    [rows, shown],
  );
  const [pick, setPick] = useState<string | null>(null);
  const month = list.find((r) => r.month === pick) || list[list.length - 1];
  const previous = month ? list[list.indexOf(month) - 1] : undefined;
  const metrics: Metric[] =
    shown === "instagram" ? ["followers", "new_followers", "reach", "views", "engagements"] : ["followers", "new_followers", "views", "engagements"];

  return (
    <div className="page-stats-block">
      <div className="page-stats-head">
        <div>
          <strong>{pageName(page)}</strong>
          {page.instagram_username && <span className="page-stats-ig">@{page.instagram_username}</span>}
        </div>
        {rows.length > 0 && (
          <div className="segmented small" role="radiogroup" aria-label="Πλατφόρμα">
            <button role="radio" aria-checked={shown === "facebook"} className={shown === "facebook" ? "on" : ""} onClick={() => setPlatform("facebook")}>
              Facebook
            </button>
            {hasIg && (
              <button role="radio" aria-checked={shown === "instagram"} className={shown === "instagram" ? "on" : ""} onClick={() => setPlatform("instagram")}>
                Instagram
              </button>
            )}
          </div>
        )}
      </div>

      {page.insights_status === "no_access" ? (
        <div className="page-stats-note">
          <CircleAlert size={16} />
          <div>
            <strong>Δεν υπάρχει ακόμη πρόσβαση στα στατιστικά αυτής της σελίδας.</strong>
            <span>
              Στο Business Settings δώσε στον system user του WebTag πρόσβαση στη σελίδα (και στον λογαριασμό Instagram της), και
              βγάλε ξανά το token με τις άδειες pages_read_engagement, read_insights, instagram_basic και instagram_manage_insights.
            </span>
            {page.insights_error && <small>Μήνυμα Meta: {page.insights_error}</small>}
          </div>
        </div>
      ) : !list.length ? (
        <p className="meta-note">Τα στατιστικά της σελίδας θα εμφανιστούν μετά τον επόμενο συγχρονισμό.</p>
      ) : (
        <>
          <div className="page-stats-months" role="radiogroup" aria-label="Μήνας">
            {list.map((r) => (
              <button
                key={r.month}
                role="radio"
                aria-checked={r.month === month?.month}
                className={`chip ${r.month === month?.month ? "on" : ""}`}
                onClick={() => setPick(r.month)}
              >
                {monthLabel(r.month)}
              </button>
            ))}
          </div>
          {month && (
            <div className="page-stats-kpis">
              {metrics.map((m) => {
                const value = month[m];
                const delta = m === "followers" ? null : change(value, previous ? previous[m] : null);
                return (
                  <div className="page-kpi" key={m} title={hints[m]}>
                    <span>{labels[m]}</span>
                    <strong>{value === null ? "—" : count(value)}</strong>
                    {delta !== null && (
                      <small className={delta >= 0 ? "up" : "down"}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% από {monthLabel(previous!.month)}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="page-stats-charts">
            <MonthBars title="Προβολές ανά μήνα" rows={list} metric="views" selected={month?.month} onPick={setPick} />
            <MonthBars title="Αλληλεπιδράσεις ανά μήνα" rows={list} metric="engagements" selected={month?.month} onPick={setPick} />
          </div>
          <small className="page-stats-updated">
            {monthLabel(month!.month, true)}
            {month!.month === list[list.length - 1].month && month!.month.slice(0, 7) === new Date().toISOString().slice(0, 7)
              ? " (σε εξέλιξη: η σύγκριση αφορά τις ημέρες μέχρι σήμερα)"
              : ""}{" "}
            · ενημέρωση {dateTimeLabel(month!.fetched_at)}
          </small>
        </>
      )}
    </div>
  );
}

// One measure, one hue, bars from a zero baseline; the value of each month on hover/focus.
function MonthBars({
  title,
  rows,
  metric,
  selected,
  onPick,
}: {
  title: string;
  rows: PageMonth[];
  metric: Metric;
  selected?: string;
  onPick: (m: string) => void;
}) {
  const values = rows.map((r) => r[metric]);
  if (values.every((v) => v === null)) return null;
  const max = Math.max(1, ...values.map((v) => v || 0));
  return (
    <figure className="month-bars">
      <figcaption>{title}</figcaption>
      <div className="month-bars-plot">
        {rows.map((r) => {
          const v = r[metric];
          const text = `${monthLabel(r.month, true)}: ${v === null ? "χωρίς στοιχεία" : count(v)}`;
          return (
            <button
              key={r.month}
              className={`month-bar ${r.month === selected ? "on" : ""}`}
              aria-label={text}
              onClick={() => onPick(r.month)}
            >
              <span className="month-bar-tip">{text}</span>
              <span className="month-bar-fill" style={{ height: v === null ? 0 : `${Math.max(2, (v / max) * 100)}%` }} />
              <span className="month-bar-label">{monthLabel(r.month)}</span>
            </button>
          );
        })}
      </div>
    </figure>
  );
}
