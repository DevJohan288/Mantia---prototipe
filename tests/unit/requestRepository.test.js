"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { JsonRequestRepository } = require("../../dist/server/repositories/requestRepository");

test("persiste solicitudes en JSON y las conserva en una nueva instancia", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-requests-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "requests.json");
  const repository = new JsonRequestRepository(filePath);
  const input = {
    customerName: "Cliente Persistente",
    contactEmail: "cliente@example.com",
    contactPhone: null,
    serviceDescription: "Revisión técnica",
    serviceAddress: "Calle 1",
    preferredDate: null,
  };
  const created = await repository.create(input);
  const persisted = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(persisted[0].id, created.id);
  await repository.updateReview(created.id, {
    status: "needs_information",
    notes: "Falta confirmar el alcance.",
  });
  const reread = await new JsonRequestRepository(filePath).list();
  assert.equal(reread[0].customerName, "Cliente Persistente");
  assert.equal(reread[0].reviewNotes, "Falta confirmar el alcance.");
  assert.equal(reread[0].status, "needs_information");
});

test("informa JSON local corrupto sin ocultar el error", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mantia-requests-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "requests.json");
  await writeFile(filePath, "{", "utf8");
  await assert.rejects(
    new JsonRequestRepository(filePath).list(),
    /JSON inválido/,
  );
});
