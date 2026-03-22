const STORAGE_KEY = "gider-takip-v1";
const CATEGORIES_KEY = "gider-takip-categories-v1";
const BUDGET_KEY = "gider-takip-budgets-v1";
const CHART_VIEW_KEY = "gider-takip-chart-view-v1";
const CHART_VIEW_IDS = ["month-pie", "month-bar", "trend", "sub", "budget"];
/** Sunucuda bu dosya varsa (index ile aynı klasör), her ziyaretçi aynı dışa aktarım verisini görür. */
const SHARED_BUNDLE_FILENAME = "paylasilan-veri.json";

/** baslat.bat ile açılan FastAPI+SQLite sunucusunda true; /api/bundle ile yükleme ve kayıtta otomatik PUT. */
let serverSqliteSync = false;
let serverPushTimer = null;

const CHART_PALETTE = [
  "#a78bfa",
  "#22d3ee",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#818cf8",
  "#fb923c",
  "#2dd4bf",
  "#c084fc",
  "#94a3b8",
];

function getDefaultCategories() {
  return [
    { id: "yemek", name: "Yemek & içecek", subcategories: [] },
    { id: "ulasim", name: "Ulaşım", subcategories: [] },
    { id: "market", name: "Market", subcategories: [] },
    { id: "fatura", name: "Fatura", subcategories: [] },
    { id: "eglence", name: "Eğlence", subcategories: [] },
    { id: "saglik", name: "Sağlık", subcategories: [] },
    { id: "diger", name: "Diğer", subcategories: [] },
  ];
}

function normalizeExpense(e) {
  if (!e || typeof e !== "object") return e;
  const categoryId = e.categoryId ?? e.category ?? "diger";
  const sub =
    e.subcategoryId != null && String(e.subcategoryId).trim() !== "" ? String(e.subcategoryId) : null;
  const note = typeof e.note === "string" ? e.note.trim().slice(0, 300) : "";
  const description =
    typeof e.description === "string" ? e.description.trim().slice(0, 120) : "";
  return { ...e, categoryId, subcategoryId: sub, note, description };
}

function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) {
      const def = getDefaultCategories();
      saveCategories(def);
      return def;
    }
    const data = JSON.parse(raw);
    const list = data?.categories ?? data;
    if (!Array.isArray(list) || list.length === 0) {
      const def = getDefaultCategories();
      saveCategories(def);
      return def;
    }
    return list.map((c) => ({
      id: String(c.id),
      name: String(c.name || "Adsız"),
      subcategories: Array.isArray(c.subcategories)
        ? c.subcategories.map((s) => ({ id: String(s.id), name: String(s.name || "Adsız") }))
        : [],
    }));
  } catch {
    const def = getDefaultCategories();
    saveCategories(def);
    return def;
  }
}

function saveCategories(categories) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify({ version: 1, categories }));
  schedulePushToServer();
}

function loadBudgets() {
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    const out = {};
    for (const k of Object.keys(o)) {
      const n = Number(o[k]);
      if (Number.isFinite(n) && n >= 0) out[String(k)] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function saveBudgets(map) {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(map));
  schedulePushToServer();
}

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExpenses(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  schedulePushToServer();
}

function allExpensesNormalized() {
  return loadExpenses().map(normalizeExpense);
}

function categoryById(categories, id) {
  return categories.find((c) => c.id === id);
}

function categoryDisplayName(categories, id) {
  const c = categoryById(categories, id);
  return c ? c.name : "Silinmiş kategori";
}

function subcategoryDisplayName(categories, categoryId, subId) {
  if (!subId) return null;
  const c = categoryById(categories, categoryId);
  if (!c?.subcategories) return null;
  const s = c.subcategories.find((x) => x.id === subId);
  return s ? s.name : null;
}

function expenseCategoryLine(e, categories) {
  const n = normalizeExpense(e);
  const parent = categoryDisplayName(categories, n.categoryId);
  const sub = subcategoryDisplayName(categories, n.categoryId, n.subcategoryId);
  return sub ? `${parent} › ${sub}` : parent;
}

const form = document.getElementById("expenseForm");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("date");
const descriptionInput = document.getElementById("description");
const categorySelect = document.getElementById("category");
const subcategorySelect = document.getElementById("subcategory");
const expenseList = document.getElementById("expenseList");
const emptyState = document.getElementById("emptyState");
const monthTotalEl = document.getElementById("monthTotal");
const summaryPeriodHint = document.getElementById("summaryPeriodHint");
const filterMonth = document.getElementById("filterMonth");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const sqliteSyncHint = document.getElementById("sqliteSyncHint");
const chartPeriodLabel = document.getElementById("chartPeriodLabel");
const chartViewPills = document.getElementById("chartViewPills");
const chartViewHint = document.getElementById("chartViewHint");
const chartPanelMonth = document.getElementById("chartPanelMonth");
const chartMonthPanelHeading = document.getElementById("chartMonthPanelHeading");
const monthCategorySummary = document.getElementById("monthCategorySummary");
const monthCategorySummaryLead = document.getElementById("monthCategorySummaryLead");
const monthCategorySummaryList = document.getElementById("monthCategorySummaryList");
const monthPieBlock = document.getElementById("monthPieBlock");
const monthBarBlock = document.getElementById("monthBarBlock");
const chartEmptyStateMonth = document.getElementById("chartEmptyStateMonth");
const chartPanelTrend = document.getElementById("chartPanelTrend");
const chartPanelSub = document.getElementById("chartPanelSub");
const chartPanelBudget = document.getElementById("chartPanelBudget");
const chartsLibError = document.getElementById("chartsLibError");
const addParentCategoryForm = document.getElementById("addParentCategoryForm");
const newParentCategoryName = document.getElementById("newParentCategoryName");
const categoryTreeEl = document.getElementById("categoryTree");
const renameDialog = document.getElementById("renameDialog");
const renameDialogTitle = document.getElementById("renameDialogTitle");
const renameDialogInput = document.getElementById("renameDialogInput");
const renameDialogCancel = document.getElementById("renameDialogCancel");
const renameDialogSave = document.getElementById("renameDialogSave");
const recordsSearch = document.getElementById("recordsSearch");
const recordsCategoryFilter = document.getElementById("recordsCategoryFilter");
const subChartParent = document.getElementById("subChartParent");
const trendEmptyState = document.getElementById("trendEmptyState");
const trendChartWrap = document.getElementById("trendChartWrap");
const subChartEmpty = document.getElementById("subChartEmpty");
const subChartWrap = document.getElementById("subChartWrap");
const subChartTotalLine = document.getElementById("subChartTotalLine");
const budgetListEl = document.getElementById("budgetList");
const saveBudgetsBtn = document.getElementById("saveBudgetsBtn");
const editExpenseDialog = document.getElementById("editExpenseDialog");
const editExpenseForm = document.getElementById("editExpenseForm");
const editExpenseId = document.getElementById("editExpenseId");
const editAmount = document.getElementById("editAmount");
const editDate = document.getElementById("editDate");
const editDescription = document.getElementById("editDescription");
const editCategory = document.getElementById("editCategory");
const editSubcategory = document.getElementById("editSubcategory");
const editNote = document.getElementById("editNote");
const editExpenseCancel = document.getElementById("editExpenseCancel");

let chartDoughnut = null;
let chartBar = null;
let chartTrend = null;
let chartSub = null;

let lastAllNormalized = [];
let lastMonthStr = "";
let lastCategories = [];
/** @type {{ type: 'parent', categoryId: string } | { type: 'sub', categoryId: string, subId: string } | null} */
let renameTarget = null;

function applyRenameForTarget(target, trimmed) {
  if (!target || !trimmed) return;
  const list = loadCategories();
  if (target.type === "parent") {
    const idx = list.findIndex((x) => x.id === target.categoryId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], name: trimmed };
  } else if (target.type === "sub") {
    const cat = list.find((x) => x.id === target.categoryId);
    if (!cat) return;
    const si = cat.subcategories.findIndex((x) => x.id === target.subId);
    if (si === -1) return;
    cat.subcategories[si] = { ...cat.subcategories[si], name: trimmed };
  } else {
    return;
  }
  saveCategories(list);
  renderCategoryTree();
  refreshCategorySelects();
  render();
}

