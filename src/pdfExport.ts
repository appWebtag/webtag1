// Builds a PDF report of the promotions currently shown (after filters),
// grouped by client, with each client's logo and the Meta results.
import { jsPDF } from "jspdf";
import { autoTable, type RowInput } from "jspdf-autotable";
import {
  categoryNames,
  dateLabel,
  formatCost,
  kindLabels,
  phase,
  type Business,
  type Data,
  type Profile,
  type Promotion,
} from "./domain";
import { adsForLinks, costPer, count, money, resultValues, type MetaData, type MetaResult } from "./metaCore";
import { imageDataUrl } from "./images";

const statusLabels = {
  scheduled: "Προγραμματισμένη",
  active: "Ενεργή",
  expired: "Έληξε",
  completed: "Ολοκληρωμένη",
  cancelled: "Ακυρωμένη",
};
const CHARCOAL: [number, number, number] = [84, 83, 81];
const TEAL: [number, number, number] = [54, 125, 142];
const LIGHT: [number, number, number] = [244, 248, 249];

async function fontBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export interface ExportOptions {
  promotions: Promotion[];
  data: Data;
  meta: MetaData;
  logoUrl: (businessId: string) => string | undefined;
  filterSummary: string;
  today: string;
  owner?: Profile | null;
  ownerLogoUrl?: string;
}

