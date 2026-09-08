# Contexto completo de Cuenta Clara

Actualizado: 7 de septiembre de 2026.

Este documento explica donde esta el proyecto, como esta construido, como se publica y el estado real de cada integracion. No contiene contrasenas, tokens ni API keys.

## 1. Que es la app

**Cuenta Clara** es una aplicacion web responsive para manejar las finanzas compartidas de una pareja. Permite registrar ingresos, gastos y ahorros, consultar el historial, crear presupuestos y metas, cargar facturas y hablar con un asesor financiero por la app o Telegram.

La moneda principal es el colon costarricense (CRC).

## 2. Dónde está el proyecto

En esta computadora, la carpeta del proyecto es:

```text
/Users/arelysdiaz/Documents/Codex/2026-05-24/me-puedes-ayudar-a-crea-una
```

Repositorio en GitHub:

```text
https://github.com/amorcitosyyo-web/cuenta-clara
```

Rama publicada:

```text
main
```

Sitio de produccion actual:

```text
https://cuenta-clara-rosy.vercel.app/
```

## 3. Archivos importantes

| Archivo o carpeta | Funcion |
| --- | --- |
| `index.html` | Estructura visual de la app. |
| `styles.css` | Todo el diseno responsive para telefono y computadora. |
| `app.js` | Logica del navegador: movimientos, vistas, filtros, CSV, presupuestos, facturas y chat flotante. |
| `api/financial-advisor.js` | Backend del asesor dentro de la app; usa OpenAI sin exponer la clave. |
| `api/telegram-webhook.js` | Recibe mensajes, audios y botones de Telegram y responde como el agente. |
| `api/agent-inbox.js` | Recibe movimientos de Make/correo, los clasifica y los manda a gastos, ingresos o Bandeja. |
| `api/_agent.js` | Funciones compartidas del agente: datos de Supabase, clasificacion, memoria, reglas y mensajes de Telegram. |
| `api/sync-email.js` | Punto de conexion de la app con Make para pedir lectura de correo. |
| `api/analyze-receipt.js` | Analiza facturas desde la app. |
| `api/supabase-config.js` | Entrega la configuracion publica de Supabase al navegador. |
| `database/schema.sql` | Esquema general de Supabase. |
| `database/supabase-app-state.sql` | Tabla/estado que comparte los datos de la app. |
| `plantilla-movimientos.csv` | Plantilla para importar movimientos. |
| `docs/` | Guias de Make, Telegram, despliegue y hoja de ruta. |

## 4. Como funciona la app hoy

### Datos financieros

Los movimientos tienen tipo `income`, `expense` o `saving`.

- **Ingresos**: dinero que entra.
- **Gastos**: dinero que sale por categorias.
- **Ahorros**: se mantienen separados visualmente, pero afectan el saldo disponible porque ese dinero si sale del ingreso del mes. Esta fue la decision final tomada para que el saldo sea real.

La app incluye resumen mensual, selector de mes, historial por fechas, filtros, presupuestos por categoria, metas de ahorro, graficos y exportacion CSV. Cuando hay un filtro de fecha activo, el CSV exporta solamente el rango filtrado; sin filtro exporta todo.

### Carga de datos

La app permite importar datos mediante la plantilla CSV. Los nuevos movimientos pueden pasar por una Bandeja para revisarlos antes de aceptarlos. La Bandeja no forma parte del calculo hasta que se confirma el movimiento.

### Facturas

Desde la seccion Factura se puede tomar o subir una foto. El backend intenta extraer comercio, fecha, total, productos y categoria. La imagen se comprime primero en el dispositivo para evitar enviar archivos demasiado grandes.

## 5. Asesor IA dentro de la app

El boton flotante abre el chat del asesor financiero. El backend es `api/financial-advisor.js`.

Comportamiento actual:

- Mantiene una conversacion corta por chat para conservar el contexto inmediato.
- Usa el modelo de OpenAI configurado en Vercel.
- Responde breve para controlar costo.
- Pide periodo cuando hace falta; por ejemplo, antes de analizar varios meses.
- Solo envia al modelo los datos relevantes para la pregunta y periodo, no todos los movimientos historicos.
- La app genera sus propios graficos normales; la IA no debe generar un grafico salvo que se pida algo especifico.
- No debe cambiar presupuestos, gastos, categorias o ahorros sin confirmacion explicita.

La memoria del agente tiene dos niveles:

- **Memoria de conversacion**: contexto breve de mensajes recientes.
- **Memoria persistente**: metas, notas, reglas aprendidas y eventos recientes, guardados junto al estado de la cuenta en Supabase.

## 6. Clasificacion automatica y aprendizaje

Cuando llega un movimiento desde correo/Make al endpoint `api/agent-inbox.js`:

