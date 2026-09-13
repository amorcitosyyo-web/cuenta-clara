const { makeId } = require("./_agent");

function normalizeHeader(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").trim();
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").replace(/[^\d,.-]/g, "");
  const comma = text.lastIndexOf(","); const dot = text.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const normalized = text.replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "").replace(decimal, ".");
  return Number(normalized) || 0;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function readDelimited(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  const delimiter = text.includes("\t") ? "\t" : text.split("\n")[0]?.includes(";") ? ";" : ",";
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => splitRow(line, delimiter));
  if (!rows.length) return [];
  const headers = rows.shift().map(normalizeHeader);
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function splitRow(line, delimiter) {
  const values = []; let current = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim()); return values;
}

async function readSpreadsheet(buffer, filename = "") {
  const extension = String(filename).toLowerCase().split(".").pop();
  if (["csv", "tsv", "txt"].includes(extension)) return readDelimited(buffer);
  let ExcelJS;
  try { ExcelJS = require("exceljs"); } catch { throw new Error("El lector de Excel aún no está instalado en Vercel. Agrega la dependencia exceljs antes de desplegar."); }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = (sheet.getRow(1).values || []).slice(1).map(normalizeHeader);
  return sheet.getSheetValues().slice(2).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index + 1]?.text ?? row[index + 1] ?? ""]))).filter((row) => Object.values(row).some((value) => String(value).trim()));
}

function mapSpreadsheetRows(rows, source = "xlsx") {
  const aliases = {
    merchant: ["comercio", "merchant", "descripcion", "detalle", "nombre", "concepto"],
    amount: ["monto", "amount", "total", "importe", "valor"],
    date: ["fecha", "date", "dia"],
    category: ["categoria", "category"],
    note: ["nota", "note", "observacion", "descripcion"],
    type: ["tipo", "type", "clase"],
  };
  const valueFor = (row, names) => {
    const keys = Object.keys(row || {});
    const key = keys.find((item) => names.includes(normalizeHeader(item)));
    return key ? row[key] : "";
  };
  return rows.map((row, index) => {
    const merchant = String(valueFor(row, aliases.merchant) || "").trim();
    const amount = parseAmount(valueFor(row, aliases.amount));
    return {
      row: index + 2, merchant, amount, date: normalizeDate(valueFor(row, aliases.date)),
      category: String(valueFor(row, aliases.category) || "").trim(), note: String(valueFor(row, aliases.note) || "").trim(),
      type: normalizeHeader(valueFor(row, aliases.type)) === "ingreso" ? "income" : "expense", source, confidence: merchant && amount > 0 ? 0.95 : 0,
    };
  });
}

async function analyzePdfWithOpenAI(buffer, filename, categories) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta configurar OpenAI para analizar PDF.");
  const prompt = [
    "Analiza este PDF de Costa Rica. Si contiene facturas o una lista de gastos, devuelve SOLO JSON.",
    "Formato: {items:[{merchant:string,amount:number,date:string,category:string,note:string,items:[{name:string,quantity:number|null,amount:number|null}]}]}",
    "Usa fecha YYYY-MM-DD y montos CRC. No inventes datos ilegibles.",
    "Categorías disponibles: " + categories.map((item) => item.name).join(", "),
  ].join("\n");
  const base64 = Buffer.from(buffer).toString("base64");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini", store: false, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_file", filename, file_data: `data:application/pdf;base64,${base64}` }] }] }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "No pude leer el PDF.");
  const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || "";
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No encontré movimientos legibles en el PDF.");
  return JSON.parse(match[0]);
}

async function storeDocument({ ownerId, buffer, filename, mimeType, metadata = {} }) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !ownerId) return null;
  const documentId = makeId();
  const safeName = String(filename || "documento").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${ownerId}/${new Date().toISOString().slice(0, 7)}/${documentId}-${safeName}`;
  const upload = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/agent-documents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, { method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": mimeType || "application/octet-stream", "x-upsert": "false" }, body: buffer });
  if (!upload.ok) return { id: documentId, path: null, error: "No se pudo guardar el archivo original; se guardaron los datos extraídos.", ...metadata };
  return { id: documentId, path, filename: safeName, mimeType, retentionUntil: new Date(Date.now() + 365 * 86400000).toISOString(), ...metadata };
}

module.exports = { analyzePdfWithOpenAI, mapSpreadsheetRows, readDelimited, readSpreadsheet, storeDocument };