function showRenameDialog(title, currentName, target) {
  if (renameDialog && typeof renameDialog.showModal === "function") {
    renameTarget = target;
    renameDialogTitle.textContent = title;
    renameDialogInput.value = currentName;
    renameDialog.showModal();
    queueMicrotask(() => {
      renameDialogInput.focus();
      renameDialogInput.select();
    });
  } else {
    const next = prompt(title, currentName);
    if (next == null) return;
    const t = next.trim();
    if (!t) return;
    applyRenameForTarget(target, t);
  }
}

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAxisMoney(value) {
  return (
    new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 0,
    }).format(value) + " ₺"
  );
}

function formatDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMonthTitle(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return "";
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(d);
}

function currentMonthFilter() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Üstteki ay seçimine göre form tarihi: bu ay → bugün; geçmiş ay → ayın son günü; gelecek ay → ayın 1’i */
function defaultDateForSelectedMonth(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return todayISODate();
  const [y, m] = monthStr.split("-").map(Number);
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (y === cy && m === cm) return todayISODate();

  const selected = y * 12 + m;
  const current = cy * 12 + cm;
  if (selected < current) {
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function syncExpenseDateToSelectedMonth() {
  if (!dateInput || !filterMonth) return;
  dateInput.value = defaultDateForSelectedMonth(filterMonth.value);
}

/** Ay filtresini bir ay geri veya ileri alır; grafik ve kayıtlar buna göre güncellenir */
function shiftFilterMonth(deltaMonths) {
  const raw = filterMonth?.value;
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return;
  const [y, m] = raw.split("-").map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  const ny = d.getFullYear();
  const nm = d.getMonth() + 1;
  filterMonth.value = `${ny}-${String(nm).padStart(2, "0")}`;
  syncExpenseDateToSelectedMonth();
  render();
  refreshChartsLayout();
}

function expenseMatchesMonth(expense, monthStr) {
  if (!monthStr) return true;
  return expense.date.startsWith(monthStr);
}

function computeMonthTotal(expenses, monthStr) {
  return expenses
    .filter((e) => expenseMatchesMonth(e, monthStr))
    .reduce((sum, e) => sum + e.amount, 0);
}

function sortExpensesDesc(items) {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });
}

function aggregateByCategoryIds(expenses, monthStr) {
  const totals = {};
  for (const e of expenses) {
    if (!expenseMatchesMonth(e, monthStr)) continue;
    const n = normalizeExpense(e);
    const id = n.categoryId || "diger";
    totals[id] = (totals[id] || 0) + e.amount;
  }
  return totals;
}

