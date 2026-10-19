"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { SESSION_DURATION_SECONDS } = require("../../dist/server/config");
const { AuthService } = require("../../dist/server/services/authService");

async function createAuth(context) {
  const directory = await mkdtemp(join(tmpdir(), "mantia-auth-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "user.json");
  const auth = new AuthService(filePath);
  await auth.initialize();
  return { auth, filePath };
}

test("crea una cuenta una sola vez y guarda hash, no la contraseña", async (context) => {
  const { auth, filePath } = await createAuth(context);
  assert.equal(auth.isConfigured(), false);
  assert.ok(await auth.createAccount("mantia.user", "clave-local-segura"));
  assert.equal(auth.isConfigured(), true);
  assert.equal(await auth.createAccount("otro", "otra-clave-segura"), null);
  const stored = await readFile(filePath, "utf8");
  assert.doesNotMatch(stored, /clave-local-segura/);
  assert.match(stored, /"passwordHash"/);
  assert.match(stored, /"salt"/);
});

test("autentica usuario persistido y mantiene vencimiento y cierre de sesión", async (context) => {
  const { auth, filePath } = await createAuth(context);
  let now = 1000;
  const timedAuth = new AuthService(filePath, () => now);
  await timedAuth.initialize();
  await timedAuth.createAccount("operador", "clave-local-segura");

  const token = await timedAuth.authenticate("OPERADOR", "clave-local-segura");
  assert.ok(token);
  assert.equal(await timedAuth.authenticate("operador", "incorrecta"), null);
  const request = { headers: { cookie: `mantia_session=${token}` } };
  assert.equal(timedAuth.isAuthenticated(request), true);
  now += SESSION_DURATION_SECONDS * 1000;
  assert.equal(timedAuth.isAuthenticated(request), false);

  const anotherToken = await timedAuth.authenticate("operador", "clave-local-segura");
  assert.ok(anotherToken);
  const anotherRequest = { headers: { cookie: `mantia_session=${anotherToken}` } };
  timedAuth.logout(anotherRequest);
  assert.equal(timedAuth.isAuthenticated(anotherRequest), false);
});

test("una nueva instancia puede autenticar con la cuenta guardada", async (context) => {
  const { auth, filePath } = await createAuth(context);
  await auth.createAccount("administrador", "clave-local-segura");
  const restartedAuth = new AuthService(filePath);
  await restartedAuth.initialize();
  assert.equal(restartedAuth.isConfigured(), true);
  assert.ok(await restartedAuth.authenticate("administrador", "clave-local-segura"));
  assert.equal(restartedAuth.isAuthenticated({ headers: {} }), false);
});

test("valida nombre y longitud de contraseña al crear cuenta", async (context) => {
  const { auth } = await createAuth(context);
  await assert.rejects(auth.createAccount("ab", "clave-local-segura"), /entre 3 y 40 caracteres/);
  await assert.rejects(auth.createAccount("usuario", "corta"), /entre 8 y 128/);
  assert.equal(auth.isConfigured(), false);
});
