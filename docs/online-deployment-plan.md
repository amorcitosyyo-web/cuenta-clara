# Plan para poner Cuenta Clara en linea

## Objetivo

Que la app se pueda usar desde iPhone, Mac y PC con una URL publica, y que ambos vean los mismos ingresos, gastos, presupuestos, ahorros, categorias y facturas.

## Camino recomendado

### 1. Hosting de la app: Vercel

Vercel sirve para publicar la app y obtener una URL tipo:

```text
https://cuenta-clara.vercel.app
```

Es suficiente para la interfaz y tiene plan gratuito.

### 2. Base de datos, login y fotos: Supabase

Supabase nos da:

- Login con correo.
- Base de datos Postgres.
- Storage para guardar fotos de facturas.
- Reglas de seguridad para que solo ustedes dos vean la informacion.

El archivo `database/schema.sql` ya tiene la estructura inicial.

### 3. Analisis de facturas: endpoint privado

La API key de Gemini no debe quedar escrita en el navegador cuando la app este publica.

En local esta bien para probar, pero en produccion debe ir escondida en una funcion del servidor:

```text
App -> /api/analyze-receipt -> Gemini
```

Asi la app nunca muestra la API key.

## Fases

### Fase A: Publicar rapido

Sirve para abrir la app desde el celular.

- Crear cuenta en Vercel.
- Subir estos archivos.
- Abrir la URL publica.
- Instalar en el iPhone como PWA.

Limitacion: si no conectamos Supabase, cada dispositivo guarda datos separados.

### Fase B: Datos compartidos reales

Sirve para que ambos usen la misma cuenta.

- Crear proyecto en Supabase.
- Ejecutar `database/schema.sql`.
- Agregar login.
- Cambiar `localStorage` por Supabase.
- Crear hogar compartido.
- Invitar a la pareja por email.

### Fase C: Facturas seguras

Sirve para analizar facturas sin exponer la API key.

- Crear funcion `/api/analyze-receipt`.
- Guardar `GEMINI_API_KEY` como variable privada en Vercel.
- La app manda foto + categorias + patrones a esa funcion.
- La funcion devuelve JSON con comercio, fecha, total, categoria y productos.

## Lo que se ocupa de ustedes

- Una cuenta gratis de Vercel.
- Una cuenta gratis de Supabase.
- La API key de Gemini.
- Los correos que van a entrar a la app.

