// Analysis that goes with the monthly report. The numbers (score, totals,
// deltas) are always computed here from the household's data; the AI only
// writes the narrative on top of those facts, and a deterministic version of
// that narrative is used whenever the AI is unavailable or answers badly.

const crc = (value) => `₡${Math.round(Number(value || 0)).toLocaleString("es-CR").replace(/ /g, " ")}`;
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (month) => { const [year, raw] = String(month).split("-"); return MONTH_NAMES[Number(raw) - 1] ? `${MONTH_NAMES[Number(raw) - 1]} de ${year}` : String(month); };
const pct = (part, whole) => (Number(whole) > 0 ? Math.round((Number(part || 0) / Number(whole)) * 100) : 0);

function scoreFor(report) {
  const t = report.totals || {};
  let score = 100;
  const notes = [];
  if (Number(t.available) < 0) { score -= 30; notes.push("gastaste más de lo disponible"); }
  const over = (report.budgets || []).filter((item) => item.budget > 0 && item.remaining < 0);
  if (over.length) score -= Math.min(32, over.length * 8);
  if (Number(t.previousExpense) > 0) {
    const growth = ((t.expense - t.previousExpense) / t.previousExpense) * 100;
    if (growth > 10) score -= Math.min(15, Math.round(growth / 2));
  }
  if (Number(t.income) > 0 && pct(t.saving, t.income) < 10) score -= 10;
  score = Math.max(5, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? "Excelente" : score >= 70 ? "Buen mes" : score >= 50 ? "Con ojo" : "Hay que ajustar";
  return { score, grade, overBudgets: over.length, notes };
}

function buildFacts(report) {
  const t = report.totals || {};
  const growth = Number(t.previousExpense) > 0 ? Math.round(((t.expense - t.previousExpense) / t.previousExpense) * 100) : null;
  return {
    mes: report.month,
    mesEnCurso: Boolean(report.isPartial),
    ingresos: Math.round(t.income || 0),
    gastos: Math.round(t.expense || 0),
    ahorroMovido: Math.round(t.saving || 0),
    disponible: Math.round(t.available || 0),
    gastoMesAnterior: Math.round(t.previousExpense || 0),
    cambioVsMesAnteriorPct: growth,
    tasaAhorroPct: Number(t.income) > 0 ? pct(t.saving, t.income) : null,
    cantidadGastos: (report.expenses || []).length,
    categorias: (report.categories || []).slice(0, 8).map((item) => ({
      id: item.id, nombre: item.name, monto: Math.round(item.amount), pctDelGasto: pct(item.amount, t.expense),
      mesAnterior: Math.round(item.previous || 0), movimientos: item.count,
    })),
    presupuestos: (report.budgets || []).filter((item) => item.budget > 0 && (item.spent > 0 || item.remaining < 0)).slice(0, 8)
      .map((item) => ({ nombre: item.name, gastado: Math.round(item.spent), presupuesto: Math.round(item.budget), excedidoPct: item.budget ? Math.round(((item.spent - item.budget) / item.budget) * 100) : 0 })),
    comercios: (report.merchants || []).slice(0, 6).map((item) => ({ nombre: item.name, monto: Math.round(item.amount), veces: item.count })),
    gastosMasGrandes: (report.topExpenses || []).map((item) => ({ comercio: item.merchant, monto: Math.round(item.amount), fecha: item.date, categoria: item.category })),
    gastoPorSemana: (report.weeks || []).map((item) => ({ dias: item.label, monto: Math.round(item.amount) })),
    tendencia6Meses: (report.trend || []).map((item) => ({ mes: item.month, ingresos: Math.round(item.income), gastos: Math.round(item.expense) })),
    metasAhorro: (report.savingsBalance || []).map((item) => ({ nombre: item.name, ahorrado: Math.round(item.saved), meta: Math.round(item.target) })),
    pagosPendientes: (report.pendingPayments || []).length,
  };
}

// Used when there is no AI key, the AI times out, or its answer is unusable.
function basicInsights(report, facts) {
  const wins = [];
  const fails = [];
  const improve = [];
  const actions = [];
  const t = report.totals || {};
  const cats = report.categories || [];
  const over = (report.budgets || []).filter((item) => item.budget > 0 && item.remaining < 0)
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));

  if (Number(t.available) >= 0 && Number(t.income) > 0) wins.push({ title: "Cerraste sin números rojos", detail: `Después de gastos y ahorro quedaron ${crc(t.available)} disponibles.` });
  if (facts.cambioVsMesAnteriorPct !== null && facts.cambioVsMesAnteriorPct <= 0) wins.push({ title: "Gastaste menos que el mes anterior", detail: `Bajaron ${Math.abs(facts.cambioVsMesAnteriorPct)}% frente a ${crc(t.previousExpense)}.` });
  if (facts.tasaAhorroPct !== null && facts.tasaAhorroPct >= 10) wins.push({ title: "Seguiste ahorrando", detail: `Moviste ${crc(t.saving)} a ahorro, el ${facts.tasaAhorroPct}% de los ingresos.` });
  const withinBudget = (report.budgets || []).filter((item) => item.budget > 0 && item.spent > 0 && item.remaining >= 0);
  if (withinBudget.length) wins.push({ title: "Presupuestos que sí se respetaron", detail: withinBudget.slice(0, 3).map((item) => item.name).join(", ") + "." });

  over.slice(0, 3).forEach((item) => fails.push({ title: `${item.name} se pasó del presupuesto`, detail: `Gastaron ${crc(item.spent)} de ${crc(item.budget)} (${crc(item.spent - item.budget)} de más).` }));
  if (Number(t.available) < 0) fails.push({ title: "Se gastó más de lo que entró", detail: `El disponible quedó en ${crc(t.available)}.` });
  if (facts.cambioVsMesAnteriorPct !== null && facts.cambioVsMesAnteriorPct > 10) fails.push({ title: "El gasto subió frente al mes anterior", detail: `Subió ${facts.cambioVsMesAnteriorPct}% (${crc(t.expense - t.previousExpense)} más).` });
  if (Number(t.income) > 0 && facts.tasaAhorroPct < 10) fails.push({ title: "Poco ahorro este mes", detail: `Solo el ${facts.tasaAhorroPct}% de los ingresos fue a ahorro; una meta sana es 10% o más.` });

  const biggest = cats.filter((item) => item.id !== "vivienda")[0];
  if (biggest) improve.push({ title: `Mirar de cerca ${biggest.name}`, detail: `Es la categoría variable más grande: ${crc(biggest.amount)} (${pct(biggest.amount, t.expense)}% del gasto).` });
  const grew = cats.filter((item) => item.previous > 0 && item.amount > item.previous * 1.25 && item.amount - item.previous > 10000).sort((a, b) => (b.amount - b.previous) - (a.amount - a.previous))[0];
  if (grew) improve.push({ title: `${grew.name} viene creciendo`, detail: `Pasó de ${crc(grew.previous)} a ${crc(grew.amount)}.` });
  // Rent and the like are fixed costs, not a habit to change.
  const fixedMerchants = new Set((report.expenses || []).filter((item) => item.category === "vivienda").map((item) => item.merchant || "Sin comercio"));
  const topMerchant = (report.merchants || []).find((item) => !fixedMerchants.has(item.name));
  if (topMerchant && pct(topMerchant.amount, t.expense) >= 20) improve.push({ title: `Mucho peso en ${topMerchant.name}`, detail: `Concentra el ${pct(topMerchant.amount, t.expense)}% de lo gastado.` });

  if (over[0]) actions.push(`Definir un tope semanal para ${over[0].name} y revisarlo cada domingo.`);
  if (biggest) actions.push(`Planear la compra grande de ${biggest.name} con lista antes de ir.`);
  actions.push("Revisar los gastos del mes en la app y corregir categorías dudosas antes del próximo cierre.");
  if (Number(t.income) > 0 && facts.tasaAhorroPct < 10) actions.push("Mover el ahorro apenas entre el ingreso, antes de gastar.");

  if (!wins.length) wins.push({ title: "Hay datos para mejorar", detail: "Con el registro al día ya se puede ver con claridad en qué se va el dinero." });
  if (!fails.length) fails.push({ title: "Sin alertas fuertes", detail: "No se detectaron excesos importantes este mes." });
  if (!improve.length) improve.push({ title: "Mantener el ritmo", detail: "Sigan registrando todo para detectar patrones." });

  const topCat = cats[0];
  const summary = Number(t.income) || Number(t.expense)
    ? `En ${monthName(report.month)} entraron ${crc(t.income)} y se gastaron ${crc(t.expense)}${topCat ? `; lo que más pesó fue ${topCat.name} (${pct(topCat.amount, t.expense)}%)` : ""}. ${over.length ? `${over.length} presupuesto(s) se excedieron.` : "Los presupuestos se mantuvieron bajo control."}`
    : "Todavía no hay movimientos suficientes para analizar este mes.";
  return {
    source: "basic",
    headline: Number(t.available) < 0 ? "Un mes para apretar el cinturón" : over.length ? "Buen mes, con algunos excesos para corregir" : "Un mes ordenado",
    summary,
    wins: wins.slice(0, 4), fails: fails.slice(0, 4), improve: improve.slice(0, 4), actions: actions.slice(0, 5),
    categoryNotes: {},
  };
}

