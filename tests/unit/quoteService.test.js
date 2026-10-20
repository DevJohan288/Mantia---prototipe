"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CATALOG_SERVICES_FILE,
  CATALOG_TARIFF_VERSIONS_FILE,
} = require("../../dist/server/config");
const { JsonCatalogRepository } = require("../../dist/server/repositories/catalogRepository");
const { CatalogService } = require("../../dist/server/services/catalogService");
const { QuoteService, roundTaxToCop } = require("../../dist/server/services/quoteService");

function createService(options = {}) {
  const persisted = [];
  const repository = {
    list: async () => [...persisted],
    append: async (quote) => { persisted.push(quote); },
  };
  const service = new QuoteService(
    new CatalogService(new JsonCatalogRepository(CATALOG_SERVICES_FILE, CATALOG_TARIFF_VERSIONS_FILE)),
    repository,
    {
      referenceDate: "2026-10-13",
      now: () => new Date("2026-10-13T12:00:00.000Z"),
      createId: () => "quote-test-id",
      ...options,
    },
  );
  return { service, persisted };
}

function validInput(overrides = {}) {
  return {
    requestId: "request-test-id",
    city: "bogota",
    visitDate: "2026-10-15",
    startTime: "09:00",
    durationMinutes: 180,
    urgent: false,
    isHoliday: false,
    lines: [
      { serviceCode: "AA-01", quantity: 1, technicalAssessment: "complete" },
    ],
    ...overrides,
  };
}

test("calcula un concepto sin recargo y agrega el desplazamiento una sola vez", async () => {
  const { service } = createService();
  const result = await service.calculate(validInput());
  assert.equal(result.kind, "calculated");
  if (result.kind !== "calculated") return;

  assert.equal(result.quote.taxableBaseCop, 125000);
  assert.equal(result.quote.taxCop, 23750);
  assert.equal(result.quote.totalCop, 148750);
  assert.deepEqual(result.quote.lines.map((line) => line.serviceCode), ["AA-01", "DES-BOG"]);
  assert.equal(result.quote.lines[1].quantity, 1);
  assert.equal(result.quote.lines[1].surchargeCop, 0);
  assert.equal(result.quote.lines[0].tariffVersionId, "2026-10");
});

test("calcula Arboleda y Mirador con la fecha de emisión, no la de visita", async () => {
  const { service } = createService();
  const arboleda = await service.calculate(validInput({
    visitDate: "2026-10-15",
    durationMinutes: 180,
    lines: [{ serviceCode: "AA-01", quantity: 4, technicalAssessment: "complete" }],
  }));
  assert.equal(arboleda.kind, "calculated");
  if (arboleda.kind === "calculated") {
    assert.equal(arboleda.quote.taxableBaseCop, 410000);
    assert.equal(arboleda.quote.taxCop, 77900);
    assert.equal(arboleda.quote.totalCop, 487900);
  }

  const mirador = await service.calculate(validInput({
    city: "chia",
    visitDate: "2026-10-16",
    startTime: "08:00",
    durationMinutes: 540,
    lines: [
      { serviceCode: "PI-01", quantity: 120, technicalAssessment: "complete" },
      { serviceCode: "PL-01", quantity: 2, technicalAssessment: "complete" },
    ],
  }));
  assert.equal(mirador.kind, "calculated");
  if (mirador.kind === "calculated") {
    assert.equal(mirador.quote.taxableBaseCop, 1870000);
    assert.equal(mirador.quote.taxCop, 355300);
    assert.equal(mirador.quote.totalCop, 2225300);
    assert.equal(mirador.quote.lines.at(-1).serviceCode, "DES-CHI");
  }

  const differentVisitDate = await service.calculate(validInput({
    visitDate: "2026-01-15",
    lines: [{ serviceCode: "AA-01", quantity: 1, technicalAssessment: "complete" }],
  }));
  assert.equal(differentVisitDate.kind, "calculated");
  if (differentVisitDate.kind === "calculated") {
    assert.equal(differentVisitDate.quote.emissionDate, "2026-10-13");
    assert.equal(differentVisitDate.quote.lines[0].unitPriceCop, 95000);
    assert.equal(differentVisitDate.quote.expirationDate, "2026-10-27");
  }
});

test("calcula el IVA una vez sobre la base total y redondea 0,49, 0,50 y 0,51", () => {
  assert.equal(roundTaxToCop(71), 13);
  assert.equal(roundTaxToCop(50), 10);
  assert.equal(roundTaxToCop(29), 6);
});

test("aplica recargo de fin de semana solo a servicios, no a desplazamiento ni por urgencia", async () => {
  const { service } = createService();
  const weekend = await service.calculate(validInput({
    visitDate: "2026-10-17",
    lines: [
      { serviceCode: "AA-01", quantity: 2, technicalAssessment: "complete" },
      { serviceCode: "PL-01", quantity: 1, technicalAssessment: "complete" },
    ],
  }));
  assert.equal(weekend.kind, "calculated");
  if (weekend.kind === "calculated") {
    assert.equal(weekend.quote.lines[0].surchargeRatePercent, 25);
    assert.equal(weekend.quote.lines[0].surchargeCop, 47500);
    assert.equal(weekend.quote.lines[1].surchargeCop, 16250);
    assert.equal(weekend.quote.lines[2].surchargeCop, 0);
    assert.equal(weekend.quote.taxableBaseCop, 348750);
  }

  const urgentWeekday = await service.calculate(validInput({ urgent: true }));
  assert.equal(urgentWeekday.kind, "calculated");
  if (urgentWeekday.kind === "calculated") {
    assert.equal(urgentWeekday.quote.lines[0].surchargeCop, 0);
  }
});

