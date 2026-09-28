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
  UserRound,
  Users,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import Dashboard from "./Dashboard";
import Schedule from "./Schedule";
import { BusinessForm, Modal, PromotionForm } from "./forms";
import { Avatar, Badge, ChannelPill, Empty, PromotionTable } from "./ui";
import { demoData } from "./demo";
import {
  actions,
  dateLabel,
  matches,
  phase,
  replacement,
  todayISO,
  validatePromotion,
  type Business,
  type Data,
  type Promotion,
} from "./domain";
import {
  demoMode,
  friendlyError,
  loadData,
  saveBusiness,
  savePromotion,
  supabase,
} from "./data";

type View = "overview" | "businesses" | "promotions" | "schedule" | "business";
type Popup =
  | { type: "business-form"; initial?: Business }
  | {
      type: "promotion-form";
      initial?: Promotion;
      previous?: Promotion;
      businessId?: string;
    }
  | { type: "promotion"; id: string }
  | {
      type: "confirm";
      promotion: Promotion;
      action: "publish" | "complete" | "cancel";
    }
  | null;
const emptyData: Data = { businesses: [], promotions: [] };
const navigation = [
  { id: "overview" as const, title: "Επισκόπηση", Icon: LayoutDashboard },
  { id: "businesses" as const, title: "Επιχειρήσεις", Icon: Users },
  { id: "promotions" as const, title: "Προωθήσεις", Icon: Megaphone },
  { id: "schedule" as const, title: "Πρόγραμμα", Icon: CalendarDays },
];
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        p<span />
      </span>
      <span>
        promo<span className="brand-light">desk</span>
        <small>SOCIAL, ΣΕ ΤΑΞΗ.</small>
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
  const [popup, setPopup] = useState<Popup>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(todayISO());
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
        if (active) setData(value);
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
  const navigate = useCallback((next: View) => {
    setView(next);
    setSearch("");
    setFilter("all");
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
  const persistBusiness = async (b: Business) => {
    const expectedUser = userId;
    if (!expectedUser) throw new Error("Συνδέσου ξανά για να αποθηκεύσεις.");
    try {
      const saved = demoMode
        ? b
        : await saveBusiness(
            { ...b, user_id: expectedUser },
            data.businesses.some((x) => x.id === b.id),
          );
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
  const persistPromotion = async (p: Promotion) => {
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
      if (userRef.current !== expectedUser) return;
      setData((d) => ({
        ...d,
        promotions: [...d.promotions.filter((x) => x.id !== saved.id), saved],
      }));
      setPopup(null);
      setToast("Η προώθηση αποθηκεύτηκε.");
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
            title: "Άνοιγμα οθόνης Promo Desk",
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
  const promotions = data.promotions
    .filter(
      (p) =>
        (filter === "all" || phase(p, today) === filter) &&
        matches(
          `${p.title} ${data.businesses.find((b) => b.id === p.business_id)?.name} ${p.channel}`,
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
  return (
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
                    <button
                      className="button primary"
                      onClick={() => newPromotion()}
                    >
                      <Plus size={18} />
                      Νέα προώθηση
                    </button>
                  </div>
                  <div className="toolbar">
                    <label className="search-box">
                      <Search size={17} />
                      <input
                        aria-label="Αναζήτηση προώθησης"
                        placeholder="Αναζήτηση τίτλου, επιχείρησης ή καναλιού…"
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
          userId={userId!}
          today={today}
          onSave={persistPromotion}
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
          <ChannelPill channel={current.channel} />
          <h3 className="promotion-title">{current.title}</h3>
          <Badge promotion={current} today={today} />
          <dl className="promotion-meta">
            <div>
              <dt>Έναρξη προβολής</dt>
              <dd>{dateLabel(current.starts_on, true)}</dd>
            </div>
            <div>
              <dt>Λήξη προβολής</dt>
              <dd>{dateLabel(current.ends_on, true)}</dd>
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
              ? `Η προώθηση «${popup.promotion.title}» θα καταγραφεί ως δημοσιευμένη σήμερα, ${dateLabel(today, true)}. Για άλλη ημερομηνία χρησιμοποίησε την επεξεργασία.`
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
  );
}
