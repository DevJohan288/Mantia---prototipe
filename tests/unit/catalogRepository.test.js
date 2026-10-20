"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { JsonCatalogRepository } = require("../../dist/server/repositories/catalogRepository");

async function makeRepository(context, services, versions) {
  const directory = await mkdtemp(join(tmpdir(), "mantia-catalog-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const servicesPath = join(directory, "services.json");
  const versionsPath = join(directory, "tariff-versions.json");
  await writeFile(servicesPath, JSON.stringify(services), "utf8");
  await writeFile(versionsPath, JSON.stringify(versions), "utf8");
  return new JsonCatalogRepository(servicesPath, versionsPath);
}

const services = [
  { code: "AA-01", name: "Aire", unit: "equipment", category: "service" },
];
const january = {
  id: "2026-01",
  validFrom: "2026-01-01",
  validThrough: "2026-09-30",
  tariffs: [{ serviceCode: "AA-01", amountCop: 90000 }],
};

test("rechaza fechas inválidas y vigencias invertidas", async (context) => {
  const invalidDates = [
    { ...january, validFrom: "2026-02-30" },
    { ...january, validThrough: "2025-12-31" },
  ];
  for (const version of invalidDates) {
    const repository = await makeRepository(context, services, [version]);
    await assert.rejects(repository.load(), /vigencia.*no es válida/);
  }
});

test("rechaza períodos solapados para el mismo servicio", async (context) => {
  const overlapping = {
    ...january,
    id: "2026-09",
    validFrom: "2026-09-30",
    validThrough: "2026-12-31",
    tariffs: [{ serviceCode: "AA-01", amountCop: 95000 }],
  };
  const repository = await makeRepository(context, services, [january, overlapping]);
  await assert.rejects(repository.load(), /vigencias solapadas/);
});

test("rechaza códigos duplicados, tarifas huérfanas e importes inválidos", async (context) => {
  const duplicateServices = await makeRepository(context, [...services, ...services], [january]);
  await assert.rejects(duplicateServices.load(), /inválido o está duplicado/);

  const unknownCode = {
    ...january,
    tariffs: [{ serviceCode: "NO-EXISTE", amountCop: 1000 }],
  };
  const orphanTariff = await makeRepository(context, services, [unknownCode]);
  await assert.rejects(orphanTariff.load(), /servicio inexistente/);

  const invalidAmount = {
    ...january,
    tariffs: [{ serviceCode: "AA-01", amountCop: 1000.5 }],
  };
  const fractionalTariff = await makeRepository(context, services, [invalidAmount]);
  await assert.rejects(fractionalTariff.load(), /entero positivo en COP/);
});

test("informa JSON inválido y archivos ausentes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-catalog-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const servicesPath = join(directory, "services.json");
  const versionsPath = join(directory, "tariff-versions.json");
  await writeFile(servicesPath, "{", "utf8");
  await writeFile(versionsPath, "[]", "utf8");
  await assert.rejects(
    new JsonCatalogRepository(servicesPath, versionsPath).load(),
    /JSON inválido/,
  );
  await assert.rejects(
    new JsonCatalogRepository(join(directory, "missing.json"), versionsPath).load(),
    /No se pudo leer/,
  );
});
