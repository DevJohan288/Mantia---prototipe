# Guía técnica de Mantia

Documento de referencia para instalar, explicar, probar y mantener el prototipo de
gestión local de solicitudes y cotizaciones de Mantia Servicios S.A.S.

## 1. Resumen

Mantia es una aplicación web local para registrar solicitudes de servicio, revisarlas,
consultar servicios y tarifas vigentes, y preparar y emitir cotizaciones asociadas a
solicitudes aprobadas.

La solución está construida con:

- **Servidor:** Node.js y HTTP nativo, escrito en TypeScript.
- **Interfaz:** HTML semántico, CSS y TypeScript compilado para navegador.
- **Persistencia:** archivos JSON locales; no requiere base de datos.
- **Pruebas:** `node:test`, con pruebas unitarias, de integración y de rutas estáticas.
- **Dependencias de desarrollo:** TypeScript y tipos de Node.js; no hay framework de
  servidor, framework de interfaz ni servicio externo.

Es un prototipo pensado para ejecutarse en una sola máquina. El servidor solo escucha en
`127.0.0.1`; no debe tratarse como una aplicación lista para publicar en Internet o para
ser utilizada simultáneamente por varios procesos o equipos.

## 2. Requisitos y puesta en marcha

Se necesita Node.js y npm compatibles con las versiones fijadas por el proyecto. El
procedimiento recomendado desde la raíz del repositorio es:

```text
npm install
npm run build
npm test
npm start
```

El servidor queda disponible en `http://127.0.0.1:3000`. Para elegir otro puerto se
define la variable de entorno `PORT` antes de iniciar el proceso; solo se aceptan
enteros entre 1 y 65535.

El orden importa: las pruebas cargan código compilado desde `dist`, por lo que se debe
ejecutar `npm run build` antes de `npm test` cuando se parte de un clon limpio. `dist/`
es una salida generada y está excluida de Git.

### Comandos del proyecto

| Comando | Propósito |
| --- | --- |
| `npm install` | Instala las dependencias descritas por `package-lock.json`. |
| `npm run build` | Compila el servidor y el cliente en dos configuraciones TypeScript. |
| `npm test` | Ejecuta las pruebas con el runner incorporado de Node.js. |
| `npm start` | Inicia el servidor compilado. |

## 3. Estructura del repositorio

```text
data/
  auth/              Usuario local persistido
  catalog/           Servicios y versiones tarifarias
  quotes/            Cotizaciones emitidas
  requests/          Solicitudes; el archivo se crea al registrar una
docs/
  guia-tecnica.md    Esta guía
public/
  assets/            Montaje público reservado para recursos estáticos
  css/               Hoja de estilos pública
src/
  client/
    index.html       Panel y módulos de trabajo
    login.html       Acceso y creación inicial de cuenta
    scripts/         Controladores TypeScript del navegador
  server/
    application.ts   Enrutamiento general y control de errores
    config.ts        Rutas locales, puerto y montajes estáticos
    server.ts        Arranque del servidor HTTP
    repositories/    Lectura y persistencia de datos
    routes/          Adaptadores HTTP y validación de solicitudes API
    services/        Reglas de negocio y validaciones
  shared/
    models/          Tipos compartidos del dominio
tests/
  integration/       Flujos de API y persistencia
  unit/              Servicios y repositorios aislados
  staticRoutes.test.js
```

### Responsabilidades principales

| Componente | Responsabilidad |
| --- | --- |
| `src/server/server.ts` | Lee y valida `PORT`, inicializa autenticación y crea el servidor en loopback. |
| `src/server/application.ts` | Decide entre autenticación, API protegida, redirecciones y contenido estático; transforma errores no controlados en respuestas 500. |
| `src/server/routes/` | Traduce HTTP a llamadas de servicio y asigna códigos y formatos de respuesta. |
| `src/server/services/` | Aplica reglas de negocio sin depender de una interfaz web. |
| `src/server/repositories/` | Valida los documentos JSON y encapsula su lectura/escritura. |
| `src/shared/models/` | Define los contratos TypeScript de solicitudes, catálogo y cotizaciones. |
| `src/client/` | Presenta formularios, navegación, resultados y mensajes de estado. |
| `data/` | Conserva el estado local; no es un directorio público del servidor. |

