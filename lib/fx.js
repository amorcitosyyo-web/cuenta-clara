// Foreign-currency handling for movements that arrive in USD (emailed bank
// charges for Spotify, Amazon, etc.). The app keeps everything in colones, so
// a USD item is converted at the reference rate for the day and flagged as an
// estimate: the bank applies its own rate, and the CRC amount on the monthly
// statement replaces the estimate when it is reconciled.

const RATE_URL = "https://api.hacienda.go.cr/indicadores/tc/dolar";
const CACHE_DAYS = 60;
const NEAREST_DAYS = 5;

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "").replace(/[^\d.,-]/g, "").trim();
  if (!clean) return 0;
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const thousands = decimal === "," ? "." : ",";
  const number = Number(clean.split(thousands).join("").replace(decimal, "."));
  return Number.isFinite(number) ? number : 0;
}

function costaRicaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function detectCurrency(raw) {
  const explicit = String(raw.currency || raw.moneda || raw.divisa || "").trim().toUpperCase();
  if (explicit) {
    if (/^(USD|US\$|\$|DOLAR|DOLARES|DÓLAR|DÓLARES)$/.test(explicit)) return "USD";
    if (/^(CRC|₡|COLON|COLONES|COLÓN)$/.test(explicit)) return "CRC";
  }
  const amountText = String(raw.amount ?? raw.monto ?? raw.total ?? "");
  if (/USD|US\$|\$/i.test(amountText)) return "USD";
  if (/CRC|₡/i.test(amountText)) return "CRC";
  const context = `${raw.note || ""} ${raw.nota || ""} ${raw.description || ""}`;
  if (/\bUSD\b|US\$/i.test(context)) return "USD";
  return "CRC";
}

async function fetchReferenceRate() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(RATE_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const sell = Number(data?.venta?.valor);
    const buy = Number(data?.compra?.valor);
    if (!(sell > 0)) return null;
    return { sell, buy: buy > 0 ? buy : null, date: String(data?.venta?.fecha || "").slice(0, 10) || costaRicaToday() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function nearestCachedRate(cache, dateStr) {
  const target = Date.parse(`${dateStr}T12:00:00Z`);
  let best = null;
  for (const [day, entry] of Object.entries(cache)) {
    const distance = Math.abs(Date.parse(`${day}T12:00:00Z`) - target) / 86400000;
    if (distance <= NEAREST_DAYS && (!best || distance < best.distance)) best = { day, entry, distance };
  }
  return best;
}

// Hacienda's historical endpoint is unreliable, so every rate fetched is
// kept in state.agentMemory.fxRates. A purchase uses the rate cached for its
// own day, else the closest cached day, else the current rate.
async function usdRateFor(dateStr, state) {
  state.agentMemory = state.agentMemory || {};
  const cache = state.agentMemory.fxRates = state.agentMemory.fxRates || {};
  if (cache[dateStr]?.sell > 0) return { sell: cache[dateStr].sell, rateDate: dateStr };
  const today = costaRicaToday();
  let fresh = null;
  if (state.agentMemory.fxFetchedOn !== today) {
    fresh = await fetchReferenceRate();
    if (fresh) {
      state.agentMemory.fxFetchedOn = today;
      cache[fresh.date] = { sell: fresh.sell, buy: fresh.buy, fetchedAt: new Date().toISOString() };
      const days = Object.keys(cache).sort();
      days.slice(0, Math.max(0, days.length - CACHE_DAYS)).forEach((day) => { delete cache[day]; });
    }
  }
  const near = nearestCachedRate(cache, dateStr);
  if (near) return { sell: near.entry.sell, rateDate: near.day };
  if (fresh) return { sell: fresh.sell, rateDate: fresh.date };
  // A purchase older than anything cached (a late statement, a retried
  // email): the most recent known rate is still a better estimate than none.
  const latest = Object.keys(cache).sort().pop();
  return latest ? { sell: cache[latest].sell, rateDate: latest } : null;
}

function itemDate(raw) {
  const text = String(raw.date || raw.fecha || raw.created_at || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return text && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : costaRicaToday();
}

// Returns { item } with the amount in colones, or { error } when a USD item
// cannot be converted. An error leaves the item unrecorded so the next
// email read retries it instead of saving a wrong amount.
async function convertForeignCurrency(raw, state) {
  if (detectCurrency(raw) !== "USD") return { item: raw };
  const original = parseAmount(raw.amount ?? raw.monto ?? raw.total);
  if (!(original > 0)) return { item: raw };
  const date = itemDate(raw);
  const rate = await usdRateFor(date, state);
  if (!rate) return { error: `Sin tipo de cambio disponible para convertir USD ${original.toFixed(2)}; se reintenta en la próxima lectura.` };
  const merchant = String(raw.merchant || raw.comercio || raw.name || "").trim();
  const sourceId = String(raw.sourceId || raw.source_id || raw.gmailMessageId || raw.messageId || raw.id || "").trim() || `${merchant}-USD${original}-${date}`;
  const fx = {
    originalAmount: original,
    originalCurrency: "USD",
    rate: rate.sell,
    rateDate: rate.rateDate,
    rateSource: "BCCR venta (Hacienda)",
    estimated: true,
  };
  const note = [String(raw.note || raw.nota || raw.description || "").trim(), `USD ${original.toFixed(2)} x CRC ${rate.sell.toFixed(2)} (tipo de cambio estimado)`].filter(Boolean).join(" · ");
  return { item: { ...raw, amount: Math.round(original * rate.sell * 100) / 100, currency: "CRC", sourceId, note, fx } };
}

module.exports = { convertForeignCurrency, detectCurrency, usdRateFor, parseAmount };
