"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createRequestTestServer } = require("../../dist/server/routes/requestRoutes");

class MemoryRequestRepository {
  requests = [];
  async list() {
    return this.requests.map((request) => ({ ...request }));
  }
  async create(input) {
    const now = "2026-01-10T12:00:00.000Z";
    const request = {
      ...input,
      id: `test-${this.requests.length + 1}`,
      status: "pending_review",
      reviewNotes: "",
      createdAt: now,
      updatedAt: now,
    };
    this.requests.push(request);
    return { ...request };
  }
  async updateReview(id, review) {
    const request = this.requests.find((item) => item.id === id);
    if (!request) return null;
    Object.assign(request, { status: review.status, reviewNotes: review.notes, updatedAt: "2026-01-10T13:00:00.000Z" });
    return { ...request };
  }
}

test("API registra, lista y revisa solicitudes con respuestas HTTP claras", async (context) => {
  const server = createRequestTestServer(new MemoryRequestRepository());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/requests`;
  const input = {
    customerName: "Cliente Prueba",
    contactEmail: "prueba@example.com",
    contactPhone: "",
    serviceDescription: "Inspección de equipo",
    serviceAddress: "Carrera 1 # 2-3",
    preferredDate: null,
  };

  const invalidResponse = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, contactEmail: "", contactPhone: "" }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.match((await invalidResponse.json()).error, /medio de contacto/);

  const createdResponse = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.status, "pending_review");

  const listResponse = await fetch(baseUrl);
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).length, 1);

  const missingResponse = await fetch(`${baseUrl}/missing/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(missingResponse.status, 404);

  const reviewResponse = await fetch(`${baseUrl}/${created.id}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved", notes: "Datos completos." }),
  });
  assert.equal(reviewResponse.status, 200);
  assert.equal((await reviewResponse.json()).status, "approved");

  const invalidTransition = await fetch(`${baseUrl}/${created.id}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "rejected", notes: "Ya fue aprobada." }),
  });
  assert.equal(invalidTransition.status, 409);
});

test("API rechaza tipo de contenido incorrecto y cuerpos JSON malformados", async (context) => {
  const server = createRequestTestServer(new MemoryRequestRepository());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/api/requests`;
  const wrongType = await fetch(endpoint, { method: "POST", body: "{}" });
  assert.equal(wrongType.status, 400);
  const malformed = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
});