El flujo típico en el servidor es:

```text
HTTP → application → route → service → repository → archivo JSON
                           ↑                         ↓
                    respuesta HTTP ← modelo tipado ←
```

La autenticación se comprueba en `application.ts` antes de procesar las API de
solicitudes, catálogo y cotizaciones. Las rutas de autenticación son la excepción
necesaria para crear cuenta, consultar sesión e iniciar o cerrar sesión.

## 4. Compilación TypeScript

El servidor se compila con `tsconfig.json`: objetivo ES2022, módulos `NodeNext`, raíz
`src/` y salida `dist/`. Se habilitan comprobaciones estrictas, entre ellas
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitReturns`, `noUnusedLocals` y `noUnusedParameters`.

El cliente se compila por separado con `tsconfig.client.json`: usa módulos ESNext y
resolución `Bundler`, pero produce un script clásico bajo `dist/client/scripts/`. No hay
bundler ni carga de módulos en el navegador; por eso `main.ts` y `login.ts` no usan
`import`/`export` y encapsulan su código en funciones autoejecutables.

Los tipos del dominio del servidor están en `src/shared/models/`. El script de navegador
declara sus propios tipos de respuesta/entrada porque se compila como programa
independiente; al cambiar un contrato HTTP, hay que revisar tanto el modelo y la ruta
del servidor como los tipos y el uso en el cliente.

## 5. Funcionalidades y flujos

### 5.1 Cuenta y sesión local

En la primera visita, la pantalla de configuración permite crear una cuenta local única.
Después, la pantalla de inicio de sesión autentica esa cuenta.

- Usuario: de 3 a 40 caracteres; letras, números, punto, guion y guion bajo.
- Contraseña: de 8 a 128 caracteres.
- El servidor guarda una sal y un hash derivado con `scrypt`; no guarda la contraseña
  en texto plano.
- La sesión vive en memoria del proceso y expira a las 8 horas.
- La cookie se marca `HttpOnly` y `SameSite=Strict`.
- Al reiniciar el servidor, las sesiones dejan de existir y es necesario iniciar sesión
  de nuevo.
- No existen roles ni múltiples cuentas.

La pantalla consulta `GET /api/auth/session` para decidir si presenta configuración,
inicio de sesión o redirección al panel. La cuenta persistida está en
`data/auth/user.json`; no se debe compartir este archivo como parte de una entrega,
aunque su contraseña no esté almacenada en texto plano.

### 5.2 Solicitudes y revisión

Una solicitud incluye nombre del cliente, al menos un medio de contacto, descripción
del servicio, dirección y fecha preferida opcional. El servicio valida y normaliza el
ingreso antes de delegar al repositorio.

Estados disponibles:

| Estado | Significado |
| --- | --- |
| `pending_review` | Nueva y pendiente de revisión. |
| `needs_information` | Requiere información adicional. |
| `approved` | Aprobada para preparar una cotización. |
| `rejected` | Rechazada. |

Transiciones permitidas:

| Estado actual | Siguientes estados permitidos |
| --- | --- |
| `pending_review` | `needs_information`, `approved`, `rejected` |
| `needs_information` | `pending_review`, `approved`, `rejected` |
| `approved` | Ninguno en el flujo implementado |
| `rejected` | Ninguno en el flujo implementado |

Solicitar información o rechazar requiere una nota. La aplicación no convierte la
aprobación en una cotización automáticamente: la cotización es una operación separada.
Las solicitudes se guardan en `data/requests/requests.json`, creado cuando se registra
la primera.

### 5.3 Catálogo y tarifas

El catálogo se divide en dos documentos:

- `data/catalog/services.json`: código, nombre, unidad y categoría (`service` o
  `travel`) de cada servicio.
- `data/catalog/tariff-versions.json`: identificador de versión, fechas inclusivas de
  vigencia y tarifas en COP.

El repositorio valida los documentos al cargarlos: estructura, códigos únicos,
referencias a servicios existentes, importes enteros positivos, fechas reales y
vigencias no solapadas para un mismo servicio. El servicio selecciona la tarifa con
fecha explícita. Devuelve uno de tres resultados: `available`,
`service_not_found` o `no_applicable_tariff`; nunca inventa una tarifa faltante.

Los importes del catálogo son valores antes de IVA. Los archivos del catálogo son de
solo lectura desde la API.

### 5.4 Preparación y emisión de cotizaciones

La solicitud aprobada aporta el vínculo comercial, pero no trae automáticamente los
detalles técnicos que requiere una cotización. Quien la prepara debe indicar ciudad,
fecha y hora de visita, duración, urgencia, si es festivo y una o más líneas con código
de servicio, cantidad y evaluación técnica.

El flujo está dividido expresamente:

1. **Preparar:** elegir una solicitud aprobada y completar los datos técnicos.
2. **Calcular:** `POST /api/quotes/calculate` valida y devuelve una propuesta; no la
   guarda ni la emite.
3. **Revisar:** la interfaz presenta conceptos, tarifas, recargos, base, IVA y total.
   Si cambian los datos, invalida la propuesta y exige recalcular.
4. **Emitir:** después de confirmación, `POST /api/quotes/issue` vuelve a validar la
   aprobación y recalcula en el servidor. El cliente no establece importes ni totales.
5. **Consultar:** la cotización emitida se guarda como snapshot y queda disponible en
   las consultas de cotizaciones.

Reglas que condicionan el cálculo:

- La fecha que selecciona la versión tarifaria es la **fecha de emisión**, no la fecha
  de visita. De forma normal se toma la fecha local del servidor. Para demostraciones o
  pruebas puede definirse `MANTIA_QUOTE_REFERENCE_DATE` con una fecha real
  `AAAA-MM-DD`.
- La vigencia tarifaria incluye los dos extremos de cada período.
- La ciudad determina el código de desplazamiento; el desplazamiento se agrega una vez
  por visita y no admite una línea manual del cliente.
- Los sábados y domingos, según el cálculo UTC del día de visita, el código aplica
  recargo de 25 % a servicios catalogados; no lo aplica al desplazamiento. La urgencia
  se conserva como dato, pero por sí sola no añade recargo.
- Para días entre semana se requiere revisión si se declara festivo, si la visita inicia
  antes de las 08:00, inicia a las 18:00 o después, o termina después de las 18:00.
- Una visita que llega a la medianoche o la cruza requiere revisión manual. No hay
  calendario automático de festivos.
- Falta de tarifa, servicio no catalogado o evaluación técnica ausente, incompleta o
  fuera del alcance también bloquean la emisión.
- El IVA es 19 % de la base total gravable (conceptos, recargos y desplazamiento) y se
  redondea una sola vez al peso, con mitad hacia arriba.
- La vigencia de una cotización es emisión más 14 días calendario: contando el día de
  emisión, son 15 días.
- Una emisión exitosa se conserva como snapshot con descripciones, precios y versión
  tarifaria usados. Una segunda emisión para la misma solicitud se rechaza; no
  sobrescribe el registro.

Los bloqueos se devuelven con códigos y mensajes de revisión manual. No se persisten
como cotizaciones pendientes ni se crea una cola de trabajo. El proceso no cambia el
estado de la solicitud aprobada.

## 6. Contratos HTTP

Las API usan JSON. Todas las rutas de solicitudes, catálogo y cotizaciones requieren
sesión; las rutas de `/api/auth/` se atienden antes de esa comprobación. Las rutas que
reciben cuerpos validan el tipo de contenido y la estructura. Se rechazan campos no
permitidos.

### Autenticación

| Método y ruta | Uso | Respuestas habituales |
| --- | --- | --- |
| `GET /api/auth/session` | Consulta si la cuenta está configurada y si la petición tiene sesión. | `200` con `configured` y `authenticated`. |
| `POST /api/auth/setup` | Crea la cuenta inicial con `username`, `password` y `confirmPassword`. | `201`, `400` por datos inválidos, `409` si ya existe cuenta. |
| `POST /api/auth/login` | Inicia sesión con `username` y `password`. | `200`, `400` por cuerpo inválido, `401` por credenciales incorrectas. |
| `POST /api/auth/logout` | Invalida la sesión actual y limpia la cookie. | `200`. |

El cuerpo máximo de autenticación es 8 KiB.

### Solicitudes

| Método y ruta | Uso | Respuestas habituales |
| --- | --- | --- |
| `GET /api/requests` | Lista solicitudes. | `200` con una colección. |
| `POST /api/requests` | Crea una solicitud. | `201`; `400` si el cuerpo o sus campos no son válidos. |
| `PATCH /api/requests/:id/review` | Cambia estado y nota de revisión. | `200`; `400` validación, `404` no encontrada, `409` transición no permitida. |

Los cuerpos de solicitudes tienen límite de 32 KiB. La interfaz presenta errores de
validación en el módulo correspondiente.

### Catálogo

| Método y ruta | Uso | Respuestas habituales |
| --- | --- | --- |
| `GET /api/catalog` | Devuelve servicios y versiones tarifarias. No admite query params. | `200`; `400` si se envían parámetros no permitidos. |
| `GET /api/catalog/tariffs?serviceCode=AA-01&date=2026-10-01` | Busca tarifa por código y fecha explícitos. | `200` con resultado de búsqueda, `400` fecha/parámetros inválidos, `404` servicio desconocido. |

La respuesta de la consulta tarifaria discrimina `available`,
`no_applicable_tariff` y `service_not_found`.

### Cotizaciones

| Método y ruta | Uso | Respuestas habituales |
| --- | --- | --- |
| `GET /api/quotes/eligible` | Solicitudes aprobadas que no tienen cotización emitida. | `200` con la colección elegible. |
| `GET /api/quotes` | Lista snapshots emitidos. | `200`. |
| `GET /api/quotes/:id` | Recupera una cotización emitida por identificador. | `200`, `400` ID inválido, `404` no encontrada. |
| `POST /api/quotes/calculate` | Calcula una propuesta no persistida. | `200` resultado calculado; errores de entrada, estado o revisión se expresan con HTTP y razones. |
| `POST /api/quotes/issue` | Vuelve a validar, recalcula y emite la propuesta. | `201`; `400` entrada inválida, `404` servicio/solicitud no encontrada, `409` revisión necesaria o conflicto de emisión. |

El cuerpo de cálculo/emisión tiene límite de 32 KiB y acepta solamente
`requestId`, `city`, `visitDate`, `startTime`, `durationMinutes`, `urgent`,
`isHoliday` y `lines`. Cada línea acepta `serviceCode`, `quantity`,
`technicalAssessment` y `technicalNotes`. En la emisión, ni precios, ni impuestos, ni
totales del navegador son autoritativos.

## 7. Persistencia y formatos

Los repositorios convierten JSON leído en `unknown` a datos validados antes de usarlo.
Los errores de JSON corrupto o documentos inválidos se informan; no se reemplaza un
archivo corrupto por una colección vacía.

Las escrituras de cuenta, solicitudes y cotizaciones se serializan dentro del proceso.
Se prepara un archivo temporal único y luego se renombra al archivo objetivo para
reducir la posibilidad de dejar un documento escrito parcialmente. Los catálogos se
cargan desde sus archivos JSON y no tienen endpoints de edición.

Archivos de datos:

| Archivo | Contenido |
| --- | --- |
| `data/auth/user.json` | Cuenta local con usuario, sal y hash `scrypt`. |
| `data/catalog/services.json` | Definiciones de servicios. |
| `data/catalog/tariff-versions.json` | Vigencias y precios por servicio. |
| `data/requests/requests.json` | Solicitudes y estado de revisión; creado bajo demanda. |
| `data/quotes/quotes.json` | Cotizaciones emitidas, guardadas como snapshots. |

Los archivos JSON de la carpeta `data/` pueden contener información local de operación.
Antes de entregar o compartir el repositorio, se deben revisar y sanitizar los registros
reales y no incluir credenciales, hashes de usuarios, datos personales ni cotizaciones
confidenciales.

### Forma de los modelos

- **Solicitud (`RequestRecord`):** campos de contacto/servicio de `RequestInput`, más
  `id`, `status`, `reviewNotes`, `createdAt` y `updatedAt`.
- **Versión tarifaria (`TariffVersion`):** `id`, `validFrom`, `validThrough` y una
  colección `tariffs` de `{ serviceCode, amountCop }`.
- **Entrada de cotización (`QuoteInput`):** solicitud, ciudad, fecha/hora/duración,
  indicadores de urgencia y festivo y líneas técnicas.
- **Propuesta (`QuoteDraft`):** datos de emisión y visita, líneas snapshot, base, tasa y
  valor de IVA, total, vínculo a revisión anterior reservado y razones vacías en el
  camino calculable.
- **Cotización emitida (`IssuedQuote`):** snapshot calculado con estado `issued` y
  `createdAt`/`updatedAt`.

Los tipos concretos están definidos en
[`src/shared/models/request.ts`](../src/shared/models/request.ts),
[`src/shared/models/catalog.ts`](../src/shared/models/catalog.ts) y
[`src/shared/models/quote.ts`](../src/shared/models/quote.ts).

## 8. Interfaz y accesibilidad

`src/client/index.html` contiene el panel y las vistas de solicitudes, revisión,
catálogo, cotizaciones e historial. La navegación usa fragmentos URL (`#panel`,
`#solicitudes`, etc.). El historial se muestra como módulo futuro y todavía no almacena
actividad.

