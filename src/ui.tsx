import { createContext, useContext } from "react";
import {
  ArrowUpRight,
  MessageCircle,
  Camera,
  BriefcaseBusiness,
  Music2,
  Megaphone,
  Check,
  Clock3,
  X,
} from "lucide-react";
import {
  phase,
  dateLabel,
  type Business,
  type Promotion,
  type Channel,
  formatCost,
  kindLabels,
  type PromotionKind,
} from "./domain";

/** Shows a promotion by its categories (falls back to the old title). Provided by App. */
export const LabelContext = createContext<{
  label: (p: Promotion) => string;
  categories: (p: Promotion) => string[];
  logo: (businessId: string | undefined) => string | undefined;
}>({ label: (p) => p.title, categories: () => [], logo: () => undefined });
export const useLabel = () => useContext(LabelContext);
export function KindPill({ kind }: { kind: PromotionKind }) {
  return <span className={`kind-pill ${kind}`}>{kindLabels[kind]}</span>;
}
export function CategoryChips({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span className="category-chips">
      {names.map((n) => (
        <span className="chip small" key={n}>
          {n}
        </span>
      ))}
    </span>
  );
}

export const labels = {
  scheduled: "Προγραμματισμένη",
  active: "Ενεργή",
  expired: "Έληξε",
  completed: "Ολοκληρωμένη",
  cancelled: "Ακυρωμένη",
};
export function Badge({
  promotion,
  today,
}: {
  promotion: Promotion;
  today: string;
}) {
  const value = phase(promotion, today);
  return (
    <span className={`badge ${value}`}>
      <span className="status-dot" />
      {labels[value]}
    </span>
  );
}
export function Avatar({
  business,
  size = "",
}: {
  business?: Business;
  size?: string;
}) {
  const { logo } = useContext(LabelContext);
  const src = logo(business?.id);
  if (src)
    return (
      <span className={`avatar logo ${size}`} aria-hidden="true">
        <img src={src} alt="" loading="lazy" />
      </span>
    );
  const index =
    [...(business?.name || "A")].reduce((sum, c) => sum + c.charCodeAt(0), 0) %
    5;
  return (
    <span className={`avatar color-${index} ${size}`} aria-hidden="true">
      {business?.name
        .split(/\s+/)
        .filter((x) => x !== "&")
        .slice(0, 2)
        .map((x) => x[0])
        .join("") || "?"}
    </span>
  );
}
export function ChannelIcon({ channel }: { channel: Channel }) {
  const Icon = channel.includes("Instagram")
    ? Camera
    : channel === "Facebook"
      ? MessageCircle
      : channel === "TikTok"
        ? Music2
        : channel === "LinkedIn"
          ? BriefcaseBusiness
          : Megaphone;
  return <Icon size={14} aria-hidden="true" />;
}
export function ChannelPill({ channel }: { channel: Channel }) {
  return (
    <span className="channel">
      <ChannelIcon channel={channel} />
      {channel}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Megaphone size={30} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function PromotionTable({
  promotions,
  businesses,
  today,
  onOpen,
  onBusiness,
}: {
  promotions: Promotion[];
  businesses: Business[];
  today: string;
  onOpen: (p: Promotion) => void;
  onBusiness: (b: Business) => void;
}) {
  const { label, categories } = useLabel();
  if (!promotions.length)
    return (
      <Empty title="Δεν υπάρχουν προωθήσεις εδώ ακόμη.">
        Πρόσθεσε μια προώθηση για να οργανώσεις το πρόγραμμά σου.
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ΕΠΙΧΕΙΡΗΣΗ / ΠΡΟΩΘΗΣΗ</th>
            <th>ΚΑΝΑΛΙ</th>
            <th>ΔΙΑΡΚΕΙΑ</th>
            <th>ΚΟΣΤΟΣ</th>
            <th>ΚΑΤΑΣΤΑΣΗ</th>
            <th>
              <span className="sr-only">Άνοιγμα</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((p) => {
            const business = businesses.find((b) => b.id === p.business_id);
            return (
              <tr key={p.id}>
                <td>
                  <div className="business-cell">
                    <button
                      className="avatar-button"
                      onClick={() => business && onBusiness(business)}
                      aria-label={`Καρτέλα ${business?.name}`}
                    >
                      <Avatar business={business} />
                    </button>
                    <div>
                      <button className="text-link" onClick={() => onOpen(p)}>
                        {business?.name || "Επιχείρηση"}
                      </button>
                      {categories(p).length ? (
                        <CategoryChips names={categories(p)} />
                      ) : (
                        <span className="table-subtitle">{p.title}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="channel-cell">
                    <KindPill kind={p.kind} />
                    <ChannelPill channel={p.channel} />
                  </div>
                </td>
                <td>
                  <span className="date-range">
                    {p.kind === "post"
                      ? dateLabel(p.starts_on)
                      : `${dateLabel(p.starts_on)} — ${dateLabel(p.ends_on)}`}
                  </span>
                  <span className="table-subtitle">
                    {new Date(p.ends_on + "T12:00:00").getFullYear()}
                  </span>
                </td>
                <td className="cost-cell">{formatCost(p.cost)}</td>
                <td>
                  <Badge promotion={p} today={today} />
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Λεπτομέρειες: ${label(p)}`}
                    onClick={() => onOpen(p)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export { Check, Clock3, X };
