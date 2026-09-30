import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import {
  actions,
  addDays,
  dateLabel,
  formatCost,
  relativeDay,
  type Data,
  type Promotion,
} from "./domain";
import { Avatar, Empty, KindPill, useLabel } from "./ui";

type View = "day" | "week" | "month";
type CalEvent = { promotion: Promotion; date: string; type: "publish" | "end" | "renew"; label: string };
const viewLabels: Record<View, string> = { day: "Ημέρα", week: "Εβδομάδα", month: "Μήνας" };
const WEEKDAYS = ["ΔΕΥ", "ΤΡΙ", "ΤΕΤ", "ΠΕΜ", "ΠΑΡ", "ΣΑΒ", "ΚΥΡ"];

const at = (iso: string) => new Date(`${iso}T12:00:00`);
/** Monday of the week that contains the date. */
const weekStart = (iso: string) => addDays(iso, -((at(iso).getDay() + 6) % 7));
function addMonths(iso: string, amount: number) {
  const d = at(`${iso.slice(0, 7)}-01`);
  d.setMonth(d.getMonth() + amount);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("el-GR", o).format(at(iso));

export default function Schedule({
  data,
  today,
  onOpen,
  onNew,
  onAction,
}: {
  data: Data;
  today: string;
  onOpen: (p: Promotion) => void;
  onNew: () => void;
  onAction: (p: Promotion, type: "publish" | "renew") => void;
}) {
  const { label } = useLabel();
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem("webtag-calendar-view");
      return v === "day" || v === "week" || v === "month" ? v : "month";
    } catch {
      return "month";
    }
  });
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);
  const changeView = (v: View) => {
    setView(v);
    if (selected) setAnchor(selected);
    try {
      localStorage.setItem("webtag-calendar-view", v);
    } catch {
      /* not available */
    }
  };
  const move = (amount: number) => {
    setAnchor((a) => (view === "month" ? addMonths(a, amount) : addDays(a, view === "week" ? 7 * amount : amount)));
    setSelected(null);
  };
  const openDay = (date: string) => {
    setAnchor(date);
    setSelected(date);
    changeView("day");
  };

  const business = (p: Promotion) => data.businesses.find((b) => b.id === p.business_id);
  const pending = actions(data.promotions);
  const live = data.promotions.filter((p) => p.status !== "cancelled");
  const events: CalEvent[] = live.flatMap((p) => [
    { promotion: p, date: p.published_on || p.starts_on, type: "publish" as const, label: p.kind === "post" ? "Δημοσίευση" : p.published_on ? "Έναρξη" : "Προγραμματισμός" },
    { promotion: p, date: p.ends_on, type: "end" as const, label: "Λήξη" },
    ...pending
      .filter((a) => a.promotion.id === p.id && a.type === "renew")
      .map((a) => ({ promotion: p, date: a.date, type: "renew" as const, label: "Ανανέωση" })),
  ]);
  const eventsOn = (date: string) =>
    events.filter((e) => e.date === date && !(e.type === "end" && e.promotion.starts_on === e.promotion.ends_on));
  /** Ads that are running that day (without a start/end on that very day). */
  const runningOn = (date: string) =>
    live.filter(
      (p) => p.kind === "ads" && p.starts_on <= date && p.ends_on >= date && !eventsOn(date).some((e) => e.promotion.id === p.id),
    );

  const monthFirst = `${anchor.slice(0, 7)}-01`;
  const title =
    view === "month"
      ? fmt(monthFirst, { month: "long", year: "numeric" })
      : view === "week"
        ? `${fmt(weekStart(anchor), { day: "numeric", month: "short" })} – ${fmt(addDays(weekStart(anchor), 6), { day: "numeric", month: "short", year: "numeric" })}`
        : fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const unit = view === "month" ? "μήνας" : view === "week" ? "εβδομάδα" : "ημέρα";

  const eventButton = (e: CalEvent) => (
    <button
      key={e.promotion.id + e.type}
      className={`calendar-event ${e.type}`}
      title={`${e.label}: ${business(e.promotion)?.name || ""} · ${label(e.promotion)}`}
      onClick={() => onOpen(e.promotion)}
    >
      {e.label}: {business(e.promotion)?.name}
    </button>
  );

  const agenda = selected ? pending.filter((a) => a.date === selected) : pending;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ΚΑΘΕ ΚΙΝΗΣΗ ΣΤΗΝ ΩΡΑ ΤΗΣ</div>
          <h1>
            Το πρόγραμμά σου<span className="purple-text">.</span>
          </h1>
          <p>Δημοσιεύσεις, διαφημίσεις σε εξέλιξη, λήξεις και οι επόμενες προωθήσεις.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={18} />
          Νέα προώθηση
        </button>
      </div>
      <section className="panel">
        <div className="schedule-heading">
          <h2>{title}</h2>
          <div className="calendar-actions">
            <div className="segmented small" role="radiogroup" aria-label="Προβολή ημερολογίου">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button key={v} role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => changeView(v)}>
                  {viewLabels[v]}
                </button>
              ))}
            </div>
            <button
              className="button secondary small"
              onClick={() => {
                setAnchor(today);
                setSelected(today);
              }}
            >
              Σήμερα
            </button>
            <button className="icon-button bordered" onClick={() => move(-1)} aria-label={`Προηγούμενη ${unit}`}>
              <ArrowLeft size={15} />
            </button>
            <button className="icon-button bordered" onClick={() => move(1)} aria-label={`Επόμενη ${unit}`}>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {view === "month" && (
          <div className="calendar-grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="calendar-weekday">
                {d}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const date = addDays(weekStart(monthFirst), i);
              const running = runningOn(date).length;
              return (
                <div
                  key={date}
                  className={`calendar-day ${date.slice(0, 7) !== monthFirst.slice(0, 7) ? "outside" : ""} ${date === today ? "today" : ""} ${selected === date ? "selected-day" : ""}`}
                >
                  <button className="day-label" aria-label={`Ενέργειες ${dateLabel(date, true)}`} onClick={() => setSelected(date)}>
                    {Number(date.slice(-2))}
                  </button>
                  {eventsOn(date).map(eventButton)}
                  {running > 0 && (
                    <button className="calendar-running-count" onClick={() => openDay(date)} title="Προβολή ημέρας">
                      {running} σε εξέλιξη
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === "week" && (
          <div className="calendar-grid week">
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(weekStart(anchor), i);
              return (
                <button key={date} className={`calendar-weekday week-head ${date === today ? "today" : ""}`} onClick={() => openDay(date)}>
                  {WEEKDAYS[i]} <strong>{Number(date.slice(-2))}</strong>
                </button>
              );
            })}
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(weekStart(anchor), i);
              return (
                <div
                  key={date}
                  data-label={`${WEEKDAYS[i]} ${Number(date.slice(-2))}`}
                  className={`calendar-day week-day ${date === today ? "today" : ""}`}
                >
                  {eventsOn(date).map(eventButton)}
                  {runningOn(date).map((p) => (
                    <button
                      key={p.id}
                      className="calendar-event running"
                      title={`Σε εξέλιξη: ${business(p)?.name || ""} · ${label(p)}`}
                      onClick={() => onOpen(p)}
                    >
                      {business(p)?.name}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {view === "day" && <DayView date={anchor} today={today} events={eventsOn(anchor)} running={runningOn(anchor)} business={business} label={label} onOpen={onOpen} />}

        <div className="calendar-legend">
          <span>
            <i className="legend-dot publish" />
            Έναρξη / προγραμματισμός
          </span>
          <span>
            <i className="legend-dot running" />
            Διαφήμιση σε εξέλιξη
          </span>
          <span>
            <i className="legend-dot end" />
            Λήξη
          </span>
          <span>
            <i className="legend-dot" />
            Νέα προώθηση
          </span>
        </div>
      </section>
      <section className="panel agenda-section">
        <div className="section-heading">
          <div>
            <h2>{selected ? `Ενέργειες · ${dateLabel(selected, true)}` : "Όλες οι επόμενες ενέργειες"}</h2>
            <p>Οι εκκρεμότητες παραμένουν μέχρι να τις τακτοποιήσεις.</p>
          </div>
          {selected && (
            <button className="text-action" onClick={() => setSelected(null)}>
              Προβολή όλων
            </button>
          )}
        </div>
        {agenda.length ? (
          agenda.map((a) => (
            <div className="agenda-row" key={a.promotion.id + a.type}>
              <div className="agenda-date">{dateLabel(a.date)}</div>
              <Avatar business={business(a.promotion)} />
              <div className="agenda-content">
                <strong>{business(a.promotion)?.name}</strong>
                <span>
                  {a.type === "renew" ? "Ετοιμασία νέας προώθησης" : "Δημοσίευση"} · {label(a.promotion)}
                </span>
              </div>
              <span className={`due-label ${a.date < today ? "late" : ""}`}>{relativeDay(a.date, today)}</span>
              <button className="button secondary small" onClick={() => onAction(a.promotion, a.type)}>
                {a.type === "renew" ? "Νέα προώθηση" : "Δημοσιεύτηκε"}
              </button>
            </div>
          ))
        ) : (
          <Empty title="Καμία εκκρεμότητα εδώ." />
        )}
      </section>
    </>
  );
}

function DayView({
  date,
  today,
  events,
  running,
  business,
  label,
  onOpen,
}: {
  date: string;
  today: string;
  events: CalEvent[];
  running: Promotion[];
  business: (p: Promotion) => Data["businesses"][number] | undefined;
  label: (p: Promotion) => string;
  onOpen: (p: Promotion) => void;
}) {
  const row = (p: Promotion, tag: string, type: string) => (
    <button key={p.id + type} className="day-row" onClick={() => onOpen(p)}>
      <span className={`day-tag ${type}`}>{tag}</span>
      <Avatar business={business(p)} />
      <span className="day-row-main">
        <strong>{business(p)?.name || "Επιχείρηση"}</strong>
        <span>
          {label(p)} · {dateLabel(p.starts_on)} – {dateLabel(p.ends_on, true)}
        </span>
      </span>
      <KindPill kind={p.kind} />
      {p.meta_campaign_id && <span className="kind-pill meta">Meta</span>}
      <span className="day-row-cost">{formatCost(p.cost)}</span>
    </button>
  );
  if (!events.length && !running.length)
    return (
      <div className="day-view">
        <Empty title={date === today ? "Τίποτα προγραμματισμένο για σήμερα." : "Τίποτα προγραμματισμένο αυτή την ημέρα."} />
      </div>
    );
  return (
    <div className="day-view">
      {events.length > 0 && (
        <>
          <h4>Ενέργειες της ημέρας</h4>
          {events.map((e) => row(e.promotion, e.label, e.type))}
        </>
      )}
      {running.length > 0 && (
        <>
          <h4>Σε εξέλιξη ({running.length})</h4>
          {running.map((p) => row(p, "Σε εξέλιξη", "running"))}
        </>
      )}
    </div>
  );
}
