import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  Megaphone,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  actions,
  addDays,
  dateLabel,
  phase,
  relativeDay,
  type Business,
  type Data,
  type Promotion,
} from "./domain";
import { Avatar, Empty, PromotionTable, useLabel } from "./ui";

type Props = {
  data: Data;
  today: string;
  onNew: () => void;
  onOpen: (p: Promotion) => void;
  onAction: (p: Promotion, type: "publish" | "renew") => void;
  onBusiness: (b: Business) => void;
  onSchedule: () => void;
  onPromotions: () => void;
};
export default function Dashboard({
  data,
  today,
  onNew,
  onOpen,
  onAction,
  onBusiness,
  onSchedule,
  onPromotions,
}: Props) {
  const { label } = useLabel();
  const active = data.promotions.filter((p) => phase(p, today) === "active");
  const expiring = active.filter((p) => p.ends_on <= addDays(today, 7));
  const pending = actions(data.promotions);
  const overdue = pending.filter((x) => x.date < today);
  const soon = pending.filter(
    (x) => x.date >= today && x.date <= addDays(today, 7),
  );
  const attention = pending
    .filter((x) => x.date <= addDays(today, 7))
    .slice(0, 4);
  const stats = [
    {
      label: "Ενεργές προωθήσεις",
      value: active.length,
      note: "Οι διαφημίσεις που τρέχουν",
      icon: Megaphone,
      color: "purple",
    },
    {
      label: "Λήγουν σύντομα",
      value: expiring.length,
      note: "Μέσα στις επόμενες 7 ημέρες",
      icon: Clock3,
      color: "orange",
    },
    {
      label: "Επόμενες ενέργειες",
      value: soon.length,
      note: "Σήμερα και τις επόμενες 7 ημέρες",
      icon: CalendarDays,
      color: "blue",
    },
    {
      label: "Σε εκκρεμότητα",
      value: overdue.length,
      note: "Πέρασε η ημερομηνία τους",
      icon: CircleAlert,
      color: "red",
    },
  ];
  const weekday = new Intl.DateTimeFormat("el-GR", { weekday: "long" }).format(
    new Date(today + "T12:00:00"),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ΤΟ ΓΡΑΦΕΙΟ ΣΟΥ, ΣΕ ΤΑΞΗ</div>
          <h1>
            Μια ματιά στη μέρα σου<span className="purple-text">.</span>
          </h1>
          <p>Οι προωθήσεις τρέχουν. Εσύ έχεις τον έλεγχο.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={18} />
          Νέα προώθηση
        </button>
      </div>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.color}`}>
                <s.icon size={18} />
              </span>
            </div>
            <strong>{s.value.toString().padStart(2, "0")}</strong>
            <small>{s.note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="panel attention-panel">
          <div className="section-heading">
            <div>
              <h2>
                Χρειάζονται την προσοχή σου{" "}
                <span className="count">
                  {pending.filter((x) => x.date <= addDays(today, 7)).length}
                </span>
              </h2>
              <p>Οι επόμενες κινήσεις, με σειρά προτεραιότητας.</p>
            </div>
            <button className="text-action" onClick={onSchedule}>
              Το πρόγραμμά μου <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="attention-list">
            {attention.length ? (
              attention.map((item) => {
                const b = data.businesses.find(
                  (b) => b.id === item.promotion.business_id,
                );
                return (
                  <div
                    className="attention-row"
                    key={item.promotion.id + item.type}
                  >
                    <Avatar business={b} />
                    <div className="attention-main">
                      <strong>{b?.name}</strong>
                      <span>
                        {item.type === "renew"
                          ? "Ετοιμασία νέας προώθησης"
                          : "Δημοσίευση προώθησης"}{" "}
                        · {item.promotion.channel}
                      </span>
                    </div>
                    <span
                      className={`due-label ${item.date < today ? "late" : item.date === today ? "now" : ""}`}
                    >
                      {relativeDay(item.date, today)}
                    </span>
                    <button
                      className="icon-button bordered"
                      onClick={() => onAction(item.promotion, item.type)}
                      aria-label={`${item.type === "renew" ? "Ανανέωση" : "Δημοσίευση"}: ${label(item.promotion)}`}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                );
              })
            ) : (
              <Empty title="Είσαι σε καλό δρόμο!">
                Δεν υπάρχουν ενέργειες για τις επόμενες 7 ημέρες.
              </Empty>
            )}
          </div>
        </section>
        <aside className="day-card">
          <div className="day-top">
            <span className="eyebrow">ΣΗΜΕΡΑ</span>
            <CalendarDays size={20} />
          </div>
          <div className="day-number">
            {Number(today.slice(-2))}
            <span>
              {dateLabel(today).split(" ").slice(1).join(" ")}
              <br />
              <small>{weekday}</small>
            </span>
          </div>
          <div className="day-rule" />
          <div className="day-summary">
            <span className="day-dot" />
            <span>
              <strong>
                {pending.filter((a) => a.date === today).length} ενέργειες
              </strong>{" "}
              για σήμερα
            </span>
          </div>
          <p>Μια σωστή υπενθύμιση κάνει χώρο για την επόμενη ωραία ιδέα.</p>
          <button onClick={onSchedule}>
            Άνοιγμα προγράμματος <ArrowRight size={17} />
          </button>
          <Sparkles className="day-spark" size={70} strokeWidth={1} />
        </aside>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Στον αέρα τώρα <span className="live-dot" />
            </h2>
            <p>Όλες οι ενεργές διαφημίσεις των πελατών σου.</p>
          </div>
          <button className="text-action" onClick={onPromotions}>
            Όλες οι προωθήσεις <ArrowUpRight size={16} />
          </button>
        </div>
        <PromotionTable
          promotions={active.sort((a, b) => a.ends_on.localeCompare(b.ends_on))}
          businesses={data.businesses}
          today={today}
          onOpen={onOpen}
          onBusiness={onBusiness}
        />
      </section>
      <div className="page-footer">
        <span>Λιγότερο ψάξιμο. Περισσότερη δημιουργία.</span>
        <span>
          WebTag <span className="footer-dot">●</span> Ο δικός σου χώρος
          οργάνωσης
        </span>
      </div>
    </>
  );
}
