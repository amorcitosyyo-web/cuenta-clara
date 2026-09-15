// Specialist: Conversational Planning (Ciclo 7-6)
// Handles multi-turn natural language planning without rigid form questions.

const PLANNER_PROMPTS = {
  asking_accounts: `Eres el facilitador de planificación de Cuenta Clara. Estás construyendo un plan mensual conversacional.
El usuario describe sus cuentas. Extrae cada una con nombre, propósito, saldo (si lo dice), mínimo objetivo.

Comprende lenguaje natural imperfecto. No inventes datos. No repitas preguntas ya respondidas.
Si el usuario dice "tengo 3 cuentas pero solo hablo de 2", pregunta por la 3a.

Devuelve SOLO JSON:
{
  "understood": "Tu resumen de lo que entendí",
  "accounts": [{"name": "...", "purpose": "...", "balance": null, "minBalance": null, "targetBalance": null}],
  "ambiguities": ["¿cuál es el saldo mínimo que quieres en...?"],
  "readyForNextStage": false
}`,

  asking_cards: `Ahora habla de tarjetas de crédito: nombre, propósito, banco, corte, vencimiento, saldo, pago mínimo.
No inventes. Comprende respuestas naturales largas.

Devuelve JSON:
{
  "understood": "Tu resumen",
  "cards": [{"name": "...", "purpose": "...", "bank": "...", "cutoffDay": 15, "dueDay": 25, "statement": null, "minimumPayment": null}],
  "ambiguities": [],
  "readyForNextStage": false
}`,

  asking_income: `Habla de ingresos: salario, comisiones, otros. Monto, frecuencia, cuenta receptora.
No inventes.

Devuelve JSON:
{
  "understood": "Tu resumen de ingresos",
  "salaryPlanned": 1500000,
  "commissionPlanned": null,
  "otherIncome": [],
  "readyForNextStage": false
}`,
};

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "asking_accounts";
  const { OPENAI_AGENT_MODEL, OPENAI_API_KEY } = process.env;

  if (!OPENAI_API_KEY) {
    return { text: "No tengo acceso a OpenAI ahora.", newFlowState: "planning", newContext: flowContext };
  }

  try {
    const prompt = PLANNER_PROMPTS[stage];
    if (!prompt) {
      return { text: "Fase de planificación desconocida. Escribe 'cancelar' para salir.", newFlowState: "planning" };
    }

    const fullPrompt = `${prompt}\n\nContexto actual: ${JSON.stringify(flowContext)}\n\nMensaje del usuario:\n${text}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_AGENT_MODEL || "gpt-4o-mini",
        store: false,
        max_output_tokens: 900,
        input: fullPrompt,
      }),
    });

    if (!response.ok) {
      return { text: "El modelo no respondió. Intenta de nuevo.", newFlowState: "planning", newContext: flowContext };
    }

    const data = await response.json();
    const output = (data.output || [])
      .filter(item => item?.type === "message")
      .flatMap(item => item.content || [])
      .filter(item => item?.type === "output_text")
      .map(item => item.text || "")
      .join("\n");

    const parsed = parseJsonFromOutput(output);
    if (!parsed) {
      return { text: "No pude procesar esa respuesta. Intenta de nuevo.", newFlowState: "planning", newContext: flowContext };
    }

    // Advance stage if ready
    let nextStage = stage;
    if (parsed.readyForNextStage) {
      if (stage === "asking_accounts") nextStage = "asking_cards";
      else if (stage === "asking_cards") nextStage = "asking_income";
      else if (stage === "asking_income") nextStage = "review";
    }

    const newContext = {
      ...flowContext,
      stage: nextStage,
      accounts_collected: parsed.accounts || flowContext.accounts_collected || [],
      cards_collected: parsed.cards || flowContext.cards_collected || [],
      salaryPlanned: parsed.salaryPlanned !== null ? parsed.salaryPlanned : (flowContext.salaryPlanned || null),
      commissionPlanned: parsed.commissionPlanned !== null ? parsed.commissionPlanned : (flowContext.commissionPlanned || null),
    };

    let response_text = parsed.understood;
    if (parsed.ambiguities?.length) {
      response_text += "\n\nPregunto para aclarar:\n" + parsed.ambiguities.map((a, i) => `${i + 1}. ${a}`).join("\n");
    }
    if (parsed.readyForNextStage && nextStage !== stage) {
      const stageNames = {
        "asking_cards": "tus tarjetas",
        "asking_income": "tus ingresos",
        "review": "revisión"
      };
      response_text += `\n\n✅ Listo. Ahora vamos con ${stageNames[nextStage] || "lo siguiente"}...`;
    }

    return {
      text: response_text,
      newFlowState: nextStage === "review" ? "idle" : "planning",
      newContext,
      nextQuestion: nextStage === "asking_accounts" ? "¿Más cuentas?" : `Detalles de ${nextStage}`,
    };

  } catch (error) {
    console.error("Planner error:", error);
    return { text: "Error en planificación. Intenta de nuevo.", newFlowState: "planning", newContext: flowContext };
  }
}

function parseJsonFromOutput(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

module.exports = { turn };