function buildSlicesForMonth(expenses, monthStr, categories) {
  const totals = aggregateByCategoryIds(expenses, monthStr);
  const entries = Object.keys(totals)
    .map((key) => ({ key, amount: totals[key] }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    labels: entries.map((x) => categoryDisplayName(categories, x.key)),
    keys: entries.map((x) => x.key),
    data: entries.map((x) => x.amount),
  };
}

function buildBarSlicesAscending(expenses, monthStr, categories) {
  const totals = aggregateByCategoryIds(expenses, monthStr);
  const entries = Object.keys(totals)
    .map((key) => ({ key, amount: totals[key] }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => a.amount - b.amount);

  return {
    labels: entries.map((x) => categoryDisplayName(categories, x.key)),
    keys: entries.map((x) => x.key),
    data: entries.map((x) => x.amount),
  };
}

function lastNMonthStrings(endMonthStr, n) {
  if (!endMonthStr || !/^\d{4}-\d{2}$/.test(endMonthStr)) return [];
  const [y, m] = endMonthStr.split("-").map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function shortMonthLabel(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit" }).format(d);
}

/** Trend ekseni: seçili aydan önceki dönemler ay sonu tarihiyle (tam kapanmış ay). */
function trendChartAxisLabel(monthStr, reportMonthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;
  if (!reportMonthStr || monthStr >= reportMonthStr) return shortMonthLabel(monthStr);
  const [y, m] = monthStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = new Date(y, m - 1, lastDay);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "2-digit" }).format(d);
}

function aggregateSubcategoriesForParent(expenses, monthStr, parentId) {
  const totals = {};
  let noSub = 0;
  for (const e of expenses) {
    if (!expenseMatchesMonth(e, monthStr)) continue;
    const n = normalizeExpense(e);
    if (n.categoryId !== parentId) continue;
    if (!n.subcategoryId) {
      noSub += e.amount;
    } else {
      const sid = n.subcategoryId;
      totals[sid] = (totals[sid] || 0) + e.amount;
    }
  }
  const entries = Object.entries(totals)
    .map(([id, amount]) => ({ id, amount }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (noSub > 0) entries.push({ id: "__none__", amount: noSub });
  return entries;
}

function matchesRecordFilters(e, qRaw, catFilter) {
  const n = normalizeExpense(e);
  if (catFilter && n.categoryId !== catFilter) return false;
  const q = (qRaw || "").trim().toLowerCase();
  if (!q) return true;
  const d = (n.description || "").toLowerCase();
  const note = (n.note || "").toLowerCase();
  return d.includes(q) || note.includes(q);
}

function chartColorAt(index) {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

function destroyMainMonthCharts() {
  if (chartDoughnut) {
    chartDoughnut.destroy();
    chartDoughnut = null;
  }
  if (chartBar) {
    chartBar.destroy();
    chartBar = null;
  }
}

/** Seçili ay üst kategorileri harcamaya göre (yüksekten düşüğe) özetler. */
function updateMonthCategorySummary(pie) {
  if (!monthCategorySummary || !monthCategorySummaryLead || !monthCategorySummaryList) return;
  if (!pie?.labels?.length) {
    monthCategorySummary.hidden = true;
    monthCategorySummaryLead.textContent = "";
    monthCategorySummaryList.innerHTML = "";
    return;
  }
  monthCategorySummary.hidden = false;
  monthCategorySummaryLead.textContent = "";
  const topStrong = document.createElement("strong");
  topStrong.textContent = pie.labels[0];
  monthCategorySummaryLead.append(document.createTextNode("En yüksek harcama: "), topStrong, document.createTextNode("."));
  monthCategorySummaryList.innerHTML = "";
  for (let i = 0; i < pie.labels.length; i++) {
    const li = document.createElement("li");
    li.className = "month-summary__item";
    const name = document.createElement("span");
    name.className = "month-summary__name";
    name.textContent = pie.labels[i];
    const amt = document.createElement("span");
    amt.className = "month-summary__amount";
    amt.textContent = formatMoney(pie.data[i]);
    li.append(name, amt);
    monthCategorySummaryList.append(li);
  }
}

function destroyTrendChart() {
  if (chartTrend) {
    chartTrend.destroy();
    chartTrend = null;
  }
}

function destroySubChart() {
  if (chartSub) {
    chartSub.destroy();
    chartSub = null;
  }
}

function destroyCharts() {
  destroyMainMonthCharts();
  destroyTrendChart();
  destroySubChart();
}

function refreshChartsLayout() {
  requestAnimationFrame(() => {
    if (chartDoughnut) chartDoughnut.resize();
    if (chartBar) chartBar.resize();
    if (chartTrend) chartTrend.resize();
    if (chartSub) chartSub.resize();
  });
}

function chartTooltipLabel(context) {
  const label = context.label || "";
  const raw = context.parsed;
  const n = typeof raw === "number" ? raw : raw?.x ?? raw?.y ?? 0;
  return `${label}: ${formatMoney(n)}`;
}

/** Trend: ipucunda yalnızca veri dizisindeki kesin tutar (₺, iki ondalık); eksen yuvarlak gösterge olabilir. */
function chartTrendTooltipCallbacks() {
  return {
    title: () => "",
    label(ctx) {
      const v = Number(ctx.dataset.data[ctx.dataIndex]);
      return formatMoney(Number.isFinite(v) ? v : 0);
    },
  };
}

let percentLabelsPluginRegistered = false;

/** Pasta/halka ve çubuklarda yüzde; trend çubuğunda aylık toplam tutar (₺). */
const percentLabelsPlugin = {
  id: "percentLabels",
  afterDatasetsDraw(chart) {
    const type = chart.config.type;
    const dataset = chart.data.datasets[0];
    if (!dataset?.data?.length) return;
    const data = dataset.data.map((v) => Number(v));
    const total = data.reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0);
    if (total <= 0) return;

    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;
    ctx.save();
    const fontFamily = chart.options?.font?.family ?? "'DM Sans', system-ui, sans-serif";
    ctx.textBaseline = "middle";

    function pctLabel(value, minPercent = 0.05) {
      if (!Number.isFinite(value) || value <= 0) return null;
      const p = (value / total) * 100;
      if (p < minPercent) return null;
      const rounded = Math.round(p);
      if (rounded === 0 && p > 0) return "<1%";
      return `${rounded}%`;
    }

    function drawOutlinedText(text, x, y, align, strokeW = 3) {
      ctx.textAlign = align;
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = "rgba(6, 6, 15, 0.92)";
      ctx.fillStyle = "#f4f0ff";
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }

    if (type === "doughnut" || type === "pie") {
      const canvasId = chart.canvas?.id ?? "";
      const useOutsideCallouts = canvasId === "chartSub" || canvasId === "chartDoughnut";
      const subLabelPx = 14;
      const subStroke = 4.5;
      ctx.font = `600 ${useOutsideCallouts ? subLabelPx : 11}px ${fontFamily}`;
      const lineLen = useOutsideCallouts ? 50 : 36;
      const textPad = useOutsideCallouts ? 14 : 10;

      meta.data.forEach((arc, i) => {
        const text = pctLabel(data[i], useOutsideCallouts ? 0.02 : 0.05);
        if (!text || typeof arc.tooltipPosition !== "function") return;
        const span = arc.endAngle - arc.startAngle;
        if (span < (useOutsideCallouts ? 0.055 : 0.11)) return;
        const innerTip = arc.tooltipPosition();
        if (!useOutsideCallouts) {
          drawOutlinedText(text, innerTip.x, innerTip.y, "center", 3);
          return;
        }

        const cx = arc.x;
        const cy = arc.y;
        let ux = innerTip.x - cx;
        let uy = innerTip.y - cy;
        const ulen = Math.hypot(ux, uy);
        if (ulen < 1e-6) return;
        ux /= ulen;
        uy /= ulen;
        /** Çizgiyi dilim gövdesinden başlatma; dış çemberin hemen dışında başlar (üst üste binmeyi azaltır). */
        const outerR =
          typeof arc.outerRadius === "number" && arc.outerRadius > 0 ? arc.outerRadius : ulen;
        const outset = 6;
        const tip = { x: cx + ux * (outerR + outset), y: cy + uy * (outerR + outset) };

        const area = chart.chartArea;
        /** Alt yarıda düz radyal çizgi lejanta doğru iner; yatay dirsek ile etiketi halkanın hizasında tut. */
        const useElbowDown = uy > 0.16;

        ctx.strokeStyle = "rgba(167, 139, 250, 0.55)";
        ctx.lineWidth = 1.25;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        let labelX;
        let labelY;
        let align;

        if (useElbowDown) {
          const stub = 16;
          const kneeX = tip.x + ux * stub;
          const kneeY = tip.y + uy * stub;
          const effSign = Math.abs(ux) < 0.22 ? (tip.x >= cx ? 1 : -1) : Math.sign(ux || 1);
          const horiz = Math.max(lineLen + 8, 48);
          let bendX = kneeX + effSign * horiz;
          const bendY = kneeY;
          const margin = 16;
          bendX = Math.min(area.right - margin, Math.max(area.left + margin, bendX));
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(bendX, bendY);
          ctx.stroke();
          const ah = 4;
          const px = -uy;
          const py = ux;
          ctx.fillStyle = "rgba(167, 139, 250, 0.75)";
          ctx.beginPath();
          ctx.moveTo(tip.x + ux * 6, tip.y + uy * 6);
          ctx.lineTo(tip.x + ux * 1.5 + px * ah, tip.y + uy * 1.5 + py * ah);
          ctx.lineTo(tip.x + ux * 1.5 - px * ah, tip.y + uy * 1.5 - py * ah);
          ctx.closePath();
          ctx.fill();
          labelX = bendX + effSign * textPad;
          labelY = bendY;
          align = effSign > 0 ? "left" : "right";
        } else {
          const endX = tip.x + ux * lineLen;
          const endY = tip.y + uy * lineLen;
          labelX = tip.x + ux * (lineLen + textPad);
          labelY = tip.y + uy * (lineLen + textPad);
          align = ux >= 0 ? "left" : "right";
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          const ah = 5;
          const px = -uy;
          const py = ux;
          ctx.fillStyle = "rgba(167, 139, 250, 0.75)";
          ctx.beginPath();
          ctx.moveTo(tip.x + ux * 7, tip.y + uy * 7);
          ctx.lineTo(tip.x + ux * 2 + px * ah, tip.y + uy * 2 + py * ah);
          ctx.lineTo(tip.x + ux * 2 - px * ah, tip.y + uy * 2 - py * ah);
          ctx.closePath();
          ctx.fill();
        }

        drawOutlinedText(text, labelX, labelY, align, subStroke);
      });
    } else if (type === "bar") {
      const canvasId = chart.canvas?.id ?? "";
      const isTrend = canvasId === "chartTrend";
      if (isTrend) {
        ctx.font = `600 12px ${fontFamily}`;
        const horizontal = chart.options.indexAxis === "y";
        meta.data.forEach((bar, i) => {
          const v = data[i];
          if (!Number.isFinite(v) || v <= 0) return;
          if (typeof bar.tooltipPosition !== "function") return;
          const text = formatMoney(v);
          if (horizontal) {
            const p = bar.tooltipPosition();
            drawOutlinedText(text, Math.min(p.x + 10, chart.chartArea.right - 4), p.y, "left", 3.5);
          } else {
            const p = bar.tooltipPosition();
            const top =
              typeof bar.y === "number" && typeof bar.base === "number" ? Math.min(bar.y, bar.base) : p.y;
            drawOutlinedText(text, bar.x, Math.max(top - 10, chart.chartArea.top + 6), "center", 3.5);
          }
        });
      } else {
        ctx.font = `600 11px ${fontFamily}`;
        const horizontal = chart.options.indexAxis === "y";
        meta.data.forEach((bar, i) => {
          const text = pctLabel(data[i]);
          if (!text || typeof bar.tooltipPosition !== "function") return;
          const p = bar.tooltipPosition();
          if (horizontal) {
            drawOutlinedText(text, Math.min(p.x + 8, chart.chartArea.right - 4), p.y, "left");
          } else {
            ctx.textAlign = "center";
            drawOutlinedText(text, p.x, Math.max(p.y - 6, chart.chartArea.top + 8), "center");
          }
        });
      }
    }
    ctx.restore();
  },
};

function ensurePercentLabelsPlugin() {
  if (percentLabelsPluginRegistered || typeof Chart === "undefined") return;
  Chart.register(percentLabelsPlugin);
  percentLabelsPluginRegistered = true;
}

function renderTrendChartInternal(allNormalized, endMonthStr) {
  if (!trendEmptyState || !trendChartWrap) return;
  const canvas = document.getElementById("chartTrend");
  if (!canvas) return;
  const months = lastNMonthStrings(endMonthStr, 6);
  const data = months.map((m) => computeMonthTotal(allNormalized, m));
  if (data.reduce((a, b) => a + b, 0) === 0) {
    destroyTrendChart();
    trendEmptyState.hidden = false;
    trendChartWrap.hidden = true;
    return;
  }
  trendEmptyState.hidden = true;
  trendChartWrap.hidden = false;
  destroyTrendChart();
  const labels = months.map((m) => trendChartAxisLabel(m, endMonthStr));
  chartTrend = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "",
          data,
          backgroundColor: months.map((_, i) => chartColorAt(i + 1)),
          borderWidth: 0,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: chartTrendTooltipCallbacks(),
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(139, 92, 246, 0.12)" },
          ticks: { color: "#9d99bc", maxRotation: 45 },
        },
        y: {
          grid: { color: "rgba(139, 92, 246, 0.12)" },
          ticks: {
            color: "#9d99bc",
            callback: (v) => formatAxisMoney(v),
          },
        },
      },
    },
  });
}

