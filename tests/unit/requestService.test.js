"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RequestConflictError,
  RequestService,
  RequestValidationError,
  validateRequestInput,
} = require("../../dist/server/services/requestService");

class MemoryRequestRepository {
  requests = [];
  async list() {
    return this.requests.map((request) => ({ ...request }));
  }
  async create(input) {
    const now = "2026-01-10T12:00:00.000Z";
    const request = {
      ...input,
      id: `request-${this.requests.length + 1}`,
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

const validInput = {
  customerName: "  Empresa Mantia  ",
  contactEmail: "contacto@example.com",
  contactPhone: "",
  serviceDescription: "Mantenimiento preventivo",
  serviceAddress: "Calle 10 # 20-30",
  preferredDate: "2026-02-28",
};

test("valida y normaliza los datos de ingreso", () => {
  assert.deepEqual(validateRequestInput(validInput), {
    customerName: "Empresa Mantia",
    contactEmail: "contacto@example.com",
    contactPhone: null,
    serviceDescription: "Mantenimiento preventivo",
    serviceAddress: "Calle 10 # 20-30",
    preferredDate: "2026-02-28",
  });
});

test("exige medio de contacto y rechaza fecha inexistente o campos ajenos", () => {
  assert.throws(() => validateRequestInput({ ...validInput, contactEmail: "", contactPhone: "" }), RequestValidationError);
  assert.throws(() => validateRequestInput({ ...validInput, preferredDate: "2026-02-30" }), RequestValidationError);
  assert.throws(() => validateRequestInput({ ...validInput, amount: 500 }), RequestValidationError);
});

test("crea solicitud y permite revisar por estados válidos", async () => {
  const service = new RequestService(new MemoryRequestRepository());
  const created = await service.create(validInput);
  assert.equal(created.status, "pending_review");
  assert.equal(created.customerName, "Empresa Mantia");

  const needsInfo = await service.review(created.id, {
    status: "needs_information",
    notes: "Confirmar el área que requiere el servicio.",
  });
  assert.equal(needsInfo.status, "needs_information");
  assert.equal(needsInfo.reviewNotes, "Confirmar el área que requiere el servicio.");

  const returnedToReview = await service.review(created.id, { status: "pending_review" });
  assert.equal(returnedToReview.status, "pending_review");
  const approved = await service.review(created.id, { status: "approved" });
  assert.equal(approved.status, "approved");
  await assert.rejects(
    service.review(created.id, { status: "rejected", notes: "Cambio no permitido." }),
    RequestConflictError,
  );
});

test("exige motivo al solicitar información o rechazar", async () => {
  const service = new RequestService(new MemoryRequestRepository());
  const created = await service.create(validInput);
  await assert.rejects(
    service.review(created.id, { status: "needs_information" }),
    RequestValidationError,
  );
  await assert.rejects(
    service.review(created.id, { status: "rejected" }),
    RequestValidationError,
  );
});
