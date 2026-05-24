# Escenario Make recomendado: factura con Gemini gratis

Objetivo: que Make reciba la foto de la app, la mande a una IA con vision y devuelva JSON listo para Cuenta Clara.

## Por que cambiar de OCR.space a Gemini

OCR.space solo lee texto. En facturas reales falla cuando hay:

- Totales duplicados: `Subtotal`, `Total`, `Tarjeta`, `Monto cancelado`.
- Numeros fiscales largos: clave, consecutivo, autorizacion, terminal, telefono.
- Productos con codigo, cantidad, precio unitario e impuesto.
- Fechas en formatos distintos.

Gemini puede interpretar la imagen completa y elegir el total correcto.

## Modulos en Make

1. **Webhooks > Custom webhook**
   - Nombre: `Cuenta Clara OCR factura`
   - Recibe:
     - `image`: foto comprimida en base64/data URL
     - `text`: texto opcional escrito por el usuario
     - `filename`: nombre de archivo
     - `categories`: categorias actuales de la app en JSON
     - `merchantRules`: memoria de patrones aprendidos en JSON
     - `classificationGuide`: reglas generales de clasificacion

2. **HTTP > Make a request**
   - Esta es la opcion mas confiable porque el modulo Gemini de Make puede aparecer como generador de imagen y no como analizador de imagen.
   - Method: `POST`
   - URL:

```text
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=TU_API_KEY
```

   - Body content type: `application/json`
   - Parse response: `Yes`
   - Body:

```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "Analiza esta factura o tiquete de Costa Rica. Devuelve SOLO JSON valido, sin markdown. Usa solamente estas categorias de la app: {{1.categories}}. Usa esta memoria de patrones aprendidos como prioridad: {{1.merchantRules}}. Guia de clasificacion: {{1.classificationGuide}}. Campos requeridos: {\"comercio\": string, \"fecha\": \"YYYY-MM-DD\", \"total\": number, \"categoria\": string, \"productos\": [{\"nombre\": string, \"cantidad\": number | null, \"precio\": number | null, \"categoria\": string}], \"confianza\": number, \"observaciones\": string}. Reglas: usa colones costarricenses; ignora clave numerica, consecutivo, autorizacion, terminal, telefono, cedula juridica, numero de caja y codigos de barras; el total correcto normalmente aparece cerca de Total, Total CRC, Total a Pagar, Tarjeta CRC o Monto Cancelado; si hay subtotal, IVA, descuento y total, usa Total; no dupliques Tarjeta si es el mismo monto; detecta la fecha real de compra."
        },
        {
          "inline_data": {
            "mime_type": "{{1.mimeType}}",
            "data": "{{1.imageBase64}}"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.1,
    "response_mime_type": "application/json"
  }
}
```

3. **Webhooks > Webhook response**
   - Status: `200`
   - Headers:
     - `Content-Type`: `application/json`
     - `Access-Control-Allow-Origin`: `*`
   - Body: mapear el texto de la respuesta de Gemini. Normalmente viene en:

```text
{{2.candidates[1].content.parts[1].text}}
```

   - Si Make usa indice cero en tu vista, puede aparecer como:

```text
{{2.candidates[0].content.parts[0].text}}
```

## Prompt para Gemini

```text
Analiza esta factura o tiquete de Costa Rica. Devuelve SOLO JSON valido, sin markdown.

Usa solamente estas categorias de la app:
{{1.categories}}

Usa esta memoria de patrones aprendidos como prioridad:
{{1.merchantRules}}

Guia de clasificacion:
{{1.classificationGuide}}

Campos requeridos:
{
  "comercio": string,
  "fecha": "YYYY-MM-DD",
  "total": number,
  "categoria": string,
  "productos": [
    {
      "nombre": string,
      "cantidad": number | null,
      "precio": number | null,
      "categoria": string
    }
  ],
  "confianza": number,
  "observaciones": string
}

Reglas:
- Usa colones costarricenses.
- El total correcto normalmente aparece cerca de "Total", "Total CRC", "Total a Pagar", "Tarjeta CRC" o "Monto Cancelado".
- Ignora clave numerica, consecutivo, autorizacion, terminal, telefono, cedula juridica, numero de caja y codigos de barras.
- Si hay "Subtotal", "IVA", "Descuento" y "Total", usa el monto de "Total".
- Si hay "Tarjeta" con el mismo monto que total, no lo dupliques.
- Detecta el comercio desde el encabezado.
- Detecta la fecha real de compra, no fechas de resolucion o autorizacion.
- Extrae productos solamente de las lineas de articulos, no de textos legales.

Reglas de categoria:
- No inventes categorias fuera de las recibidas en categories.
- merchantRules no es una lista cerrada; cada regla puede traer `merchant`, `patterns` y `productPatterns`.
- Si el comercio coincide con `merchant` o con `patterns`, esa regla tiene prioridad.
- Si los productos coinciden con `productPatterns`, usa esa categoria como evidencia aunque el comercio sea nuevo.
- Si no hay patron aprendido, clasifica por keywords de categories y por los productos.
- Si no estas seguro, usa la categoria mas probable y explica la duda en observaciones.
```

## Memoria que crece

La app ahora envia `merchantRules` y aprende automaticamente cuando guardan una factura. No aprende solo por nombre exacto; aprende patrones:

1. Gemini analiza el tiquete.
2. La app muestra el resultado.
3. Cuando guardan el gasto, la app registra `comercio -> categoria`, palabras clave del comercio y patrones de productos.
4. En la siguiente factura, esa memoria viaja a Make y Gemini la usa para clasificar comercios parecidos o nuevos.

Esto permite que la base de lugares crezca sin tener que editar el escenario cada vez.

## API key gratis

Crear en Google AI Studio:

`https://aistudio.google.com/apikey`

No pegar la key en el chat. Debe ingresarse directamente en Make al crear la conexion de Google Gemini AI.
