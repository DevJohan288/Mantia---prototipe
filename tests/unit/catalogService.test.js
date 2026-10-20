"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CATALOG_SERVICES_FILE,
  CATALOG_TARIFF_VERSIONS_FILE,
} = require("../../dist/server/config");
const { JsonCatalogRepository } = require("../../dist/server/repositories/catalogRepository");
const { CatalogService } = require("../../dist/server/services/catalogService");

const catalog = new CatalogService(
  new JsonCatalogRepository(CATALOG_SERVICES_FILE, CATALOG_TARIFF_VERSIONS_FILE),
);

test("carga los siete servicios y dos versiones tarifarias con los importes entregados", async () => {
  const result = await catalog.getCatalog();
  assert.equal(result.services.length, 7);
  assert.equal(result.tariffVersions.length, 2);
  const january = result.tariffVersions.find((version) => version.id === "2026-01");
  const october = result.tariffVersions.find((version) => version.id === "2026-10");
  assert.ok(january);
  assert.ok(october);
  assert.equal(january.validFrom, "2026-01-01");
  assert.equal(january.validThrough, "2026-09-30");
  assert.equal(october.validFrom, "2026-10-01");
  assert.equal(october.validThrough, "2026-12-31");
  assert.deepEqual(january.tariffs.map((tariff) => tariff.amountCop), [
    90000, 70000, 13000, 60000, 45000, 25000, 50000,
  ]);
  assert.deepEqual(october.tariffs.map((tariff) => tariff.amountCop), [
    95000, 75000, 14000, 65000, 50000, 30000, 60000,
  ]);
});

test("consulta tarifas por la fecha explícita y respeta fechas inclusivas", async () => {
  const lastJanuaryDay = await catalog.findTariffOnDate("AA-01", "2026-09-30");
  assert.equal(lastJanuaryDay.kind, "available");
  if (lastJanuaryDay.kind === "available") {
    assert.equal(lastJanuaryDay.tariff.amountCop, 90000);
    assert.equal(lastJanuaryDay.versionId, "2026-01");
  }

  const firstOctoberDay = await catalog.findTariffOnDate("AA-01", "2026-10-01");
  assert.equal(firstOctoberDay.kind, "available");
  if (firstOctoberDay.kind === "available") {
    assert.equal(firstOctoberDay.tariff.amountCop, 95000);
    assert.equal(firstOctoberDay.versionId, "2026-10");
  }
});

test("devuelve explícitamente tarifa no disponible y servicio desconocido", async () => {
  const expired = await catalog.findTariffOnDate("AA-01", "2027-01-01");
  assert.equal(expired.kind, "no_applicable_tariff");
  const unknown = await catalog.findTariffOnDate("ZZ-99", "2026-10-01");
  assert.equal(unknown.kind, "service_not_found");
});

test("rechaza fechas de consulta inválidas", async () => {
  await assert.rejects(
    catalog.findTariffOnDate("AA-01", "2026-02-30"),
    /fecha real/,
  );
});
