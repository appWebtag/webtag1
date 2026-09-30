import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleAlert,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  FileDown,
  Tags,
  UserRound,
  Users,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import Dashboard from "./Dashboard";
import Schedule from "./Schedule";
import { BusinessForm, Modal, PromotionForm } from "./forms";
import {
  Avatar,
  Badge,
  CategoryChips,
  ChannelPill,
  Empty,
  KindPill,
  LabelContext,
  PromotionTable,
} from "./ui";
import { CategoryManager, FiltersBar } from "./Filters";
import { demoData, demoMeta } from "./demo";
import MetaView from "./MetaView";
import { BusinessMetaComparison, BusinessMetaPanel, PromotionMetaPanel } from "./MetaPanels";
import {
  addLink,
  assignAds,
  emptyMeta,
  mapPage,
  loadMeta,
  metaSync,
  removeLink,
  reviewAds,
  saveAccount,
  type MetaData,
} from "./meta";
import {
  actions,
  dateLabel,
  matches,
  phase,
  replacement,
  todayISO,
  validatePromotion,
  applyFilters,
  categoryIds,
  categoryNames,
  emptyFilters,
  formatCost,
  promotionLabel,
  type Business,
  type Category,
  type Data,
  type Promotion,
  type PromotionFilters,
} from "./domain";
import {
  demoMode,
  friendlyError,
  loadData,
  deleteCategory,
  removeLogoFile,
  saveBusiness,
  signedLogoUrls,
  uploadLogo,
  saveCategory,
  savePromotion,
  setPromotionCategories,
  supabase,
} from "./data";

type View =
  | "overview"
  | "businesses"
  | "promotions"
  | "schedule"
  | "business"
  | "meta";
type Popup =
  | { type: "business-form"; initial?: Business }
  | {
      type: "promotion-form";
      initial?: Promotion;
      previous?: Promotion;
      businessId?: string;
    }
  | { type: "promotion"; id: string }
  | { type: "categories" }
  | {
      type: "confirm";
      promotion: Promotion;
      action: "publish" | "complete" | "cancel";
    }
  | null;