function renderSubChartInternal(allNormalized, monthStr, categories) {
  if (!subChartEmpty || !subChartWrap || !subChartParent) return;
  const canvas = document.getElementById("chartSub");
  if (!canvas) return;
  const parentId = subChartParent.value;
  if (!parentId) {
    destroySubChart();
    subChartEmpty.textContent = "Görüntülemek için üst kategori seçin.";
    subChartEmpty.hidden = false;
    subChartWrap.hidden = true;
    return;
  }
  const entries = aggregateSubcategoriesForParent(allNormalized, monthStr, parentId);
  const cat = categoryById(categories, parentId);
  if (entries.length === 0) {
    destroySubChart();
    if (subChartTotalLine) subChartTotalLine.hidden = true;
    subChartEmpty.textContent = cat
      ? `Seçili dönemde “${cat.name}” kategorisine ilişkin kayıt bulunmamaktadır.`
      : "Seçili dönemde bu üst kategori için kayıt bulunmamaktadır.";
    subChartEmpty.hidden = false;
    subChartWrap.hidden = true;
    return;
  }
  subChartEmpty.hidden = true;
  subChartWrap.hidden = false;
  destroySubChart();
  const subTotal = entries.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  if (subChartTotalLine) {
    const catName = cat?.name ?? "Seçili üst kategori";
    subChartTotalLine.textContent = `${catName} Toplam gider: ${formatMoney(subTotal)}`;
    subChartTotalLine.hidden = false;
  }
  const labels = entries.map((x) =>
    x.id === "__none__" ? "Alt kategori atanmamış" : subcategoryDisplayName(categories, parentId, x.id) || "Alt"
  );
  const data = entries.map((x) => x.amount);
  const bg = entries.map((_, i) => chartColorAt(i + 2));
  chartSub = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: bg,
          borderWidth: 0,
          hoverOffset: 6,
          radius: "66%",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      layout: {
        padding: { top: 72, right: 76, bottom: 32, left: 76 },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#f4f0ff",
            boxWidth: 14,
            padding: 12,
            font: { size: 13, weight: "500" },
          },
        },
        tooltip: { callbacks: { label: chartTooltipLabel } },
      },
    },
  });
}

function renderBudgetSection(categories, all, monthStr) {
  if (!budgetListEl) return;
  const budgets = loadBudgets();
  const totals = aggregateByCategoryIds(all, monthStr);
  budgetListEl.innerHTML = "";
  for (const c of categories) {
    const spent = totals[c.id] || 0;
    const cap = budgets[c.id] ?? 0;
    const row = document.createElement("div");
    row.className = "budget-row";
    const top = document.createElement("div");
    top.className = "budget-row__top";
    const name = document.createElement("span");
    name.className = "budget-row__name";
    name.textContent = c.name;
    const inputWrap = document.createElement("div");
    inputWrap.className = "budget-row__input-wrap";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.step = "0.01";
    inp.className = "budget-row__input";
    inp.dataset.categoryId = c.id;
    inp.value = cap > 0 ? String(cap) : "";
    inp.placeholder = "Üst limit";
    inp.setAttribute(
      "aria-label",
      `${c.name} — dönem içi maksimum gider tutarı (üst limit, ₺)`
    );
    const tl = document.createElement("span");
    tl.className = "budget-row__meta";
    tl.textContent = "₺";
    inputWrap.append(inp, tl);
    top.append(name, inputWrap);
    row.append(top);
    const bar = document.createElement("div");
    bar.className = "budget-row__bar";
    const fill = document.createElement("div");
    fill.className = "budget-row__bar-fill";
    if (cap > 0) {
      const pct = Math.min(100, (spent / cap) * 100);
      fill.style.width = `${pct}%`;
      if (spent > cap) fill.classList.add("budget-row__bar-fill--over");
    } else {
      fill.style.width = "0%";
    }
    const hoverTip = `Dönem içi harcama: ${formatMoney(spent)}`;
    const tipEl = document.createElement("span");
    tipEl.className = "budget-row__tooltip";
    tipEl.textContent = hoverTip;
    tipEl.setAttribute("role", "tooltip");
    bar.append(fill, tipEl);
    bar.tabIndex = 0;
    const meta = document.createElement("div");
    meta.className = "budget-row__meta";
    let line =
      cap > 0
        ? `Dönem içi harcama: ${formatMoney(spent)} · Maksimum (üst limit): ${formatMoney(cap)}`
        : `Dönem içi harcama: ${formatMoney(spent)} — üst limit tanımlı değil`;
    if (cap > 0 && spent > cap) line += " · Limit aşımı";
    meta.textContent = line;
    row.append(bar, meta);
    budgetListEl.append(row);
  }
}

function renderExpenseList(categories, all, monthStr) {
  if (!expenseList || !emptyState) return;
  const q = recordsSearch?.value ?? "";
  const catFilter = recordsCategoryFilter?.value ?? "";
  const inMonth = all.filter((e) => expenseMatchesMonth(e, monthStr));
  const filtered = sortExpensesDesc(inMonth.filter((e) => matchesRecordFilters(e, q, catFilter)));

  expenseList.innerHTML = "";
  if (filtered.length === 0) {
    emptyState.hidden = false;
    emptyState.innerHTML =
      inMonth.length === 0
        ? "Bu dönemde kayıt yok. Eklemek için <strong>Yeni gider</strong> sekmesine geçin."
        : "Kriterlere uyan kayıt yok. Aramayı temizleyin veya üst kategori filtresini <strong>Tümü</strong> yapın.";
    return;
  }
  emptyState.hidden = true;

  for (const e of filtered) {
    const n = normalizeExpense(e);
    const li = document.createElement("li");
    li.className = "expense-item";
    li.setAttribute("role", "listitem");

    const main = document.createElement("div");
    main.className = "expense-item__main";

    const desc = document.createElement("p");
    desc.className = "expense-item__desc";
    const descText = (e.description || "").trim();
    const catLine = expenseCategoryLine(e, categories);
    if (descText) {
      desc.textContent = descText;
    } else {
      desc.textContent = catLine;
    }

    const meta = document.createElement("p");
    meta.className = "expense-item__meta";
    meta.textContent = descText
      ? `${catLine} · ${formatDisplayDate(e.date)}`
      : formatDisplayDate(e.date);

    main.append(desc, meta);
    if (n.note) {
      const noteEl = document.createElement("p");
      noteEl.className = "expense-item__note";
      noteEl.textContent = n.note;
      main.append(noteEl);
    }

    const amount = document.createElement("div");
    amount.className = "expense-item__amount";
    amount.textContent = formatMoney(e.amount);

    const actions = document.createElement("div");
    actions.className = "expense-item__actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--ghost btn--small";
    editBtn.textContent = "Düzenle";
    editBtn.addEventListener("click", () => openEditExpenseDialog(e));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--danger";
    del.textContent = "Sil";
    del.addEventListener("click", () => {
      const next = loadExpenses().filter((x) => x.id !== e.id);
      saveExpenses(next);
      render();
    });
    actions.append(editBtn, del);

    li.append(main, amount, actions);
    expenseList.append(li);
  }
}