`src/client/scripts/main.ts` controla navegación, consultas API y renderizado. Construye
contenido dinámico con elementos DOM y `textContent`, en lugar de insertar directamente
valores de registros como HTML. Hay regiones `aria-live`, etiqueta de navegación activa,
enlace para saltar al contenido y gestión de foco en cambios de vista. Sin JavaScript,
las secciones HTML permanecen disponibles como mejora progresiva; la interactividad
requiere el script compilado.

`src/client/login.html` y `src/client/scripts/login.ts` gestionan configuración e inicio
de sesión. Los campos del formulario ayudan a la validación, pero las reglas definitivas
se comprueban también en el servidor.

## 9. Seguridad y límites de operación

Medidas presentes en el código:

- El proceso escucha solo en `127.0.0.1`.
- Las API de negocio exigen sesión; la autenticación usa cookie `HttpOnly`,
  `SameSite=Strict` y `Cache-Control: no-store`.
- El servidor estático usa una lista explícita de páginas, directorios y extensiones
  públicas. No sirve `src/`, `data/`, `node_modules/`, configuración ni código del
  servidor.
- La resolución estática rechaza segmentos inseguros y comprueba la ruta real para
  impedir que enlaces simbólicos salgan de un montaje.
- Se configuran cabeceras como CSP, `X-Content-Type-Options`,
  `Referrer-Policy` y `Cross-Origin-Resource-Policy` para contenido estático.
