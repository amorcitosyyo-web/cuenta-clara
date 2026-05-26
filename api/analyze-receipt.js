const GEMINI_MODEL = "gemini-2.0-flash";

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" });
      return;
    }

    const body = await readJsonBody(req);
    const image = body.image || "";
    const text = body.text || "";
    const imageBase64 = extractBase64Payload(image);

    if (!imageBase64 && !text.trim()) {
      res.status(400).json({ error: "Envia una foto o texto de factura" });
      return;
    }

    const prompt = buildPrompt(body);
    const parts = [{ text: prompt }];

    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: extractMimeType(image) || "image/jpeg",
          data: imageBase64,
        },
      });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            response_mime_type: "application/json",
          },
        }),
      },
    );

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) {
      res.status(geminiResponse.status).json({
        error: "Gemini no pudo analizar la factura",
        detail: data?.error?.message || "Error desconocido",
      });
      return;
    }

    const parsed = parseGeminiJson(data);
    if (!parsed) {
      res.status(502).json({ error: "Gemini no devolvio JSON valido", raw: data });
      return;
    }

    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({ error: "No se pudo analizar la factura", detail: error.message });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildPrompt(body) {
  return [
    "Analiza esta factura o tiquete de Costa Rica.",
    "Devuelve SOLO JSON valido, sin markdown ni explicaciones.",
    `Categorias disponibles de la app: ${JSON.stringify(body.categories || [])}.`,
    `Memoria de patrones aprendidos: ${JSON.stringify(body.merchantRules || [])}.`,
    `Guia de clasificacion: ${body.classificationGuide || ""}.`,
    "Campos requeridos: comercio, fecha, total, categoria, productos, confianza, observaciones.",
    "Formato exacto: {\"comercio\":\"\",\"fecha\":\"YYYY-MM-DD\",\"total\":0,\"categoria\":\"\",\"productos\":[{\"nombre\":\"\",\"cantidad\":null,\"precio\":null,\"categoria\":\"\"}],\"confianza\":0,\"observaciones\":\"\"}.",
    "Reglas: usa colones costarricenses; total numerico sin simbolos; usa la fecha real de compra; ignora clave numerica, consecutivo, cedula, telefono, caja, autorizacion, terminal, codigos de barras, QR y textos legales.",
    "El total correcto normalmente aparece cerca de Total, Total CRC, Total a Pagar, Monto Cancelado o Tarjeta CRC. Si Tarjeta repite el total, no lo dupliques.",
    `Texto escrito por el usuario u OCR local: ${body.text || ""}`,
  ].join("\n");
}

function parseGeminiJson(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
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

function extractMimeType(dataUrl) {
  return String(dataUrl || "").match(/^data:([^;]+);base64,/)?.[1] || "";
}

function extractBase64Payload(dataUrl) {
  return String(dataUrl || "").includes(",") ? String(dataUrl).split(",")[1] : "";
}
