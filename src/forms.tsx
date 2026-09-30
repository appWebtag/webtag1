import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, Plus, X } from "lucide-react";
import { logoToPng } from "./images";
import {
  addDays,
  channels,
  validatePromotion,
  kindLabels,
  type Business,
  type Category,
  type Profile,
  type Promotion,
  type PromotionKind,
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
export function LogoPicker({
  initialUrl,
  onChange,
  hint = "Τετράγωνη εικόνα, ιδανικά με διάφανο φόντο. Αποθηκεύεται ιδιωτικά.",
}: {
  initialUrl?: string;
  onChange: (logo: Blob | null) => void;
  hint?: string;
}) {
  const [preview, setPreview] = useState<string | undefined>(initialUrl);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const pick = async (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Διάλεξε εικόνα PNG, JPG, WEBP ή SVG έως 8 MB.");
      return;
    }
    try {
      const png = await logoToPng(file);
      onChange(png);
      setPreview(URL.createObjectURL(png));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="logo-field">
        <div className="logo-preview">
          {preview ? <img src={preview} alt="Logo" /> : <span>Χωρίς logo</span>}
        </div>
        <div className="logo-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="button secondary small" onClick={() => fileRef.current?.click()}>
            {preview ? "Αλλαγή logo" : "Επιλογή logo"}
          </button>
          {preview && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                onChange(null);
                setPreview(undefined);
              }}
            >
              Αφαίρεση
            </button>
          )}
          <small>{hint}</small>
        </div>
      </div>
      {error && <small className="form-error">{error}</small>}
    </>
  );
}
export function ProfileForm({
  initial,
  userId,
  loginEmail,
  logoUrl,
  onSave,
  onClose,
}: {
  initial: Profile | null;
  userId: string;
  loginEmail: string;
  logoUrl?: string;
  onSave: (p: Profile, logo?: Blob | null) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Profile>(
    () =>
      initial || {
        user_id: userId,
        full_name: "",
        company_name: "",
        phone: "",
        email: loginEmail,
        website: "",
        address: "",
        vat_number: "",
        logo_path: null,
      },
  );
  const [logo, setLogo] = useState<Blob | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof Profile, value: string) => setValues((v) => ({ ...v, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const trimmed = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
      ) as unknown as Profile;
      await onSave(trimmed, logo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fields: [keyof Profile, string, string, string?][] = [
    ["full_name", "Ονοματεπώνυμο", "name"],
    ["company_name", "Επωνυμία", "organization"],
    ["phone", "Τηλέφωνο", "tel", "tel"],
    ["email", "Email επικοινωνίας", "email", "email"],
    ["website", "Ιστοσελίδα", "url", "url"],
    ["vat_number", "ΑΦΜ", "off"],
  ];
  return (
    <Modal title="Ο λογαριασμός μου" description={`Σύνδεση ως ${loginEmail}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <span>Logo</span>
            <LogoPicker initialUrl={logoUrl} onChange={setLogo} hint="Εμφανίζεται στο μενού και στις αναφορές PDF. Αποθηκεύεται ιδιωτικά." />
          </div>
          {fields.map(([key, label, auto, type]) => (
            <label className="field" key={key}>
              {label}
              <input
                type={type || "text"}
                autoComplete={auto}
                maxLength={key === "vat_number" ? 30 : key === "phone" ? 40 : 250}
                value={(values[key] as string) || ""}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
          <label className="field full">
            Διεύθυνση
            <input maxLength={300} autoComplete="street-address" value={values.address} onChange={(e) => update("address", e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            Άκυρο
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Αποθήκευση…" : "Αποθήκευση στοιχείων"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function BusinessForm({
  initial,
  userId,
  logoUrl,
  onSave,
  onClose,
}: {
  initial?: Business;
  userId: string;
  logoUrl?: string;
  /** logo: undefined = unchanged, null = remove, Blob = new PNG */
  onSave: (b: Business, logo?: Blob | null) => Promise<void>;
  onClose: () => void;
}) {
  const [logo, setLogo] = useState<Blob | null | undefined>(undefined);
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
      await onSave(
        {
          ...values,
          name: values.name.trim(),
          email: values.email.trim(),
        },
        logo,
      );
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
          <div className="field full">
            <span>Logo</span>
            <LogoPicker initialUrl={logoUrl} onChange={setLogo} />
          </div>
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
export function CategoryPicker({
  categories,
  selected,
  onToggle,
  onCreate,
}: {
  categories: Category[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => Promise<Category>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || busy) return;
    const existing = categories.find(
      (c) => c.name.trim().toLocaleLowerCase("el") === clean.toLocaleLowerCase("el"),
    );
    setError("");
    if (existing) {
      if (!selected.includes(existing.id)) onToggle(existing.id);
      setName("");
      return;
    }
    setBusy(true);
    try {
      const created = await onCreate(clean);
      onToggle(created.id);
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, "el"));
  return (
    <div className="category-picker">
      <div className="chip-list" role="group" aria-label="Κατηγορίες">
        {sorted.map((c) => (
          <button
            type="button"
            key={c.id}
            className={`chip ${selected.includes(c.id) ? "on" : ""}`}
            aria-pressed={selected.includes(c.id)}
            onClick={() => onToggle(c.id)}
          >
            {selected.includes(c.id) && <Check size={12} />}
            {c.name}
          </button>
        ))}
        {!sorted.length && <span className="chip-empty">Δεν έχεις φτιάξει ακόμη κατηγορίες.</span>}
      </div>
      <div className="chip-add">
        <input
          maxLength={60}
          value={name}
          placeholder="Νέα κατηγορία, π.χ. Προσφορά"
          aria-label="Όνομα νέας κατηγορίας"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="button secondary small" onClick={add} disabled={!name.trim() || busy}>
          <Plus size={14} />
          {busy ? "Προσθήκη…" : "Προσθήκη"}
        </button>
      </div>
      {error && <small className="form-error">{error}</small>}
    </div>
  );
}
export function PromotionForm({
  initial,
  previous,
  businessId,
  businesses,
  categories,
  initialCategories,
  userId,
  today,
  onSave,
  onCreateCategory,
  onClose,
}: {
  initial?: Promotion;
  previous?: Promotion;
  businessId?: string;
  businesses: Business[];
  categories: Category[];
  initialCategories: string[];
  userId: string;
  today: string;
  onSave: (p: Promotion, categoryIds: string[]) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Promotion>(() => {
    const start = previous
      ? previous.next_action_on && previous.next_action_on > today
        ? previous.next_action_on
        : today
      : today;
    const kind = previous?.kind || "ads";
    return (
      initial || {
        id: crypto.randomUUID(),
        user_id: userId,
        business_id: previous?.business_id || businessId || "",
        title: "",
        channel: previous?.channel || "Facebook + Instagram",
        starts_on: kind === "post" ? today : start,
        ends_on: kind === "post" ? today : addDays(start, 14),
        next_action_on: null,
        published_on: kind === "post" ? today : null,
        status: kind === "post" ? "completed" : "scheduled",
        notes: "",
        previous_promotion_id: previous?.id || null,
        created_at: new Date().toISOString(),
        kind,
        cost: null,
      }
    );
  });
  const [selected, setSelected] = useState<string[]>(initialCategories);
  const [costText, setCostText] = useState(
    initial?.cost !== null && initial?.cost !== undefined ? String(initial.cost).replace(".", ",") : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isPost = values.kind === "post";
  const update = (key: keyof Promotion, value: string | null) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setKind = (kind: PromotionKind) =>
    setValues((v) => {
      if (kind === v.kind) return v;
      if (kind === "post") {
        const day = v.published_on && v.published_on <= today ? v.published_on : today;
        return { ...v, kind, status: "completed", published_on: day, starts_on: day, ends_on: day };
      }
      const start = initial && initial.kind === "ads" ? initial.starts_on : today;
      const end = initial && initial.kind === "ads" ? initial.ends_on : addDays(today, 14);
      return {
        ...v,
        kind,
        status: initial && initial.kind === "ads" ? initial.status : "scheduled",
        published_on: initial && initial.kind === "ads" ? initial.published_on : null,
        starts_on: start,
        ends_on: end,
      };
    });
  const setPostDay = (day: string) =>
    setValues((v) => ({ ...v, published_on: day || null, starts_on: day, ends_on: day }));
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
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const names = categories
      .filter((c) => selected.includes(c.id))
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b, "el"));
    const rawCost = costText.trim().replace(/\s|€/g, "").replace(",", ".");
    const cost = rawCost === "" ? null : Number(rawCost);
    if (cost !== null && (!/^\d+(\.\d{1,2})?$/.test(rawCost) || !Number.isFinite(cost))) {
      setError("Γράψε το κόστος ως ποσό, π.χ. 45 ή 45,50.");
      return;
    }
    const candidate: Promotion = {
      ...values,
      title: names.join(" · ").slice(0, 200),
      cost,
    };
    const issue = validatePromotion(candidate, today);
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
      await onSave(candidate, selected);
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
          ? "Συνέχεια της προηγούμενης προώθησης. Το ιστορικό της παραμένει."
          : "Κατηγορίες, είδος, κόστος και ημερομηνίες."
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
          <div className="field full">
            <span>Κατηγορίες * <small>(μία ή περισσότερες)</small></span>
            <CategoryPicker
              categories={categories}
              selected={selected}
              onToggle={toggle}
              onCreate={onCreateCategory}
            />
            {initial && !initialCategories.length && initial.title && (
              <small>Παλιός τίτλος: «{initial.title}». Διάλεξε κατηγορίες για να τον αντικαταστήσεις.</small>
            )}
          </div>
          <div className="field">
            <span>Είδος *</span>
            <div className="segmented" role="radiogroup" aria-label="Είδος">
              {(["post", "ads"] as PromotionKind[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  role="radio"
                  aria-checked={values.kind === k}
                  className={values.kind === k ? "on" : ""}
                  onClick={() => setKind(k)}
                >
                  {kindLabels[k]}
                </button>
              ))}
            </div>
            <small>
              {isPost
                ? "Το post καταχωρίζεται αμέσως ως ολοκληρωμένο."
                : "Διαφήμιση με διάρκεια προβολής."}
            </small>
          </div>
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
            Κόστος διαφήμισης (€)
            <input
              inputMode="decimal"
              value={costText}
              onChange={(e) => setCostText(e.target.value)}
              placeholder="π.χ. 45,50"
            />
            <small>Προαιρετικό.</small>
          </label>
          {isPost ? (
            <label className="field">
              Ημερομηνία δημοσίευσης *
              <input
                required
                type="date"
                name="post_day"
                max={today}
                value={values.published_on || ""}
                onInput={(e) => setPostDay(e.currentTarget.value)}
                onChange={(e) => setPostDay(e.target.value)}
              />
            </label>
          ) : (
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
          )}
          {!isPost && (
            <>
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
            </>
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
