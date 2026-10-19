"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveStaticPath } = require("../dist/server/routes/staticRoutes");

test("sirve la página principal", () => {
  assert.ok(resolveStaticPath("/")?.endsWith("index.html"));
  assert.ok(resolveStaticPath("/index.html")?.endsWith("index.html"));
});

test("permite CSS y JavaScript compilado del cliente", () => {
  assert.ok(resolveStaticPath("/css/main.css")?.endsWith("main.css"));
  assert.ok(resolveStaticPath("/js/main.js")?.endsWith("main.js"));
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
