// Make puede devolver el cuerpo como JSON, como texto JSON o dentro de una
// propiedad Text. Esta normalización permite aceptar esos formatos sin que un
// movimiento válido se convierta silenciosamente en una lista vacía.
function normalizeMakeItems(payload) {
  const found = [];
  collect(payload, found, 0);
  const seen = new Set();
  return found.filter((item) => {
    const sourceId = String(item.sourceId || item.source_id || item.id || "").trim();
    const merchant = String(item.merchant || item.comercio || item.name || "").trim();
    const key = sourceId || `${merchant}:${item.amount || item.monto || ""}:${item.date || item.fecha || ""}`;
    if (!merchant || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collect(value, output, depth) {
  if (depth > 7 || value === null || value === undefined) return;
  if (typeof value === "string") {
    parseJsonValues(value).forEach((parsed) => collect(parsed, output, depth + 1));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, output, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  if (value.merchant || value.comercio || value.name) {
    output.push(value);
    return;
  }
  ["items", "pending", "movements", "Text", "text", "body", "data", "result"].forEach((key) => {
    if (value[key] !== undefined) collect(value[key], output, depth + 1);
  });
}

function parseJsonValues(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  try { return [JSON.parse(value)]; } catch { /* Make puede concatenar objetos JSON. */ }
  const results = [];
  let start = -1;
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') { quote = true; continue; }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try { results.push(JSON.parse(value.slice(start, index + 1))); } catch { /* Ignorar fragmento inválido. */ }
        start = -1;
      }
    }
  }
  return results;
}

module.exports = { normalizeMakeItems };
