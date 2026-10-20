"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { handleApplicationRequestSafely } = require("../../dist/server/application");
const { AuthService } = require("../../dist/server/services/authService");

test("API del catálogo exige sesión y devuelve tarifas para límites y cambio de versión", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-catalog-api-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const auth = new AuthService(join(directory, "user.json"));
  await auth.initialize();
  const token = await auth.createAccount("catalogo", "clave-de-prueba-segura");
  assert.ok(token);

  const server = createServer((req, res) => {
    handleApplicationRequestSafely(req, res, auth);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const sessionCookie = `mantia_session=${token}`;

  for (const path of [
    "/api/catalog",
    "/api/catalog/tariffs?serviceCode=AA-01&date=2026-10-01",
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Inicie sesión/);
  }

  const catalogResponse = await fetch(`${baseUrl}/api/catalog`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.services.length, 7);
  assert.equal(catalog.tariffVersions.length, 2);

  const expectedBoundaryCases = [
    { date: "2026-01-01", versionId: "2026-01", amountCop: 90000 },
    { date: "2026-09-30", versionId: "2026-01", amountCop: 90000 },
    { date: "2026-10-01", versionId: "2026-10", amountCop: 95000 },
    { date: "2026-12-31", versionId: "2026-10", amountCop: 95000 },
  ];
  for (const expected of expectedBoundaryCases) {
    const response = await fetch(
      `${baseUrl}/api/catalog/tariffs?serviceCode=AA-01&date=${expected.date}`,
      { headers: { Cookie: sessionCookie } },
    );
    assert.equal(response.status, 200, expected.date);
    const result = await response.json();
    assert.equal(result.kind, "available", expected.date);
    assert.equal(result.versionId, expected.versionId, expected.date);
    assert.equal(result.tariff.amountCop, expected.amountCop, expected.date);
  }

  const unavailableResponse = await fetch(
    `${baseUrl}/api/catalog/tariffs?serviceCode=AA-01&date=2027-01-01`,
    { headers: { Cookie: sessionCookie } },
  );
  assert.equal(unavailableResponse.status, 200);
  const unavailable = await unavailableResponse.json();
  assert.equal(unavailable.kind, "no_applicable_tariff");
  assert.equal("amountCop" in unavailable, false);
  assert.match(unavailable.service.code, /AA-01/);

  const invalidDateResponse = await fetch(
    `${baseUrl}/api/catalog/tariffs?serviceCode=AA-01&date=2026-02-30`,
    { headers: { Cookie: sessionCookie } },
  );
  assert.equal(invalidDateResponse.status, 400);
  assert.match((await invalidDateResponse.json()).error, /fecha real/);

  const missingParams = await fetch(`${baseUrl}/api/catalog/tariffs?serviceCode=AA-01`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(missingParams.status, 400);

  const repeatedDate = await fetch(
    `${baseUrl}/api/catalog/tariffs?serviceCode=AA-01&date=2026-10-01&date=2026-12-31`,
    { headers: { Cookie: sessionCookie } },
  );
  assert.equal(repeatedDate.status, 400);

  const unknownService = await fetch(
    `${baseUrl}/api/catalog/tariffs?serviceCode=ZZ-99&date=2026-10-01`,
    { headers: { Cookie: sessionCookie } },
  );
  assert.equal(unknownService.status, 404);
});

test("API del catálogo no expone rutas para leer archivos", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-catalog-routes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const auth = new AuthService(join(directory, "user.json"));
  await auth.initialize();
  const token = await auth.createAccount("catalogo", "clave-de-prueba-segura");
  assert.ok(token);
  const server = createServer((req, res) => {
    handleApplicationRequestSafely(req, res, auth);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/catalog/files?path=data/auth/user.json`,
    { headers: { Cookie: `mantia_session=${token}` } },
  );
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /Ruta del catálogo no encontrada/);
});
