"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { AuthService } = require("../../dist/server/services/authService");
const { handleAuthRoutes } = require("../../dist/server/routes/authRoutes");

test("crea usuario, inicia sesión y cierra sesión mediante la API", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-auth-api-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const auth = new AuthService(join(directory, "user.json"));
  await auth.initialize();
  const server = createServer((req, res) => {
    handleAuthRoutes(req, res, auth).catch((error) => {
      res.writeHead(500);
      res.end(error.message);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/auth`;

  const unconfigured = await fetch(`${baseUrl}/session`);
  assert.deepEqual(await unconfigured.json(), { configured: false, authenticated: false });

  const shortPassword = await fetch(`${baseUrl}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "operador",
      password: "corta",
      confirmPassword: "corta",
    }),
  });
  assert.equal(shortPassword.status, 400);

  const mismatch = await fetch(`${baseUrl}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "operador",
      password: "clave-local-segura",
      confirmPassword: "no-coincide",
    }),
  });
  assert.equal(mismatch.status, 400);

  const setup = await fetch(`${baseUrl}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "operador",
      password: "clave-local-segura",
      confirmPassword: "clave-local-segura",
    }),
  });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const sessionCookie = cookie.split(";")[0];

  const duplicateSetup = await fetch(`${baseUrl}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "otro",
      password: "clave-local-segura",
      confirmPassword: "clave-local-segura",
    }),
  });
  assert.equal(duplicateSetup.status, 409);

  const authenticated = await fetch(`${baseUrl}/session`, {
    headers: { Cookie: sessionCookie },
  });
  assert.deepEqual(await authenticated.json(), { configured: true, authenticated: true });

  const logout = await fetch(`${baseUrl}/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  const loggedOut = await fetch(`${baseUrl}/session`, {
    headers: { Cookie: sessionCookie },
  });
  assert.deepEqual(await loggedOut.json(), { configured: true, authenticated: false });

  const login = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "OPERADOR", password: "clave-local-segura" }),
  });
  assert.equal(login.status, 200);
});
