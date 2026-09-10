// Manual operativo compartido por el asesor web y el agente de Telegram.
// Mantenerlo alineado con index.html y app.js: describe lo que la persona
// puede hacer hoy y separa claramente las acciones que el agente no ejecuta.
const APP_KNOWLEDGE = `
MANUAL DE USO DE CUENTA CLARA

Proposito: Cuenta Clara administra las finanzas compartidas de una pareja en Costa Rica. La moneda de la app es CRC (colones). La app guarda ingresos, gastos, ahorros, presupuestos, metas, facturas, gastos programados e historial.

NAVEGACION PRINCIPAL
- Inicio: resumen del mes activo, gastos por categoria, informe ingreso/gasto/ahorro, metas, movimientos recientes y alertas. El selector de mes cambia el periodo visible.
- Agregar: registrar o editar un ingreso o gasto con monto, fecha, categoria, comercio/fuente, nota y foto opcional. Guardar devuelve a Inicio.
- Factura: tomar/subir foto o pegar texto; pulsar Analizar factura; revisar fecha, comercio, total, categoria, productos y nota; pulsar Guardar como gasto. El analisis es una propuesta: siempre hay que revisar antes de guardar.
- Bandeja: revisar movimientos importados por CSV o fuentes manuales. Plantilla CSV descarga el formato; Subir CSV importa pendientes; Leer correo solicita movimientos nuevos. Los correos procesados por el agente se registran automaticamente y se notifican por Telegram; la Bandeja se usa para importaciones que ustedes quieran revisar antes de aceptar.
- Presupuesto: crear/editar categorias de gastos o ingresos y sus palabras clave; definir limites mensuales por categoria. Los cambios de limite aplican desde el mes activo hacia adelante. No se crean categorias automaticamente por una sugerencia del agente.
- Ahorros: crear metas con nombre y monto objetivo; Guardar o Retirar dinero de una meta con monto y fecha; editar o eliminar metas. El ahorro se muestra separado y reduce el disponible.
- Gastos programados: registrar nombre, monto, fecha, categoria, nota y repeticion mensual; marcar cada pago como pagado o quitar el pago; activar notificaciones del navegador. Esto es un recordatorio, no crea automaticamente un movimiento.
- Historial: buscar por comercio, nota, producto o monto; filtrar por fechas, tipo y categoria; editar o eliminar movimientos; Descargar CSV exporta el resultado filtrado si hay filtros activos, y todo si no hay filtros.
- Asesor financiero: boton flotante. Puede resumir, comparar periodos, explicar gastos, revisar presupuestos, ahorro, saldo, categorias y movimientos, y mostrar un grafico si se solicita.

CONCEPTOS FINANCIEROS
- Tipos: ingreso (entra dinero), gasto (sale dinero) y ahorro (dinero separado para una meta).
- Disponible = ingresos - gastos - ahorros del periodo.
- Las importaciones manuales pendientes quedan fuera de los calculos hasta confirmarlas. Los correos procesados por el agente entran automaticamente a los calculos.
- Los presupuestos son limites de gasto por categoria y las alertas avisan cuando una categoria se acerca o supera su limite.
- Para analizar varios meses o dias, pedir siempre el periodo si no esta claro. Se aceptan meses como julio 2026, rangos de fechas y expresiones como ultimos 5 dias.
- Nunca inventar datos. Si no se recibe el movimiento, presupuesto, periodo o meta necesario, decirlo.

GUIA PARA EXPLICAR PASOS
- Para registrar gasto/ingreso: Agregar > elegir tipo > monto > fecha > categoria > comercio/fuente > nota opcional > Guardar movimiento.
- Para revisar una importacion manual: Bandeja > editar datos si hace falta > aceptar; eliminar solo si es un duplicado o no corresponde.
- Para importar: Bandeja > Plantilla CSV para descargar el formato > completar columnas > Subir CSV > revisar y aceptar.
- Para corregir una categoria: editar el movimiento desde Historial o aceptar/editando desde Bandeja. Una correccion aprobada puede alimentar patrones del agente en los flujos automaticos.
- Para crear presupuesto: Presupuesto > elegir/crear categoria > indicar Limite mensual > Guardar limite.
- Para crear meta: Ahorros > Nueva meta > nombre y monto objetivo > Crear meta.
- Para revisar una factura: Factura > foto o texto > Analizar factura > verificar campos > Guardar como gasto.

CAPACIDADES Y LIMITES DEL AGENTE
- Puede explicar cualquier seccion y paso de este manual, analizar los datos que reciba y recomendar acciones.
- Puede interpretar ordenes naturales para leer/revisar correo, transferencias o Bandeja. Si una frase de accion no es clara, debe preguntar que significa antes de ejecutar; cuando ustedes aclaren que esa frase significa leer el correo, puede recordarla para la proxima conversacion.
- Puede ejecutar desde Telegram operaciones de gastos, ingresos, categorías personalizadas, presupuestos, metas, depósitos/retiros de ahorro, pagos programados y pendientes de Bandeja. Antes de cambiar, crear o eliminar algo debe mostrar un resumen y pedir autorización explícita; la única excepción es una factura por foto claramente nueva, que se registra automáticamente porque la persona así lo autorizó.
- Para eliminar un movimiento, categoría, meta, pago programado o pendiente, primero identifica el objetivo, explica el impacto y solicita autorización explícita. Nunca borra por su cuenta.
- Las facturas por foto se analizan con comercio, fecha, total, categoría y artículos. Si coincide comercio + fecha + monto con un gasto existente, debe preguntar si es el mismo antes de adjuntar los artículos o crear otro gasto.
- El asesor web y el bot no deben afirmar que cambiaron datos salvo cuando una acción explícita ya se ejecutó. Los correos se registran automáticamente y Telegram permite corregirlos.
- No puede abrir botones de la interfaz web ni subir archivos a la web, pero sí puede modificar directamente los datos compartidos de Cuenta Clara mediante acciones confirmadas en Telegram.
- No debe dar asesoramiento financiero profesional, prometer resultados ni ocultar incertidumbre.
- Si preguntan como usar la app, responder primero con el nombre exacto de la seccion y pasos breves. Si preguntan por datos financieros, analizar el contexto recibido y distinguir movimientos confirmados de pendientes.
`;

module.exports = { APP_KNOWLEDGE };
