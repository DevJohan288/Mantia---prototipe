# Mantia

Aplicación local para la gestión de solicitudes y cotizaciones de Mantia Servicios S.A.S.
El servidor usa HTTP nativo de Node.js, la interfaz usa HTML/CSS/TypeScript y los datos
se guardan localmente en archivos JSON. No se utilizan frameworks de interfaz ni servicios
externos.

## Requisitos y ejecución

- Node.js compatible con la versión de TypeScript definida en `package-lock.json`.
- Instalar dependencias de desarrollo con `npm install`.
- Compilar con `npm run build`.
- Iniciar el servidor con `npm start`. Por defecto queda disponible en
  `http://localhost:3000`; se puede cambiar el puerto mediante `PORT`.
- Ejecutar las pruebas con `npm test`.

## Solicitudes y revisión

El primer bloque permite registrar solicitudes con nombre del cliente, al menos un medio
de contacto, descripción del servicio, dirección y fecha preferida opcional. Las solicitudes
se guardan en `data/requests/requests.json`; el archivo se crea al registrar la primera
solicitud. Si el JSON existente no es válido, el servidor informa el error y no reemplaza
los datos.

Estados disponibles:

- `pending_review`: solicitud nueva.
- `needs_information`: se requiere información adicional; la nota es obligatoria.
- `approved`: aprobada para pasar a una etapa futura de cotización.
- `rejected`: rechazada; la nota es obligatoria.

Desde revisión se puede solicitar información, devolver la solicitud a revisión, aprobarla
o rechazarla. Aprobadas y rechazadas son estados finales en este bloque. Toda entrada se
valida en el servidor y los errores de validación, inexistencia o transición se comunican
con respuestas HTTP claras.

## Alcance pendiente

Este bloque no genera cotizaciones, calcula precios ni importa cotizaciones históricas.
Quedan por definir reglas comerciales para servicios sin tarifa, clasificación de festivos
y casos que requieren revisión manual antes de calcular cotizaciones. Las solicitudes
aprobadas solo quedan listas para la etapa posterior; no se crea una cotización todavía.
