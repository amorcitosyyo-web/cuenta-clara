const GEMINI_MODEL = "gemini-2.0-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const question = String(body.question || "").trim();
    if (!question) {
      res.status(400).json({ error: "Escribe una pregunta para el asesor" });
      return;
    }

    const prompt = buildPrompt(question, body.context || {}, body.conversation || []);
    const openAiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const errors = [];

    if (!openAiKey && !geminiKey) {
      res.status(500).json({ error: "Falta configurar OPENAI_API_KEY o GEMINI_API_KEY en Vercel" });
      return;
    }

    if (openAiKey) {
      try {
        const parsed = await callOpenAiAdvisor(openAiKey, prompt);
        res.status(200).json({ ...normalizeAdvisorResponse(parsed), provider: "openai" });
        return;
      } catch (error) {
        errors.push(`OpenAI: ${error.message}`);
      }
    }

    if (geminiKey) {
      try {
        const parsed = await callGeminiAdvisor(geminiKey, prompt);
        res.status(200).json({ ...normalizeAdvisorResponse(parsed), provider: "gemini" });
        return;
      } catch (error) {
        errors.push(`Gemini: ${error.message}`);
      }
    }

    res.status(502).json({
      error: "La IA no pudo responder como asesor",
      detail: errors.join(" | ") || "Error desconocido",
    });
  } catch (error) {
    res.status(500).json({ error: "No se pudo consultar al asesor", detail: error.message });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildPrompt(question, context, conversation) {
  const recentConversation = Array.isArray(conversation)
    ? conversation.slice(-12).map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        text: String(message.text || "").slice(0, 1200),
        insights: Array.isArray(message.insights) ? message.insights.slice(0, 3).map(String) : [],
      }))
    : [];

  return [
    "Eres el asesor financiero de una pareja dentro de la app Cuenta Clara.",
    "Responde en espanol claro, corto y practico para Costa Rica.",
    "Usa SOLO los datos enviados en CONTEXTO. Si falta informacion, dilo.",
    "Usa HISTORIAL_RECIENTE para mantener el hilo de la conversacion y entender referencias como 'eso', 'lo anterior' o 'comparalo'.",
    "Si el historial contradice el CONTEXTO, el CONTEXTO financiero actual gana.",
    "No inventes movimientos, montos, presupuestos ni ingresos.",
    "Puedes recomendar ajustes de presupuesto, ahorro o habitos, pero no digas que ya los cambiaste.",
    "Cuando el usuario pida graficos, devuelve datos simples en chart.items.",
    "Devuelve SOLO JSON valido, sin markdown.",
    "Formato exacto:",
    "{\"answer\":\"\",\"insights\":[\"\"],\"chart\":{\"title\":\"\",\"type\":\"bar\",\"items\":[{\"label\":\"\",\"value\":0,\"color\":\"\"}]},\"suggestedActions\":[{\"label\":\"\",\"description\":\"\",\"kind\":\"budget_suggestion\",\"categoryId\":\"\",\"amount\":0}]}",
    "Reglas de chart: maximo 8 items; value numerico; color opcional; si no aplica usa items vacio.",
    `HISTORIAL_RECIENTE: ${JSON.stringify(recentConversation).slice(0, 12000)}`,
    `PREGUNTA: ${question}`,
    `CONTEXTO: ${JSON.stringify(context).slice(0, 24000)}`,
  ].join("\n");
}

async function callOpenAiAdvisor(apiKey, prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "Responde solo JSON valido con el formato solicitado. No uses markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }

  const parsed = parseJsonText(data?.choices?.[0]?.message?.content || "");
  if (!parsed) throw new Error("no devolvio JSON valido");
  return parsed;
}

async function callGeminiAdvisor(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          response_mime_type: "application/json",
        },
      }),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = parseJsonText(text);
  if (!parsed) throw new Error("no devolvio JSON valido");
  return parsed;
}

function parseJsonText(text) {
  if (!text) return null;

  try {
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAdvisorResponse(value) {
  const chart = value.chart && Array.isArray(value.chart.items)
    ? {
        title: String(value.chart.title || ""),
        type: value.chart.type === "line" ? "line" : "bar",
        items: value.chart.items.slice(0, 8).map((item) => ({
          label: String(item.label || ""),
          value: Number(item.value || 0),
          color: String(item.color || ""),
        })),
      }
    : { title: "", type: "bar", items: [] };

  return {
    answer: String(value.answer || "No pude preparar una respuesta con esos datos."),
    insights: Array.isArray(value.insights) ? value.insights.slice(0, 6).map(String) : [],
    chart,
    suggestedActions: Array.isArray(value.suggestedActions)
      ? value.suggestedActions.slice(0, 4).map((action) => ({
          label: String(action.label || ""),
          description: String(action.description || ""),
          kind: String(action.kind || "suggestion"),
          categoryId: String(action.categoryId || ""),
          amount: Number(action.amount || 0),
        }))
      : [],
  };
}
