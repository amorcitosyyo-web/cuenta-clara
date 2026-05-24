# Escenario Make para OCR barato

Objetivo: leer facturas sin usar IA pagada.

## Modulos

1. **Webhooks > Custom webhook**
   - Nombre: `Cuenta Clara OCR factura`
   - URL creada:
     `https://hook.us2.make.com/gh8rbvkey2nse6eolro3g2gjqtbdauif`

2. **HTTP > Make a request**
   - Authentication type: `No authentication`
   - URL: `https://api.ocr.space/parse/image`
   - Method: `POST`
   - Body type: `Application/x-www-form-urlencoded`
   - Parse response: `Yes`

   Campos:
   - `apikey`: `helloworld`
   - `language`: `spa`
   - `OCREngine`: `2`
   - `scale`: `true`
   - `isTable`: `true`
   - `base64Image`: mapear el campo `image` del webhook

   Nota: `helloworld` es la llave publica de prueba de OCR.space. Para uso real conviene crear una API key gratis en OCR.space y cambiar ese valor.

3. **Webhooks > Webhook response**
   - Status: `200`
   - Header:
     - `Content-Type`: `application/json`
   - Body:

```json
{
  "text": "{{2.ParsedResults[1].ParsedText}}",
  "rawText": "{{2.ParsedResults[1].ParsedText}}"
}
```

## Para gastar menos

- La app comprime la foto antes de mandarla.
- Solo se llama Make cuando hay webhook configurado.
- No se usa IA para categorizar: la app categoriza localmente con reglas.
- Make usa 3 operaciones por factura: webhook, HTTP OCR, respuesta.
- Si OCR falla, la app usa el texto manual como respaldo.
- La app tambien tiene OCR directo gratis con OCR.space si el campo de Make queda vacio.
