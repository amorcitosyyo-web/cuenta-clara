const { money } = require("./reporting");

// Dependency-free drawing primitives: this code runs in a Vercel function,
// where a browser-based PDF renderer is not available.
const PAGE = { width: 612, height: 792, left: 38, right: 574, top: 744, bottom: 48 };
const COLORS = {
  // Palette copied from the application visual system.
  ink: "0.957 1 0.969", muted: "0.663 0.765 0.698", paper: "0.02 0.122 0.125", card: "0.043 0.169 0.149",
  green: "0.137 0.325 0.278", lime: "0.847 1 0.333", coral: "1 0.435 0.463", amber: "1 0.741 0.349",
  blue: "0.537 0.851 1", purple: "0.478 0.173 1", line: "0.14 0.32 0.275", paleGreen: "0.063 0.235 0.205", paleCoral: "0.26 0.12 0.14",
};

function ascii(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " "); }
function safeText(value) { return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function textLine(text, x, y, size = 10, bold = false, color = COLORS.ink) { return `${color} rg\nBT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${safeText(text)}) Tj ET\n`; }
function rect(x, y, width, height, color) { return `${color} rg ${x} ${y} ${width} ${height} re f\n`; }
function line(x1, y1, x2, y2, color = COLORS.line, thickness = 0.7) { return `${color} RG ${thickness} w ${x1} ${y1} m ${x2} ${y2} l S\n`; }
function polygon(points, color) { return `${color} rg ${points.map(([x, y], index) => `${x.toFixed(2)} ${y.toFixed(2)} ${index ? "l" : "m"}`).join(" ")} h f\n`; }
function disc(cx, cy, radius, color) {
  const points = Array.from({ length: 40 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 40;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
  return polygon(points, color);
}
function wedge(cx, cy, radius, start, end, color) {
  const steps = Math.max(3, Math.ceil(Math.abs(end - start) / (Math.PI / 18)));
  const points = [[cx, cy]];
  for (let index = 0; index <= steps; index += 1) {
    const angle = start + ((end - start) * index) / steps;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return polygon(points, color);
}
function truncate(value, max = 34) { const text = ascii(value).trim(); return text.length > max ? `${text.slice(0, Math.max(1, max - 3))}...` : text; }
function percent(value, total) { return Math.max(0, Math.min(1, Number(value || 0) / Math.max(Number(total || 0), 1))); }
function monthLabel(month) {
  const [year, rawMonth] = String(month || "").split("-");
  const names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${names[Number(rawMonth) - 1] || month} ${year || ""}`.trim();
}

function buildFinancialPdf(report, kind = "full") {
  const pages = [];
  let content = "";
  let y = PAGE.top;
  const startPage = () => { content = rect(0, 0, PAGE.width, PAGE.height, COLORS.paper); y = PAGE.top; };
  const finishPage = () => { pages.push(content); };
  const footer = () => {
    content += line(PAGE.left, 30, PAGE.right, 30);
    content += textLine("Cuenta Clara | Tu panorama financiero, claro y accionable", PAGE.left, 18, 7, false, COLORS.muted);
    content += textLine(`Pagina ${pages.length + 1}`, 522, 18, 7, false, COLORS.muted);
  };
  const header = (continuation = false) => {
    content += rect(0, 704, PAGE.width, 88, COLORS.green);
    content += rect(0, 700, PAGE.width, 4, COLORS.lime);
    content += textLine("CUENTA CLARA", PAGE.left, 756, 19, true, "1 1 1");
    content += textLine(continuation ? `Reporte financiero | ${monthLabel(report.month)} | Continuacion` : `Reporte financiero | ${monthLabel(report.month)}`, PAGE.left, 734, 10, false, COLORS.muted);
    content += textLine(`Generado el ${new Date().toLocaleDateString("es-CR")}`, 424, 734, 8, false, COLORS.muted);
    y = 678;
  };
  const ensure = (height) => {
    if (y - height >= PAGE.bottom) return;
    footer(); finishPage(); startPage(); header(true);
  };
  const title = (label, subtitle) => {
    ensure(subtitle ? 45 : 28);
    content += textLine(label, PAGE.left, y, 14, true, COLORS.ink); y -= 16;
    if (subtitle) { content += textLine(subtitle, PAGE.left, y, 8.5, false, COLORS.muted); y -= 18; } else y -= 5;
  };
  const card = (x, top, width, height, label, value, tone = "green") => {
    const palette = tone === "coral" ? [COLORS.paleCoral, COLORS.coral] : tone === "amber" ? [COLORS.card, COLORS.amber] : [COLORS.paleGreen, COLORS.lime];
    content += rect(x, top - height, width, height, palette[0]) + rect(x, top - height, 5, height, palette[1]);
    content += textLine(label, x + 14, top - 20, 8, true, COLORS.muted) + textLine(value, x + 14, top - 43, 13, true, COLORS.ink);
  };
  const progress = (x, baseline, width, value, max, color = COLORS.green) => {
    content += rect(x, baseline, width, 6, COLORS.green) + rect(x, baseline, Math.max(2, Math.round(width * percent(value, max))), 6, color);
  };
  const row = (label, amount, ratio, detail, color = COLORS.green) => {
    ensure(35);
    content += textLine(truncate(label, 34), PAGE.left, y, 9.5, true, COLORS.ink) + textLine(amount, 456, y, 9.5, true, COLORS.ink); y -= 11;
    progress(PAGE.left, y, 345, ratio, 1, color);
    if (detail) content += textLine(detail, 394, y - 1, 7.5, false, COLORS.muted);
    y -= 18;
  };
  const infoBox = (heading, message, tone = "green") => {
    ensure(54);
    const fill = tone === "coral" ? COLORS.paleCoral : COLORS.paleGreen;
    const color = tone === "coral" ? COLORS.coral : COLORS.green;
    content += rect(PAGE.left, y - 45, PAGE.right - PAGE.left, 45, fill) + rect(PAGE.left, y - 45, 4, 45, color);
    content += textLine(heading, PAGE.left + 14, y - 17, 9, true, COLORS.ink) + textLine(truncate(message, 82), PAGE.left + 14, y - 32, 8.5, false, COLORS.muted); y -= 58;
  };
  const donut = (items) => {
    const chartColors = [COLORS.lime, COLORS.blue, COLORS.amber, COLORS.coral, COLORS.purple];
    const chartItems = items.slice(0, 5);
    const total = chartItems.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 1;
    const cx = 148; const cy = y - 86; const radius = 66;
    let angle = Math.PI / 2;
    chartItems.forEach((item, index) => {
      const next = angle + ((Number(item.amount || 0) / total) * Math.PI * 2);
      content += wedge(cx, cy, radius, angle, next, chartColors[index]);
      angle = next;
    });
    content += disc(cx, cy, 39, COLORS.card);
    content += textLine("GASTOS", cx - 19, cy + 5, 7.5, true, COLORS.muted);
    content += textLine(money(total).replace("CRC ", ""), cx - 27, cy - 11, 9, true, COLORS.ink);
    let legendY = y - 28;
    chartItems.forEach((item, index) => {
      const share = Math.round(percent(item.amount, total) * 100);
      content += rect(252, legendY - 7, 8, 8, chartColors[index]);
      content += textLine(truncate(item.name, 26), 270, legendY - 1, 9, true, COLORS.ink);
      content += textLine(`${share}%  ${money(item.amount)}`, 410, legendY - 1, 8.5, false, COLORS.muted);
      legendY -= 26;
    });
    y -= 165;
  };

  const totals = report.totals || {};
  const activeBudgets = (report.budgets || []).filter((item) => Number(item.spent || 0) > 0 || Number(item.remaining || 0) < 0);
  const quietBudgetCount = Math.max(0, (report.budgets || []).length - activeBudgets.length);
  const diff = Number(totals.expense || 0) - Number(totals.previousExpense || 0);
  startPage(); header();
  title("Panorama del mes", `${(report.expenses || []).length} gasto(s) registrado(s) | Datos al cierre de este reporte`);
  card(38, y, 126, 59, "INGRESOS", money(totals.income), "green");
  card(172, y, 126, 59, "GASTOS", money(totals.expense), "coral");
  card(306, y, 126, 59, "AHORRO", money(totals.saving), "amber");
  card(440, y, 134, 59, "DISPONIBLE", money(totals.available), Number(totals.available || 0) < 0 ? "coral" : "green"); y -= 80;
  title("En que se fue el dinero", report.categories?.length ? "Distribucion de gastos por categoria" : "Aun no hay gastos registrados en este periodo");
  const categoryMax = report.categories?.[0]?.amount || 1;
  if (report.categories?.length) {
    ensure(170);
    donut(report.categories);
    if (report.categories.length > 5) { content += textLine(`+ ${report.categories.length - 5} categoria(s) adicional(es)`, PAGE.left, y + 5, 8.5, false, COLORS.muted); }
  } else infoBox("Sin movimientos todavia", "Cuando registres gastos, aqui veras las categorias principales.");
  if (kind === "full" || kind === "comparison") {
    title("Comparacion con el mes anterior");
    const direction = diff > 0 ? "mas" : diff < 0 ? "menos" : "igual";
    infoBox(diff > 0 ? "Atencion al gasto" : "Evolucion del gasto", `Este mes llevas ${money(Math.abs(diff))} ${direction} que el mes anterior (${money(totals.previousExpense)}).`, diff > 0 ? "coral" : "green");
  }
  if (kind === "full" || kind === "budget") {
    title("Presupuesto bajo control", activeBudgets.length ? "Solo se muestran categorias con movimiento o excedidas" : "No hay gasto contra presupuestos este mes");
    if (activeBudgets.length) {
      activeBudgets.slice(0, 5).forEach((item) => { const over = Number(item.remaining) < 0; row(item.name, `${money(item.spent)} / ${money(item.budget)}`, percent(item.spent, item.budget), over ? "EXCEDIDO" : `Quedan ${money(item.remaining)}`, over ? COLORS.coral : COLORS.lime); });
      if (quietBudgetCount) { content += textLine(`${quietBudgetCount} presupuesto(s) sin movimientos este mes.`, PAGE.left, y, 8, false, COLORS.muted); y -= 18; }
    } else if (report.budgets?.length) infoBox("Vas en cero", `${report.budgets.length} presupuesto(s) configurado(s), sin gastos registrados aun.`);
    else infoBox("Sin presupuestos", "Puedes crear presupuestos desde la app para ver avances aqui.");
  }
  if (kind === "pending") {
    title("Pagos programados pendientes", report.pendingPayments?.length ? "Los compromisos que aun faltan por marcar como pagados" : "No tienes pagos programados pendientes");
    if (report.pendingPayments?.length) report.pendingPayments.slice(0, 10).forEach((item) => {
      ensure(29);
      content += rect(PAGE.left, y - 21, 5, 21, COLORS.amber) + textLine(truncate(item.name, 42), PAGE.left + 14, y - 9, 9.5, true, COLORS.ink) + textLine(`${money(item.amount)} | vence ${item.dueDate}`, PAGE.left + 14, y - 20, 8, false, COLORS.muted);
      y -= 31;
    });
    else infoBox("Todo al dia", "No hay pagos programados pendientes para este mes.");
  }
  if (kind === "savings") {
    title("Metas de ahorro", report.savingsBalance?.length ? "Avance acumulado de tus cuentas de ahorro" : "No hay metas de ahorro configuradas");
    if (report.savingsBalance?.length) report.savingsBalance.slice(0, 8).forEach((item) => row(item.name, `${money(item.saved)} / ${money(item.target)}`, percent(item.saved, item.target), `${Math.round(percent(item.saved, item.target) * 100)}% completado`, COLORS.lime));
    else infoBox("Define una meta", "Las metas de ahorro apareceran aqui con su avance.");
  }
  // Continue on the first page while space remains.  Sparse months should be a
  // compact one-page report, not a nearly empty second page.
  if (kind === "full") {
    title("Proximos compromisos", report.pendingPayments?.length ? "Pagos programados que siguen pendientes" : "No tienes pagos programados pendientes");
    if (report.pendingPayments?.length) report.pendingPayments.slice(0, 6).forEach((item) => { ensure(29); content += rect(PAGE.left, y - 21, 5, 21, COLORS.amber) + textLine(truncate(item.name, 42), PAGE.left + 14, y - 9, 9.5, true, COLORS.ink) + textLine(`${money(item.amount)} | vence ${item.dueDate}`, PAGE.left + 14, y - 20, 8, false, COLORS.muted); y -= 31; });
    else infoBox("Todo al dia", "No hay pagos programados pendientes para este mes.");
    title("Metas de ahorro", report.savingsBalance?.length ? "Avance acumulado de tus cuentas de ahorro" : "No hay metas de ahorro configuradas");
    if (report.savingsBalance?.length) report.savingsBalance.slice(0, 5).forEach((item) => row(item.name, `${money(item.saved)} / ${money(item.target)}`, percent(item.saved, item.target), `${Math.round(percent(item.saved, item.target) * 100)}% completado`, COLORS.lime));
    else infoBox("Define una meta", "Las metas de ahorro apareceran aqui con su avance.");
    title("Comercios con mayor gasto", report.merchants?.length ? "Los lugares que mas impactaron tu presupuesto" : "No hay comercios para mostrar");
    if (report.merchants?.length) { const merchantMax = report.merchants[0]?.amount || 1; report.merchants.slice(0, 5).forEach((item, index) => row(`${index + 1}. ${item.name}`, money(item.amount), percent(item.amount, merchantMax), `${item.count} mov.`, COLORS.green)); }
    else infoBox("Sin datos todavia", "Los comercios se mostraran al registrar gastos.");
  }
  footer(); finishPage();
  return makePdf(pages);
}

function makePdf(pageContents) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageIds = [];
  pageContents.forEach((content) => {
    const pageId = objects.length + 1; const contentId = pageId + 1; pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%PDF\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, "ascii")); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, "ascii"); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}

module.exports = { buildFinancialPdf };
