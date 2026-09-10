const { money } = require("./reporting");

function ascii(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ");
}

function textLine(text, x, y, size = 10, bold = false) {
  const safe = ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  return `BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${safe}) Tj ET\n`;
}

function buildFinancialPdf(report, kind = "full") {
  const pages = [];
  // Leave a real top margin: Helvetica's glyphs extend above their baseline.
  const top = 760;
  let content = "0.02 0.12 0.11 rg 0 0 612 792 re f\n0.9 0.96 0.91 rg\n";
  let y = top;
  const add = (line, size = 10, bold = false) => { content += textLine(line, 42, y, size, bold); y -= size + 8; };
  const addBar = (label, value, max) => {
    const width = Math.max(4, Math.round((Number(value || 0) / Math.max(Number(max || 0), 1)) * 360));
    content += "0.31 0.65 0.48 rg " + `160 ${y - 2} ${width} 10 re f\n` + "0.9 0.96 0.91 rg\n";
    add(`${label}: ${money(value)}`);
  };
  const next = () => { pages.push(content); content = "0.02 0.12 0.11 rg 0 0 612 792 re f\n0.9 0.96 0.91 rg\n"; y = top; };

  add("CUENTA CLARA", 21, true);
  add(`Reporte financiero - ${report.month}`, 14, true);
  add(`Generado: ${new Date().toLocaleDateString("es-CR")}`, 9);
  y -= 10;
  add("Resumen financiero", 13, true);
  add(`Ingresos: ${money(report.totals.income)}`);
  add(`Gastos: ${money(report.totals.expense)}`);
  add(`Ahorro movido: ${money(report.totals.saving)}`);
  add(`Disponible: ${money(report.totals.available)}`, 11, true);
  y -= 8;
  add("Gastos por categoria", 13, true);
  const max = report.categories[0]?.amount || 1;
  report.categories.slice(0, 8).forEach((row) => addBar(row.name, row.amount, max));
  if (kind === "full" || kind === "comparison") {
    if (y < 190) next();
    add("Comparacion con el mes anterior", 13, true);
    add(`Gastos mes anterior: ${money(report.totals.previousExpense)}`);
    const diff = report.totals.expense - report.totals.previousExpense;
    add(`Variacion: ${diff >= 0 ? "+" : ""}${money(diff)}`);
  }
  if (kind === "full" || kind === "budget") {
    if (y < 150) next();
    add("Presupuestos", 13, true);
    if (report.budgets.length) report.budgets.forEach((row) => add(`${row.name}: ${money(row.spent)} de ${money(row.budget)}${row.remaining < 0 ? " - EXCEDIDO" : ` - quedan ${money(row.remaining)}`}`));
    else add("No hay presupuestos configurados.");
  }
  if (kind === "full" || kind === "pending") {
    if (y < 150) next();
    add("Pagos programados pendientes", 13, true);
    if (report.pendingPayments.length) report.pendingPayments.forEach((row) => add(`${row.name}: ${money(row.amount)} - vence ${row.dueDate}`));
    else add("No hay pagos programados pendientes.");
  }
  if (kind === "full" || kind === "savings") {
    if (y < 160) next();
    add("Metas de ahorro", 13, true);
    if (report.savingsBalance.length) report.savingsBalance.forEach((row) => add(`${row.name}: ${money(row.saved)} de ${money(row.target)}`));
    else add("No hay metas de ahorro configuradas.");
  }
  if (kind === "full") {
    if (y < 180) next();
    add("Comercios con mayor gasto", 13, true);
    report.merchants.slice(0, 10).forEach((row, index) => add(`${index + 1}. ${row.name}: ${money(row.amount)} (${row.count} movimiento(s))`));
  }
  pages.push(content);
  return makePdf(pages);
}

function makePdf(pageContents) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageIds = [];
  pageContents.forEach((content) => {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%PDF\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}

module.exports = { buildFinancialPdf };