1. Se descartan duplicados mediante `sourceId`.
2. Se intenta reconocer una regla aprendida o palabras clave conocidas.
3. Si la confianza es de 90% o mas, entra automaticamente a Gasto o Ingreso.
4. Si hay duda, queda en Bandeja.
5. Al corregir una categoria desde Telegram, el agente guarda un patron para reutilizarlo en futuros movimientos parecidos.

El agente no debe crear categorias por su cuenta. Puede sugerir una nueva, pero requiere aprobacion humana.

## 7. Telegram: estado actual

El bot de Telegram ya esta conectado al grupo privado. El webhook apunta a:

```text
https://cuenta-clara-rosy.vercel.app/api/telegram-webhook
```

El grupo autorizado actual tiene este chat ID:

```text
-5541851449
```

Los dos IDs personales autorizados son los de Deyvid y Kelia. Estan guardados como variable privada en Vercel, separados por coma; no deben ponerse en el frontend ni compartirse fuera del proyecto.

El bot ya puede:

- Responder a `/start`, `/ayuda`, `/limpiar`, `/recuerda` y `/meta`.
- Responder conversaciones de texto que le lleguen.
- Recibir notas de voz y transcribirlas con OpenAI antes de responder.
- Mantener contexto corto de la conversacion del grupo.
- Usar botones de Telegram para confirmar o cambiar categorias de movimientos pendientes.
- Restringir el control a ese grupo y a los dos usuarios autorizados.

### Importante: mensajes normales en grupos

Para que responda textos normales como `puedes leer el correo porfa`, hay que desactivar la privacidad del bot en BotFather:

1. Abrir `@BotFather`.
2. Escribir `/mybots`.
3. Elegir **Cuenta Clara**.
4. Entrar a **Bot Settings**.
5. Entrar a **Group Privacy**.
6. Elegir **Turn off**.

Esto no abre el bot a extraños: el backend sigue validando el ID del grupo y los dos IDs personales permitidos.

## 8. Make y lectura de correos

Make es quien debe leer Gmail. La app no recibe ni guarda una contrasena de Gmail.

Flujo programado acordado:

```text
Gmail -> Make -> /api/agent-inbox -> Supabase -> Telegram
```

Horario deseado de Make (Costa Rica):

```text
06:00, 11:00, 16:00 y 21:00
```

Make debe buscar los correos de gastos/ingresos, obtener comercio, fecha, monto, nota y un `sourceId` unico, y hacer un `POST` a:

```text
https://cuenta-clara-rosy.vercel.app/api/agent-inbox
```

Con este header:

```text
X-Cuenta-Clara-Agent-Token: [valor de AGENT_INGEST_TOKEN]
```

Ejemplo del cuerpo:

```json
{
  "items": [
    {
      "source": "gmail",
      "sourceId": "id-unico-del-correo",
      "date": "2026-09-07",
      "merchant": "MXM Tibas",
      "amount": "2030.00",
      "note": "Detalle del correo"
    }
  ]
}
```

La guia detallada esta en `docs/make-email-inbox-scenario.md`.

## 9. Notificaciones que debe producir el agente

El comportamiento objetivo acordado es:

- Movimiento clasificado con confianza alta: se agrega directo a Gasto o Ingreso y se avisa al grupo con comercio, monto y categoria.
- Ese aviso debe incluir el boton **Cambiar categoria**.
- Si nadie presiona el boton, la categoria queda como esta.
- Movimiento dudoso: queda en Bandeja y Telegram pregunta la categoria con botones.
- Cuando una persona confirma desde Telegram, el movimiento sale de Bandeja, se registra con la categoria elegida y el patron se aprende.
- Tambien debe avisar cuando se acerca o supera un presupuesto, y mandar resumentes semanales y mensuales cuando se configure la automatizacion.

## 10. Variables de entorno de Vercel

Todas las claves, tokens y credenciales se guardan en **Vercel > Project > Settings > Environment Variables** como tipo **Secret**. Nunca se agregan a `app.js`, `index.html`, GitHub o un chat.

Variables usadas o previstas:

| Variable | Tipo | Uso |
| --- | --- | --- |
| `SUPABASE_URL` | Secret | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Acceso privado del backend a Supabase. |
| `AGENT_OWNER_USER_ID` | Secret | Usuario dueño de la cuenta compartida en Supabase. |
| `OPENAI_API_KEY` | Secret | Clave de OpenAI para chat, clasificacion y audio. |
| `OPENAI_CLASSIFIER_MODEL` | Config/Secret | Modelo barato para clasificar, por ejemplo `gpt-4.1-mini`. |
| `OPENAI_ADVISOR_MODEL` | Config/Secret | Modelo del asesor; revisar codigo antes de cambiarlo. |
| `TELEGRAM_BOT_TOKEN` | Secret | Token entregado por BotFather. |
| `TELEGRAM_CHAT_ID` | Secret | ID del grupo privado. |
| `TELEGRAM_ALLOWED_USER_IDS` | Secret | IDs de los dos usuarios, separados por coma. |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | Clave aleatoria para validar llamadas de Telegram. |
| `AGENT_INGEST_TOKEN` | Secret | Clave que Make manda al endpoint de Bandeja/agente. |
| `MAKE_EMAIL_WEBHOOK_URL` | Secret | URL del webhook de Make para pedirle lectura de correo. |
| `MAKE_EMAIL_WEBHOOK_TOKEN` | Secret | Token opcional que valida llamadas hacia Make. |
| `GEMINI_API_KEY` | Secret | Clave antigua/alternativa para analisis de facturas si esta configurada. |

