import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import {
  addDays,
  channels,
  validatePromotion,
  type Business,
  type Promotion,
  type PromotionStatus,
  type Channel,
} from "./domain";

export function Modal({
  title,
  description,
  onClose,
  children,
  busy = false,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Κλείσιμο"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function BusinessForm({
  initial,
  userId,
  onSave,
  onClose,
}: {
  initial?: Business;
  userId: string;
  onSave: (b: Business) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState(
    () =>
      initial || {
        id: crypto.randomUUID(),
        user_id: userId,
        name: "",
        contact_name: "",
        phone: "",
        email: "",
        notes: "",
        created_at: new Date().toISOString(),
      },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof Business, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!values.name.trim()) {
      setError("Συμπλήρωσε την επωνυμία της επιχείρησης.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        email: values.email.trim(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial ? "Επεξεργασία επιχείρησης" : "Νέα επιχείρηση"}
      description="Τα στοιχεία του πελάτη σου, συγκεντρωμένα."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field full">
            Επωνυμία επιχείρησης *
            <input
              required
              maxLength={150}
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="π.χ. Olive & Thyme"
              autoComplete="organization"
            />
          </label>
          <label className="field full">
            Υπεύθυνος επικοινωνίας
            <input
              maxLength={150}
              value={values.contact_name}
              onChange={(e) => update("contact_name", e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="field">
            Τηλέφωνο
            <input
              type="tel"
              maxLength={40}
              value={values.phone}
              onChange={(e) => update("phone", e.target.value)}
              autoComplete="tel"
            />
          </label>
          <label className="field">
            Email
            <input
              type="email"
              maxLength={250}
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="field full">
            Σημειώσεις
            <textarea
              maxLength={10000}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Ό,τι χρειάζεται να θυμάσαι για τη συνεργασία σας."
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Άκυρο
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Αποθήκευση…" : "Αποθήκευση επιχείρησης"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PromotionForm({
  initial,
  previous,
  businessId,
  businesses,
  userId,
  today,
  onSave,
  onClose,
}: {
  initial?: Promotion;
  previous?: Promotion;
  businessId?: string;
  businesses: Business[];
  userId: string;
  today: string;
  onSave: (p: Promotion) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Promotion>(() => {
    const start = previous
      ? previous.next_action_on && previous.next_action_on > today
        ? previous.next_action_on
        : today
      : today;
    return (
      initial || {
        id: crypto.randomUUID(),
        user_id: userId,
        business_id: previous?.business_id || businessId || "",
        title: "",
        channel: previous?.channel || "Facebook + Instagram",
        starts_on: start,
        ends_on: addDays(start, 14),
        next_action_on: null,
        published_on: null,
        status: "scheduled",
        notes: "",
        previous_promotion_id: previous?.id || null,
        created_at: new Date().toISOString(),
      }
    );
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof Promotion, value: string | null) =>
    setValues((v) => ({ ...v, [key]: value }));
  const statusChange = (status: PromotionStatus) =>
    setValues((v) => ({
      ...v,
      status,
      published_on:
        status === "scheduled"
          ? null
          : status === "cancelled"
            ? v.published_on
            : v.published_on || today,
    }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const issue = validatePromotion(values, today);
    if (issue) {
      setError(issue);
      return;
    }
    if (!businesses.some((b) => b.id === values.business_id)) {
      setError("Επίλεξε μία διαθέσιμη επιχείρηση.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ ...values, title: values.title.trim() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        initial
          ? "Επεξεργασία προώθησης"
          : previous
            ? "Η επόμενη προώθηση"
            : "Νέα προώθηση"
      }
      description={
        previous
          ? `Συνέχεια της προώθησης «${previous.title}». Το ιστορικό της παραμένει.`
          : "Οργάνωσε τη δημοσίευση, τη λήξη και το επόμενο βήμα."
      }
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field full">
            Επιχείρηση *
            <select
              required
              disabled={!!values.previous_promotion_id}
              value={values.business_id}
              onChange={(e) => update("business_id", e.target.value)}
            >
              <option value="">Επίλεξε επιχείρηση</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field full">
            Τίτλος προώθησης *
            <input
              required
              maxLength={200}
              value={values.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="π.χ. Προσφορά Οκτωβρίου"
            />
          </label>
          <label className="field">
            Κανάλι *
            <select
              value={values.channel}
              onChange={(e) => update("channel", e.target.value as Channel)}
            >
              {channels.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Κατάσταση *
            <select
              value={values.status}
              onChange={(e) => statusChange(e.target.value as PromotionStatus)}
            >
              <option value="scheduled">Προγραμματισμένη</option>
              <option value="published">Δημοσιευμένη</option>
              <option value="completed">Ολοκληρωμένη</option>
              <option value="cancelled">Ακυρωμένη</option>
            </select>
          </label>
          <label className="field">
            Έναρξη προβολής *
            <input
              required
              type="date"
              name="starts_on"
              onInput={(e) => update("starts_on", e.currentTarget.value)}
              value={values.starts_on}
              onChange={(e) => update("starts_on", e.target.value)}
            />
          </label>
          <label className="field">
            Λήξη προβολής *
            <input
              required
              type="date"
              name="ends_on"
              onInput={(e) => update("ends_on", e.currentTarget.value)}
              min={values.starts_on}
              value={values.ends_on}
              onChange={(e) => update("ends_on", e.target.value)}
            />
            <small>Η διαφήμιση υπολογίζεται ενεργή και την ημέρα λήξης.</small>
          </label>
          {values.status !== "scheduled" && (
            <label className="field full">
              Ημερομηνία δημοσίευσης{values.status !== "cancelled" ? " *" : ""}
              <input
                required={values.status !== "cancelled"}
                type="date"
                name="published_on"
                onInput={(e) =>
                  update("published_on", e.currentTarget.value || null)
                }
                max={today}
                value={values.published_on || ""}
                onChange={(e) => update("published_on", e.target.value || null)}
              />
              <small>Πότε ανέβηκε πραγματικά η διαφήμιση.</small>
            </label>
          )}
          <label className="field full">
            Πότε χρειάζεται η επόμενη προώθηση;
            <input
              type="date"
              name="next_action_on"
              onInput={(e) =>
                update("next_action_on", e.currentTarget.value || null)
              }
              min={values.starts_on}
              value={values.next_action_on || ""}
              onChange={(e) => update("next_action_on", e.target.value || null)}
            />
            <small>
              Προαιρετικό. Θα εμφανίζεται στις επόμενες ενέργειες μέχρι να
              καταχωρίσεις την ανανέωση.
            </small>
          </label>
          <label className="field full">
            Σημειώσεις
            <textarea
              maxLength={10000}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Περιεχόμενο, οδηγίες ή αποτελέσματα της προώθησης."
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Άκυρο
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Αποθήκευση…" : "Αποθήκευση προώθησης"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
