# Mantia

Aplicación local para la gestión de solicitudes y cotizaciones de Mantia Servicios S.A.S.
El servidor usa HTTP nativo de Node.js, la interfaz usa HTML/CSS/TypeScript y los datos
se guardan localmente en archivos JSON. No se utilizan frameworks de interfaz ni servicios
externos.

## Requisitos y ejecución

- Node.js compatible con la versión de TypeScript definida en `package-lock.json`.
- Instalar dependencias de desarrollo con `npm install`.
- Compilar con `npm run build`. El script del navegador se compila por separado como
  JavaScript clásico, sin el envoltorio CommonJS utilizado por el servidor.
- Iniciar el servidor con `npm start`. Por defecto queda disponible en
  `http://127.0.0.1:3000`; se puede cambiar el puerto mediante `PORT`.
- Ejecutar las pruebas con `npm test`.

## Acceso local

La primera vez que abra Mantia, cree un usuario y una contraseña desde la pantalla de
configuración. La cuenta queda guardada en `data/auth/user.json`; el archivo contiene un
hash scrypt con sal, no la contraseña. No elimine ese archivo si desea conservar la cuenta.
Para restablecerla, detenga Mantia y elimine ese archivo local.

El nombre de usuario admite de 3 a 40 letras, números, punto, guion o guion bajo; la
contraseña debe tener de 8 a 128 caracteres. Es una cuenta local única, sin roles. La
sesión se mantiene en memoria del servidor y vence a las 8 horas o al reiniciar Mantia.
La cookie es `HttpOnly` y `SameSite=Strict`; cerrar sesión invalida la sesión actual.
La aplicación escucha únicamente en `127.0.0.1` y no está preparada para acceso desde
otros equipos.

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
