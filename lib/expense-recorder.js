// Conversational specialist for manual expenses.
// It deliberately gives priority to the user's wording: when the user says
// "lo gasté en X", X is stored as the merchant/description instead of asking
// for a separate commercial name.

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parseAmount(value) {
  const raw = String(value || "").replace(/[^\d.,-]/g, "");
  if (!raw) return null;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    normalized = raw.replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "").replace(decimal, ".");
  } else if (dot >= 0 && raw.length - dot - 1 === 3) {
    normalized = raw.replace(/\./g, "");
  } else if (comma >= 0 && raw.length - comma - 1 === 3) {
    normalized = raw.replace(/,/g, "");
  } else {
    normalized = raw.replace(/,/g, ".");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function costaRicaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateFromText(text, today = new Date()) {
  const normalized = normalizeText(text);
  const current = costaRicaDate(today);
  if (/\bayer\b/.test(normalized)) {
    const value = new Date(`${current}T12:00:00-06:00`);
    value.setDate(value.getDate() - 1);
    return value.toISOString().slice(0, 10);
  }
  if (/\bhoy\b/.test(normalized)) return current;
  const iso = String(text).match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const local = String(text).match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
  if (local) return `${local[3]}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
  return current;
}

function categoryFor(text, categories = []) {
  const normalized = normalizeText(text);
  const aliases = [
    ["comida-fuera", /comida fuera|restaurante|cafeteria|cafe|delivery|uber eats|chicharronera/],
    ["transporte", /transporte|uber(?! eats)|taxi|bus|gasolina|parqueo/],
    ["hogar", /limpieza|limpiar|detergente|papel toalla|hogar|casa/],
    ["compras-personales", /personal|ropa|perfume|colgate|cuidado personal/],
    ["alimentacion", /alimentacion|alimentación|comida|super|supermercado|mercado|pan|desayuno|almuerzo|cena/],
  ];
  const found = aliases.find(([, pattern]) => pattern.test(normalized));
  if (found) return found[0];
  const match = (Array.isArray(categories) ? categories : []).find((item) => {
    const name = normalizeText(item.name || item.id);
    return name && normalized.includes(name);
  });
  return match?.id || "imprevistos";
}

function hasExpenseVerb(text) {
  return /\b(gaste|gastamos|gasto|compre|compramos|compre|pague|pagamos|registre|registrar|agrega|agregar|anota|anotar)\b/i.test(normalizeText(text));
}

function extractMerchant(text, amountToken) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const explicit = source.match(/\b(?:en|a|para)\s+(?:el|la|los|las|un|una)?\s*([^,.;!?]+?)(?=\s+(?:de|del|por|categoria|categoría|fecha|hoy|ayer)\b|$)/i);
  if (explicit?.[1]) return explicit[1].trim();
  const cleaned = source
    .replace(/\b(hoy|ayer|gaste|gasté|gastamos|gasto|compre|compré|pague|pagué|registre|registré|registrar|agrega|agregar|anota|anotar|el|la|los|las|un|una|gasto|compra|por|crc|colones?)\b/gi, " ")
    .replace(amountToken || "", " ")
    .replace(/\s+/g, " ").trim();
  return cleaned.replace(/^(en|a|para)\s+/i, "").trim();
}

function parseExpenseRequest(text, { categories = [], today = new Date(), requireVerb = false } = {}) {
  const source = String(text || "").trim();
  if (!source) return { status: "not_expense" };
  if (requireVerb && !hasExpenseVerb(source)) return { status: "not_expense" };
  const amountMatch = source.match(/(?:₡|crc\s*)?\d[\d.,]*/i);
  const amount = amountMatch ? parseAmount(amountMatch[0]) : null;
  if (!amount) return { status: "missing", field: "amount" };
  const merchant = extractMerchant(source, amountMatch?.[0]);
  if (!merchant || merchant.length < 2) return { status: "missing", field: "merchant" };
  return {
    status: "ready",
    data: {
      type: "expense",
      amount,
      date: dateFromText(source, today),
      merchant: merchant.slice(0, 120),
      category: categoryFor(source, categories),
      note: `Registro manual: ${source}`,
      source: "manual",
    },
  };
}

function isExpenseRequest(text) {
  return hasExpenseVerb(String(text || "")) && /(?:₡|crc\s*)?\d[\d.,]*/i.test(String(text || ""));
}

module.exports = { parseExpenseRequest, isExpenseRequest, _test: { parseAmount, dateFromText, extractMerchant, categoryFor } };