function updateEditSubcategoryOptions() {
  if (!editCategory || !editSubcategory) return;
  const cats = loadCategories();
  const catId = editCategory.value;
  const cat = categoryById(cats, catId);
  const prev = editSubcategory.value;
  editSubcategory.innerHTML = "";
  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "— Yok —";
  editSubcategory.append(optEmpty);
  if (!cat?.subcategories?.length) {
    editSubcategory.disabled = true;
    editSubcategory.value = "";
    return;
  }
  editSubcategory.disabled = false;
  for (const s of cat.subcategories) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    editSubcategory.append(o);
  }
  if (prev && cat.subcategories.some((x) => x.id === prev)) {
    editSubcategory.value = prev;
  }
}

function openEditExpenseDialog(e) {
  if (!editExpenseDialog || typeof editExpenseDialog.showModal !== "function") return;
  const n = normalizeExpense(e);
  editExpenseId.value = e.id;
  editAmount.value = String(e.amount);
  editDate.value = e.date;
  editDescription.value = n.description ?? "";
  editNote.value = n.note || "";

  const cats = loadCategories();
  editCategory.innerHTML = "";
  for (const c of cats) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    editCategory.append(o);
  }
  if (cats.some((x) => x.id === n.categoryId)) {
    editCategory.value = n.categoryId;
  } else if (cats.length) {
    editCategory.value = cats[0].id;
  }
  updateEditSubcategoryOptions();
  if (n.subcategoryId && !editSubcategory.disabled) {
    editSubcategory.value = n.subcategoryId;
  } else {
    editSubcategory.value = "";
  }

  editExpenseDialog.showModal();
  queueMicrotask(() => editAmount.focus());
}

function loadChartViewPreference() {
  try {
    const v = localStorage.getItem(CHART_VIEW_KEY);
    if (CHART_VIEW_IDS.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "month-pie";
}

function persistChartView(view) {
  try {
    if (CHART_VIEW_IDS.includes(view)) {
      localStorage.setItem(CHART_VIEW_KEY, view);
    }
  } catch {
    /* ignore */
  }
}

function setChartView(view) {
  const v = CHART_VIEW_IDS.includes(view) ? view : "month-pie";
  if (chartViewPills) {
    for (const btn of chartViewPills.querySelectorAll("[data-chart-view]")) {
      const on = btn.dataset.chartView === v;
      btn.classList.toggle("chart-view-pills__btn--active", on);
      btn.setAttribute("aria-selected", String(on));
    }
  }
  persistChartView(v);
}

function getChartView() {
  const active = chartViewPills?.querySelector(".chart-view-pills__btn--active[data-chart-view]");
  const v = active?.dataset.chartView;
  if (CHART_VIEW_IDS.includes(v)) return v;
  return loadChartViewPreference();
}

function applyChartViewPanels(view) {
  const monthOn = view === "month-pie" || view === "month-bar";
  if (chartPanelMonth) chartPanelMonth.hidden = !monthOn;
  if (chartPanelTrend) chartPanelTrend.hidden = view !== "trend";
  if (chartPanelSub) chartPanelSub.hidden = view !== "sub";
  if (chartPanelBudget) chartPanelBudget.hidden = view !== "budget";

  const hints = {
    "month-pie": "Seçili dönemde her üst kategorinin toplam harcamadaki payı.",
    "month-bar": "Seçili dönem: üst kategoriler tutar sırasıyla; çubukta pay yüzdesi.",
    trend: "Seçili aya kadar son altı ayın aylık toplamları ve dönem içi payları.",
    sub: "Bir üst kategori seçin; alt kırılım halka grafikte, yüzde dış etiketle.",
    budget: "Üst kategori başına dönem üst limiti (₺). Çubuk harcamayı limite göre gösterir.",
  };
  if (chartViewHint) chartViewHint.textContent = hints[view] ?? "";
}

function renderCharts(allNormalized, monthStr, categories) {
  const period = formatMonthTitle(monthStr);
  if (summaryPeriodHint) {
    summaryPeriodHint.textContent = period ? `Kayıtlar ve raporlar · ${period}` : "";
  }
  if (chartPeriodLabel) {
    chartPeriodLabel.textContent = period || "";
  }
  if (chartMonthPanelHeading) {
    chartMonthPanelHeading.textContent = period
      ? `${period} aylık harcama yüzdesi`
      : "Aylık harcama yüzdesi";
  }

  lastAllNormalized = allNormalized;
  lastMonthStr = monthStr;
  lastCategories = categories;

  const view = getChartView();
  applyChartViewPanels(view);

  if (typeof Chart === "undefined") {
    destroyCharts();
    if (chartsLibError) {
      chartsLibError.hidden = false;
      chartsLibError.textContent =
        "Grafik bileşeni yüklenemedi. Sayfayı yenileyin veya bağlantıyı denetleyin. Üst limit ekranı grafiksiz kullanılabilir.";
    }
    if (chartPanelMonth) chartPanelMonth.hidden = true;
    if (chartPanelTrend) chartPanelTrend.hidden = true;
    if (chartPanelSub) chartPanelSub.hidden = true;
    if (chartPanelBudget) chartPanelBudget.hidden = view !== "budget";
    return;
  }

  if (chartsLibError) chartsLibError.hidden = true;

  Chart.defaults.color = "#9d99bc";
  Chart.defaults.borderColor = "rgba(167, 139, 250, 0.12)";
  Chart.defaults.font.family = "'DM Sans', 'Space Grotesk', system-ui, sans-serif";
  ensurePercentLabelsPlugin();

  if (view === "budget") {
    destroyCharts();
    return;
  }

  const pie = buildSlicesForMonth(allNormalized, monthStr, categories);
  const monthHasData = pie.data.length > 0;

  if (view === "month-pie" || view === "month-bar") {
    if (!monthHasData) {
      destroyMainMonthCharts();
      if (chartEmptyStateMonth) {
        chartEmptyStateMonth.hidden = false;
        chartEmptyStateMonth.textContent =
          "Bu dönemde veri yok. Kayıt ekleyin veya üstteki dönemi değiştirin.";
      }
      if (monthPieBlock) monthPieBlock.hidden = true;
      if (monthBarBlock) monthBarBlock.hidden = true;
      updateMonthCategorySummary(null);
    } else {
      if (chartEmptyStateMonth) chartEmptyStateMonth.hidden = true;
      const bgPie = pie.keys.map((_, i) => chartColorAt(i));
      const keyToColor = {};
      pie.keys.forEach((k, i) => {
        keyToColor[k] = chartColorAt(i);
      });
      const bar = buildBarSlicesAscending(allNormalized, monthStr, categories);
      const bgBar = bar.keys.map((k) => keyToColor[k] ?? chartColorAt(0));
      const canvasD = document.getElementById("chartDoughnut");
      const canvasB = document.getElementById("chartBar");

      if (view === "month-pie") {
        if (monthPieBlock) monthPieBlock.hidden = false;
        if (monthBarBlock) monthBarBlock.hidden = true;
        if (chartBar) {
          chartBar.destroy();
          chartBar = null;
        }
        if (canvasD) {
          if (chartDoughnut) chartDoughnut.destroy();
          chartDoughnut = new Chart(canvasD, {
            type: "doughnut",
            data: {
              labels: pie.labels,
              datasets: [
                {
                  data: pie.data,
                  backgroundColor: bgPie,
                  borderWidth: 0,
                  hoverOffset: 6,
                  radius: "66%",
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: "58%",
              layout: {
                padding: { top: 72, right: 76, bottom: 32, left: 76 },
              },
              plugins: {
                legend: {
                  position: "bottom",
                  labels: {
                    color: "#f4f0ff",
                    boxWidth: 14,
                    padding: 12,
                    font: { size: 13, weight: "500" },
                  },
                },
                tooltip: {
                  callbacks: { label: chartTooltipLabel },
                },
              },
            },
          });
        }
      } else {
        if (monthPieBlock) monthPieBlock.hidden = true;
        if (monthBarBlock) monthBarBlock.hidden = false;
        if (chartDoughnut) {
          chartDoughnut.destroy();
          chartDoughnut = null;
        }
        if (canvasB) {
          if (chartBar) chartBar.destroy();
          chartBar = new Chart(canvasB, {
            type: "bar",
            data: {
              labels: bar.labels,
              datasets: [
                {
                  data: bar.data,
                  backgroundColor: bgBar,
                  borderWidth: 0,
                  borderRadius: 6,
                  barThickness: 18,
                },
              ],
            },
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: { label: chartTooltipLabel },
                },
              },
              scales: {
                x: {
                  grid: { color: "rgba(139, 92, 246, 0.12)" },
                  ticks: {
                    color: "#9d99bc",
                    callback: (v) => formatAxisMoney(v),
                  },
                },
                y: {
                  grid: { display: false },
                  ticks: {
                    color: "#f4f0ff",
                    font: { size: 11 },
                  },
                },
              },
            },
          });
        }
      }
      updateMonthCategorySummary(pie);
    }
  } else {
    destroyMainMonthCharts();
    if (chartEmptyStateMonth) chartEmptyStateMonth.hidden = true;
    if (monthPieBlock) monthPieBlock.hidden = true;
    if (monthBarBlock) monthBarBlock.hidden = true;
    updateMonthCategorySummary(null);
  }

  if (view === "trend") {
    renderTrendChartInternal(allNormalized, monthStr);
  } else {
    destroyTrendChart();
    if (trendEmptyState) {
      trendEmptyState.hidden = true;
      trendEmptyState.textContent = "Bu aralıkta veri bulunmamaktadır.";
    }
    if (trendChartWrap) trendChartWrap.hidden = true;
  }

  if (view === "sub") {
    renderSubChartInternal(allNormalized, monthStr, categories);
  } else {
    destroySubChart();
    if (subChartEmpty) subChartEmpty.hidden = true;
    if (subChartWrap) subChartWrap.hidden = true;
  }
}

function refreshCategorySelects() {
  const cats = loadCategories();
  const currentCat = categorySelect.value;
  categorySelect.innerHTML = "";
  for (const c of cats) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    categorySelect.append(o);
  }
  if (currentCat && cats.some((x) => x.id === currentCat)) {
    categorySelect.value = currentCat;
  } else if (cats.length) {
    categorySelect.value = cats[0].id;
  }
  updateSubcategorySelect();

  if (recordsCategoryFilter) {
    const prevF = recordsCategoryFilter.value;
    recordsCategoryFilter.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "Tümü";
    recordsCategoryFilter.append(allOpt);
    for (const c of cats) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      recordsCategoryFilter.append(o);
    }
    if (prevF && (prevF === "" || cats.some((x) => x.id === prevF))) {
      recordsCategoryFilter.value = prevF;
    }
  }

  if (subChartParent) {
    const prevS = subChartParent.value;
    subChartParent.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Üst kategori seçin";
    subChartParent.append(opt0);
    for (const c of cats) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      subChartParent.append(o);
    }
    if (prevS && cats.some((x) => x.id === prevS)) {
      subChartParent.value = prevS;
    }
  }
}

