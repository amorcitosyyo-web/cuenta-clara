const ExcelJS = require("exceljs");
const { getAppState, getCategories } = require("./_agent");
const { financialReport } = require("./reporting");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const userId = await authorizedUser(req);
    if (!userId) return res.status(403).json({ error: "No tienes acceso a esta exportación." });
    const month = /^\d{4}-\d{2}$/.test(String(req.query?.month || "")) ? req.query.month : new Date().toISOString().slice(0, 7);
    const state = await getAppState(userId);
    const categories = getCategories(state);
    const rows = (state.movements || []).filter((item) => String(item.date || "").startsWith(month)).map((item) => ({ Fecha: item.date, Tipo: item.type, Comercio: item.merchant, Monto: Number(item.amount || 0), Categoría: categories.find((category) => category.id === item.category)?.name || item.category, Nota: item.note || "", Fuente: item.source || "manual" }));
    const format = String(req.query?.format || "xlsx").toLowerCase();
    const filename = `cuenta-clara-${month}.${format === "csv" ? "csv" : "xlsx"}`;
    if (format === "csv") {
      const headers = Object.keys(rows[0] || { Fecha: "", Tipo: "", Comercio: "", Monto: "", Categoría: "", Nota: "", Fuente: "" });
      const csv = [headers.join(","), ...rows.map((item) => headers.map((key) => `"${String(item[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename=${filename}`); return res.status(200).send(`\ufeff${csv}`);
    }
    const workbook = new ExcelJS.Workbook(); workbook.creator = "Cuenta Clara";
    const summary = financialReport(state, categories, month);
    const overview = workbook.addWorksheet("Resumen");
    overview.addRows([["Cuenta Clara", `Reporte ${month}`], [], ["Ingresos", summary.totals.income], ["Gastos", summary.totals.expense], ["Ahorro", summary.totals.saving], ["Disponible", summary.totals.available]]);
    overview.getColumn(1).width = 28; overview.getColumn(2).width = 20; overview.getRow(1).font = { bold: true, size: 16, color: { argb: "E8F6ED" } }; overview.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "073329" } };
    const sheet = workbook.addWorksheet("Movimientos"); sheet.columns = Object.keys(rows[0] || { Fecha: "", Tipo: "", Comercio: "", Monto: "", Categoría: "", Nota: "", Fuente: "" }).map((header) => ({ header, key: header, width: header === "Nota" ? 38 : 18 })); sheet.addRows(rows); sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "12624F" } }; sheet.getColumn("Monto").numFmt = '₡#,##0.00'; sheet.views = [{ state: "frozen", ySplit: 1 }];
    const payload = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename=${filename}`); return res.status(200).send(Buffer.from(payload));
  } catch (error) { console.error("Report export error:", error); return res.status(500).json({ error: "No pude generar la exportación." }); }
};

async function authorizedUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.SUPABASE_URL) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "" } });
  const user = await response.json().catch(() => null); const owner = process.env.AGENT_OWNER_USER_ID;
  return response.ok && user?.id && (!owner || user.id === owner) ? user.id : null;
}
