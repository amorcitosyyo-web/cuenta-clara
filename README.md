# Cuenta Clara

Primera version de una app web responsive para controlar una cuenta compartida de pareja.

## Que incluye

- Registro de ingresos y gastos en colones.
- Resumen mensual.
- Interfaz oscura con paleta verde: `#051F20`, `#0B2B26`, `#163832`, `#235347`, `#8EB69B`, `#DAF1DE`.
- Graficos de gastos por categoria e informe de ingreso/gasto/ahorro.
- Metas de ahorro y transferencias desde el disponible hacia una cuenta de ahorro.
- Presupuestos por categoria.
- Historial filtrable.
- Subida o toma de foto de factura.
- Campo para conectar un webhook de Make.
- Compresion de foto antes de enviarla a Make/OCR.
- Analisis directo con Gemini si no hay webhook de Make.
- OCR gratuito directo con OCR.space como ultimo respaldo.
- Analisis inicial de texto de factura para sugerir fecha, comercio, total, categoria y productos.
- Datos guardados localmente en el navegador con `localStorage`.

## Como abrirla

Abre `index.html` en Safari, Chrome o Edge. En iPhone se puede abrir desde Safari y agregar a pantalla de inicio.

## Como publicarla en Vercel

1. Crea una cuenta gratis en Vercel.
2. Sube esta carpeta como proyecto.
3. Framework preset: `Other`.
4. Build command: dejar vacio.
5. Output directory: dejar vacio o usar `.`.
6. Publica el proyecto.

La primera version queda en linea, pero cada dispositivo guarda sus datos por separado hasta conectar Supabase.

## Proximos pasos recomendados

1. Conectar Supabase para que ambos usuarios compartan los mismos datos.
2. Agregar login.
3. Subir fotos a Supabase Storage.
4. Conectar OCR real para leer facturas desde imagen.
5. Usar IA para categorizar productos y comercios con mas precision.
6. Sincronizar metas de ahorro entre ambos usuarios.