function updateSubcategorySelect() {
  const cats = loadCategories();
  const catId = categorySelect.value;
  const cat = categoryById(cats, catId);
  const prev = subcategorySelect.value;
  subcategorySelect.innerHTML = "";
  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "— Yok —";
  subcategorySelect.append(optEmpty);

  if (!cat?.subcategories?.length) {
    subcategorySelect.disabled = true;
    subcategorySelect.value = "";
    return;
  }

  subcategorySelect.disabled = false;
  for (const s of cat.subcategories) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    subcategorySelect.append(o);
  }
  if (prev && cat.subcategories.some((x) => x.id === prev)) {
    subcategorySelect.value = prev;
  }
}

function countExpensesInCategory(categoryId) {
  return loadExpenses().filter((e) => normalizeExpense(e).categoryId === categoryId).length;
}

function countExpensesInSubcategory(categoryId, subId) {
  return loadExpenses().filter((e) => {
    const n = normalizeExpense(e);
    return n.categoryId === categoryId && n.subcategoryId === subId;
  }).length;
}

function renderCategoryTree() {
  if (!categoryTreeEl) return;
  categoryTreeEl.innerHTML = "";
  const cats = loadCategories();

  for (const c of cats) {
    const li = document.createElement("li");
    li.className = "cat-tree__item";
    li.setAttribute("role", "listitem");

    const row = document.createElement("div");
    row.className = "cat-tree__row";

    const nameEl = document.createElement("span");
    nameEl.className = "cat-tree__name";
    nameEl.textContent = c.name;

    const actions = document.createElement("div");
    actions.className = "cat-tree__actions";

    const btnRename = document.createElement("button");
    btnRename.type = "button";
    btnRename.className = "btn btn--ghost btn--small";
    btnRename.textContent = "Adını değiştir";
    btnRename.addEventListener("click", () => {
      showRenameDialog("Üst kategori adı", c.name, { type: "parent", categoryId: c.id });
    });

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn--danger";
    btnDel.textContent = "Sil";
    btnDel.addEventListener("click", () => {
      const n = countExpensesInCategory(c.id);
      if (n > 0) {
        alert(
          `Bu üst kategori ${n} kayıtta kullanılmaktadır. Kaldırmadan önce ilgili kayıtları güncellemeniz veya silmeniz gerekir.`
        );
        return;
      }
      if (!confirm(`“${c.name}” kategorisini ve tüm alt kategorilerini silmek istiyor musunuz?`)) return;
      const list = loadCategories().filter((x) => x.id !== c.id);
      saveCategories(list);
      renderCategoryTree();
      refreshCategorySelects();
      render();
    });

    actions.append(btnRename, btnDel);
    row.append(nameEl, actions);
    li.append(row);

    const subsUl = document.createElement("ul");
    subsUl.className = "cat-tree__subs";
    for (const s of c.subcategories) {
      const sLi = document.createElement("li");
      sLi.className = "cat-tree__sub";

      const sName = document.createElement("span");
      sName.className = "cat-tree__sub-name";
      sName.textContent = s.name;

      const sRename = document.createElement("button");
      sRename.type = "button";
      sRename.className = "btn btn--ghost btn--small";
      sRename.textContent = "Ad";
      sRename.addEventListener("click", () => {
        showRenameDialog("Alt kategori adı", s.name, { type: "sub", categoryId: c.id, subId: s.id });
      });

      const sDel = document.createElement("button");
      sDel.type = "button";
      sDel.className = "btn btn--danger";
      sDel.textContent = "Sil";
      sDel.addEventListener("click", () => {
        const n = countExpensesInSubcategory(c.id, s.id);
        if (n > 0) {
          alert(`Bu alt kategori ${n} kayıtta kullanılmaktadır; sistem tarafından kaldırılamaz.`);
          return;
        }
        if (!confirm(`“${s.name}” alt kategorisini silmek istiyor musunuz?`)) return;
        const list = loadCategories();
        const cat = list.find((x) => x.id === c.id);
        if (!cat) return;
        cat.subcategories = cat.subcategories.filter((x) => x.id !== s.id);
        saveCategories(list);
        renderCategoryTree();
        refreshCategorySelects();
        render();
      });

      sLi.append(sName, sRename, sDel);
      subsUl.append(sLi);
    }
    li.append(subsUl);

    const addSubRow = document.createElement("div");
    addSubRow.className = "cat-tree__add-sub";
    const subInput = document.createElement("input");
    subInput.type = "text";
    subInput.className = "field__input";
    subInput.placeholder = "Yeni alt kategori";
    subInput.maxLength = 60;
    subInput.autocomplete = "off";
    const subBtn = document.createElement("button");
    subBtn.type = "button";
    subBtn.className = "btn btn--ghost btn--small";
    subBtn.textContent = "Alt kategori ekle";
    subBtn.addEventListener("click", () => {
      const trimmed = subInput.value.trim();
      if (!trimmed) return;
      const list = loadCategories();
      const cat = list.find((x) => x.id === c.id);
      if (!cat) return;
      cat.subcategories.push({ id: crypto.randomUUID(), name: trimmed });
      saveCategories(list);
      subInput.value = "";
      renderCategoryTree();
      refreshCategorySelects();
      render();
    });
    addSubRow.append(subInput, subBtn);
    li.append(addSubRow);

    categoryTreeEl.append(li);
  }
}