- Los cuerpos tienen límites de tamaño y las API rechazan campos inesperados.
- Las entradas se validan en el servidor, independientemente de la validación HTML.
- Los errores de persistencia no se presentan como éxitos ni como datos vacíos.

Limitaciones que deben entenderse antes de ampliar el uso:

- No está diseñado para acceso por red ni incluye configuración TLS, proxy o despliegue
  de producción.
- Las sesiones están en memoria; no se comparten entre instancias ni sobreviven a un
  reinicio.
- La cola de serialización de escrituras opera dentro de una instancia de proceso. El
  almacenamiento JSON no proporciona transacciones, índices, migraciones ni
  coordinación multi-proceso como una base de datos.
- No hay roles, múltiples usuarios, recuperación de contraseña ni gestión de sesiones
  persistente.
- No existe calendario de festivos, cola de revisión manual, envío de correo ni flujo de
  revisiones de cotización.
- Las solicitudes no incluyen los datos técnicos de los servicios; se confirman durante
  la preparación de la cotización.
- El catálogo se consulta desde archivos JSON y se administra fuera de la aplicación.

## 10. Pruebas

Las pruebas usan el runner nativo `node:test` y comprueban las reglas sin añadir un
framework de pruebas. La suite se distribuye en:

- `tests/unit/`: autenticación, validación de solicitudes, reglas de catálogo,
  persistencia y cálculo de cotizaciones.
