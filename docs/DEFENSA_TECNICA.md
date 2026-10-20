# Mantia

## Defensa técnica de la prueba técnica

**Responsable:** No identificado en las fuentes disponibles  
**Fecha de elaboración:** 20 de octubre de 2026  
**Estado:** Borrador técnico para revisión; no sustituye la validación contra el
enunciado y los documentos empresariales originales.

> Esta defensa distingue entre evidencia directa, comportamiento implementado,
> cobertura realmente ejecutada y aspectos que no pueden confirmarse. El enunciado
> original y los documentos de negocio citados en la planificación no estaban
> disponibles como archivos individuales durante esta revisión.

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Contexto y problema](#2-contexto-y-problema)
3. [Requisitos y alcance](#3-requisitos-y-alcance)
4. [Arquitectura y organización](#4-arquitectura-y-organización)
5. [Decisiones técnicas y alternativas](#5-decisiones-técnicas-y-alternativas)
6. [Reglas de negocio y trazabilidad](#6-reglas-de-negocio-y-trazabilidad)
7. [Pruebas y verificaciones](#7-pruebas-y-verificaciones)
8. [Uso de inteligencia artificial](#8-uso-de-inteligencia-artificial)
9. [Limitaciones y riesgos](#9-limitaciones-y-riesgos)
10. [Trabajo futuro priorizado](#10-trabajo-futuro-priorizado)
11. [Conclusiones](#11-conclusiones)
12. [Referencias y anexos](#12-referencias-y-anexos)

## Convención de evidencia

| Etiqueta | Significado |
| --- | --- |
| **Verificado** | Observado directamente en un archivo o confirmado por una prueba/comando ejecutado. |
| **Implementado, no verificado** | El comportamiento se aprecia en el código, pero no se ejecutó una verificación específica. |
| **Parcial** | Existe parte del flujo, con restricciones o cobertura incompleta. |
| **Pendiente** | No existe implementación o falta información para decidirla. |
| **Interpretación** | Decisión de implementación cuyo carácter de requisito formal no pudo confirmarse. |
| **No disponible** | No se tuvo acceso a la evidencia necesaria. |

La etiqueta **Verificado** se refiere únicamente a la evidencia descrita, no a una
certificación general del sistema ni a la confirmación de requisitos del cliente.

## 1. Resumen ejecutivo

Mantia es una aplicación web local para registrar y revisar solicitudes de servicio,
consultar un catálogo con versiones tarifarias y preparar y emitir cotizaciones
relacionadas con solicitudes aprobadas. La aplicación usa Node.js con HTTP nativo,
TypeScript, HTML/CSS y persistencia local JSON. No depende de un framework de servidor,
un framework de interfaz ni una base de datos.

La implementación tiene una separación reconocible entre adaptadores HTTP
(`routes`), reglas de negocio (`services`), persistencia (`repositories`) y modelos del
dominio (`shared/models`). El navegador presenta módulos para panel, solicitudes,
revisión, catálogo y cotizaciones. La sección Historial es una vista informativa sin
funcionalidad de consulta histórica.

En la revisión del 20 de octubre de 2026 se ejecutaron `npm run build` y `npm test` con
Node.js v24.21.0 y npm v11.19.0: la compilación terminó correctamente y pasaron las
48 pruebas existentes (48 aprobadas, 0 fallidas). Estas pruebas validan varios flujos
principales, pero no sustituyen la comparación con el enunciado original.

**Estado de alcance:** está implementado el flujo local básico de autenticación,
solicitudes, consulta tarifaria y cotización; están ausentes la importación de
documentación original, el tratamiento específico de Horizonte, la gestión de
ascensores/elevadores, la carga de históricos de Excel, el calendario automático de
festivos y la cola de revisión manual.

## 2. Contexto y problema

### 2.1 Evidencia de contexto

El [README](../README.md) describe la aplicación como un prototipo local de gestión de
solicitudes y cotizaciones. El código actual incluye formularios de solicitud, revisión,
consulta de tarifas y cálculo/emisión de cotizaciones. La información tarifaria está
representada en JSON.

La planificación recibida menciona un enunciado PDF, documentos de contexto, solicitudes
de clientes en TXT/PDF, tarifas y un historial de cotizaciones en XLSX. Esos nombres
son una lista de documentos esperados, no prueba de que se hayan incorporado a la
implementación.

### 2.2 Disponibilidad de fuentes originales

**Verificado:** en la raíz existe `Mantia.rar`. Se inspeccionó su listado mediante
UnRAR 7.13. El archivo enumera una versión anterior de la estructura y código del
proyecto, pero no contiene archivos con extensión PDF, XLSX ni los archivos de negocio
TXT mencionados en la planificación. La raíz y `docs/` tampoco contienen esos
documentos como archivos individuales.

**No disponible:** no se contó con `00_Prueba_Tecnica.pdf`,
`01_Contexto_Empresa.pdf`, `LEEME.txt`, las solicitudes de Arboleda, Mirador, Horizonte
y Arrayanes, ni `02_Historial_Cotizaciones.xlsx` como fuentes examinables. En
consecuencia, no es posible afirmar qué requisitos exactos establecía el enunciado, qué
datos contenían los casos ni si las tarifas o los cálculos reproducen fielmente los
originales.

### 2.3 Problema que puede describirse con seguridad

Con base en el README y el código, la aplicación permite gestionar un flujo local que
va desde el registro de una solicitud hasta la preparación y emisión explícita de una
cotización. Es razonable describir que este flujo combina datos de solicitudes,
información técnica y tarifas vigentes; no se atribuyen al enunciado empresarial
necesidades más específicas porque el PDF fuente no está disponible.

La propuesta de conservar documentos originales y registrar una interpretación
estructurada revisable por una persona aparece en la planificación recibida. **No se
encontró una implementación de carga o archivo de documentos originales, ni una
relación entre un documento fuente y los campos de una solicitud.** La aplicación
actual recibe los datos mediante formulario web. No se observó uso de IA o parsers
automáticos durante la ejecución.

## 3. Requisitos y alcance

La tabla registra capacidades observables. Sin el enunciado oficial, “implementado”
describe el estado del código, no una afirmación de cumplimiento contractual.

### 3.1 Funcionalidad observable

| Área | Capacidad observada | Evidencia | Estado |
| --- | --- | --- | --- |
| Cuenta local | Configurar una cuenta inicial, autenticar y cerrar sesión. | `authService.ts`, `authRoutes.ts`, pruebas unitarias/de integración. | **Verificado** mediante build y suite. |
| Solicitudes | Crear, listar y validar solicitudes; exigir medio de contacto. | `requestService.ts`, `requestRoutes.ts`, pruebas `requestService` y `requestRoutes`. | **Verificado** mediante build y suite. |
| Revisión | Permitir transiciones de estado limitadas y exigir nota para solicitar información o rechazar. | `TRANSITIONS` y validaciones en `requestService.ts`; pruebas unitarias. | **Verificado** mediante build y suite. |
| Catálogo | Leer servicios/versiones desde JSON y buscar una tarifa por código y fecha inclusiva. | `catalogRepository.ts`, `catalogService.ts`; pruebas de repositorio, servicio y API. | **Verificado** mediante build y suite. |
| Propuesta | Validar datos técnicos y reglas de fecha/horario; calcular líneas, recargo, desplazamiento, IVA y total. | `quoteService.ts`; pruebas unitarias de cotización. | **Verificado** para los casos existentes, no como cobertura exhaustiva. |
| Emisión | Recalcular en el servidor y guardar como snapshot; impedir emisión duplicada por solicitud. | `quoteRoutes.ts`, `quoteService.ts`, `quoteRepository.ts`; pruebas de API y persistencia. | **Verificado** mediante build y suite. |
| Interfaz | Navegación y pantallas para panel, solicitudes, revisión, catálogo y cotizaciones. | `src/client/index.html`, `main.ts`; pruebas estáticas verifican contratos seleccionados. | **Parcial**: pruebas estáticas, sin pruebas de navegador de extremo a extremo. |
| Historial | Presentar una vista con mensaje de funcionalidad futura. | Sección `data-view="historial"` de `index.html`. | **Pendiente** como función de consulta; la pantalla es solo placeholder. |
| Documentos originales | Cargar documentos, conservarlos y relacionarlos con interpretación estructurada. | No se localizaron modelos, rutas o pruebas de esta funcionalidad. | **Pendiente**. |
| Historial XLSX | Importar o consultar seis cotizaciones históricas descritas en planificación. | No se encontró archivo XLSX ni importador. | **No disponible / pendiente**. |
| Horizonte | Aplicar un bloqueo o correspondencia de servicio específico para ese cliente/caso. | No hay menciones a Horizonte en el código fuente ni en las pruebas inspeccionadas. | **No disponible**. |
| Ascensores/elevadores | Modelar servicios de ascensor y probar su comportamiento específico. | No se encontraron menciones a ascensor/elevador ni servicios asociados en código o pruebas. | **No disponible**. |

### 3.2 Requisitos no funcionales y restricciones técnicas observables

| Tema | Observación | Evidencia / estado |
| --- | --- | --- |
| Tipado | TypeScript con opciones estrictas y chequeos de símbolos/parámetros sin uso. | `tsconfig.json`; compilación ejecutada correctamente (**Verificado**). |
| Simplicidad de dependencias | No se usa framework web ni bundler; el servidor usa HTTP nativo. | `package.json`, `server.ts`, configuraciones TS (**Verificado**). |
| Interfaz | HTML, CSS y TypeScript del navegador. | Archivos en `src/client/` y `public/css/` (**Verificado**). |
| Ejecución local | Binding a `127.0.0.1`, puerto 3000 por defecto y variable `PORT`. | `server.ts` (**Verificado por inspección de código**). |
| Persistencia | Archivos JSON locales, no una base relacional. | Repositorios y rutas configuradas (**Verificado por inspección**). |
| Seguridad estática | Lista blanca de montajes/extensiones, comprobación de ruta, cabeceras de seguridad. | `staticRoutes.ts`; pruebas de traversal y archivos internos (**Verificado** para casos incluidos). |
| Acceso de varios equipos/procesos | No es el objetivo declarado por el README; persistencia JSON y sesión en memoria. | **Fuera del alcance operativo actual**. |

### 3.3 Funcionalidades parciales o fuera del alcance

- Las solicitudes se introducen en un formulario; no se ingieren documentos originales.
- La revisión manual del motor de cotizaciones se devuelve como resultado bloqueado,
  pero no se almacena en una cola ni cambia el estado de la solicitud.
- El dato técnico se confirma durante la preparación de la cotización. No se adjunta
  evidencia técnica ni existe una regla específica para Horizonte.
- Las revisiones de cotizaciones están anticipadas por un identificador en el modelo,
  pero no hay flujo para crear revisiones.
- El historial no se implementa como módulo de actividad ni como importación del Excel.
- No hay calendario automático de festivos, correo, roles, usuarios múltiples o
  despliegue remoto preparado.

## 4. Arquitectura y organización

### 4.1 Estructura

```text
src/
  client/                 HTML y scripts TypeScript del navegador
  server/
    application.ts        Enrutamiento general, sesión y errores no controlados
    config.ts             Configuración y rutas locales
    server.ts             Arranque HTTP
    routes/               Adaptación de API a HTTP
    services/             Validación y reglas de negocio
    repositories/         Acceso y validación de JSON
  shared/models/          Contratos del dominio del servidor
data/
  auth/                   Datos de cuenta local
  catalog/                Catálogo y versiones tarifarias
  requests/               Solicitudes persistidas
  quotes/                 Cotizaciones emitidas
public/
  css/                    Hoja de estilos pública
tests/
  unit/                   Pruebas de servicios/repositorios
  integration/            Pruebas de API/persistencia
  staticRoutes.test.js    Pruebas de rutas y contenido estático
docs/
  guia-tecnica.md         Guía de uso/arquitectura existente
  DEFENSA_TECNICA.md      Este documento
```

### 4.2 Flujo de solicitud HTTP

```text
Navegador
   │ HTTP / JSON / cookie de sesión
   ▼
server.ts ──► application.ts
                  ├── autentica y redirige
                  ├── routes/authRoutes.ts
                  ├── routes/requestRoutes.ts ──► RequestService
                  ├── routes/catalogRoutes.ts ──► CatalogService
                  ├── routes/quoteRoutes.ts ─────► QuoteService
                  └── routes/staticRoutes.ts
                                      │
                         servicios/repositorios
                                      │
                               archivos JSON
```

Las solicitudes de `/api/auth/` se enrutan antes del requisito de sesión. Las API de
solicitudes, catálogo y cotizaciones pasan por la comprobación de autenticación de
`application.ts`. Las páginas y recursos estáticos se resuelven mediante montajes
permitidos; el servidor no expone el árbol completo del proyecto.

### 4.3 Validación y errores

- Los datos de entrada de negocio se tratan inicialmente como `unknown` y se validan en
  el servidor. La validación de HTML del cliente es complementaria, no sustitutiva.
- Los campos JSON no permitidos se rechazan en APIs que reciben objetos de negocio.
- Los cuerpos de solicitudes y cotizaciones se limitan a 32 KiB; autenticación se
  limita a 8 KiB.
- Los errores de validación, inexistencia y conflicto se traducen a respuestas HTTP
  diferenciadas. Errores inesperados llegan al manejador general, que registra el
  fallo y responde 500 o destruye una respuesta que ya inició.
- Los repositorios reportan JSON corrupto o estructura inválida; no convierten esos
  errores silenciosamente en colecciones vacías.

### 4.4 Persistencia

El catálogo se lee desde `data/catalog/services.json` y
`data/catalog/tariff-versions.json`. Solicitudes, cotizaciones y usuario se almacenan
como JSON. Las escrituras de usuario/solicitudes/cotizaciones usan archivos temporales
y renombrado, y serializan operaciones dentro del proceso.

Esto reduce el riesgo de escrituras parciales en una sola instancia, pero no proporciona
transacciones o coordinación entre varios procesos. Tampoco hay esquema/versionado de
migraciones. Los archivos `data/` están presentes en el repositorio local; antes de
entregarlo a terceros se debe revisar y sanitizar cualquier cuenta, solicitud o
cotización que contenga datos personales o confidenciales.

### 4.5 Catálogo en tiempo de ejecución

`CatalogService.getCatalog()` llama a `repository.load()`, y
`findTariffOnDate()` vuelve a cargar el repositorio para cada consulta. El repositorio
lee los JSON desde disco en cada `load()`. Por tanto, **el código no congela
explícitamente el catálogo en memoria**.

Esta conclusión se deriva del código; no existe una prueba que modifique los archivos
durante la vida del proceso y confirme el comportamiento. Además, el cálculo de una
cotización obtiene el catálogo y realiza búsquedas tarifarias por separado, que vuelven
a cargar archivos. Si se editan los JSON durante un cálculo, lecturas consecutivas
podrían observar versiones diferentes. Para una política de catálogo consistente se
debe decidir entre snapshot al inicio del cálculo, recarga controlada o caché con
invalidación y probar esa política.

## 5. Decisiones técnicas y alternativas

No se encontró un ADR (registro formal de decisiones). La columna “Motivo” separa la
razón que puede inferirse de la estructura de una decisión documentada: no se afirma que
las alternativas se hayan evaluado formalmente.

| Problema | Elección observable | Alternativas posibles, no consta evaluación formal | Ventajas | Costos/riesgos | Evidencia |
| --- | --- | --- | --- | --- | --- |
| Tipado en servidor y cliente | TypeScript estricto. | JavaScript; otro lenguaje tipado. | Detecta incompatibilidades en compilación y permite modelos expresivos. | Los tipos no validan JSON en runtime; el cliente duplica tipos del contrato. | `tsconfig*.json`, build exitoso. |
| Servir API y estáticos | HTTP nativo de Node.js. | Framework como Express/Fastify. | Pocas dependencias y control explícito del flujo. | Enrutamiento, parsers y middleware deben mantenerse manualmente. | `server.ts`, `application.ts`, `routes/`. |
| Ejecutar el cliente sin bundler | Dos configuraciones TypeScript; script clásico. | Vite u otro bundler; módulos ESM directos. | Menos infraestructura de construcción. | `main.ts` concentra gran parte del cliente y no comparte módulos con imports. | `package.json`, `tsconfig.client.json`, prueba de salida clásica. |
| Persistencia del prototipo | Archivos JSON. | SQLite u otra base de datos. | Fácil de revisar y operar en una instancia local. | Concurrencia multi-proceso, consultas, migraciones y transacciones limitadas. | Repositorios JSON y pruebas de persistencia. |
| Modularidad del servidor | Separar rutas, servicios, repositorios y modelos. | Un único módulo; capas adicionales. | Responsabilidades localizables y pruebas de servicio/repositorio. | Hay lógica HTTP repetida entre rutas y parte de wiring vive en rutas. | Estructura real y pruebas unitarias/integración. |
| Entrada de la cotización | Validar y recalcular en servidor al emitir. | Confiar en totales enviados por cliente. | El navegador no es fuente autoritativa de precios/IVA/totales. | Sigue dependiendo de la veracidad humana de la evaluación técnica declarada. | `quoteRoutes.ts`, pruebas de manipulación de campos. |
| Salida de cotización | Persistir snapshot de los valores emitidos. | Recalcular documentos históricos contra tarifas actuales. | Conserva descripción, importes y versión usados en esa emisión. | No equivale a importar/normalizar un historial empresarial existente. | `quoteRepository.ts`, `quotePersistence.test.js`. |

### 5.1 Dependencias

`package.json` declara `typescript` y `@types/node` como dependencias de desarrollo.
Las pruebas usan el runner de Node.js (`node:test`). No se observan dependencias de
producción ni framework de interfaz. La compilación actual se completó sin instalar ni
modificar dependencias.

### 5.2 Estrategia de validación

Se validan datos tanto en límites HTTP como en servicios y repositorios. Esto es útil
porque las reglas de dominio se invocan también desde pruebas sin HTTP y porque el
archivo JSON puede ser modificado por fuera de la API. No se usa un esquema runtime
compartido de terceros; los guardas de tipo y validaciones son funciones explícitas del
proyecto.

**Riesgo residual:** los tipos de TypeScript del navegador y los modelos del servidor
no se comparten como imports; el navegador convierte respuestas JSON mediante
aserciones de tipo. Una evolución de API requiere sincronizar manualmente ambos lados.

## 6. Reglas de negocio y trazabilidad

### 6.1 Solicitudes

El servicio valida nombre, contacto, descripción, dirección y fecha opcional. Se requiere
correo o teléfono. La fecha debe ser real en formato `AAAA-MM-DD`. El servicio normaliza
textos y limita longitudes. Las transiciones válidas están explicitadas en
`TRANSITIONS`; aprobar y rechazar son terminales en el flujo actual.

Estas reglas están **implementadas y cubiertas por pruebas existentes**. Su condición de
requisitos del cliente no puede verificarse sin el enunciado original.

### 6.2 Catálogo y tarifas

Los archivos actuales definen siete códigos: cinco servicios (`AA-01`, `AA-02`,
`PI-01`, `PL-01`, `EL-01`) y dos códigos de desplazamiento (`DES-BOG`, `DES-CHI`).
Hay dos versiones en los datos revisados: `2026-01` y `2026-10`, con rangos inclusivos.
El repositorio valida referencias, duplicados, importes y fechas; el servicio devuelve
`no_applicable_tariff` si no encuentra una tarifa aplicable.

El catálogo no contiene un servicio identificado como ascensor o elevador. No se puede
confirmar si los servicios listados corresponden exactamente a los documentos fuente,
porque esos documentos no estaban disponibles.

### 6.3 Cotización, importes e IVA

El motor requiere una solicitud relacionada, ciudad Bogotá/Chía, fecha y hora, duración,
urgencia, indicador explícito de festivo y líneas con cantidades/evaluación técnica.
Rechaza campos ajenos y entradas inválidas. Agrega automáticamente una vez el
desplazamiento de la ciudad. Impide introducir desplazamiento como línea manual.

El importe de línea es cantidad por precio unitario. En fin de semana (sábado o domingo
según `getUTCDay()` sobre la fecha de visita), el código aplica 25 % a servicios
catalogados; excluye desplazamiento. `urgent` se conserva, pero no activa por sí solo
un recargo.

La función central `roundTaxToCop()` calcula 19 % sobre la base gravable total. La base
incluye importes de servicio, recargos y desplazamiento; el redondeo ocurre una sola
vez al peso, con mitades hacia arriba. La prueba unitaria de casos `71`, `50` y `29`
pesos comprueba resultados de IVA `13`, `10` y `6`, que cubren fracciones de `0,49`,
`0,50` y `0,51`, respectivamente.

### 6.4 Horarios

El código interpreta la fecha de visita como fecha UTC para encontrar día de semana:

- Entre semana, un inicio anterior a las 08:00 bloquea el cálculo.
- Entre semana, inicio a las 18:00 o después, o finalización después de las 18:00,
  bloquea el cálculo.
- Una visita que alcanza o cruza la medianoche se bloquea para revisión.
- Entre semana, festivo declarado bloquea para revisión.
- Sábado y domingo no tienen límites ordinarios de hora implementados; solo se evalúa
  el cruce de medianoche. No hay calendario automático de festivos.

La suite comprueba varios casos negativos (07:30, 17:30 con 60 minutos, inicio 18:00
y cruce de medianoche), pero no una matriz completa de límites. Por ejemplo, no se
identificó una prueba explícita de inicio exactamente 08:00, finalización exactamente
18:00, horario válido de fin de semana o todos los cruces posibles. Por tanto, la
validación horaria es **parcial**, no una validación general exhaustiva.

### 6.5 Fecha de emisión, referencia y visita

`QuoteService` obtiene `emissionDate` de `MANTIA_QUOTE_REFERENCE_DATE`, si se configura,
y en caso contrario de la fecha local del reloj del servidor. La fecha de visita se usa
para día/horario de la visita; la consulta de tarifa usa `emissionDate`.

La prueba `calcula Arboleda y Mirador con la fecha de emisión, no la de visita` fija
referencia de emisión al 13 de octubre de 2026, usa varias fechas de visita y verifica
una tarifa de la versión `2026-10`. También prueba una fecha de visita en enero mientras
la emisión sigue siendo octubre. Es evidencia útil de separación, aunque la verificación
está agrupada en un solo test, no en pruebas independientes para cada contrato/caso.

El 13/10/2026 es una fecha de fixture de prueba, no un valor fijo de producción. No se
puede asegurar que esa fecha fuera una regla oficial: la fuente de planificación la
presenta como fecha de referencia identificada.

### 6.6 Vigencia de cotización

La función de cálculo suma 14 días calendario a la fecha de emisión. Con emisión
13/10/2026, el vencimiento almacenado es 27/10/2026. La prueba describe la regla como
“quince días calendario contando emisión como día uno”.

**Interpretación pendiente de confirmación:** el código implementa un vencimiento a
emisión + 14 días, es decir, quince fechas si se cuenta el día inicial. La planificación
aclara que el conteo inclusivo es una interpretación de trabajo, no una aclaración
confirmada por el cliente. Debe validarse con el responsable del negocio antes de
presentarlo como requisito formal.

### 6.7 Horizonte

El brief solicita revisar un caso particular de Horizonte, evitar sugerir `AA-02`
automáticamente sin fundamento y bloquear una cotización si falta información esencial.

- La palabra “Horizonte” no aparece en código ni pruebas inspeccionadas.
- No se encontró modelo de cliente/caso que asocie Horizonte con un servicio.
- No existe selección automática de `AA-02`; las líneas las introduce el usuario.
- El motor sí requiere una evaluación técnica declarada como `complete` para cada
  línea y bloquea datos faltantes, incompletos o fuera del alcance.
- La evaluación es una declaración de quien prepara la entrada; no está respaldada por
  documentos adjuntos ni por una regla específica de cliente.

Conclusión: existe un bloqueo genérico ante información técnica insuficiente, pero el
caso Horizonte no está implementado ni verificado de forma específica. Sin sus
documentos fuente, no es posible determinar qué información esencial falta o qué
servicio correspondería.

### 6.8 Información histórica

Existe un repositorio de snapshots emitidos en `data/quotes/quotes.json`; una prueba de
persistencia verifica guardar, volver a leer y conservar precio/versión tarifaria.
Esto no demuestra la importación de seis cotizaciones históricas del supuesto Excel.
No se localizó ese Excel en el archivo RAR ni como archivo individual. La vista
Historial es un placeholder y no presenta actividad.

## 7. Pruebas y verificaciones

### 7.1 Ejecución realizada

**Verificado el 20 de octubre de 2026:**

| Comando | Resultado real |
| --- | --- |
| `node --version` | `v24.21.0` |
| `npm --version` | `11.19.0` |
| `npm run build` | Terminó con código 0: compilación de servidor y cliente completada. |
| `npm test` | 48 pruebas, 48 aprobadas, 0 fallidas, 0 omitidas. |

`npm test` ejecuta `node --test`. Las pruebas importan los archivos compilados bajo
`dist/`; para una instalación limpia se debe ejecutar primero `npm run build`.

### 7.2 Trazabilidad de verificaciones

| Área | Verificación | Evidencia | Resultado | Estado |
| --- | --- | --- | --- | --- |
| Compilación | Compilar servidor y cliente con TS. | `npm run build`; configuraciones `tsconfig.json` y `tsconfig.client.json`. | Éxito, código 0. | **Verificado** |
| Suite automatizada | Ejecutar toda la suite Node. | `npm test`; 48 tests del directorio `tests/`. | 48 aprobadas, 0 fallidas. | **Verificado** |
| Solicitud | Contacto obligatorio, fecha real/campos permitidos, estados y notas. | `tests/unit/requestService.test.js`, `tests/integration/requestRoutes.test.js`. | Casos presentes y suite pasó. | **Verificado** para escenarios cubiertos |
| Persistencia de solicitudes | Guardar y leer en otra instancia; reportar JSON corrupto. | `tests/unit/requestRepository.test.js`. | Casos presentes y suite pasó. | **Verificado** |
| Catálogo | Fecha, vigencia inclusiva, solapamientos, referencias/importes y servicio no encontrado. | `tests/unit/catalogRepository.test.js`, `tests/unit/catalogService.test.js`, `tests/integration/catalogRoutes.test.js`. | Casos presentes y suite pasó. | **Verificado** para escenarios cubiertos |
| Congelación/recarga de catálogo | Cambiar archivos durante la ejecución y observar política. | `CatalogService` delega en `repository.load()` en cada acceso; no hay test de mutación durante ejecución. | El código vuelve a leer; comportamiento de recarga no tiene test directo y el cálculo podría leer versiones diferentes. | **Implementado según código, no verificado en runtime** |
| IVA | Redondeo central para fracciones 0,49/0,50/0,51 de peso. | `roundTaxToCop()` y test en `tests/unit/quoteService.test.js`. | Base 71 → IVA 13; 50 → 10; 29 → 6. | **Verificado** |
| Emisión vs. visita | Tarifa para fecha de emisión pese a variar fecha de visita. | Test combinado “calcula Arboleda y Mirador con la fecha de emisión, no la de visita”. | Verifica emisión `2026-10-13`, precio de versión octubre y visita alternativa enero. | **Verificado**; conviene aislar casos en tests propios |
| Vencimiento | Emisión 13/10 → vencimiento 27/10. | Test de vigencia y `addCalendarDays()` en `quoteService.ts`. | +14 días; conteo inclusivo equivale a quince fechas. | **Verificado como implementación**, regla de negocio es **Interpretación** |
| Horario | Casos 07:30, 17:30+60, 18:00, festivo entre semana y cruce de medianoche. | Test `bloquea festivos, horarios no confirmados y visitas que cruzan medianoche`. | Casos incluidos pasan. | **Parcial**: faltan límites válidos, fin exacto 18:00 y matriz de fin de semana |
| Horizonte | Bloquear específicamente el caso y confirmar selección de servicio. | Búsqueda en `src/` y `tests/`; no se localizaron menciones. | No hay caso ni test identificable. | **No disponible** |
| Ascensores/elevadores | Servicios, validaciones y escenarios de ascensor. | Búsqueda de `ascensor`/`elevador` en código y pruebas; catálogo actual revisado. | Sin referencias/servicios encontrados. | **No disponible** |
| Persistencia de cotización | Snapshot exacto, duplicados, segunda emisión y JSON corrupto. | `tests/integration/quotePersistence.test.js`. | Casos presentes y suite pasó. | **Verificado** |
| API cotizaciones | Sesión, elegibilidad, solicitud aprobada, campos manipulados, cálculo/emisión/consulta. | `tests/integration/quoteRoutes.test.js`. | Flujo integrado cubierto; suite pasó. | **Verificado** para escenario de prueba |
| Seguridad estática | Rutas internas, traversal y extensiones no públicas. | `tests/staticRoutes.test.js`. | Casos presentes y suite pasó. | **Verificado** para rutas enumeradas |
| Interfaz real | Interacción navegador, accesibilidad y errores end-to-end. | Solo pruebas estáticas de HTML/script; no se ejecutó navegador automatizado. | No hay verificación E2E realizada en esta revisión. | **No verificado** |
| Archivos fuente empresariales | Presencia y contenido de PDFs/XLSX/TXT citados. | Listado RAR con UnRAR 7.13 y archivos del workspace. | El RAR inspeccionado no enumera esos documentos; no se encontraron como archivos individuales. | **No disponible** |

Las pruebas aportan evidencia reproducible sobre el comportamiento codificado; no
validan por sí solas la fidelidad del catálogo a documentos originales ni la
interpretación de reglas que no están confirmadas.

## 8. Uso de inteligencia artificial

El material recibido propone una distribución de trabajo entre ChatGPT, Claude y el
responsable del proyecto. Sin embargo, **no se contó con un historial verificable de
esas conversaciones o prompts**. La distribución descrita debe tratarse como una
declaración de planificación, no como registro auditado de quién implementó cada
función.

En la conversación de trabajo actualmente disponible se observan solicitudes de
limpieza, auditoría y documentación, y respuestas de este asistente Copilot; esto no
permite reconstruir las sesiones anteriores de ChatGPT o Claude ni identificar qué
cambios de código fueron producidos por cada herramienta. No se atribuyen propuestas
aceptadas, descartadas o modificadas a una IA específica sin evidencia.

La revisión de esta entrega contrastó documentación propuesta con el código y pruebas
actuales; se ejecutaron compilación y pruebas. Esto es una verificación técnica local,
no prueba de revisión humana de cada cambio histórico ni reemplaza la responsabilidad
del autor de defender decisiones.

Para una trazabilidad completa se recomienda adjuntar un registro cronológico que
incluya herramienta, fecha, prompt/resumen, archivos cambiados, revisión del responsable
y comandos de validación, omitiendo credenciales y datos de clientes.

## 9. Limitaciones y riesgos

| Limitación/riesgo | Impacto | Evidencia | Acción recomendada |
| --- | --- | --- | --- |
| No están disponibles los documentos originales de la prueba/empresa. | No se puede confirmar trazabilidad contractual, datos de casos ni exactitud histórica. | RAR listado sin PDF/XLSX/TXT citados; no están en el workspace. | Solicitar y comparar enunciado, contexto, solicitudes y tarifas originales antes de la entrega final. |
| Horizonte no está modelado específicamente. | No se demuestra el tratamiento exigido para ese caso ni la selección correcta de servicio. | Sin referencias/casos en código y tests. | Obtener el caso y definir criterios técnicos; incorporar test de regresión antes de presentar cobertura. |
| No hay ascensores/elevadores en catálogo ni pruebas. | No se acredita el tratamiento del requisito si forma parte del enunciado. | Catálogo actual tiene siete códigos y ninguno de ascensor; búsquedas sin coincidencias. | Confirmar si se exige ascensor y, solo con datos fuente, definir servicio, criterios y escenarios. |
| Horarios de fin de semana no tienen límites ordinarios. | La API puede calcular horarios de sábado/domingo que negocio quizás no permita. | En `quoteService.ts` restricciones ordinarias solo dentro de `!isWeekend`; la suite cubre pocos límites. | Acordar horarios de fin de semana y ampliar pruebas de fronteras y cruces. |
| No hay test de política de recarga/congelación del catálogo. | Puede haber cambios no detectados durante la vida del proceso o dentro de una cotización. | Se vuelve a leer JSON por `load()` y consultas; sin test de cambios en caliente. | Definir política y asegurar que cada cálculo utiliza un snapshot tarifario coherente. |
| Test de emisión/visita agrupa varios casos. | Es más difícil localizar qué contrato falla y mantener fixtures. | Un solo test agrupa Arboleda, Mirador y visita alternativa. | Separar pruebas de fecha tarifaria, fecha de visita y ejemplos de negocio; mantener casos mínimos. |
| Cantidad acepta cualquier número positivo finito. | Cantidades fraccionarias pueden producir importes con fracciones de COP. | Validación usa `Number.isFinite` y UI `step="any"`; el monto no se redondea por línea. | Confirmar precisión por unidad y regla de redondeo de líneas con negocio. |
| Evaluación técnica es una autodeclaración. | El servidor no verifica que el diagnóstico esté respaldado por evidencia. | Campo `technicalAssessment`; no hay adjuntos o flujo de aprobación técnica. | Acordar controles de revisión y evidencia requerida sin inferir automáticamente un servicio. |
| JSON/sesión local de una sola instancia. | No es adecuada para concurrencia entre procesos o despliegue multiusuario remoto. | Sesiones en memoria; escrituras JSON serializadas dentro del proceso. | Si cambia el despliegue, diseñar persistencia y gestión de sesión compatibles con concurrencia. |
| Datos locales podrían contener información sensible. | Compartir el repositorio sin limpiar podría revelar cuentas/datos personales. | Archivos de datos existen bajo `data/`; su contenido no se revisó para proteger privacidad. | Revisar, anonimizar o excluir datos reales y regenerar una cuenta demo antes de entregar. |
| Sin pruebas E2E de navegador ejecutadas. | Pruebas estáticas no cubren interacciones completas ni comportamiento visual. | Suite inspeccionada usa `node:test`; no se ejecutó navegador. | Añadir validación manual reproducible o E2E si la prueba lo permite. |
| Sin historial de conversaciones de IA verificable. | No se puede auditar la contribución individual de ChatGPT/Claude. | No hay transcripciones disponibles en las fuentes revisadas. | Aportar registro de IA con revisión/decisiones del responsable, si se exige. |

## 10. Trabajo futuro priorizado

### Crítico antes de afirmar cumplimiento de la prueba

1. Obtener el enunciado original y los documentos de empresa/casos/tarifas, y hacer una
   matriz de requisito → implementación → prueba.
2. Confirmar la regla de vigencia de 15 días y documentar su interpretación aprobada.
3. Revisar el caso Horizonte y cualquier caso de ascensor/elevador en las fuentes;
   crear reglas y pruebas solo si los requisitos originales las respaldan.
4. Revisar y sanitizar `data/auth/`, `data/requests/` y `data/quotes/` para preparar una
   copia entregable segura.
5. Confirmar horarios de fin de semana, límites de 08:00/18:00 y cruce de medianoche
   con quien define el negocio.

### Importante

1. Definir y probar la política de snapshot/recarga de catálogo para evitar mezclar
   versiones durante un cálculo.
2. Separar la prueba de emisión frente a fecha de visita y escribir casos explícitos
   para fecha de visita fuera de la vigencia de emisión.
3. Ampliar pruebas de fronteras horarias, datos técnicos, cantidades y persistencia.
4. Añadir pruebas E2E para login, solicitudes, catálogo y emisión, si las restricciones
   de la prueba lo permiten.
5. Corregir la deuda de longitud del script de cliente por funcionalidad, sin dividirlo
   arbitrariamente ni alterar UX.

### Mejoras opcionales

1. Registrar decisiones arquitectónicas y reglas de negocio confirmadas (ADR o
   documento de decisiones ligero).
2. Describir una guía de sanitización y restablecimiento de datos demo.
3. Implementar historial solo cuando se definan fuentes, eventos y retención.
4. Considerar base transaccional únicamente si se requiere concurrencia o más de una
   instancia; no es necesaria para aparentar sofisticación en el prototipo actual.

## 11. Conclusiones

La solución actual ofrece un flujo local funcional de cuenta única, solicitudes,
revisión, consulta de tarifas y cotizaciones con cálculo en servidor y snapshot
persistido. La estructura por rutas, servicios y repositorios facilita localizar
reglas y probarlas de forma aislada. El uso de HTTP nativo, TypeScript y archivos JSON
es coherente con un prototipo local de pocas dependencias, con límites claros si se
pretende convertirlo en servicio multiusuario o de producción.

La compilación y las 48 pruebas pasaron en el entorno revisado. Las pruebas cubren
redondeo del IVA, vigencias, tarifas faltantes, bloqueo de ciertos horarios,
separación emisión/visita, emisión única y errores de persistencia. No prueban el
cumplimiento frente al PDF original, la importación de históricos, el caso Horizonte,
servicios de ascensor, todos los límites horarios ni una política de catálogo
consistente bajo modificación concurrente.

Por falta de documentos fuente, la defensa permanece en **borrador**. Antes de
presentarla como cumplimiento definitivo, el responsable debe validar los requisitos
originales, confirmar interpretaciones comerciales y sanear los datos locales.

## 12. Referencias y anexos

### 12.1 Fuentes efectivamente revisadas

- [`README.md`](../README.md): descripción y alcance funcional actual.
- [`docs/guia-tecnica.md`](./guia-tecnica.md): guía técnica previamente elaborada.
- [`package.json`](../package.json), [`package-lock.json`](../package-lock.json),
  [`tsconfig.json`](../tsconfig.json) y
  [`tsconfig.client.json`](../tsconfig.client.json): scripts, dependencias y
  compilación.
- `src/server/`: servidor, configuración, API, servicios y repositorios.
- `src/shared/models/`: modelos del dominio.
- `src/client/`: HTML y scripts de navegador.
- `data/catalog/services.json` y `data/catalog/tariff-versions.json`: estructura y
  vigencias de catálogo.
- `tests/`: nombres y contenido de pruebas unitarias, integración y estáticas.
- `Mantia.rar`: listado de contenido mediante UnRAR 7.13; no se extrajeron archivos.
- Prompt de defensa pegado por el usuario: planificación y verificaciones solicitadas;
  no equivale al enunciado oficial de la prueba.

### 12.2 Fuentes no disponibles o no verificables

- Enunciado original `00_Prueba_Tecnica.pdf`.
- Contexto empresarial `01_Contexto_Empresa.pdf`.
- Instrucciones `LEEME.txt`.
- Solicitudes originales de Arboleda, Mirador, Horizonte y Arrayanes.
- Tarifas originales en sus documentos fuente (más allá del JSON actual).
- Historial `02_Historial_Cotizaciones.xlsx`.
- Historial completo de prompts/respuestas de ChatGPT y Claude.

El listado de `Mantia.rar` no mostró estos documentos. Esta afirmación se limita al
contenido listado del archivo y no implica que no existan en otra ubicación.

### 12.3 Referencias de código y pruebas

- Autenticación: [`authService.ts`](../src/server/services/authService.ts),
  [`authRoutes.ts`](../src/server/routes/authRoutes.ts),
  [`authService.test.js`](../tests/unit/authService.test.js) y
  [`authRoutes.test.js`](../tests/integration/authRoutes.test.js).
- Solicitudes: [`requestService.ts`](../src/server/services/requestService.ts),
  [`requestRepository.ts`](../src/server/repositories/requestRepository.ts),
  [`requestService.test.js`](../tests/unit/requestService.test.js) y
  [`requestRoutes.test.js`](../tests/integration/requestRoutes.test.js).
- Catálogo: [`catalogService.ts`](../src/server/services/catalogService.ts),
  [`catalogRepository.ts`](../src/server/repositories/catalogRepository.ts),
  [`catalogService.test.js`](../tests/unit/catalogService.test.js) y
  [`catalogRepository.test.js`](../tests/unit/catalogRepository.test.js).
- Cotizaciones: [`quoteService.ts`](../src/server/services/quoteService.ts),
  [`quoteRoutes.ts`](../src/server/routes/quoteRoutes.ts),
  [`quoteRepository.ts`](../src/server/repositories/quoteRepository.ts),
  [`quoteService.test.js`](../tests/unit/quoteService.test.js),
  [`quoteRoutes.test.js`](../tests/integration/quoteRoutes.test.js) y
  [`quotePersistence.test.js`](../tests/integration/quotePersistence.test.js).
- Rutas estáticas: [`staticRoutes.ts`](../src/server/routes/staticRoutes.ts) y
  [`staticRoutes.test.js`](../tests/staticRoutes.test.js).

### 12.4 Comandos de validación

Ejecutados en Windows, desde la raíz del repositorio:

```text
node --version        # v24.21.0
npm --version         # 11.19.0
npm run build         # éxito
npm test              # 48 aprobadas; 0 fallidas
```

### 12.5 Exportar a PDF

No se encontró `pandoc`, `wkhtmltopdf` ni `soffice` (CLI de LibreOffice) en el entorno
revisado, por lo que no se generó un PDF. Para crear uno desde Visual Studio Code:

1. Instalar la extensión **Markdown PDF** (publisher `yzane`) si está permitida en el
   entorno.
2. Abrir `docs/DEFENSA_TECNICA.md`.
3. Abrir la paleta de comandos con `Ctrl+Shift+P`.
4. Ejecutar **Markdown PDF: Export (pdf)**.
5. Revisar el PDF resultante: saltos de página, tabla de verificaciones y diagramas
   deben ser legibles antes de compartirlo.

La versión Markdown es la fuente editable y debe conservarse junto al PDF exportado.
