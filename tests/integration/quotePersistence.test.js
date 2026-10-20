"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { JsonQuoteRepository } = require("../../dist/server/repositories/quoteRepository");

function issuedQuote(id = "quote-id") {
  return {
    id,
    requestId: "request-id",
    status: "issued",
    emissionDate: "2026-10-13",
    expirationDate: "2026-10-27",
    city: "bogota",
    visitDate: "2026-10-15",
    startTime: "09:00",
    endTime: "12:00",
    durationMinutes: 180,
    urgent: false,
    isHoliday: false,
    lines: [{
      serviceCode: "AA-01",
      description: "Mantenimiento preventivo de aire acondicionado split hasta 24.000 BTU",
      unit: "equipment",
      quantity: 4,
      technicalAssessment: "complete",
      unitPriceCop: 95000,
      amountCop: 380000,
      surchargeRatePercent: 0,
      surchargeCop: 0,
      tariffVersionId: "2026-10",
    }, {
      serviceCode: "DES-BOG",
      description: "Desplazamiento en Bogotá",
      unit: "visit",
      quantity: 1,
      technicalAssessment: "complete",
      unitPriceCop: 30000,
      amountCop: 30000,
      surchargeRatePercent: 0,
      surchargeCop: 0,
      tariffVersionId: "2026-10",
    }],
    taxableBaseCop: 410000,
    taxRatePercent: 19,
    taxCop: 77900,
    totalCop: 487900,
    previousRevisionId: null,
    reviewReasons: [],
    createdAt: "2026-10-13T12:00:00.000Z",
    updatedAt: "2026-10-13T12:00:00.000Z",
  };
}

test("guarda y vuelve a leer snapshots sin cambiar precios ni versión", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-quotes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "quotes.json");
  const repository = new JsonQuoteRepository(filePath);
  const quote = issuedQuote();
  await repository.append(quote);

  const loaded = await repository.list();
  assert.deepEqual(loaded, [quote]);
  assert.equal(loaded[0].lines[0].unitPriceCop, 95000);
  assert.equal(loaded[0].lines[0].tariffVersionId, "2026-10");
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), [quote]);
});

test("rechaza IDs duplicados y conserva el registro original", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-quotes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repository = new JsonQuoteRepository(join(directory, "quotes.json"));
  const original = issuedQuote();
  await repository.append(original);
  await assert.rejects(repository.append({ ...original, totalCop: 1 }), /Ya existe una cotización/);
  assert.deepEqual(await repository.list(), [original]);
});

test("rechaza una segunda cotización para una solicitud ya emitida", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-quotes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repository = new JsonQuoteRepository(join(directory, "quotes.json"));
  const original = issuedQuote();
  await repository.append(original);
  await assert.rejects(
    repository.append({ ...original, id: "another-quote-id" }),
    /ya tiene una cotización emitida/,
  );
  assert.deepEqual(await repository.list(), [original]);
});

test("rechaza corrupción JSON en vez de responder como una colección vacía", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-quotes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "quotes.json");
  await writeFile(filePath, "{ no-json", "utf8");
  const repository = new JsonQuoteRepository(filePath);
  await assert.rejects(repository.list(), /JSON inválido/);
});

test("rechaza documentos inválidos e IDs duplicados encontrados en disco", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-quotes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "quotes.json");
  const quote = issuedQuote();
  await writeFile(filePath, JSON.stringify([{ ...quote, id: "" }]), "utf8");
  const repository = new JsonQuoteRepository(filePath);
  await assert.rejects(repository.list(), /formato esperado/);

  await writeFile(filePath, JSON.stringify([quote, quote]), "utf8");
  await assert.rejects(repository.list(), /identificadores duplicados/);
});