- `tests/integration/`: flujos HTTP de autenticación, catálogo, solicitudes y
  cotizaciones, incluyendo persistencia.
- `tests/staticRoutes.test.js`: páginas, recursos públicos, rutas internas bloqueadas,
  traversal y salida compilada del cliente.

Los escenarios cubren, entre otros: fechas y cantidades inválidas; límites inclusivos de
tarifas; períodos solapados; transiciones de estado; campos desconocidos; JSON local
corrupto; restricciones de autenticación; redondeo del IVA; recargo de fin de semana;
festivos y horarios que requieren revisión; emisión única; conservación del snapshot;
y exposición de archivos internos.

Al preparar esta guía, la suite existente pasó con **48 pruebas aprobadas**. Para
repetir la validación en otro entorno:

```text
npm run build
npm test
```

## 11. Guion breve de demostración

1. Ejecutar compilación y pruebas; iniciar con `npm start`.
2. Abrir `http://127.0.0.1:3000`; crear la cuenta local inicial.
3. Registrar una solicitud usando al menos correo o teléfono.
4. Revisarla: pedir información y volver a revisión, o aprobarla para cotizar.
5. Consultar el catálogo y una tarifa para una fecha determinada.
6. Preparar una cotización para la solicitud aprobada, completando evaluación técnica.
7. Calcular y observar el desglose; cambiar un dato y comprobar que se invalida la
   propuesta.
