// Un movimiento bancario conserva su total original. Cuando existe una
// factura desglosada, estas funciones reparten ese mismo total entre sus
// categorías de artículos para presupuestos y reportes, sin duplicarlo.
function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function categoryId(value, categories, fallback) {
  const target = normalize(value);
  if (!target) return fallback;
  const exact = (categories || []).find((item) => normalize(item.id) === target || normalize(item.name) === target);
  const partial = (categories || []).find((item) => target.length > 3 && (normalize(item.name).includes(target) || target.includes(normalize(item.name))));
  return (exact || partial)?.id || fallback;
}

function normalizeReceiptItems(items, categories, fallbackCategory) {
  return (Array.isArray(items) ? items : []).slice(0, 60).map((item) => {
    const amount = Number(item?.amount ?? item?.precio ?? 0);
    return {
      name: String(item?.name || item?.nombre || "").trim(),
      quantity: item?.quantity ?? item?.cantidad ?? null,
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      category: categoryId(item?.category || item?.categoria, categories, fallbackCategory),
    };
  }).filter((item) => item.name);
}

function expenseAllocations(movement, categories) {
  const fallback = movement?.category || "imprevistos";
  const total = Number(movement?.amount || 0);
  const items = normalizeReceiptItems(movement?.receiptItems || movement?.receipt?.items, categories, fallback)
    .filter((item) => Number(item.amount) > 0);
  const itemTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  // No se inventa un reparto si la lectura excede el total bancario.
  if (!items.length || itemTotal > total + 0.02) return [{ category: fallback, amount: total, itemized: false }];
  const allocations = items.map((item) => ({ category: item.category || fallback, amount: Number(item.amount), itemized: true }));
  const remainder = Math.round((total - itemTotal) * 100) / 100;
  if (remainder > 0.01) allocations.push({ category: fallback, amount: remainder, itemized: false });
  return allocations;
}

function expensesByCategory(movements, categories) {
  return (movements || []).filter((item) => item.type === "expense").reduce((totals, movement) => {
    expenseAllocations(movement, categories).forEach((allocation) => {
      totals[allocation.category] = (totals[allocation.category] || 0) + Number(allocation.amount || 0);
    });
    return totals;
  }, {});
}

module.exports = { normalizeReceiptItems, expenseAllocations, expensesByCategory };
