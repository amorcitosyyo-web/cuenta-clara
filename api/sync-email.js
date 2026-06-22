module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  const webhookUrl = process.env.MAKE_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    res.status(501).json({
      error: "Falta configurar MAKE_EMAIL_WEBHOOK_URL en Vercel.",
      items: [],
    });
    return;
  }

  try {
    const user = await requireUser(req);
    const body = await readJsonBody(req);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MAKE_EMAIL_WEBHOOK_TOKEN ? { "X-Cuenta-Clara-Token": process.env.MAKE_EMAIL_WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify({
        existingSourceIds: Array.isArray(body.existingSourceIds) ? body.existingSourceIds : [],
        userId: user?.id || "",
        email: user?.email || "",
      }),
    });

    const text = await response.text();
    const payload = parseJson(text);
    if (!response.ok) {
      res.status(response.status).json({ error: payload.error || "Make no pudo leer el correo.", items: [] });
      return;
    }

    res.status(200).json({
      items: normalizeMakeItems(payload),
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || "No se pudo sincronizar con Make.", items: [] });
  }
};

async function requireUser(req) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("No autorizado.");
    error.statusCode = 401;
    throw error;
  }
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const error = new Error("Sesion invalida.");
    error.statusCode = 401;
    throw error;
  }
  return response.json();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeMakeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.pending)) return payload.pending;
  if (Array.isArray(payload.movements)) return payload.movements;
  return [];
}

function parseJson(text) {
  if (!text) return { items: [] };
  try {
    return JSON.parse(text);
  } catch (_error) {
    return parseConcatenatedJson(text);
  }
}

function parseConcatenatedJson(text) {
  const chunks = splitConcatenatedJsonObjects(text);
  const items = [];
  chunks.forEach((chunk) => {
    try {
      items.push(...normalizeMakeItems(JSON.parse(chunk)));
    } catch (_error) {
      // Ignore malformed fragments and keep any valid movement objects.
    }
  });
  return { items };
}

function splitConcatenatedJsonObjects(text) {
  const chunks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      escaped = char === "\\" && !escaped;
      if (char === "\"" && !escaped) inString = false;
      if (char !== "\\") escaped = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        chunks.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return chunks;
}