function render() {
  const categories = loadCategories();
  const all = allExpensesNormalized();
  const monthStr = filterMonth.value;

  monthTotalEl.textContent = formatMoney(computeMonthTotal(all, monthStr));
  renderCharts(all, monthStr, categories);
  renderBudgetSection(categories, all, monthStr);
  renderExpenseList(categories, all, monthStr);
}

categorySelect.addEventListener("change", () => updateSubcategorySelect());

if (recordsSearch) {
  recordsSearch.addEventListener("input", () => {
    renderExpenseList(loadCategories(), allExpensesNormalized(), filterMonth.value);
  });
}
if (recordsCategoryFilter) {
  recordsCategoryFilter.addEventListener("change", () => {
    renderExpenseList(loadCategories(), allExpensesNormalized(), filterMonth.value);
  });
}
if (subChartParent) {
  subChartParent.addEventListener("change", () => {
    if (getChartView() === "sub") {
      renderSubChartInternal(lastAllNormalized, lastMonthStr, lastCategories);
    }
  });
}

if (chartViewPills) {
  chartViewPills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chart-view]");
    if (!btn || !chartViewPills.contains(btn)) return;
    const v = btn.dataset.chartView;
    if (!CHART_VIEW_IDS.includes(v)) return;
    setChartView(v);
    render();
    refreshChartsLayout();
  });
}
if (saveBudgetsBtn && budgetListEl) {
  saveBudgetsBtn.addEventListener("click", () => {
    const map = {};
    for (const inp of budgetListEl.querySelectorAll("input.budget-row__input")) {
      const cid = inp.dataset.categoryId;
      if (!cid) continue;
      const raw = String(inp.value ?? "").trim();
      if (raw === "") continue;
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0) map[cid] = v;
    }
    saveBudgets(map);
    showToast("Üst limitler kaydedildi");
    render();
  });
}

if (editExpenseForm) {
  editExpenseForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = editExpenseId?.value;
    if (!id) return;
    const amount = Number(editAmount?.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      editAmount?.focus();
      return;
    }
    const description = (editDescription?.value?.trim() ?? "").slice(0, 120);
    const cats = loadCategories();
    const catId = editCategory?.value;
    if (!catId || !categoryById(cats, catId)) {
      alert("Lütfen geçerli bir üst kategori seçiniz.");
      return;
    }
    const subVal = editSubcategory?.disabled ? "" : editSubcategory?.value;
    const noteRaw = editNote?.value?.trim() ?? "";
    const note = noteRaw.slice(0, 300);

    const items = loadExpenses();
    const idx = items.findIndex((x) => x.id === id);
    if (idx === -1) {
      editExpenseDialog?.close();
      render();
      return;
    }
    const prev = items[idx];
    const next = {
      ...prev,
      amount,
      description,
      date: editDate.value,
      categoryId: catId,
      subcategoryId: subVal ? subVal : null,
    };
    if (note) next.note = note;
    else delete next.note;
    items[idx] = next;
    saveExpenses(items);
    editExpenseDialog?.close();
    render();
      showToast("Kayıt güncellendi");
  });
}
if (editExpenseCancel && editExpenseDialog) {
  editExpenseCancel.addEventListener("click", () => editExpenseDialog.close());
}
if (editCategory) {
  editCategory.addEventListener("change", () => updateEditSubcategoryOptions());
}

addParentCategoryForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const trimmed = newParentCategoryName.value.trim();
  if (!trimmed) return;
  const list = loadCategories();
  list.push({ id: crypto.randomUUID(), name: trimmed, subcategories: [] });
  saveCategories(list);
  newParentCategoryName.value = "";
  renderCategoryTree();
  refreshCategorySelects();
  categorySelect.value = list[list.length - 1].id;
  updateSubcategorySelect();
  render();
});

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    amountInput.focus();
    return;
  }
  const description = descriptionInput.value.trim().slice(0, 120);

  const cats = loadCategories();
  const catId = categorySelect.value;
  if (!catId || !categoryById(cats, catId)) {
    alert("Lütfen geçerli bir üst kategori seçiniz.");
    return;
  }

  const subVal = subcategorySelect.disabled ? "" : subcategorySelect.value;

  const item = {
    id: crypto.randomUUID(),
    amount,
    description,
    categoryId: catId,
    subcategoryId: subVal ? subVal : null,
    date: dateInput.value,
    createdAt: Date.now(),
  };

  const items = loadExpenses();
  items.push(item);
  saveExpenses(items);

  amountInput.value = "";
  descriptionInput.value = "";
  amountInput.focus();
  render();
  showToast("Harcama kaydedildi");
});

filterMonth.addEventListener("change", () => {
  syncExpenseDateToSelectedMonth();
  render();
  refreshChartsLayout();
});

const monthPrevBtn = document.getElementById("monthPrev");
const monthNextBtn = document.getElementById("monthNext");
if (monthPrevBtn) monthPrevBtn.addEventListener("click", () => shiftFilterMonth(-1));
if (monthNextBtn) monthNextBtn.addEventListener("click", () => shiftFilterMonth(1));

