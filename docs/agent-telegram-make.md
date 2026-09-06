# Agente financiero: Make, Telegram y patrones

Esta primera fase deja al agente trabajando sobre los datos protegidos de Supabase que la app ya usa. No expone claves en el navegador.

## Variables de Vercel

Agrega estas variables como `Sensitive`, para Production y Preview:

| Variable | Para que sirve |
| --- | --- |
| `SUPABASE_URL` | La URL actual de Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de Supabase, solo para el backend. Nunca usar la anon key aqui. |
| `AGENT_OWNER_USER_ID` | El id del usuario de Supabase que es dueño de la cuenta compartida. |
| `AGENT_INGEST_TOKEN` | Una clave larga nueva para autorizar a Make. |
| `OPENAI_API_KEY` | La API key ya creada para la IA. |
| `OPENAI_CLASSIFIER_MODEL` | `gpt-4.1-mini` para clasificar barato. |
| `TELEGRAM_BOT_TOKEN` | Token de BotFather. |
| `TELEGRAM_CHAT_ID` | Id del grupo privado de ustedes. |
| `TELEGRAM_ALLOWED_USER_IDS` | Ids de Telegram de ambos, separados por coma. |
| `TELEGRAM_WEBHOOK_SECRET` | Otra clave larga nueva para validar Telegram. |

## Make: lectura cuatro veces al dia

Programa el escenario a las 06:00, 11:00, 16:00 y 21:00, hora de Costa Rica.

1. Gmail busca solo la etiqueta `BAC gastos`.
2. Extrae `sourceId`, `date`, `merchant`, `amount` y `note`.
3. En lugar de responder a la app, agrega `HTTP > Make a request`:
   - Method: `POST`
   - URL: `https://TU-DOMINIO.vercel.app/api/agent-inbox`
   - Header: `X-Cuenta-Clara-Agent-Token: TU_AGENTE_INGEST_TOKEN`
   - Body type: Raw / JSON
   - Content type: `application/json`
4. Puede mandar uno por uno o todos dentro de `items`. Ejemplo:

```json
{
  "items": [
    {
      "source": "gmail",
      "sourceId": "id-unico-del-correo",
      "date": "2026-07-12",
      "merchant": "MXM Tibas",
      "amount": "2030.00",
      "note": "BAC ref 617223563730"
    }
  ]
}
```

5. Luego actualiza la etiqueta del correo y marcalo leido solo si el HTTP devolvio `ok: true`.

El agente no crea categorias: usa las que ya existen. Si reconoce un patron con confianza de 90% o mas, registra el movimiento y avisa al grupo. Si no, lo deja en Bandeja y envia botones de categoria al grupo.

## Telegram en grupo

1. Crea un bot con BotFather y agregalo a un grupo privado con ustedes dos.
2. Guarda el token y los ids de grupo/personas en Vercel.
3. En Telegram configura el webhook hacia:

```text
https://api.telegram.org/botTU_TOKEN/setWebhook?url=https://TU-DOMINIO.vercel.app/api/telegram-webhook&secret_token=TU_TELEGRAM_WEBHOOK_SECRET
```

Los botones de categoria funcionan aunque el bot este en modo privacidad. Solo las dos personas en `TELEGRAM_ALLOWED_USER_IDS` pueden confirmar o cambiar movimientos.