export async function exportPromotionsPdf(o: ExportOptions): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  // Greek-capable font (DejaVu Sans Condensed, subset) shipped with the app.
  const [regular, bold] = await Promise.all([
    fontBase64("/fonts/DejaVuSansCondensed.ttf"),
    fontBase64("/fonts/DejaVuSansCondensed-Bold.ttf"),
  ]);
  doc.addFileToVFS("DejaVu.ttf", regular);
  doc.addFont("DejaVu.ttf", "DejaVu", "normal");
  doc.addFileToVFS("DejaVu-Bold.ttf", bold);
  doc.addFont("DejaVu-Bold.ttf", "DejaVu", "bold");
  doc.setFont("DejaVu", "normal");

  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  const resultOf = (p: Promotion): MetaResult | undefined => o.meta.results.find((r) => r.promotion_id === p.id);

  // ---- header ----
  const brand = (o.ownerLogoUrl && (await imageDataUrl(o.ownerLogoUrl, 200))) || (await imageDataUrl("/logo.png", 200));
  const ownerName = o.owner?.company_name || o.owner?.full_name || "WebTag Net Solutions";
  const contact = [o.owner?.full_name && o.owner?.company_name ? o.owner.full_name : "", o.owner?.phone, o.owner?.email, o.owner?.website]
    .filter(Boolean)
    .join(" · ");
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, W, 26, "F");
  if (brand) doc.addImage(brand, "PNG", M, 4, 18, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(16);
  doc.text("Αναφορά προωθήσεων", M + 22, 12);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(9);
  doc.setTextColor(197, 199, 198);
  doc.text(`${ownerName} · Δημιουργήθηκε ${dateLabel(o.today, true)}`, M + 22, 18.5);
  if (contact) doc.text(contact, W - M, 18.5, { align: "right" });
  doc.setTextColor(133, 191, 202);
  doc.text(doc.splitTextToSize(o.filterSummary, W - M * 2 - 22)[0] || "", M + 22, 23);

  // ---- summary ----
  const ps = o.promotions;
  const posts = ps.filter((p) => p.kind === "post").length;
  const withCost = ps.filter((p) => p.cost !== null);
  const totalCost = withCost.reduce((s, p) => s + (p.cost || 0), 0);
  const results = ps.map(resultOf).filter((r): r is MetaResult => !!r);
  const currencies = [...new Set(results.map((r) => r.currency).filter(Boolean))];
  const sum = (k: "spend" | "impressions" | "link_clicks") =>
    results.some((r) => r[k] !== null) ? results.reduce((s, r) => s + (r[k] || 0), 0) : null;
  const spend = sum("spend");
  const clicks = sum("link_clicks");
  const boxes: [string, string][] = [
    [`Προωθήσεις (${posts} Post · ${ps.length - posts} Ads)`, String(ps.length)],
    ["Κόστος διαφήμισης", withCost.length ? formatCost(totalCost) : "—"],
    ["Δαπάνη Meta", currencies.length > 1 ? "Πολλά νομίσματα" : money(spend, currencies[0] || "EUR")],
    ["Εμφανίσεις Meta", count(sum("impressions"))],
    ["Κλικ στον σύνδεσμο", count(clicks)],
    ["Κόστος ανά κλικ", currencies.length > 1 ? "—" : costPer(spend, clicks, currencies[0] || "EUR")],
  ];
  const bw = (W - M * 2 - 5 * 4) / 6;
  boxes.forEach(([label, value], i) => {
    const x = M + i * (bw + 4);
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(214, 233, 237);
    doc.roundedRect(x, 31, bw, 16, 2, 2, "FD");
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 118, 113);
    doc.text(label, x + 3, 36);
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...CHARCOAL);
    doc.text(doc.splitTextToSize(value, bw - 6)[0], x + 3, 43);
  });
  let y = 54;
  if (!ps.length) {
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(11);
    doc.text("Δεν υπάρχουν προωθήσεις με τα επιλεγμένα φίλτρα.", M, y + 6);
  }

  // ---- one section per client ----
  const byClient = new Map<string, Promotion[]>();
  for (const p of ps) byClient.set(p.business_id, [...(byClient.get(p.business_id) || []), p]);
  const clients = [...byClient.keys()]
    .map((id) => o.data.businesses.find((b) => b.id === id))
    .filter((b): b is Business => !!b)
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
  const logos = new Map<string, string | null>();
  await Promise.all(
    clients.map(async (b) => {
      const url = o.logoUrl(b.id);
      logos.set(b.id, url ? await imageDataUrl(url, 160) : null);
    }),
  );

  const head = [
    ["Κατηγορίες", "Είδος", "Κανάλι", "Περίοδος", "Κατάσταση", "Κόστος", "Δαπάνη Meta", "Εμφανίσεις", "Απήχηση", "Κλικ", "€/κλικ", "Αποτελέσματα"],
  ];
  for (const b of clients) {
    const list = [...(byClient.get(b.id) || [])].sort((a, c) => c.starts_on.localeCompare(a.starts_on));
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 16;
    }
    const logo = logos.get(b.id);
    if (logo) doc.addImage(logo, "PNG", M, y - 1, 9, 9);
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...CHARCOAL);
    doc.text(b.name, M + (logo ? 12 : 0), y + 5.5);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 137, 131);
    const clientCost = list.filter((p) => p.cost !== null).reduce((s, p) => s + (p.cost || 0), 0);
    doc.text(
      `${list.length} ${list.length === 1 ? "προώθηση" : "προωθήσεις"}${list.some((p) => p.cost !== null) ? ` · κόστος ${formatCost(clientCost)}` : ""}`,
      W - M,
      y + 5.5,
      { align: "right" },
    );
    const body: RowInput[] = list.map((p) => {
      const r = resultOf(p);
      const ids = adsForLinks(o.meta.links.filter((l) => l.promotion_id === p.id), o.meta.ads);
      const objectives = [...new Set(o.meta.ads.filter((a) => ids.includes(a.ad_id)).map((a) => a.objective))];
      const outcomes = r ? resultValues(r.actions, objectives) : [];
      const cats = categoryNames(p.id, o.data);
      return [
        cats.length ? cats.join(", ") : p.title,
        kindLabels[p.kind],
        p.channel,
        p.kind === "post" ? dateLabel(p.starts_on, true) : `${dateLabel(p.starts_on)} – ${dateLabel(p.ends_on, true)}`,
        statusLabels[phase(p, o.today)],
        formatCost(p.cost),
        r ? money(r.spend, r.currency) : "—",
        r ? count(r.impressions) : "—",
        r ? count(r.reach) : "—",
        r ? count(r.link_clicks) : "—",
        r ? costPer(r.spend, r.link_clicks, r.currency) : "—",
        outcomes.length ? outcomes.map((x) => `${x.label}: ${count(x.value)}`).join("\n") : "—",
      ];
    });
    autoTable(doc, {
      head,
      body,
      startY: y + 10,
      margin: { left: M, right: M },
      styles: { font: "DejaVu", fontSize: 7.5, cellPadding: 1.8, textColor: [70, 68, 64], lineColor: [230, 229, 227], lineWidth: 0.1 },
      headStyles: { font: "DejaVu", fontStyle: "bold", fillColor: TEAL, textColor: 255, fontSize: 6.5, overflow: "visible" },
      alternateRowStyles: { fillColor: [250, 250, 249] },
      rowPageBreak: "avoid",
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 11 },
        2: { cellWidth: 28 },
        3: { cellWidth: 33 },
        4: { cellWidth: 29 },
        5: { cellWidth: 17, halign: "right" },
        6: { cellWidth: 19, halign: "right" },
        7: { cellWidth: 19, halign: "right" },
        8: { cellWidth: 17, halign: "right" },
        9: { cellWidth: 13, halign: "right" },
        10: { cellWidth: 18, halign: "right" },
        11: { cellWidth: "auto" },
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 147, 141);
    doc.text(
      "Στατιστικά Meta για την περίοδο κάθε προώθησης (από τη δημοσίευση έως τη λήξη). «—» = δεν υπάρχει τιμή. Η απήχηση δεν αθροίζεται μεταξύ προωθήσεων.",
      M,
      H - 6,
    );
    doc.text(`Σελίδα ${i} από ${pages}`, W - M, H - 6, { align: "right" });
  }
  doc.save(`webtag-promotions-${o.today}.pdf`);
}
