"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
  CATALOG_SERVICES_FILE,
  CATALOG_TARIFF_VERSIONS_FILE,
} = require("../../dist/server/config");
const { handleApplicationRequestSafely } = require("../../dist/server/application");
const { createQuoteHandler } = require("../../dist/server/routes/quoteRoutes");
const { JsonCatalogRepository } = require("../../dist/server/repositories/catalogRepository");
const { JsonQuoteRepository } = require("../../dist/server/repositories/quoteRepository");
const { AuthService } = require("../../dist/server/services/authService");
const { CatalogService } = require("../../dist/server/services/catalogService");
const { QuoteService } = require("../../dist/server/services/quoteService");

class MemoryRequestRepository {
  requests = [
    {
      id: "approved-request",
      customerName: "Cliente aprobado",
      contactEmail: "cliente@example.com",
      contactPhone: null,
      serviceDescription: "Mantenimiento de aire acondicionado",
      serviceAddress: "Bogotá",
      preferredDate: "2026-10-15",
      status: "approved",
      reviewNotes: "",
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:30:00.000Z",
    },
    {
      id: "concurrent-request",
      customerName: "Cliente concurrente",
      contactEmail: "concurrente@example.com",
      contactPhone: null,
      serviceDescription: "Mantenimiento de aire acondicionado",
      serviceAddress: "Bogotá",
      preferredDate: "2026-10-15",
      status: "approved",
      reviewNotes: "",
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:30:00.000Z",
    },
    {
      id: "pending-request",
      customerName: "Cliente pendiente",
      contactEmail: "pendiente@example.com",
      contactPhone: null,
      serviceDescription: "Servicio pendiente",
      serviceAddress: "Bogotá",
      preferredDate: null,
      status: "pending_review",
      reviewNotes: "",
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
    },
  ];

  async list() {
    return this.requests.map((request) => ({ ...request }));
  }
}

function quoteInput(overrides = {}) {
  return {
    requestId: "approved-request",
    city: "bogota",
    visitDate: "2026-10-15",
    startTime: "09:00",
    durationMinutes: 180,
    urgent: false,
    isHoliday: false,
    lines: [{
      serviceCode: "AA-01",
      quantity: 4,
      technicalAssessment: "complete",
    }],
    ...overrides,
  };
}

test("API protegida valida solicitud y entrada, calcula, emite una sola vez y permite consultar", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-quote-api-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const auth = new AuthService(join(directory, "user.json"));
  await auth.initialize();
  const token = await auth.createAccount("cotizaciones", "clave-de-prueba-segura");
  assert.ok(token);

  const requestRepository = new MemoryRequestRepository();
  const quoteRepository = new JsonQuoteRepository(join(directory, "quotes.json"));
  let quoteNumber = 0;
  const quoteService = new QuoteService(
    new CatalogService(new JsonCatalogRepository(CATALOG_SERVICES_FILE, CATALOG_TARIFF_VERSIONS_FILE)),
    quoteRepository,
    {
      referenceDate: "2026-10-13",
      now: () => new Date("2026-10-13T12:00:00.000Z"),
      createId: () => `quote-api-${++quoteNumber}`,
    },
  );
  const quoteHandler = createQuoteHandler({
    requests: requestRepository,
    quotes: quoteRepository,
    service: quoteService,
  });
  const server = createServer((req, res) => {
    handleApplicationRequestSafely(req, res, auth, quoteHandler);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { Cookie: `mantia_session=${token}` };

  for (const path of ["/api/quotes/eligible", "/api/quotes", "/api/quotes/issue"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401);
  }

  const eligibleResponse = await fetch(`${baseUrl}/api/quotes/eligible`, { headers });
  assert.equal(eligibleResponse.status, 200);
  const eligible = await eligibleResponse.json();
  assert.deepEqual(
    eligible.map((request) => request.id).sort(),
    ["approved-request", "concurrent-request"],
  );

  const pendingInput = quoteInput({ requestId: "pending-request" });
  const pendingResponse = await fetch(`${baseUrl}/api/quotes/calculate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(pendingInput),
  });
  assert.equal(pendingResponse.status, 409);

  const unexpectedFieldResponse = await fetch(`${baseUrl}/api/quotes/calculate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ...quoteInput(), totalCop: 1 }),
  });
  assert.equal(unexpectedFieldResponse.status, 400);
  assert.match((await unexpectedFieldResponse.json()).error, /campos no permitidos/);

  const manipulatedLineResponse = await fetch(`${baseUrl}/api/quotes/calculate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(quoteInput({
      lines: [{
        serviceCode: "AA-01",
        quantity: 4,
        technicalAssessment: "complete",
        unitPriceCop: 1,
      }],
    })),
  });
  assert.equal(manipulatedLineResponse.status, 400);

  const oversizedResponse = await fetch(`${baseUrl}/api/quotes/calculate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(quoteInput({
      lines: [{
        serviceCode: "AA-01",
        quantity: 4,
        technicalAssessment: "complete",
        technicalNotes: "x".repeat(33 * 1024),
      }],
    })),
  });
  assert.equal(oversizedResponse.status, 400);
  assert.match((await oversizedResponse.json()).error, /32 KB/);

  const blockedResponse = await fetch(`${baseUrl}/api/quotes/issue`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(quoteInput({
      lines: [{ serviceCode: "AA-01", quantity: 4, technicalAssessment: "incomplete" }],
    })),
  });
  assert.equal(blockedResponse.status, 409);
  const blocked = await blockedResponse.json();
  assert.ok(blocked.result.reasons.some((item) => item.code === "technical_information_incomplete"));
  assert.deepEqual(await quoteRepository.list(), []);

  const calculateResponse = await fetch(`${baseUrl}/api/quotes/calculate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(quoteInput()),
  });
  assert.equal(calculateResponse.status, 200);
  const calculated = await calculateResponse.json();
  assert.equal(calculated.kind, "calculated");
  assert.equal(calculated.quote.taxableBaseCop, 410000);
  assert.equal(calculated.quote.taxCop, 77900);
  assert.equal(calculated.quote.totalCop, 487900);
  assert.deepEqual(await quoteRepository.list(), []);

  const issueResponse = await fetch(`${baseUrl}/api/quotes/issue`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(quoteInput()),
  });
  assert.equal(issueResponse.status, 201);
  const issued = await issueResponse.json();
  assert.equal(issued.status, "issued");
  assert.equal(issued.totalCop, 487900);
  assert.equal(issued.isHoliday, false);

  const duplicateResponse = await fetch(`${baseUrl}/api/quotes/issue`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(quoteInput()),
  });
  assert.equal(duplicateResponse.status, 409);
  assert.equal((await quoteRepository.list()).length, 1);

  const concurrentInput = quoteInput({ requestId: "concurrent-request" });
  const simultaneousIssues = await Promise.all([
    fetch(`${baseUrl}/api/quotes/issue`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(concurrentInput),
    }),
    fetch(`${baseUrl}/api/quotes/issue`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(concurrentInput),
    }),
  ]);
  assert.deepEqual(simultaneousIssues.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await quoteRepository.list()).length, 2);

  const listResponse = await fetch(`${baseUrl}/api/quotes`, { headers });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).length, 2);
  const detailResponse = await fetch(`${baseUrl}/api/quotes/${issued.id}`, { headers });
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.lines[0].unitPriceCop, 95000);
  assert.equal(detail.lines[0].tariffVersionId, "2026-10");

  const refreshedEligible = await fetch(`${baseUrl}/api/quotes/eligible`, { headers });
  assert.deepEqual(await refreshedEligible.json(), []);
});