8. Emitir explícitamente y consultar el snapshot guardado.
9. Explicar que una solicitud ya cotizada deja de estar en la lista elegible y que una
   emisión duplicada se rechaza.

Para demostrar una tarifa reproducible en otra fecha, configurar
`MANTIA_QUOTE_REFERENCE_DATE` antes de iniciar el servidor. Usar una fecha cubierta por
las versiones tarifarias del catálogo de demostración y retirar esa variable al volver
al uso normal.

## 12. Próximos pasos razonables

Para evolucionar el prototipo sin mezclar responsabilidades:

1. Dividir `src/client/scripts/main.ts` por funcionalidad conservando el comportamiento
   y las pruebas de cada flujo.
2. Extraer utilidades HTTP compartidas cuando la repetición entre rutas justifique el
   módulo, sin diluir los errores y límites propios de cada API.
3. Añadir pruebas de navegador de extremo a extremo para formularios, navegación y
   emisión.
4. Diseñar persistencia transaccional antes de permitir concurrencia o varias
   instancias.
5. Diseñar explícitamente roles, auditoría, revisiones y cola de trabajo si el alcance
   del negocio los requiere.
6. Actualizar esta guía y los contratos de API junto con cada cambio funcional.

## 13. Archivos clave para revisión

- [`src/server/application.ts`](../src/server/application.ts): orden y protección de
  rutas.
- [`src/server/services/requestService.ts`](../src/server/services/requestService.ts):
  validación y transiciones de solicitudes.
- [`src/server/services/catalogService.ts`](../src/server/services/catalogService.ts):
  búsqueda de tarifas por fecha.
- [`src/server/services/quoteService.ts`](../src/server/services/quoteService.ts):
  cálculo, bloqueos, impuestos y emisión.
- [`src/server/routes/quoteRoutes.ts`](../src/server/routes/quoteRoutes.ts): contrato
  HTTP para propuestas y cotizaciones.
- [`src/server/repositories/quoteRepository.ts`](../src/server/repositories/quoteRepository.ts):
  validación y persistencia de snapshots emitidos.
- [`src/client/index.html`](../src/client/index.html) y
  [`src/client/scripts/main.ts`](../src/client/scripts/main.ts): interfaz y flujos del
  navegador.
- [`tests/`](../tests): cobertura automatizada del comportamiento.
