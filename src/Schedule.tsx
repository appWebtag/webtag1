import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Plus } from "lucide-react";
import {
  actions,
  addDays,
  dateLabel,
  relativeDay,
  type Data,
  type Promotion,
} from "./domain";
import { Avatar, Empty, useLabel } from "./ui";

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
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const first = `${month}-01`;
  const start = addDays(
    first,
    -((new Date(first + "T12:00:00").getDay() + 6) % 7),
  );
  const changeMonth = (amount: number) => {
    const d = new Date(first + "T12:00:00");
    d.setMonth(d.getMonth() + amount);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelected(null);
  };
  const pending = actions(data.promotions);
  const events = data.promotions
    .filter((p) => p.status !== "cancelled")
    .flatMap((p) => [
      {
        promotion: p,
        date: p.published_on || p.starts_on,
        type: "publish",
        label: p.published_on ? "Δημοσίευση" : "Προγραμματισμός",
      },
      { promotion: p, date: p.ends_on, type: "end", label: "Λήξη" },
      ...pending
        .filter((a) => a.promotion.id === p.id && a.type === "renew")
        .map((a) => ({
          promotion: p,
          date: a.date,
          type: "renew",
          label: "Ανανέωση",
        })),
    ]);
  const agenda = selected
    ? pending.filter((a) => a.date === selected)
    : pending;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ΚΑΘΕ ΚΙΝΗΣΗ ΣΤΗΝ ΩΡΑ ΤΗΣ</div>
          <h1>
            Το πρόγραμμά σου<span className="purple-text">.</span>
          </h1>
          <p>Δημοσιεύσεις, λήξεις και οι επόμενες προωθήσεις.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={18} />
          Νέα προώθηση
        </button>
      </div>
      <section className="panel">
        <div className="schedule-heading">
          <h2>
            {new Intl.DateTimeFormat("el-GR", {
              month: "long",
              year: "numeric",
            }).format(new Date(first + "T12:00:00"))}
          </h2>
          <div className="calendar-actions">
            <button
              className="button secondary small"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              Σήμερα
            </button>
            <button
              className="icon-button bordered"
              onClick={() => changeMonth(-1)}
              aria-label="Προηγούμενος μήνας"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              className="icon-button bordered"
              onClick={() => changeMonth(1)}
              aria-label="Επόμενος μήνας"
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {["ΔΕΥ", "ΤΡΙ", "ΤΕΤ", "ΠΕΜ", "ΠΑΡ", "ΣΑΒ", "ΚΥΡ"].map((d) => (
            <div key={d} className="calendar-weekday">
              {d}
            </div>
          ))}
          {Array.from({ length: 42 }, (_, i) => {
            const date = addDays(start, i);
            return (
              <div
                key={date}
                className={`calendar-day ${date.slice(0, 7) !== month ? "outside" : ""} ${date === today ? "today" : ""} ${selected === date ? "selected-day" : ""}`}
              >
                <button
                  className="day-label"
                  aria-label={`Ενέργειες ${dateLabel(date, true)}`}
                  onClick={() => setSelected(date)}
                >
                  {Number(date.slice(-2))}
                </button>
                {events
                  .filter((e) => e.date === date)
                  .map((e) => (
                    <button
                      key={e.promotion.id + e.type}
                      className={`calendar-event ${e.type}`}
                      title={`${e.label}: ${label(e.promotion)}`}
                      onClick={() => onOpen(e.promotion)}
                    >
                      {e.label}:{" "}
                      {
                        data.businesses.find(
                          (b) => b.id === e.promotion.business_id,
                        )?.name
                      }
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="legend-dot publish" />
            Δημοσίευση / προγραμματισμός
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
            <h2>
              {selected
                ? `Ενέργειες · ${dateLabel(selected, true)}`
                : "Όλες οι επόμενες ενέργειες"}
            </h2>
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
              <Avatar
                business={data.businesses.find(
                  (b) => b.id === a.promotion.business_id,
                )}
              />
              <div className="agenda-content">
                <strong>
                  {
                    data.businesses.find(
                      (b) => b.id === a.promotion.business_id,
                    )?.name
                  }
                </strong>
                <span>
                  {a.type === "renew"
                    ? "Ετοιμασία νέας προώθησης"
                    : "Δημοσίευση"}{" "}
                  · {label(a.promotion)}
                </span>
              </div>
              <span className={`due-label ${a.date < today ? "late" : ""}`}>
                {relativeDay(a.date, today)}
              </span>
              <button
                className="button secondary small"
                onClick={() => onAction(a.promotion, a.type)}
              >
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
