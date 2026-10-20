"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolveStaticPath } = require("../dist/server/routes/staticRoutes");

test("sirve la página principal", () => {
  assert.ok(resolveStaticPath("/")?.endsWith("index.html"));
  assert.ok(resolveStaticPath("/index.html")?.endsWith("index.html"));
  assert.ok(resolveStaticPath("/login")?.endsWith("login.html"));
  assert.ok(resolveStaticPath("/login.html")?.endsWith("login.html"));
  assert.ok(resolveStaticPath("/setup")?.endsWith("login.html"));
  assert.ok(resolveStaticPath("/setup.html")?.endsWith("login.html"));
});

test("la página principal integra la navegación y vista del catálogo", () => {
  const html = readFileSync(resolveStaticPath("/"), "utf8");
  assert.match(html, /data-nav="catalogo"/);
  assert.match(html, /data-view="catalogo"/);
  assert.match(html, /catalog-query-form/);
});

test("el panel incluye contadores para estados persistidos y enlaces a sus módulos", () => {
  const html = readFileSync(resolveStaticPath("/"), "utf8");
  assert.match(html, /id="dashboard-pending-review"/);
  assert.match(html, /id="dashboard-needs-information"/);
  assert.match(html, /id="dashboard-approved"/);
  assert.match(html, /id="dashboard-rejected"/);
  assert.match(html, /id="dashboard-issued-quotes"/);
  assert.match(html, /id="dashboard-message"/);
});

test("la vista de cotizaciones integra preparación, cálculo y emisión explícita", () => {
  const html = readFileSync(resolveStaticPath("/"), "utf8");
  assert.match(html, /data-nav="cotizaciones"/);
  assert.match(html, /id="quote-form"/);
  assert.match(html, /id="quote-calculate"/);
  assert.match(html, /id="quote-issue"/);
  assert.match(html, /id="issued-quotes-list"/);
});

test("permite CSS y JavaScript compilado del cliente", () => {
  assert.ok(resolveStaticPath("/css/main.css")?.endsWith("main.css"));
  assert.ok(resolveStaticPath("/js/main.js")?.endsWith("main.js"));
});

test("compila el script del navegador sin envoltorio CommonJS", () => {
  const script = readFileSync(resolveStaticPath("/js/main.js"), "utf8");
  assert.doesNotMatch(script, /Object\.defineProperty\(exports/);
  assert.doesNotMatch(script, /\bexports\./);
  assert.match(script, /addEventListener\("hashchange"/);
  assert.match(script, /getElementById\("request-form"\)/);
  assert.match(script, /requestApi\("\/api\/requests"\)/);
  assert.match(script, /requestApi\("\/api\/quotes"\)/);
  assert.match(script, /counts\[request\.status\] \+= 1/);
});

test("bloquea carpetas y archivos internos", () => {
  const blocked = [
    "/src/client/index.html",
    "/src/server/server.ts",
    "/data/solicitudes.json",
    "/node_modules/typescript/package.json",
    "/dist/server/server.js",
    "/package.json",
    "/tsconfig.json",
    "/.env",
    "/.git/config",
  ];
  for (const route of blocked) {
    assert.equal(resolveStaticPath(route), null, route);
  }
});

test("bloquea path traversal y rutas malformadas", () => {
  const blocked = [
    "/css/../package.json",
    "/css/../../package.json",
    "/js/../server/server.js",
    "/css/..",
    "/css/",
    "/css//main.css",
    "/css/.hidden.css",
    "/css/main.css\0.png",
    "/css/a\\..\\package.json",
    "/css/%2e%2e/package.json",
  ];
  for (const route of blocked) {
    assert.equal(resolveStaticPath(route), null, route);
  }
});

test("rechaza extensiones no públicas", () => {
  assert.equal(resolveStaticPath("/js/main.js.map"), null);
  assert.equal(resolveStaticPath("/js/main.d.ts"), null);
  assert.equal(resolveStaticPath("/assets/datos.json"), null);
  assert.equal(resolveStaticPath("/css/sin-extension"), null);
});