Tras crear o cambiar una variable en Vercel, hay que hacer **Redeploy** para que las funciones nuevas la lean.

## 11. Como subir cambios a internet

Hay dos partes: subir a GitHub y luego Vercel publica automaticamente si esta conectado al repositorio.

En Terminal, desde la carpeta del proyecto:

```bash
cd "/Users/arelysdiaz/Documents/Codex/2026-05-24/me-puedes-ayudar-a-crea-una"
git status
git add .
git commit -m "Describe el cambio"
git push origin main
```

Si Git pide usuario:

```text
amorcitosyyo-web
```

Si pide `Password`, se pega un **Personal Access Token de GitHub**, no la contrasena de GitHub. Al pegarlo no se ven caracteres: es normal. Despues se presiona Enter.

Un resultado correcto termina con una linea similar a:

```text
main -> main
```

El error `fatal: not a git repository` significa que el comando se ejecuto fuera de la carpeta del proyecto; primero hay que ejecutar el `cd` anterior.

El error `403` significa que el token no tenia permiso de escritura. El token correcto debe tener acceso solo al repositorio `amorcitosyyo-web/cuenta-clara` y permiso **Contents: Read and write**.

## 12. Despliegue en Vercel

Vercel esta conectado al repositorio de GitHub. Cuando se hace `git push origin main`:

1. GitHub recibe el nuevo commit.
2. Vercel detecta el cambio.
3. Vercel publica el frontend y las funciones de `api/`.
4. La URL de produccion se actualiza sin cambiar: `https://cuenta-clara-rosy.vercel.app/`.

Para confirmar una publicacion, abrir Vercel > proyecto **cuenta-clara** > Deployments y revisar que el ultimo deployment este en estado **Ready**.

## 13. Estado de Git al redactar este documento

Ultimos cambios publicados antes de este documento:

```text
166faf7 Add Telegram financial agent
6055d6f Reply to Telegram messages
430e390 Add finance agent ingestion and Telegram workflow
bf1d305 Optimiza contexto del asesor IA
ca08c94 Mejora flujo del chat asesor
```

## 14. Que falta para el agente completo

Estas son las tareas pendientes, en orden recomendado:

1. **Terminar Make**: crear el escenario de Gmail y el horario de cuatro lecturas diarias.
2. **Notificacion completa de correo**: garantizar que cada movimiento automatico envie al grupo el mensaje y boton `Cambiar categoria`.
3. **Orden natural desde Telegram**: conectar frases como “revisa el correo porfa” con el webhook de Make, no solo comandos.
4. **Privacidad del bot**: desactivar Group Privacy en BotFather para que lleguen mensajes normales del grupo.
5. **Botones de aprobacion**: permitir cambiar categoria, confirmar propuestas de presupuestos y sugerir nuevas categorias solo con aprobacion.
6. **Avisos programados**: resumen semanal, resumen al final del mes, recordatorios y alertas de presupuestos.
7. **Memoria mejorada**: mantener metas, preferencias y patrones aprendidos de forma clara en Supabase.
8. **Audios**: la recepcion y transcripcion ya existen; probar con el bot en produccion y ajustar errores de permisos o formato si aparecen.
9. **Seguridad y pruebas**: comprobar que Make, Telegram y la app solo acepten tokens/usuarios autorizados antes de usar datos reales a diario.

## 15. Regla de oro de seguridad

Nunca se deben poner en un archivo, captura, mensaje o repositorio publico:

- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_INGEST_TOKEN`
- Tokens de GitHub

Si una clave aparece por accidente en una captura, chat o repositorio, se debe revocar y crear otra inmediatamente.

## 16. Siguiente paso practico

La siguiente mejora tecnica prevista es hacer que el mensaje natural de Telegram, por ejemplo:

```text
Puedes revisar el correo porfa
```

active Make, procese los movimientos nuevos y mande al grupo un aviso por cada movimiento agregado, con el boton `Cambiar categoria`.

Luego se configura Make para que ejecute esa misma lectura automaticamente a las 06:00, 11:00, 16:00 y 21:00.