const clean = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
function cleanList(list, max, withDetail = true) {
  return (Array.isArray(list) ? list : []).slice(0, max).map((item) => {
    if (typeof item === "string") return withDetail ? { title: clean(item, 80), detail: "" } : clean(item, 150);
    return withDetail ? { title: clean(item?.title, 80), detail: clean(item?.detail, 190) } : clean(item?.title || item?.detail, 150);
  }).filter((item) => (withDetail ? item.title : item));
}

async function callOpenAi(facts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    "Eres el analista financiero de un hogar de dos personas en Costa Rica (app 'Cuenta Clara'). Escribe el análisis del mes para su reporte PDF.",
    "Tono: cercano, claro y honesto, en español de Costa Rica neutro (usa 'nosotros/ustedes', sin tecnicismos, sin regaños ni sermones). Habla de números concretos.",
    "Reglas: usa SOLO los datos dados, no inventes montos ni hechos. Escribe montos como ₡125 000 (sin decimales). Si 'mesEnCurso' es true el mes no ha terminado: no lo califiques como cierre, compáralo con prudencia.",
    "Señala lo que se hizo bien, en qué se falló (excesos de presupuesto, categorías que crecen, concentración en un comercio, poco ahorro, gastos grandes o raros) y qué mejorar con acciones concretas y medibles para el próximo mes.",
    "Devuelve SOLO JSON con esta forma: {\"headline\":\"frase corta (máx 70 caracteres)\",\"summary\":\"2-4 oraciones (máx 420 caracteres)\",\"wins\":[{\"title\":\"\",\"detail\":\"\"}],\"fails\":[{\"title\":\"\",\"detail\":\"\"}],\"improve\":[{\"title\":\"\",\"detail\":\"\"}],\"actions\":[\"acción concreta\"],\"categoryNotes\":{\"<id de categoría>\":\"comentario de máx 80 caracteres\"}}",
    "2 a 4 elementos en wins, fails e improve; 3 a 5 acciones; categoryNotes solo para las 3 categorías más relevantes.",
    `Datos: ${JSON.stringify(facts)}`,
  ].join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_REPORT_MODEL || "gpt-4.1-mini",
        temperature: 0.4,
        max_tokens: 1100,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI no pudo analizar");
    return JSON.parse(payload?.choices?.[0]?.message?.content || "");
  } finally {
    clearTimeout(timer);
  }
}

