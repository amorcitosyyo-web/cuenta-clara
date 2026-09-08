# Make: correos de tarjeta a Bandeja

La app llama a Make desde `/api/sync-email`. Los resultados no se guardan directamente: primero pasan por `/api/agent-inbox`, donde el agente clasifica cada movimiento, lo guarda en Supabase y notifica Telegram.

## Variables en Vercel

- `MAKE_EMAIL_WEBHOOK_URL`: URL del webhook de Make.
- `MAKE_EMAIL_WEBHOOK_TOKEN`: opcional. Si la usas, Make puede validar el header `X-Cuenta-Clara-Token`.

La app llama a `/api/sync-email`. Ese endpoint valida la sesion de Supabase antes de llamar a Make, asi el webhook no queda expuesto en el navegador.

## Escenario en Make

1. **Custom webhook**
   - Recibe `existingSourceIds`.

2. **Gmail > Search emails**
   - Query sugerida:
     ```text
     newer_than:90d (tarjeta OR compra OR autorizacion OR "SINPE" OR "BAC" OR "Banco")
     ```
   - Ajustar con el banco real cuando tengan ejemplos.

3. **Filtro anti duplicados**
   - No procesar correos cuyo `Message ID` venga en `existingSourceIds`.

4. **Extraer datos**
   - Campos minimos:
     - `sourceId`: id unico del correo.
     - `date`: fecha en formato `YYYY-MM-DD`.
     - `merchant`: comercio.
     - `amount`: monto numerico.
     - `category`: opcional.
     - `note`: opcional.

5. **Webhook response**
   - Devolver JSON:
     ```json
     {
       "items": [
         {
           "source": "gmail",
           "sourceId": "gmail-message-id",
           "date": "2026-06-21",
           "merchant": "Walmart Tibas",
           "amount": 18500.75,
           "category": "alimentacion",
           "note": "Compra detectada por correo"
         }
       ]
     }
     ```

La app y el escenario automatico usan el mismo clasificador. Los movimientos con confianza alta entran al historial y se notifican en Telegram; los dudosos quedan en Bandeja y esperan que ustedes elijan una categoria. Nada dudoso entra al historial hasta confirmarlo.
