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

## Catálogo y tarifas (base de Fase 2)

El catálogo inicial vive en `data/catalog/services.json`; las versiones tarifarias están
en `data/catalog/tariff-versions.json`. Los importes son enteros en COP antes de IVA.
La vigencia es inclusiva y se valida por código de servicio, sin permitir períodos
solapados para una misma tarifa. Si falta una tarifa para el servicio y fecha consultados,
el servicio devuelve explícitamente `no_applicable_tariff`; no inventa importes.

La consulta `findTariffOnDate` requiere una fecha explícita. Aún está pendiente decidir
La API de solo lectura, protegida por sesión, expone `GET /api/catalog` y
`GET /api/catalog/tariffs?serviceCode=AA-01&date=2026-10-01`. La vista Catálogo permite
consultar servicios, versiones y vigencias en la interfaz.

## Motor de cotizaciones (Fase 4)

El motor se ejecuta como servicio independiente de HTTP y de la interfaz. Recibe una
solicitud relacionada, ciudad, fecha y horario de visita, duración, urgencia, indicación
explícita de festivo y conceptos con cantidad y evaluación técnica. No modifica la solicitud
ni la autenticación. La información técnica debe ser confirmada por quien prepara la entrada;
el modelo de solicitudes actual no contiene el detalle de conceptos ni los datos técnicos.

La fecha de tarifa es la fecha de emisión. Por defecto se toma la fecha local del sistema.
Para pruebas y demostraciones se puede definir `MANTIA_QUOTE_REFERENCE_DATE` con una fecha
real `AAAA-MM-DD`; no debe configurarse permanentemente para uso normal. La fecha de visita
se valida por separado y no selecciona la versión tarifaria.

El cálculo devuelve una propuesta, no la emite. La emisión es una operación explícita y
solo admite propuestas calculables. Los registros emitidos se anexan a
`data/quotes/quotes.json`, conservan descripción, unidad, precios y versión tarifaria usados,
y no pueden sobrescribirse: un identificador repetido se rechaza. La fecha de vencimiento
es la emisión más 14 días calendario (15 días contando el día de emisión). Las revisiones
vinculadas están preparadas en el modelo, pero el flujo para crearlas aún no está expuesto.

El IVA es 19 % de la base gravable total, incluido el desplazamiento y cualquier recargo;
se redondea una sola vez al peso, con `0,5` hacia arriba. El desplazamiento se agrega una
vez por visita y no recibe recargo. Todos los conceptos de servicio catalogados son elegibles
para el 25 % de recargo en visitas de fin de semana; la urgencia por sí sola no lo activa.
Una fecha festiva se debe indicar explícitamente; un festivo entre semana requiere revisión,
ya que no existe calendario aprobado. También requieren revisión los horarios entre semana
fuera de 08:00–18:00, los cruces de las 18:00 y de medianoche, tarifas ausentes, servicios
no catalogados y evaluación técnica incompleta o fuera del alcance.

No se ha añadido API ni interfaz de cotizaciones, envío por correo, importación histórica,
edición de tarifas ni gestión de revisiones. La siguiente integración deberá suministrar
los conceptos, evaluaciones técnicas y estado comprobado de festivo sin modificar el módulo
de solicitudes.

## Alcance pendiente

La fase no implementa la interfaz ni una ruta HTTP para el motor, ni un calendario automático
de festivos. Los datos de solicitudes aprobadas solo están relacionados por identificador;
el detalle para cotizar debe aportarlo una futura integración.
