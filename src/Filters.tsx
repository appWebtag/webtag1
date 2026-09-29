import { useState } from "react";
import { Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Modal } from "./forms";
import {
  channels,
  emptyFilters,
  formatCost,
  type Business,
  type Category,
  type CategoryLink,
  type Promotion,
  type PromotionFilters,
} from "./domain";

export function FiltersBar({
  filters,
  onChange,
  categories,
  businesses,
  shown,
}: {
  filters: PromotionFilters;
  onChange: (f: PromotionFilters) => void;
  categories: Category[];
  businesses: Business[];
  shown: Promotion[];
}) {
  const set = <K extends keyof PromotionFilters>(k: K, v: PromotionFilters[K]) => onChange({ ...filters, [k]: v });
  const active =
    filters.kind !== "all" ||
    filters.categories.length > 0 ||
    !!filters.channel ||
    !!filters.business ||
    !!filters.from ||
    !!filters.to;
  const withCost = shown.filter((p) => p.cost !== null);
  const total = withCost.reduce((sum, p) => sum + (p.cost || 0), 0);
  const toggleCategory = (id: string) =>
    set("categories", filters.categories.includes(id) ? filters.categories.filter((x) => x !== id) : [...filters.categories, id]);
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, "el"));
  return (
    <section className="filters-panel" aria-label="Φίλτρα προωθήσεων">
      <div className="filters-row">
        <span className="filters-title">
          <SlidersHorizontal size={15} /> Φίλτρα
        </span>
        <div className="segmented small" role="radiogroup" aria-label="Είδος">
          {(
            [
              ["all", "Όλα"],
              ["post", "Post"],
              ["ads", "Ads"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={filters.kind === v} className={filters.kind === v ? "on" : ""} onClick={() => set("kind", v)}>
              {l}
            </button>
          ))}
        </div>
        <select aria-label="Επιχείρηση" value={filters.business} onChange={(e) => set("business", e.target.value)}>
          <option value="">Όλες οι επιχειρήσεις</option>
          {[...businesses]
            .sort((a, b) => a.name.localeCompare(b.name, "el"))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <select aria-label="Κανάλι" value={filters.channel} onChange={(e) => set("channel", e.target.value)}>
          <option value="">Όλα τα κανάλια</option>
          {channels.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="date-filter">
          Από
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set("from", e.target.value)} />
        </label>
        <label className="date-filter">
          Έως
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set("to", e.target.value)} />
        </label>
        {active && (
          <button type="button" className="text-action" onClick={() => onChange(emptyFilters)}>
            <X size={13} /> Καθαρισμός
          </button>
        )}
      </div>
      {sorted.length > 0 && (
        <div className="chip-list" role="group" aria-label="Κατηγορίες">
          {sorted.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip ${filters.categories.includes(c.id) ? "on" : ""}`}
              aria-pressed={filters.categories.includes(c.id)}
              onClick={() => toggleCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="filters-summary">
        {shown.length} {shown.length === 1 ? "προώθηση" : "προωθήσεις"}
        {withCost.length > 0 && (
          <>
            {" · "}Συνολικό κόστος <strong>{formatCost(total)}</strong>
            {withCost.length < shown.length && ` (σε ${withCost.length} με καταχωρισμένο κόστος)`}
          </>
        )}
        {filters.from || filters.to ? " · με διάρκεια που πέφτει μέσα στο διάστημα" : ""}
      </div>
    </section>
  );
}

export function CategoryManager({
  categories,
  links,
  onRename,
  onDelete,
  onClose,
}: {
  categories: Category[];
  links: CategoryLink[];
  onRename: (c: Category, name: string) => Promise<void>;
  onDelete: (c: Category) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(null);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, "el"));
  return (
    <Modal title="Κατηγορίες" description="Μετονόμασε ή διέγραψε τις κατηγορίες σου. Νέες φτιάχνεις μέσα από τη φόρμα προώθησης." onClose={onClose} busy={busy}>
      {!sorted.length && <p className="modal-lead">Δεν υπάρχουν ακόμη κατηγορίες.</p>}
      <ul className="category-manager">
        {sorted.map((c) => {
          const used = links.filter((l) => l.category_id === c.id).length;
          return (
            <li key={c.id}>
              {editing === c.id ? (
                <form
                  className="category-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const clean = name.trim().replace(/\s+/g, " ");
                    if (clean) run(() => onRename(c, clean));
                  }}
                >
                  <input autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-label="Νέο όνομα" />
                  <button className="button primary small" disabled={busy || !name.trim()}>
                    Αποθήκευση
                  </button>
                  <button type="button" className="button secondary small" disabled={busy} onClick={() => setEditing(null)}>
                    Άκυρο
                  </button>
                </form>
              ) : confirm === c.id ? (
                <div className="category-edit">
                  <span>
                    Διαγραφή «{c.name}»;{used ? ` Θα αφαιρεθεί από ${used} ${used === 1 ? "προώθηση" : "προωθήσεις"}.` : ""}
                  </span>
                  <button className="button danger small" disabled={busy} onClick={() => run(() => onDelete(c))}>
                    Διαγραφή
                  </button>
                  <button className="button secondary small" disabled={busy} onClick={() => setConfirm(null)}>
                    Άκυρο
                  </button>
                </div>
              ) : (
                <>
                  <span className="chip">{c.name}</span>
                  <small>{used} {used === 1 ? "προώθηση" : "προωθήσεις"}</small>
                  <button
                    className="icon-button"
                    aria-label={`Μετονομασία ${c.name}`}
                    onClick={() => {
                      setEditing(c.id);
                      setName(c.name);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button className="icon-button" aria-label={`Διαγραφή ${c.name}`} onClick={() => setConfirm(c.id)}>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
