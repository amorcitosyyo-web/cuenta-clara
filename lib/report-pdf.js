const { basicInsights, buildFacts, scoreFor } = require("./report-insights");

// Dependency-free PDF drawing: this code runs in a Vercel function, where a
// browser-based renderer is not available. Text uses the standard Helvetica
// fonts with WinAnsi encoding, so Spanish accents and ñ render correctly.
const PAGE = { width: 612, height: 792, left: 40, right: 572, bottom: 52 };
const INNER = PAGE.right - PAGE.left;
const COLORS = {
  ink: "0.957 1 0.969", muted: "0.663 0.765 0.698", paper: "0.02 0.122 0.125", card: "0.043 0.169 0.149",
  green: "0.137 0.325 0.278", lime: "0.847 1 0.333", coral: "1 0.435 0.463", amber: "1 0.741 0.349",
  blue: "0.537 0.851 1", purple: "0.62 0.42 1", line: "0.14 0.32 0.275", paleGreen: "0.063 0.235 0.205",
  paleCoral: "0.26 0.12 0.14", paleAmber: "0.22 0.18 0.1", track: "0.09 0.24 0.215", white: "1 1 1",
};

// Helvetica advance widths (per 1000 em) for ASCII 32..126, used to wrap text.
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

function winAnsi(value) {
  return String(value ?? "")
    .replace(/₡/g, "CRC ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...")
    .replace(/[→▶►]/g, ">").replace(/[\u2000-\u200f\u2028-\u202f\u00a0]/g, " ")
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, "");
}
function esc(value) { return winAnsi(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function textWidth(value, size, bold = false) {
  let total = 0;
  for (const char of winAnsi(value)) {
    const code = char.charCodeAt(0);
    total += code >= 32 && code <= 126 ? WIDTHS[code - 32] : code === 0xB7 ? 278 : 556;
  }
  return (total / 1000) * size * (bold ? 1.07 : 1);
}
function wrap(value, width, size, bold = false) {
  const words = winAnsi(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const attempt = current ? `${current} ${word}` : word;
    if (current && textWidth(attempt, size, bold) > width) { lines.push(current); current = word; } else current = attempt;
  });
  if (current) lines.push(current);
  return lines;
}
function truncate(value, width, size, bold = false) {
  let text = winAnsi(value).trim();
  if (textWidth(text, size, bold) <= width) return text;
  while (text.length > 1 && textWidth(`${text}...`, size, bold) > width) text = text.slice(0, -1);
  return `${text.trimEnd()}...`;
}

const textAt = (text, x, y, size = 10, bold = false, color = COLORS.ink) => `${color} rg\nBT /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(text)}) Tj ET\n`;
const textRight = (text, xRight, y, size, bold, color) => textAt(text, xRight - textWidth(text, size, bold), y, size, bold, color);
const textCenter = (text, cx, y, size, bold, color) => textAt(text, cx - textWidth(text, size, bold) / 2, y, size, bold, color);
const rect = (x, y, width, height, color) => `${color} rg ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f\n`;
const line = (x1, y1, x2, y2, color = COLORS.line, thickness = 0.7) => `${color} RG ${thickness} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
function polygon(points, color) { return `${color} rg ${points.map(([x, y], index) => `${x.toFixed(2)} ${y.toFixed(2)} ${index ? "l" : "m"}`).join(" ")} h f\n`; }
function roundRect(x, y, width, height, color, radius = 7) {
  const r = Math.min(radius, height / 2, width / 2);
  const points = [];
  [[x + width - r, y + r, -Math.PI / 2], [x + width - r, y + height - r, 0], [x + r, y + height - r, Math.PI / 2], [x + r, y + r, Math.PI]].forEach(([cx, cy, start]) => {
    for (let step = 0; step <= 6; step += 1) {
      const angle = start + (Math.PI / 2) * (step / 6);
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
  });
  return polygon(points, color);
}
const disc = (cx, cy, radius, color) => polygon(Array.from({ length: 48 }, (_, index) => [cx + Math.cos((Math.PI * 2 * index) / 48) * radius, cy + Math.sin((Math.PI * 2 * index) / 48) * radius]), color);
function wedge(cx, cy, radius, start, end, color) {
  const steps = Math.max(3, Math.ceil(Math.abs(end - start) / (Math.PI / 36)));
  const points = [[cx, cy]];
  for (let index = 0; index <= steps; index += 1) {
    const angle = start + ((end - start) * index) / steps;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return polygon(points, color);
}

const group = (digits) => String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
function money(value) { const n = Math.round(Number(value || 0)); return `${n < 0 ? "-" : ""}CRC ${group(Math.abs(n))}`; }
function compact(value) {
  const n = Math.abs(Number(value || 0));
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return String(Math.round(n));
}
const percent = (value, total) => Math.max(0, Math.min(1, Number(value || 0) / Math.max(Number(total || 0), 1)));
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function monthLabel(month) { const [year, raw] = String(month || "").split("-"); return `${MONTHS[Number(raw) - 1] || month} ${year || ""}`.trim(); }
const monthShort = (month) => (MONTHS[Number(String(month).split("-")[1]) - 1] || "").slice(0, 3);

function scoreColor(score) { return score >= 70 ? COLORS.lime : score >= 50 ? COLORS.amber : COLORS.coral; }

function buildFinancialPdf(report, kind = "full", providedInsights = null) {
  const facts = buildFacts(report);
  const insights = providedInsights || { ...basicInsights(report, facts), ...scoreFor(report) };
  const pages = [];
  let content = "";
  let y = 0;

  const startPage = (first = false) => {
    content = rect(0, 0, PAGE.width, PAGE.height, COLORS.paper);
    if (first) { y = 0; return; }
    content += rect(0, 742, PAGE.width, 50, COLORS.green) + rect(0, 738, PAGE.width, 4, COLORS.lime);
    content += textAt("CUENTA CLARA", PAGE.left, 760, 11, true, COLORS.white);
    content += textRight(`Reporte financiero | ${monthLabel(report.month)}`, PAGE.right, 760, 9, false, COLORS.muted);
    y = 712;
  };
  const endPage = () => { pages.push(content); };
  const ensure = (height) => { if (y - height < PAGE.bottom) { endPage(); startPage(); } };

  const section = (label, subtitle, minHeight = 80) => {
    ensure(minHeight + 36);
    content += rect(PAGE.left, y - 14, 4, 16, COLORS.lime);
    content += textAt(label, PAGE.left + 12, y - 11, 14, true, COLORS.ink);
    y -= 24;
    if (subtitle) { content += textAt(subtitle, PAGE.left + 12, y - 2, 8.5, false, COLORS.muted); y -= 16; }
    else y -= 4;
  };

  // ---------- Hero (page 1) ----------
  const hero = () => {
    startPage(true);
    content += rect(0, 590, PAGE.width, 202, COLORS.green) + rect(0, 586, PAGE.width, 4, COLORS.lime);
    content += textAt("CUENTA CLARA  |  REPORTE FINANCIERO", PAGE.left, 756, 9, true, COLORS.lime);
    content += textAt(monthLabel(report.month), PAGE.left, 716, 32, true, COLORS.white);
    content += textAt(`Generado el ${new Date().toLocaleDateString("es-CR")}${report.isPartial ? "  |  mes en curso" : ""}`, PAGE.left, 696, 9, false, COLORS.muted);
    wrap(insights.headline, 330, 14, true).slice(0, 3).forEach((text, index) => { content += textAt(text, PAGE.left, 660 - index * 19, 14, true, COLORS.white); });
    const cx = 500; const cy = 672; const color = scoreColor(insights.score);
    content += disc(cx, cy, 56, COLORS.track);
    content += wedge(cx, cy, 56, Math.PI / 2, Math.PI / 2 - (insights.score / 100) * Math.PI * 2, color);
    content += disc(cx, cy, 42, COLORS.green);
    content += textCenter(String(insights.score), cx, cy - 2, 28, true, COLORS.white);
    content += textCenter("de 100", cx, cy - 16, 7.5, false, COLORS.muted);
    content += textCenter(insights.grade.toUpperCase(), cx, cy - 74, 9, true, color);
    y = 560;
  };

  const kpis = () => {
    const t = report.totals || {};
    const cards = [
      ["INGRESOS", money(t.income), COLORS.paleGreen, COLORS.lime],
      ["GASTOS", money(t.expense), COLORS.paleCoral, COLORS.coral],
      ["AHORRO", money(t.saving), COLORS.card, COLORS.amber],
      ["DISPONIBLE", money(t.available), Number(t.available) < 0 ? COLORS.paleCoral : COLORS.paleGreen, Number(t.available) < 0 ? COLORS.coral : COLORS.lime],
    ];
    const width = (INNER - 24) / 4;
    cards.forEach(([label, value, fill, accent], index) => {
      const x = PAGE.left + index * (width + 8);
      content += roundRect(x, y - 58, width, 58, fill) + rect(x + 10, y - 12, 18, 3, accent);
      content += textAt(label, x + 10, y - 26, 7.5, true, COLORS.muted) + textAt(value, x + 10, y - 46, 12.5, true, COLORS.ink);
    });
    y -= 78;
  };

  const readout = () => {
    const lines = wrap(insights.summary, INNER - 36, 10);
    const height = 38 + lines.length * 14;
    ensure(height + 16);
    content += roundRect(PAGE.left, y - height, INNER, height, COLORS.card);
    content += textAt(insights.source === "ai" ? "LECTURA DEL MES  |  ANÁLISIS CON IA" : "LECTURA DEL MES  |  ANÁLISIS AUTOMÁTICO", PAGE.left + 18, y - 20, 7.5, true, COLORS.lime);
    lines.forEach((text, index) => { content += textAt(text, PAGE.left + 18, y - 37 - index * 14, 10, false, COLORS.ink); });
    y -= height + 22;
  };

  // ---------- Categories ----------
  const categories = () => {
    const rows = report.categories || [];
    section("En qué se fue el dinero", rows.length ? "Reparto del gasto por categoría y cambio frente al mes anterior" : "Aún no hay gastos registrados en este periodo", rows.length ? 190 : 40);
    if (!rows.length) return;
    const palette = [COLORS.lime, COLORS.blue, COLORS.amber, COLORS.coral, COLORS.purple, "0.45 0.6 0.52"];
    const shown = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const slices = rest > 0 ? [...shown, { id: "_rest", name: `Otras (${rows.length - 5})`, amount: rest, previous: 0 }] : shown;
    const total = Number(report.totals?.expense) || slices.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 1;
    const rowHeight = 34;
    const blockHeight = Math.max(170, slices.length * rowHeight + 10);
    ensure(blockHeight + 10);
    const cx = PAGE.left + 78; const cy = y - blockHeight / 2 - 4;
    let angle = Math.PI / 2;
    slices.forEach((item, index) => {
      const next = angle - (Number(item.amount || 0) / total) * Math.PI * 2;
      content += wedge(cx, cy, 74, angle, next, palette[index]);
      angle = next;
    });
    content += disc(cx, cy, 46, COLORS.paper);
    content += textCenter("GASTOS", cx, cy + 6, 7.5, true, COLORS.muted);
    content += textCenter(compact(total), cx, cy - 10, 13, true, COLORS.ink);
    const lx = PAGE.left + 178;
    slices.forEach((item, index) => {
      const top = y - 8 - index * rowHeight;
      content += roundRect(lx, top - 9, 9, 9, palette[index], 2);
      content += textAt(truncate(item.name, 170, 10, true), lx + 16, top - 8, 10, true, COLORS.ink);
      content += textRight(money(item.amount), PAGE.right, top - 8, 10, true, COLORS.ink);
      const share = `${Math.round(percent(item.amount, total) * 100)}% del gasto`;
      let delta = "";
      let deltaColor = COLORS.muted;
      if (item.previous > 0) {
        const change = Math.round(((item.amount - item.previous) / item.previous) * 100);
        delta = `${change > 0 ? "+" : ""}${change}% vs mes anterior`;
        deltaColor = change > 15 ? COLORS.coral : change < -15 ? COLORS.lime : COLORS.muted;
      } else if (item.id !== "_rest") delta = "sin dato del mes anterior";
      content += textAt(share, lx + 16, top - 21, 8, false, COLORS.muted);
      content += textRight(delta, PAGE.right, top - 21, 8, false, deltaColor);
      const note = insights.categoryNotes?.[item.id];
      if (note) content += textAt(truncate(note, 330, 7.5), lx + 16, top - 31, 7.5, false, COLORS.muted);
    });
    y -= blockHeight + 14;
  };

  // ---------- Charts: 6-month trend + weekly rhythm ----------
  const charts = () => {
    section("Cómo se ha movido el dinero", "Ingresos y gastos de los últimos 6 meses, y el ritmo de gasto por semana", 165);
    ensure(150);
    const base = y - 112; const height = 90;
    const trend = report.trend || [];
    const maxTrend = Math.max(1, ...trend.flatMap((item) => [item.income, item.expense]));
    const trendWidth = 296;
    content += roundRect(PAGE.left, base - 30, trendWidth + 14, height + 56, COLORS.card);
    content += rect(PAGE.left + 12, base + height + 15, 7, 7, COLORS.lime) + textAt("Ingresos", PAGE.left + 23, base + height + 15, 7.5, false, COLORS.muted);
    content += rect(PAGE.left + 70, base + height + 15, 7, 7, COLORS.coral) + textAt("Gastos", PAGE.left + 81, base + height + 15, 7.5, false, COLORS.muted);
    const slot = (trendWidth - 10) / 6;
    trend.forEach((item, index) => {
      const x = PAGE.left + 12 + index * slot; const barWidth = slot * 0.34;
      const incomeHeight = Math.max(item.income > 0 ? 2 : 0, (item.income / maxTrend) * height);
      const expenseHeight = Math.max(item.expense > 0 ? 2 : 0, (item.expense / maxTrend) * height);
      content += rect(x, base, barWidth, incomeHeight, COLORS.lime) + rect(x + barWidth + 2, base, barWidth, expenseHeight, COLORS.coral);
      content += textCenter(monthShort(item.month), x + barWidth + 1, base - 14, 8, item.month === report.month, item.month === report.month ? COLORS.ink : COLORS.muted);
      if (item.month === report.month && item.expense > 0) content += textCenter(compact(item.expense), x + barWidth * 1.5 + 2, base + expenseHeight + 4, 7, true, COLORS.coral);
    });
    const wx = PAGE.left + trendWidth + 26; const wWidth = INNER - trendWidth - 26;
    const weeks = report.weeks || [];
    const maxWeek = Math.max(1, ...weeks.map((item) => item.amount));
    const peak = weeks.reduce((best, item, index) => (item.amount > (weeks[best]?.amount || 0) ? index : best), 0);
    content += roundRect(wx, base - 30, wWidth, height + 56, COLORS.card);
    content += textAt("Gasto por semana", wx + 12, base + height + 15, 7.5, false, COLORS.muted);
    const weekSlot = (wWidth - 16) / 4;
    weeks.forEach((item, index) => {
      const x = wx + 10 + index * weekSlot; const barWidth = weekSlot * 0.62;
      const barHeight = Math.max(item.amount > 0 ? 2 : 0, (item.amount / maxWeek) * height);
      content += rect(x, base, barWidth, barHeight, index === peak && item.amount > 0 ? COLORS.coral : COLORS.green);
      content += textCenter(item.label, x + barWidth / 2, base - 14, 7.5, false, COLORS.muted);
      if (item.amount > 0) content += textCenter(compact(item.amount), x + barWidth / 2, base + barHeight + 4, 7, true, COLORS.ink);
    });
    y -= 150;
  };

  // ---------- Budgets ----------
  const budgets = () => {
    const active = (report.budgets || []).filter((item) => item.budget > 0 && (Number(item.spent) > 0 || Number(item.remaining) < 0));
    section("Presupuesto bajo control", active.length ? "Cuánto se gastó contra lo que se planeó en cada categoría" : "No hay gasto contra presupuestos este mes", active.length ? 60 : 30);
    if (!active.length) return;
    active.slice(0, 7).forEach((item) => {
      ensure(36);
      const over = Number(item.remaining) < 0;
      const ratio = percent(item.spent, item.budget);
      content += textAt(truncate(item.name, 220, 9.5, true), PAGE.left, y - 8, 9.5, true, COLORS.ink);
      content += textRight(`${money(item.spent)} de ${money(item.budget)}`, PAGE.right, y - 8, 9, false, COLORS.muted);
      content += roundRect(PAGE.left, y - 22, INNER, 7, COLORS.track, 3) + roundRect(PAGE.left, y - 22, Math.max(6, INNER * ratio), 7, over ? COLORS.coral : ratio > 0.85 ? COLORS.amber : COLORS.lime, 3);
      const tag = over ? `EXCEDIDO por ${money(-item.remaining)} (${Math.round((item.spent / item.budget - 1) * 100)}% más)` : `Quedan ${money(item.remaining)}`;
      content += textAt(tag, PAGE.left, y - 32, 7.5, over, over ? COLORS.coral : COLORS.muted);
      y -= 44;
    });
    y -= 6;
  };

  // ---------- Analysis blocks ----------
  const analysisBlock = (heading, items, fill, accent) => {
    const width = INNER - 40;
    const prepared = items.map((item) => ({ titleLines: wrap(item.title, width, 10, true), detailLines: wrap(item.detail, width, 9) }));
    const height = 36 + prepared.reduce((sum, item) => sum + item.titleLines.length * 13 + item.detailLines.length * 12 + 7, 0);
    ensure(height + 12);
    content += roundRect(PAGE.left, y - height, INNER, height, fill) + rect(PAGE.left, y - height + 6, 4, height - 12, accent);
    content += textAt(heading.toUpperCase(), PAGE.left + 20, y - 21, 8.5, true, accent);
    let cursor = y - 40;
    prepared.forEach((item) => {
      content += disc(PAGE.left + 24, cursor + 3, 2.4, accent);
      item.titleLines.forEach((text) => { content += textAt(text, PAGE.left + 34, cursor, 10, true, COLORS.ink); cursor -= 13; });
      item.detailLines.forEach((text) => { content += textAt(text, PAGE.left + 34, cursor, 9, false, COLORS.muted); cursor -= 12; });
      cursor -= 7;
    });
    y -= height + 12;
  };
  const analysis = () => {
    section("Análisis del mes", insights.source === "ai" ? "Escrito por la IA a partir de los números de este reporte" : "Generado con las reglas de Cuenta Clara a partir de los números del mes", 120);
    analysisBlock("Lo que hicimos bien", insights.wins || [], COLORS.paleGreen, COLORS.lime);
    analysisBlock("Dónde fallamos", insights.fails || [], COLORS.paleCoral, COLORS.coral);
    analysisBlock("Qué podemos mejorar", insights.improve || [], COLORS.paleAmber, COLORS.amber);
  };

  const plan = () => {
    const actions = insights.actions || [];
    if (!actions.length) return;
    section("Plan para el próximo mes", "Acciones concretas para empezar el mes con ventaja", 70);
    actions.forEach((text, index) => {
      const lines = wrap(text, INNER - 44, 10);
      const height = Math.max(26, lines.length * 13 + 12);
      ensure(height + 8);
      content += roundRect(PAGE.left, y - height, INNER, height, COLORS.card);
      content += disc(PAGE.left + 18, y - height / 2, 9, COLORS.lime) + textCenter(String(index + 1), PAGE.left + 18, y - height / 2 - 3.5, 10, true, COLORS.paper);
      lines.forEach((entry, lineIndex) => { content += textAt(entry, PAGE.left + 38, y - 16 - lineIndex * 13, 10, false, COLORS.ink); });
      y -= height + 6;
    });
    y -= 10;
  };

  const merchants = () => {
    const rows = report.merchants || [];
    section("Comercios y gastos más grandes", rows.length ? "Dónde se concentró el gasto del mes" : "No hay comercios para mostrar", rows.length ? 90 : 30);
    if (!rows.length) return;
    const max = rows[0]?.amount || 1;
    rows.slice(0, 5).forEach((item, index) => {
      ensure(30);
      content += textAt(truncate(`${index + 1}. ${item.name}`, 300, 9.5, true), PAGE.left, y - 8, 9.5, true, COLORS.ink);
      content += textRight(`${money(item.amount)}  |  ${item.count} mov.`, PAGE.right, y - 8, 9, false, COLORS.muted);
      content += roundRect(PAGE.left, y - 20, INNER, 5, COLORS.track, 2) + roundRect(PAGE.left, y - 20, Math.max(5, INNER * percent(item.amount, max)), 5, COLORS.green, 2);
      y -= 30;
    });
    const big = report.topExpenses || [];
    if (big.length) {
      y -= 4;
      ensure(24 + big.length * 16);
      content += textAt("MAYORES GASTOS INDIVIDUALES", PAGE.left, y - 6, 7.5, true, COLORS.muted); y -= 20;
      big.forEach((item) => {
        content += textAt(truncate(item.merchant, 230, 9), PAGE.left, y, 9, false, COLORS.ink);
        content += textAt(truncate(`${item.category}  |  ${item.date}`, 190, 8), PAGE.left + 250, y, 8, false, COLORS.muted);
        content += textRight(money(item.amount), PAGE.right, y, 9, true, COLORS.ink);
        y -= 16;
      });
    }
    y -= 12;
  };

  const savings = () => {
    const rows = report.savingsBalance || [];
    section("Metas de ahorro", rows.length ? "Avance acumulado de las cuentas de ahorro" : "No hay metas de ahorro configuradas", rows.length ? 50 : 30);
    rows.slice(0, 6).forEach((item) => {
      ensure(36);
      const ratio = percent(item.saved, item.target);
      content += textAt(truncate(item.name, 250, 9.5, true), PAGE.left, y - 8, 9.5, true, COLORS.ink);
      content += textRight(`${money(item.saved)} de ${money(item.target)}`, PAGE.right, y - 8, 9, false, COLORS.muted);
      content += roundRect(PAGE.left, y - 22, INNER, 7, COLORS.track, 3) + roundRect(PAGE.left, y - 22, Math.max(6, INNER * ratio), 7, COLORS.lime, 3);
      content += textAt(`${Math.round(ratio * 100)}% completado`, PAGE.left, y - 32, 7.5, false, COLORS.muted);
      y -= 44;
    });
    y -= 6;
  };

  const pending = () => {
    const rows = report.pendingPayments || [];
    section("Próximos compromisos", rows.length ? "Pagos programados que siguen pendientes" : "No tienes pagos programados pendientes", rows.length ? 40 : 30);
    if (!rows.length) { ensure(34); content += roundRect(PAGE.left, y - 30, INNER, 30, COLORS.paleGreen) + textAt("Todo al día: no hay pagos programados pendientes para este mes.", PAGE.left + 16, y - 19, 9, false, COLORS.ink); y -= 44; return; }
    rows.slice(0, 8).forEach((item) => {
      ensure(32);
      content += roundRect(PAGE.left, y - 26, INNER, 26, COLORS.card) + rect(PAGE.left, y - 26, 4, 26, COLORS.amber);
      content += textAt(truncate(item.name, 300, 9.5, true), PAGE.left + 16, y - 16, 9.5, true, COLORS.ink);
      content += textRight(`${money(item.amount)}  |  vence ${item.dueDate}`, PAGE.right - 12, y - 16, 8.5, false, COLORS.muted);
      y -= 32;
    });
    y -= 8;
  };

  // ---------- Compose ----------
  hero();
  kpis();
  readout();
  if (kind === "pending") pending();
  else if (kind === "savings") savings();
  else if (kind === "budget") { budgets(); analysis(); }
  else if (kind === "comparison") { charts(); categories(); analysis(); }
  else { categories(); budgets(); charts(); analysis(); plan(); merchants(); savings(); pending(); }
  endPage();

  const total = pages.length;
  const finished = pages.map((page, index) => page
    + line(PAGE.left, 34, PAGE.right, 34)
    + textAt("Cuenta Clara  |  Tu panorama financiero, claro y accionable", PAGE.left, 20, 7, false, COLORS.muted)
    + textRight(`Página ${index + 1} de ${total}`, PAGE.right, 20, 7, false, COLORS.muted));
  return makePdf(finished);
}

function makePdf(pageContents) {
  const font = (name) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", font("Helvetica"), font("Helvetica-Bold")];
  const pageIds = [];
  pageContents.forEach((content) => {
    const pageId = objects.length + 1; const contentId = pageId + 1; pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, "latin1")); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, "latin1"); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "latin1");
}

module.exports = { buildFinancialPdf, _test: { wrap, textWidth, winAnsi } };