// Returns the narrative plus the deterministic score. Never throws.
async function generateInsights(report, { ai: useAi = true } = {}) {
  const facts = buildFacts(report);
  const fallback = basicInsights(report, facts);
  const score = scoreFor(report);
  let ai = null;
  if (useAi && (Number(facts.gastos) > 0 || Number(facts.ingresos) > 0)) {
    try { ai = await callOpenAi(facts); } catch (error) { console.error("Report insights fallback:", error?.message || error); }
  }
  const wins = cleanList(ai?.wins, 4);
  const fails = cleanList(ai?.fails, 4);
  const improve = cleanList(ai?.improve, 4);
  const actions = cleanList(ai?.actions, 5, false);
  const usable = clean(ai?.summary, 450) && wins.length && fails.length && improve.length && actions.length;
  if (!usable) return { ...fallback, ...score };
  const notes = {};
  Object.entries(ai.categoryNotes && typeof ai.categoryNotes === "object" ? ai.categoryNotes : {}).slice(0, 5).forEach(([id, note]) => { if (clean(note, 90)) notes[id] = clean(note, 90); });
  return { source: "ai", headline: clean(ai.headline, 80) || fallback.headline, summary: clean(ai.summary, 450), wins, fails, improve, actions, categoryNotes: notes, ...score };
}

module.exports = { generateInsights, basicInsights, buildFacts, scoreFor, crc };