exportBtn.addEventListener("click", () => {
  const bundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    categories: loadCategories(),
    expenses: loadExpenses().map(normalizeExpense),
    budgets: loadBudgets(),
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `giderler-${todayISODate()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function applyImportedBudgetsFromImport(budgetsMaybe) {
  if (!budgetsMaybe || typeof budgetsMaybe !== "object") return;
  const out = {};
  for (const k of Object.keys(budgetsMaybe)) {
    const n = Number(budgetsMaybe[k]);
    if (Number.isFinite(n) && n >= 0) out[String(k)] = n;
  }
  saveBudgets(out);
}

function applyImportedExpenses(valid, categoriesMaybe, budgetsMaybe, opts = {}) {
  const allowEmpty = opts.allowEmptyExpenses === true;
  if (!allowEmpty && (!Array.isArray(valid) || valid.length === 0)) {
    return false;
  }
  const list = Array.isArray(valid) ? valid : [];
  const normalized = list.map((x) => {
    const n = normalizeExpense(x);
    const base = {
      ...x,
      categoryId: n.categoryId,
      subcategoryId: n.subcategoryId,
      description: n.description,
    };
    if (n.note) base.note = n.note;
    else delete base.note;
    return base;
  });
  saveExpenses(normalized);
  if (budgetsMaybe !== undefined) applyImportedBudgetsFromImport(budgetsMaybe);
  if (categoriesMaybe && Array.isArray(categoriesMaybe) && categoriesMaybe.length > 0) {
    const cleaned = categoriesMaybe.map((c) => ({
      id: String(c.id),
      name: String(c.name || "Adsız"),
      subcategories: Array.isArray(c.subcategories)
        ? c.subcategories.map((s) => ({ id: String(s.id), name: String(s.name || "Adsız") }))
        : [],
    }));
    saveCategories(cleaned);
  }
  filterMonth.value = currentMonthFilter();
  syncExpenseDateToSelectedMonth();
  renderCategoryTree();
  refreshCategorySelects();
  render();
  return true;
}

async function refreshServerSqliteFlag() {
  try {
    const r = await fetch(new URL("/health", window.location.href), { cache: "no-store" });
    if (!r.ok) {
      serverSqliteSync = false;
      return;
    }
    const j = await r.json();
    serverSqliteSync = Boolean(j && j.ok === true && j.sqlite === true);
  } catch {
    serverSqliteSync = false;
  }
}

function buildExportBundleForServer() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    categories: loadCategories(),
    expenses: loadExpenses().map(normalizeExpense),
    budgets: loadBudgets(),
  };
}

async function pushBundleToServerQuiet() {
  if (!serverSqliteSync) return;
  try {
    const r = await fetch(new URL("/api/bundle", window.location.href), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildExportBundleForServer()),
    });
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    /* sunucu kapalı veya hata — yerel kayıt yine de geçerli */
  }
}

function schedulePushToServer() {
  if (!serverSqliteSync) return;
  clearTimeout(serverPushTimer);
  serverPushTimer = setTimeout(() => {
    void pushBundleToServerQuiet();
  }, 900);
}

/** Aynı kök adreste SQLite API varsa bundle yüklenir (paylasilan-veri.json’dan önce). */
async function tryLoadApiBundle() {
  try {
    const url = new URL("/api/bundle", window.location.href);
    url.searchParams.set("_cb", String(Date.now()));
    const r = await fetch(url.href, { cache: "no-store" });
    if (!r.ok) return false;
    const parsed = await r.json();
    if (!parsed || typeof parsed !== "object" || parsed.version !== 2 || !Array.isArray(parsed.expenses)) {
      return false;
    }
    const valid = parsed.expenses.filter(
      (x) =>
        x &&
        typeof x.amount === "number" &&
        (typeof x.description === "string" || x.description == null) &&
        typeof x.date === "string" &&
        (typeof x.categoryId === "string" || typeof x.category === "string")
    );
    const hasCats = parsed.categories && Array.isArray(parsed.categories) && parsed.categories.length > 0;
    if (valid.length === 0 && !hasCats) return false;
    applyImportedExpenses(valid, parsed.categories, parsed.budgets, { allowEmptyExpenses: true });
    return true;
  } catch {
    return false;
  }
}

async function tryLoadSharedBundle() {
  try {
    const url = new URL(SHARED_BUNDLE_FILENAME, window.location.href);
    url.searchParams.set("_cb", String(Date.now()));
    const r = await fetch(url.href, { cache: "no-store" });
    if (!r.ok) return false;
    const parsed = await r.json();
    if (!parsed || typeof parsed !== "object" || parsed.version !== 2 || !Array.isArray(parsed.expenses)) {
      return false;
    }
    const valid = parsed.expenses.filter(
      (x) =>
        x &&
        typeof x.amount === "number" &&
        (typeof x.description === "string" || x.description == null) &&
        typeof x.date === "string" &&
        (typeof x.categoryId === "string" || typeof x.category === "string")
    );
    const hasCats = parsed.categories && Array.isArray(parsed.categories) && parsed.categories.length > 0;
    if (valid.length === 0 && !hasCats) return false;
    applyImportedExpenses(valid, parsed.categories, parsed.budgets, { allowEmptyExpenses: true });
    return true;
  } catch {
    return false;
  }
}

importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));

      if (parsed && typeof parsed === "object" && parsed.version === 2 && Array.isArray(parsed.expenses)) {
        const valid = parsed.expenses.filter(
          (x) =>
            x &&
            typeof x.amount === "number" &&
            (typeof x.description === "string" || x.description == null) &&
            typeof x.date === "string" &&
            (typeof x.categoryId === "string" || typeof x.category === "string")
        );
        if (valid.length === 0) {
          alert("Dosyada işlenebilir kayıt bulunamadı.");
          return;
        }
        applyImportedExpenses(valid, parsed.categories, parsed.budgets);
        return;
      }

      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (x) =>
            x &&
            typeof x.amount === "number" &&
            (typeof x.description === "string" || x.description == null) &&
            typeof x.date === "string" &&
            typeof x.category === "string"
        );
        if (valid.length === 0) {
          alert("Dosyada işlenebilir kayıt bulunamadı.");
          return;
        }
        applyImportedExpenses(valid, null);
        return;
      }

      alert("Dosya biçimi desteklenmemektedir. Uygulama tarafından dışa aktarılan JSON veya önceki liste biçimi beklenir.");
    } catch {
      alert("JSON içeriği okunamadı veya ayrıştırılamadı.");
    }
  };
  reader.readAsText(file);
});

if (renameDialogCancel && renameDialog) {
  renameDialogCancel.addEventListener("click", () => {
    renameTarget = null;
    renameDialog.close();
  });
}
if (renameDialogSave && renameDialog) {
  renameDialogSave.addEventListener("click", () => {
    if (!renameTarget) return;
    const trimmed = renameDialogInput.value.trim();
    if (!trimmed) return;
    applyRenameForTarget(renameTarget, trimmed);
    renameTarget = null;
    renameDialog.close();
  });
}
if (renameDialogInput && renameDialogSave) {
  renameDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      renameDialogSave.click();
    }
  });
}
if (renameDialog) {
  renameDialog.addEventListener("cancel", () => {
    renameTarget = null;
  });
}

const tabExpenseBtn = document.getElementById("tab-expense");
const tabRecordsBtn = document.getElementById("tab-records");
const tabChartsBtn = document.getElementById("tab-charts");
const tabCategoriesBtn = document.getElementById("tab-categories");
const panelExpense = document.getElementById("panel-expense");
const panelRecords = document.getElementById("panel-records");
const panelCharts = document.getElementById("panel-charts");
const panelCategories = document.getElementById("panel-categories");
const toastEl = document.getElementById("toast");

let toastTimer;

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

function activateAppTab(which) {
  const tabDefs = [
    { key: "expense", btn: tabExpenseBtn, panel: panelExpense },
    { key: "records", btn: tabRecordsBtn, panel: panelRecords },
    { key: "charts", btn: tabChartsBtn, panel: panelCharts },
    { key: "categories", btn: tabCategoriesBtn, panel: panelCategories },
  ];
  for (const { key, btn, panel } of tabDefs) {
    const on = key === which;
    if (btn) {
      btn.classList.toggle("tabs__btn--active", on);
      btn.setAttribute("aria-selected", String(on));
    }
    if (panel) panel.hidden = !on;
  }
  if (which === "charts") refreshChartsLayout();
}

if (tabExpenseBtn) tabExpenseBtn.addEventListener("click", () => activateAppTab("expense"));
if (tabRecordsBtn) tabRecordsBtn.addEventListener("click", () => activateAppTab("records"));
if (tabChartsBtn) tabChartsBtn.addEventListener("click", () => activateAppTab("charts"));
if (tabCategoriesBtn) tabCategoriesBtn.addEventListener("click", () => activateAppTab("categories"));

async function initApp() {
  await refreshServerSqliteFlag();
  let apiLoaded = false;
  if (serverSqliteSync) {
    apiLoaded = await tryLoadApiBundle();
  }
  const sharedOk = !apiLoaded && (await tryLoadSharedBundle());
  filterMonth.value = currentMonthFilter();
  syncExpenseDateToSelectedMonth();
  loadCategories();
  renderCategoryTree();
  refreshCategorySelects();
  setChartView(loadChartViewPreference());
  render();
  if (sqliteSyncHint) {
    sqliteSyncHint.textContent = serverSqliteSync
      ? "SQLite sunucusu bağlı: bu adresten giren herkes aynı veriyi görür; değişiklikler kısa gecikmeyle veritabanına yazılır."
      : "";
    sqliteSyncHint.hidden = !serverSqliteSync;
  }
  if (apiLoaded) {
    showToast("Veriler SQLite veritabanından yüklendi.");
  } else if (sharedOk) {
    showToast("Paylaşılan veri yüklendi; aynı linkte herkes bu kayıtları görür.");
  }
}

initApp();