const emptyData: Data = { businesses: [], promotions: [], categories: [], categoryLinks: [] };
const navigation = [
  { id: "overview" as const, title: "Επισκόπηση", Icon: LayoutDashboard },
  { id: "businesses" as const, title: "Επιχειρήσεις", Icon: Users },
  { id: "promotions" as const, title: "Προωθήσεις", Icon: Megaphone },
  { id: "schedule" as const, title: "Πρόγραμμα", Icon: CalendarDays },
  { id: "meta" as const, title: "Meta Ads", Icon: BarChart3 },
];
function Brand() {
  return (
    <div className="brand">
      <img className="brand-mark" src="/logo.png" alt="" width="44" height="44" />
      <span>
        WebTag
        <small>Net Solutions</small>
      </span>
    </div>
  );
}
function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error)
        setError(
          error.code === "invalid_credentials"
            ? "Το email ή ο κωδικός δεν είναι σωστός."
            : "Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο.",
        );
    } catch {
      setError("Δεν υπάρχει σύνδεση με την υπηρεσία. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-banner" role="img" aria-label="WebTag Net Solutions" />
      <div className="auth-card">
        <Brand />
        <div className="eyebrow">Ο ΔΙΚΟΣ ΣΟΥ ΧΩΡΟΣ</div>
        <h1>Καλώς ήρθες ξανά.</h1>
        <p>Οι πελάτες, οι προωθήσεις και το επόμενο βήμα σου είναι εδώ.</p>
        <form onSubmit={submit}>
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            Κωδικός πρόσβασης
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Σύνδεση…" : "Σύνδεση στον λογαριασμό μου"}
          </button>
        </form>
        <small className="auth-foot">
          Πρόσβαση μόνο στον προσωπικό σου λογαριασμό.
        </small>
      </div>
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(demoMode || !supabase);
  const [data, setData] = useState<Data>(() =>
    demoMode ? demoData() : emptyData,
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<View>("overview");
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [filters, setFilters] = useState<PromotionFilters>(emptyFilters);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(todayISO());
  const [demoMetaState] = useState(() => (demoMode ? demoMeta() : null));
  const [meta, setMeta] = useState<MetaData>(() => demoMetaState?.meta || emptyMeta);
  const [metaError, setMetaError] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const userId = demoMode ? "demo" : session?.user.id;
  const userRef = useRef(userId);
  userRef.current = userId;
  useEffect(() => {
    const timer = setInterval(() => setToday(todayISO()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let eventReceived = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        eventReceived = true;
        setSession(next);
        setAuthReady(true);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !eventReceived) {
          setSession(error ? null : data.session);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (demoMode) return;
    setData(emptyData);
    setPopup(null);
    setLoadError("");
    if (!userId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    loadData(userId)
      .then((value) => {
        if (!active) return;
        setData(value);
        const paths = value.businesses.map((b) => b.logo_path).filter((x): x is string => !!x);
        signedLogoUrls(paths)
          .then((urls) => active && setLogoUrls(urls))
          .catch(() => {});
      })
      .catch((error) => {
        if (active) setLoadError(friendlyError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, revision]);
  const reloadMeta = useCallback(async () => {
    if (demoMode || !userId) return;
    try {
      const value = await loadMeta(userId);
      if (userRef.current === userId) {
        setMeta(value);
        setMetaError("");
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (userRef.current === userId)
        setMetaError(
          code === "PGRST205" || code === "42P01"
            ? "Δεν έχουν δημιουργηθεί ακόμη οι πίνακες Meta στη βάση δεδομένων."
            : "Δεν φορτώθηκαν τα δεδομένα Meta. Δοκίμασε ξανά.",
        );
    }
  }, [userId]);
  useEffect(() => {
    if (demoMode) return;
    setMeta(emptyMeta);
    reloadMeta();
  }, [reloadMeta, revision]);
  const metaAction = async (fn: () => Promise<void>, done?: string) => {
    if (!userId) throw new Error("Συνδέσου ξανά.");
    setMetaBusy(true);
    try {
      await fn();
      await reloadMeta();
      if (done) setToast(done);
    } catch (e) {
      throw new Error(e instanceof Error && !(e as { code?: string }).code ? e.message : friendlyError(e));
    } finally {
      setMetaBusy(false);
    }
  };
  const demoOnly = (update: (m: MetaData) => MetaData) => {
    setMeta(update);
    return Promise.resolve();
  };
  const newAdsCount = meta.ads.filter(
    (a) => a.review_state === "new" && a.account_id === meta.account?.ad_account_id,
  ).length;
  const navigate = useCallback((next: View) => {
    setView(next);
    setSearch("");
    setFilter("all");
    setFilters(emptyFilters);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const openBusiness = (b: Business) => {
    setSelectedBusiness(b.id);
    navigate("business");
    setPopup(null);
  };
  const openPromotion = (p: Promotion) => {
    setMutationError("");
    setPopup({ type: "promotion", id: p.id });
  };
  const newPromotion = (businessId?: string) => {
    if (!data.businesses.length) {
      setPopup({ type: "business-form" });
      setToast("Πρόσθεσε πρώτα την επιχείρηση του πελάτη σου.");
      return;
    }
    setPopup({ type: "promotion-form", businessId });
  };
  const onAction = (p: Promotion, type: "publish" | "renew") => {
    setMutationError("");
    if (type === "renew") {
      const next = replacement(p, data.promotions);
      if (next) {
        openPromotion(next);
        return;
      }
      setPopup({ type: "promotion-form", previous: p });
    } else setPopup({ type: "confirm", promotion: p, action: "publish" });
  };
  const persistBusiness = async (b: Business, logo?: Blob | null) => {
    const expectedUser = userId;
    if (!expectedUser) throw new Error("Συνδέσου ξανά για να αποθηκεύσεις.");
    try {
      const exists = data.businesses.some((x) => x.id === b.id);
      const oldPath = data.businesses.find((x) => x.id === b.id)?.logo_path || null;
      let saved: Business;
      if (demoMode) {
        saved = b;
        if (logo !== undefined)
          setLogoUrls((m) => {
            const next = { ...m };
            if (logo) next[`demo/${b.id}`] = URL.createObjectURL(logo);
            else delete next[`demo/${b.id}`];
            return next;
          });
        saved = { ...b, logo_path: logo ? `demo/${b.id}` : logo === null ? null : b.logo_path };
      } else {
        saved = await saveBusiness({ ...b, user_id: expectedUser }, exists);
        if (logo !== undefined) {
          const path = logo ? await uploadLogo(expectedUser, saved.id, logo) : null;
          saved = await saveBusiness({ ...saved, logo_path: path }, true);
          if (oldPath && oldPath !== path) await removeLogoFile(oldPath);
          if (path) {
            const urls = await signedLogoUrls([path]);
            setLogoUrls((m) => ({ ...m, ...urls }));
          }
        }
      }
      if (userRef.current !== expectedUser) return;
      setData((d) => ({
        ...d,
        businesses: [...d.businesses.filter((x) => x.id !== saved.id), saved],
      }));
      setPopup(null);
      setToast("Η επιχείρηση αποθηκεύτηκε.");
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  };
  const persistPromotion = async (p: Promotion, cats?: string[]) => {
    const expectedUser = userId;
    if (!expectedUser) throw new Error("Συνδέσου ξανά για να αποθηκεύσεις.");
    const issue = validatePromotion(p, today);
    if (issue) throw new Error(issue);
    if (
      p.previous_promotion_id &&
      p.status !== "cancelled" &&
      data.promotions.some(
        (x) =>
          x.id !== p.id &&
          x.previous_promotion_id === p.previous_promotion_id &&
          x.status !== "cancelled",
      )
    )
      throw new Error("Έχει ήδη προγραμματιστεί επόμενη προώθηση.");
    try {
      const saved = demoMode
        ? p
        : await savePromotion(
            { ...p, user_id: expectedUser },
            data.promotions.some((x) => x.id === p.id),
          );
      if (cats && !demoMode) await setPromotionCategories(saved.id, cats);
      if (userRef.current !== expectedUser) return;
      const normalized = { ...saved, cost: saved.cost === null ? null : Number(saved.cost) };
      setData((d) => ({
        ...d,
        promotions: [...d.promotions.filter((x) => x.id !== saved.id), normalized],
        categoryLinks: cats
          ? [
              ...d.categoryLinks.filter((l) => l.promotion_id !== saved.id),
              ...cats.map((category_id) => ({ promotion_id: saved.id, category_id })),
            ]
          : d.categoryLinks,
      }));
      setPopup(null);
      setToast(
        !data.promotions.some((x) => x.id === p.id) && p.kind === "post"
          ? "Το post καταχωρίστηκε ως ολοκληρωμένο."
          : "Η προώθηση αποθηκεύτηκε.",
      );
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  };
  const createCategory = async (name: string): Promise<Category> => {
    if (!userId) throw new Error("Συνδέσου ξανά.");
    const draft: Category = { id: crypto.randomUUID(), user_id: userId, name, created_at: new Date().toISOString() };
    try {
      const saved = demoMode ? draft : await saveCategory(draft, false);
      setData((d) => ({ ...d, categories: [...d.categories, saved] }));
      return saved;
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  };
  const renameCategory = async (c: Category, name: string) => {
    try {
      const saved = demoMode ? { ...c, name } : await saveCategory({ ...c, name }, true);
      setData((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? saved : x)) }));
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  };
  const removeCategory = async (c: Category) => {
    try {
      if (!demoMode) await deleteCategory(c.id, c.user_id);
      setData((d) => ({
        ...d,
        categories: d.categories.filter((x) => x.id !== c.id),
        categoryLinks: d.categoryLinks.filter((l) => l.category_id !== c.id),
      }));
      setFilters((f) => ({ ...f, categories: f.categories.filter((x) => x !== c.id) }));
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  };
  const confirmAction = async () => {
    if (popup?.type !== "confirm" || busy) return;
    setBusy(true);
    setMutationError("");
    const { promotion: p, action } = popup;
    try {
      await persistPromotion({
        ...p,
        status:
          action === "publish"
            ? "published"
            : action === "complete"
              ? "completed"
              : "cancelled",
        published_on: action === "publish" ? today : p.published_on,
      });
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setToast("Δεν ολοκληρώθηκε η αποσύνδεση. Δοκίμασε ξανά.");
    else {
      setData(emptyData);
      setPopup(null);
      setToast("");
    }
  };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool || !userId) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() =>
        context.registerTool(
          {
            name: "show_promo_desk_view",
            title: "Άνοιγμα οθόνης WebTag",
            description:
              "Open one of the existing app views. Navigates only; does not create, modify, publish, or delete records.",
            inputSchema: {
              type: "object",
              properties: {
                view: {
                  type: "string",
                  enum: ["overview", "businesses", "promotions", "schedule"],
                },
              },
              required: ["view"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: (input: unknown) => {
              const v = (input as { view?: string })?.view;
              if (
                !v ||
                !["overview", "businesses", "promotions", "schedule"].includes(
                  v,
                ) ||
                Object.keys(input as object).length !== 1
              )
                throw new Error("Invalid view");
              navigate(v as View);
              return new Promise((resolve) =>
                requestAnimationFrame(() =>
                  resolve({ view: v, navigated: true }),
                ),
              );
            },
          },
          { signal: controller.signal },
        ),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [navigate, userId]);
  if (!demoMode && !supabase)
    return (
      <div className="error-page">
        <Brand />
        <h1>Η εφαρμογή είναι έτοιμη για σύνδεση.</h1>
        <p>
          Χρειάζεται να ολοκληρωθεί η σύνδεση με τη βάση δεδομένων πριν
          καταχωριστούν πραγματικοί πελάτες. Ακολούθησε το αρχείο οδηγιών που
          συνοδεύει την εφαρμογή.
        </p>
        <p>Δεν έχουν φορτωθεί ή αποθηκευτεί δεδομένα πελατών.</p>
      </div>
    );
  if (!authReady) return <div className="loading">Έλεγχος σύνδεσης…</div>;
  if (!demoMode && !session) return <Auth />;
  const activeBusiness = data.businesses.find((b) => b.id === selectedBusiness);
  const businessPromotions = data.promotions
    .filter((p) => p.business_id === selectedBusiness)
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const promotions = applyFilters(data.promotions, filters, data.categoryLinks)
    .filter(
      (p) =>
        (filter === "all" || phase(p, today) === filter) &&
        matches(
          `${promotionLabel(p, data)} ${p.title} ${data.businesses.find((b) => b.id === p.business_id)?.name} ${p.channel} ${p.kind}`,
          search,
        ),
    )
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const current =
    popup?.type === "promotion"
      ? data.promotions.find((p) => p.id === popup.id)
      : undefined;
  const next = current ? replacement(current, data.promotions) : undefined;
  const navTitle =
    view === "business"
      ? activeBusiness?.name || "Επιχείρηση"
      : navigation.find((n) => n.id === view)?.title;
  const logoOf = (businessId: string | undefined) => {
    const path = data.businesses.find((b) => b.id === businessId)?.logo_path;
    return path ? logoUrls[path] : undefined;
  };
  const labels = {
    label: (p: Promotion) => promotionLabel(p, data),
    categories: (p: Promotion) => categoryNames(p.id, data),
    logo: logoOf,
  };
  const filterSummary = () => {
    const parts: string[] = [];
    if (filters.kind !== "all") parts.push(filters.kind === "post" ? "Post" : "Ads");
    if (filters.business) parts.push(data.businesses.find((b) => b.id === filters.business)?.name || "");
    if (filters.channel) parts.push(filters.channel);
    if (filters.categories.length)
      parts.push(
        "Κατηγορίες: " +
          data.categories.filter((c) => filters.categories.includes(c.id)).map((c) => c.name).join(", "),
      );
    if (filters.from || filters.to)
      parts.push(
        `Διάστημα: ${filters.from ? dateLabel(filters.from, true) : "…"} – ${filters.to ? dateLabel(filters.to, true) : "…"}`,
      );
    if (filter !== "all")
      parts.push(
        ({ active: "Ενεργές", scheduled: "Προγραμματισμένες", expired: "Έληξαν", completed: "Ολοκληρωμένες", cancelled: "Ακυρωμένες" } as Record<string, string>)[filter] || "",
      );
    if (search.trim()) parts.push(`Αναζήτηση: «${search.trim()}»`);
    return parts.length ? "Φίλτρα: " + parts.filter(Boolean).join(" · ") : "Όλες οι προωθήσεις";
  };
  const exportPdf = async () => {
    setExporting(true);
    try {
      const { exportPromotionsPdf } = await import("./pdfExport");
      await exportPromotionsPdf({
        promotions,
        data,
        meta,
        logoUrl: (id) => logoOf(id),
        filterSummary: filterSummary(),
        today,
      });
    } catch {
      setToast("Η εξαγωγή PDF δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <LabelContext.Provider value={labels}>
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Κλείσιμο μενού"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <Brand />
        <div className="workspace-label">Ο ΧΩΡΟΣ ΜΟΥ</div>
        <nav aria-label="Κύριο μενού">
          {navigation.map(({ id, title, Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id || (view === "business" && id === "businesses") ? "selected" : ""}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              {title}
              {id === "businesses" && data.businesses.length > 0 && (
                <span className="nav-count">{data.businesses.length}</span>
              )}
              {id === "meta" && newAdsCount > 0 && (
                <span className="nav-count highlight" title="Νέες διαφημίσεις προς αντιστοίχιση">
                  {newAdsCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sparkles size={19} />
          <strong>
            Κάθε προώθηση,
            <br />
            στη σωστή στιγμή.
          </strong>
          <p>Το ιστορικό και το επόμενο βήμα, πάντα μαζί.</p>
        </div>
        <div className="profile">
          <div className="profile-avatar">Ε</div>
          <div>
            <strong>Ο λογαριασμός μου</strong>
            <small>
              {demoMode ? "Δοκιμαστική προβολή" : "Προσωπικός χώρος"}
            </small>
          </div>
          {!demoMode && (
            <button
              className="icon-button"
              onClick={signOut}
              disabled={busy}
              aria-label="Αποσύνδεση"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Άνοιγμα μενού"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span className="breadcrumb-label">Ο χώρος μου</span>
            <span>/</span>
            <strong>{navTitle}</strong>
          </div>
          <div className="topbar-right">
            <span className="header-date">
              <CalendarDays size={15} />
              {dateLabel(today, true)}
            </span>
            {!demoMode && (
              <button
                className="icon-button"
                aria-label="Ανανέωση δεδομένων"
                onClick={() => setRevision((x) => x + 1)}
                disabled={loading}
              >
                <RefreshCw size={16} />
              </button>
            )}
            <div className="small-profile">Ε</div>
          </div>
        </header>
        {demoMode && (
          <div className="demo-banner">
            <span className="demo-dot" />
            <strong>Δοκιμαστική προβολή</strong>
            <span>
              Πλασματικά δεδομένα · οι αλλαγές χάνονται με την ανανέωση της
              σελίδας.
            </span>
          </div>
        )}
        <main>
          {loading ? (
            <div className="loading" role="status">
              Φόρτωση των προωθήσεών σου…
            </div>
          ) : loadError ? (
            <div className="notice error" role="alert">
              <CircleAlert size={20} />
              {loadError}
              <button onClick={() => setRevision((x) => x + 1)}>
                Δοκιμή ξανά
              </button>
            </div>
          ) : (
            <>
              {view === "overview" && (
                <Dashboard
                  data={data}
                  today={today}
                  onNew={() => newPromotion()}
                  onOpen={openPromotion}
                  onAction={onAction}
                  onBusiness={openBusiness}
                  onSchedule={() => navigate("schedule")}
                  onPromotions={() => navigate("promotions")}
                />
              )}
              {view === "businesses" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">ΟΙ ΣΥΝΕΡΓΑΣΙΕΣ ΣΟΥ</div>
                      <h1>
                        Οι επιχειρήσεις σου
                        <span className="purple-text">.</span>
                      </h1>
                      <p>Κάθε πελάτης, με τη δική του ιστορία.</p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setPopup({ type: "business-form" })}
                    >
                      <Plus size={18} />
                      Νέα επιχείρηση
                    </button>
                  </div>
                  <div className="toolbar">
                    <label className="search-box">
                      <Search size={17} />
                      <input
                        aria-label="Αναζήτηση επιχείρησης"
                        placeholder="Αναζήτηση επιχείρησης ή υπευθύνου…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <span className="muted-count">
                      {data.businesses.length} επιχειρήσεις
                    </span>
                  </div>
                  <div className="business-grid">
                    {data.businesses
                      .filter((b) =>
                        matches(
                          `${b.name} ${b.contact_name} ${b.phone} ${b.email}`,
                          search,
                        ),
                      )
                      .sort((a, b) => a.name.localeCompare(b.name, "el"))
                      .map((b) => {
                        const own = data.promotions.filter(
                          (p) => p.business_id === b.id,
                        );
                        const act = own.filter(
                          (p) => phase(p, today) === "active",
                        ).length;
                        const next = actions(own)[0];
                        return (
                          <button
                            className="business-card"
                            key={b.id}
                            onClick={() => openBusiness(b)}
                          >
                            <div className="business-card-top">
                              <Avatar business={b} size="large" />
                              <ArrowUpRight size={18} />
                            </div>
                            <h3>{b.name}</h3>
                            <p>
                              {b.contact_name || "Χωρίς υπεύθυνο επικοινωνίας"}
                            </p>
                            <div className="business-card-bottom">
                              <span>{act} ενεργές προωθήσεις</span>
                              <span>
                                {next
                                  ? `Επόμενο: ${dateLabel(next.date)}`
                                  : `${own.length} συνολικά`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  {!data.businesses.filter((b) =>
                    matches(
                      `${b.name} ${b.contact_name} ${b.phone} ${b.email}`,
                      search,
                    ),
                  ).length && (
                    <Empty
                      title={
                        search
                          ? "Δεν βρέθηκε επιχείρηση."
                          : "Πρόσθεσε την πρώτη σου επιχείρηση."
                      }
                    >
                      Το πελατολόγιό σου ξεκινά εδώ.
                    </Empty>
                  )}
                </>
              )}
              {view === "promotions" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">ΑΠΟ ΤΗΝ ΙΔΕΑ ΣΤΗ ΔΗΜΟΣΙΕΥΣΗ</div>
                      <h1>
                        Οι προωθήσεις σου<span className="purple-text">.</span>
                      </h1>
                      <p>Όσες τρέχουν, όσες έρχονται και όσες ολοκληρώθηκαν.</p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="button secondary"
                        onClick={exportPdf}
                        disabled={exporting || !promotions.length}
                        title="Εξαγωγή όσων εμφανίζονται, με τα στατιστικά Meta"
                      >
                        <FileDown size={16} />
                        {exporting ? "Δημιουργία…" : "Εξαγωγή PDF"}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => setPopup({ type: "categories" })}
                      >
                        <Tags size={16} />
                        Κατηγορίες
                      </button>
                      <button
                        className="button primary"
                        onClick={() => newPromotion()}
                      >
                        <Plus size={18} />
                        Νέα προώθηση
                      </button>
                    </div>
                  </div>
                  <FiltersBar
                    filters={filters}
                    onChange={setFilters}
                    categories={data.categories}
                    businesses={data.businesses}
                    shown={promotions}
                  />
                  <div className="toolbar">
                    <label className="search-box">
                      <Search size={17} />
                      <input
                        aria-label="Αναζήτηση προώθησης"
                        placeholder="Αναζήτηση κατηγορίας, επιχείρησης ή καναλιού…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <div className="filter-tabs" aria-label="Φίλτρο κατάστασης">
                      {[
                        ["all", "Όλες"],
                        ["active", "Ενεργές"],
                        ["scheduled", "Προγραμματισμένες"],
                        ["expired", "Έληξαν"],
                        ["completed", "Ολοκληρωμένες"],
                        ["cancelled", "Ακυρωμένες"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={filter === value ? "active" : ""}
                          aria-pressed={filter === value}
                          onClick={() => setFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <section className="panel">
                    <PromotionTable
                      promotions={promotions}
                      businesses={data.businesses}
                      today={today}
                      onOpen={openPromotion}
                      onBusiness={openBusiness}
                    />
                  </section>
                </>
              )}
              {view === "business" && activeBusiness && (
                <>
                  <button
                    className="back-button"
                    onClick={() => navigate("businesses")}
                  >
                    <ArrowLeft size={14} />
                    Όλες οι επιχειρήσεις
                  </button>
                  <div className="page-heading">
                    <div className="detail-heading">
                      <Avatar business={activeBusiness} size="large" />
                      <div>
                        <h1>{activeBusiness.name}</h1>
                        <div className="contact-line">
                          {activeBusiness.contact_name && (
                            <span>
                              <UserRound size={13} />
                              {activeBusiness.contact_name}
                            </span>
                          )}
                          {activeBusiness.phone && (
                            <span>
                              <Phone size={13} />
                              {activeBusiness.phone}
                            </span>
                          )}
                          {activeBusiness.email && (
                            <span>
                              <Mail size={13} />
                              {activeBusiness.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="button secondary"
                        onClick={() =>
                          setPopup({
                            type: "business-form",
                            initial: activeBusiness,
                          })
                        }
                      >
                        <Pencil size={15} />
                        Επεξεργασία
                      </button>
                      <button
                        className="button primary"
                        onClick={() => newPromotion(activeBusiness.id)}
                      >
                        <Plus size={16} />
                        Νέα προώθηση
                      </button>
                    </div>
                  </div>
                  {activeBusiness.notes && (
                    <div className="note-panel">{activeBusiness.notes}</div>
                  )}
                  <div className="detail-sections">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>Ενεργές & προγραμματισμένες</h2>
                          <p>
                            Τι τρέχει και τι ακολουθεί για αυτή την επιχείρηση.
                          </p>
                        </div>
                      </div>
                      <PromotionTable
                        promotions={businessPromotions.filter((p) =>
                          ["active", "scheduled"].includes(phase(p, today)),
                        )}
                        businesses={data.businesses}
                        today={today}
                        onOpen={openPromotion}
                        onBusiness={openBusiness}
                      />
                    </section>
                    <BusinessMetaPanel
                      business={activeBusiness}
                      meta={meta}
                      onOpenMeta={() => navigate("meta")}
                      onMapPage={(pageId, businessId) =>
                        demoMode
                          ? demoOnly((m) => ({
                              ...m,
                              pages: m.pages.map((p) => (p.page_id === pageId ? { ...p, business_id: businessId } : p)),
                              ads: m.ads.map((a) =>
                                businessId && a.page_id === pageId && a.review_state === "new"
                                  ? { ...a, business_id: businessId, review_state: "assigned" }
                                  : a,
                              ),
                            }))
                          : metaAction(() => mapPage(userId!, pageId, businessId), "Η σελίδα αντιστοιχίστηκε.")
                      }
                      onAssign={(ids, businessId) =>
                        demoMode
                          ? demoOnly((m) => ({
                              ...m,
                              ads: m.ads.map((a) =>
                                ids.includes(a.ad_id)
                                  ? { ...a, business_id: businessId, review_state: businessId ? "assigned" : "new" }
                                  : a,
                              ),
                            }))
                          : metaAction(() => assignAds(userId!, ids, businessId))
                      }
                    />
                    <BusinessMetaComparison
                      business={activeBusiness}
                      promotions={businessPromotions}
                      meta={meta}
                      onOpen={openPromotion}
                    />
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>Ιστορικό προωθήσεων</h2>
                          <p>
                            Οι προηγούμενες προωθήσεις, μαζί με τις σημειώσεις
                            τους.
                          </p>
                        </div>
                      </div>
                      <PromotionTable
                        promotions={businessPromotions.filter(
                          (p) =>
                            !["active", "scheduled"].includes(phase(p, today)),
                        )}
                        businesses={data.businesses}
                        today={today}
                        onOpen={openPromotion}
                        onBusiness={openBusiness}
                      />
                    </section>
                  </div>
                </>
              )}
              {view === "meta" && (
                <MetaView
                  meta={meta}
                  metaError={metaError}
                  businesses={data.businesses}
                  demo={demoMode}
                  busy={metaBusy}
                  onSaveAccount={(id) =>
                    demoMode
                      ? demoOnly((m) => ({ ...m, account: m.account && { ...m.account, ad_account_id: id } }))
                      : metaAction(
                          () => saveAccount(userId!, id, !!meta.account),
                          "Ο λογαριασμός αποθηκεύτηκε. Πάτα «Συγχρονισμός τώρα».",
                        )
                  }
                  onSync={() =>
                    demoMode
                      ? demoOnly((m) => m).then(() => setToast("Δοκιμαστική προβολή: δεν γίνεται πραγματικός συγχρονισμός."))
                      : metaAction(async () => {
                          const r = await metaSync();
                          if (r.status !== "ok") throw new Error(r.message || "Ο συγχρονισμός δεν ολοκληρώθηκε.");
                        }, "Ο συγχρονισμός ολοκληρώθηκε.")
                  }
                  onReview={(ids, businessId) =>
                    demoMode
                      ? demoOnly((m) => ({
                          ...m,
                          ads: m.ads.map((a) =>
                            ids.includes(a.ad_id)
                              ? { ...a, business_id: businessId, review_state: businessId ? "assigned" : "ignored" }
                              : a,
                          ),
                        }))
                      : metaAction(() => reviewAds(userId!, ids, businessId))
                  }
                />
              )}
              {view === "schedule" && (
                <Schedule
                  data={data}
                  today={today}
                  onOpen={openPromotion}
                  onNew={() => newPromotion()}
                  onAction={onAction}
                />
              )}
            </>
          )}
        </main>
      </div>
      {popup?.type === "business-form" && (
        <BusinessForm
          key={popup.initial?.id || "new-business"}
          initial={popup.initial}
          userId={userId!}
          logoUrl={logoOf(popup.initial?.id)}
          onSave={persistBusiness}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.type === "promotion-form" && (
        <PromotionForm
          key={popup.initial?.id || popup.previous?.id || "new-promotion"}
          initial={popup.initial}
          previous={popup.previous}
          businessId={popup.businessId}
          businesses={data.businesses}
          categories={data.categories}
          initialCategories={categoryIds(
            popup.initial?.id || popup.previous?.id || "",
            data.categoryLinks,
          )}
          userId={userId!}
          today={today}
          onSave={persistPromotion}
          onCreateCategory={createCategory}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.type === "categories" && (
        <CategoryManager
          categories={data.categories}
          links={data.categoryLinks}
          onRename={renameCategory}
          onDelete={removeCategory}
          onClose={() => setPopup(null)}
        />
      )}
      {current && (
        <Modal
          title={
            data.businesses.find((b) => b.id === current.business_id)?.name ||
            "Προώθηση"
          }
          onClose={() => setPopup(null)}
          wide
        >
          <div className="channel-cell">
            <KindPill kind={current.kind} />
            <ChannelPill channel={current.channel} />
          </div>
          <h3 className="promotion-title">{promotionLabel(current, data)}</h3>
          <CategoryChips names={categoryNames(current.id, data)} />
          <Badge promotion={current} today={today} />
          <dl className="promotion-meta">
            {current.kind === "ads" && (
              <>
                <div>
                  <dt>Έναρξη προβολής</dt>
                  <dd>{dateLabel(current.starts_on, true)}</dd>
                </div>
                <div>
                  <dt>Λήξη προβολής</dt>
                  <dd>{dateLabel(current.ends_on, true)}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Κόστος διαφήμισης</dt>
              <dd>{formatCost(current.cost)}</dd>
            </div>
            <div>
              <dt>Δημοσιεύτηκε</dt>
              <dd>
                {current.published_on
                  ? dateLabel(current.published_on, true)
                  : "Δεν έχει δημοσιευτεί"}
              </dd>
            </div>
            <div>
              <dt>Επόμενη προώθηση</dt>
              <dd>
                {current.next_action_on
                  ? dateLabel(current.next_action_on, true)
                  : "Δεν έχει οριστεί"}
              </dd>
            </div>
          </dl>
          {current.notes && <div className="note-panel">{current.notes}</div>}
          <PromotionMetaPanel
            promotion={current}
            meta={meta}
            userId={userId!}
            demo={demoMode}
            demoDaily={demoMetaState?.daily}
            onOpenMeta={() => {
              setPopup(null);
              navigate("meta");
            }}
            onLink={(level, metaId) =>
              demoMode
                ? demoOnly((m) => ({
                    ...m,
                    links: [...m.links, { id: `l${Date.now()}`, promotion_id: current.id, level, meta_id: metaId }],
                  }))
                : metaAction(async () => {
                    await addLink(userId!, current.id, level, metaId);
                  }, "Η σύνδεση αποθηκεύτηκε. Τα αποτελέσματα ενημερώνονται στον επόμενο συγχρονισμό.")
            }
            onUnlink={(id) =>
              demoMode
                ? demoOnly((m) => ({ ...m, links: m.links.filter((l) => l.id !== id) }))
                : metaAction(() => removeLink(userId!, id))
            }
          />
          {next && (
            <div className="notice">
              <Check size={16} />
              Έχει καταχωριστεί η επόμενη προώθηση.
              <button onClick={() => openPromotion(next)}>Προβολή</button>
            </div>
          )}
          {current.previous_promotion_id && (
            <button
              className="text-action previous-link"
              onClick={() => {
                const previous = data.promotions.find(
                  (p) => p.id === current.previous_promotion_id,
                );
                if (previous) openPromotion(previous);
              }}
            >
              <ArrowLeft size={14} />
              Προηγούμενη προώθηση
            </button>
          )}
          <div className="promotion-actions">
            <button
              className="button secondary small"
              onClick={() =>
                setPopup({ type: "promotion-form", initial: current })
              }
            >
              <Pencil size={14} />
              Επεξεργασία
            </button>
            {current.status === "scheduled" && (
              <button
                className="button primary small"
                onClick={() => onAction(current, "publish")}
              >
                <Check size={14} />
                Δημοσιεύτηκε
              </button>
            )}
            {current.status === "published" && (
              <button
                className="button secondary small"
                onClick={() => {
                  setMutationError("");
                  setPopup({
                    type: "confirm",
                    promotion: current,
                    action: "complete",
                  });
                }}
              >
                Ολοκλήρωση
              </button>
            )}
            {current.status !== "cancelled" && !next && (
              <button
                className="button primary small"
                onClick={() => onAction(current, "renew")}
              >
                <Plus size={14} />
                Επόμενη προώθηση
              </button>
            )}
            {["scheduled", "published"].includes(current.status) && (
              <button
                className="button danger small"
                onClick={() => {
                  setMutationError("");
                  setPopup({
                    type: "confirm",
                    promotion: current,
                    action: "cancel",
                  });
                }}
              >
                Ακύρωση προώθησης
              </button>
            )}
          </div>
        </Modal>
      )}
      {popup?.type === "confirm" && (
        <Modal
          title={
            popup.action === "publish"
              ? "Καταχώριση δημοσίευσης"
              : popup.action === "complete"
                ? "Ολοκλήρωση προώθησης"
                : "Ακύρωση προώθησης"
          }
          onClose={() => openPromotion(popup.promotion)}
          busy={busy}
        >
          <p className="modal-lead">
            {popup.action === "publish"
              ? `Η προώθηση «${promotionLabel(popup.promotion, data)}» θα καταγραφεί ως δημοσιευμένη σήμερα, ${dateLabel(today, true)}. Για άλλη ημερομηνία χρησιμοποίησε την επεξεργασία.`
              : popup.action === "complete"
                ? "Η προώθηση θα μεταφερθεί στις ολοκληρωμένες. Το ιστορικό και τυχόν επόμενη ενέργεια θα παραμείνουν."
                : "Η προώθηση θα παραμείνει στο ιστορικό ως ακυρωμένη και οι εκκρεμείς ενέργειές της θα αφαιρεθούν."}
          </p>
          {mutationError && (
            <p className="form-error" role="alert">
              {mutationError}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => openPromotion(popup.promotion)}
            >
              Πίσω
            </button>
            <button
              className={`button ${popup.action === "cancel" ? "danger" : "primary"}`}
              disabled={busy}
              onClick={confirmAction}
            >
              {busy
                ? "Αποθήκευση…"
                : popup.action === "publish"
                  ? "Καταχώριση δημοσίευσης"
                  : popup.action === "complete"
                    ? "Ολοκλήρωση"
                    : "Ακύρωση προώθησης"}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
    </LabelContext.Provider>
  );
}