test("calcula una vigencia de quince días calendario contando emisión como día uno", async () => {
  const { service } = createService();
  const result = await service.calculate(validInput());
  assert.equal(result.kind, "calculated");
  if (result.kind === "calculated") {
    assert.equal(result.quote.emissionDate, "2026-10-13");
    assert.equal(result.quote.expirationDate, "2026-10-27");
  }
});

test("bloquea tarifas faltantes, servicios desconocidos y evaluación técnica incompleta", async () => {
  const { service } = createService({ referenceDate: "2027-01-01" });
  const missingTariff = await service.calculate(validInput());
  assert.equal(missingTariff.kind, "blocked");
  if (missingTariff.kind === "blocked") {
    assert.ok(missingTariff.reasons.some((item) => item.code === "no_applicable_tariff"));
  }

  const unknown = await service.calculate(validInput({
    lines: [{ serviceCode: "ZZ-99", quantity: 1, technicalAssessment: "complete" }],
  }));
  assert.equal(unknown.kind, "blocked");
  if (unknown.kind === "blocked") {
    assert.ok(unknown.reasons.some((item) => item.code === "service_not_found"));
  }

  const incomplete = await service.calculate(validInput({
    lines: [{ serviceCode: "AA-01", quantity: 1, technicalAssessment: "incomplete" }],
  }));
  assert.equal(incomplete.kind, "blocked");
  if (incomplete.kind === "blocked") {
    assert.ok(incomplete.reasons.some((item) => item.code === "technical_information_incomplete"));
  }

  const missingAssessment = await service.calculate(validInput({
    lines: [{ serviceCode: "AA-01", quantity: 1 }],
  }));
  assert.equal(missingAssessment.kind, "blocked");
  if (missingAssessment.kind === "blocked") {
    assert.ok(missingAssessment.reasons.some((item) => item.code === "technical_information_missing"));
  }

  const outsideScope = await service.calculate(validInput({
    lines: [{ serviceCode: "AA-01", quantity: 1, technicalAssessment: "outside_scope" }],
  }));
  assert.equal(outsideScope.kind, "blocked");
  if (outsideScope.kind === "blocked") {
    assert.ok(outsideScope.reasons.some((item) => item.code === "outside_catalog_scope"));
  }
});

test("bloquea festivos, horarios no confirmados y visitas que cruzan medianoche", async () => {
  const { service } = createService();
  const cases = [
    { input: validInput({ visitDate: "2026-10-19", isHoliday: true }), code: "weekday_holiday" },
    { input: validInput({ visitDate: "2026-10-19", startTime: "07:30" }), code: "weekday_before_hours" },
    { input: validInput({ visitDate: "2026-10-19", startTime: "17:30", durationMinutes: 60 }), code: "weekday_outside_hours" },
    { input: validInput({ visitDate: "2026-10-19", startTime: "18:00" }), code: "weekday_outside_hours" },
    { input: validInput({ visitDate: "2026-10-17", startTime: "23:00", durationMinutes: 120 }), code: "crosses_midnight" },
  ];
  for (const item of cases) {
    const result = await service.calculate(item.input);
    assert.equal(result.kind, "blocked");
    if (result.kind === "blocked") {
      assert.ok(result.reasons.some((reason) => reason.code === item.code));
    }
  }
});

test("devuelve errores estructurados para ciudad, fecha, hora y cantidad inválidas", async () => {
  const { service } = createService();
  const cases = [
    { input: validInput({ city: "cali" }), code: "invalid_city" },
    { input: validInput({ visitDate: "2026-02-30" }), code: "invalid_date" },
    { input: validInput({ startTime: "25:00" }), code: "invalid_time" },
    { input: validInput({ lines: [{ serviceCode: "AA-01", quantity: 0, technicalAssessment: "complete" }] }), code: "invalid_quantity" },
  ];
  for (const item of cases) {
    const result = await service.calculate(item.input);
    assert.equal(result.kind, "blocked");
    if (result.kind === "blocked") {
      assert.ok(result.reasons.some((reason) => reason.code === item.code));
    }
  }
});

test("solo emite explícitamente propuestas calculables y no emite casos bloqueados", async () => {
  const { service, persisted } = createService();
  const draft = await service.calculate(validInput());
  assert.equal(draft.kind, "calculated");
  if (draft.kind === "calculated") {
    const issued = await service.issue(draft);
    assert.equal(issued.status, "issued");
    assert.equal(persisted.length, 1);
  }
  const blocked = await service.calculate(validInput({ city: "cali" }));
  assert.equal(blocked.kind, "blocked");
  await assert.rejects(service.issue(blocked), /No se puede emitir/);
  assert.equal(persisted.length, 1);
});

test("valida la fecha de referencia configurable y permite usar la fecha del reloj inyectado", async () => {
  assert.throws(
    () => createService({ referenceDate: "2026-02-30" }),
    /MANTIA_QUOTE_REFERENCE_DATE/,
  );
  const { service } = createService({ referenceDate: undefined });
  const result = await service.calculate(validInput());
  assert.equal(result.kind, "calculated");
  if (result.kind === "calculated") {
    assert.equal(result.quote.emissionDate, "2026-10-13");
  }
});
