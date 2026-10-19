import type {
  RequestInput,
  RequestRecord,
  RequestStatus,
  ReviewInput,
} from "../../shared/models/request";
import type { RequestRepository } from "../repositories/requestRepository";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export class RequestNotFoundError extends Error {
  constructor() {
    super("No se encontró la solicitud indicada.");
    this.name = "RequestNotFoundError";
  }
}

export class RequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestConflictError";
  }
}

const MAX_TEXT_LENGTH = 2000;
const ALLOWED_REQUEST_FIELDS = new Set([
  "customerName",
  "contactEmail",
  "contactPhone",
  "serviceDescription",
  "serviceAddress",
  "preferredDate",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new RequestValidationError(`El campo ${field} es obligatorio.`);
  }
  const normalized = value.trim();
  if (normalized === "") {
    throw new RequestValidationError(`El campo ${field} es obligatorio.`);
  }
  if (normalized.length > maxLength) {
    throw new RequestValidationError(`El campo ${field} supera el máximo de ${maxLength} caracteres.`);
  }
  return normalized;
}

function optionalContact(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new RequestValidationError(`El campo ${field} no tiene un formato válido.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new RequestValidationError(`El campo ${field} supera el máximo de ${maxLength} caracteres.`);
  }
  return normalized === "" ? null : normalized;
}

function optionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestValidationError("La fecha preferida debe usar el formato AAAA-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RequestValidationError("La fecha preferida no existe en el calendario.");
  }
  return value;
}

export function validateRequestInput(value: unknown): RequestInput {
  if (!isObject(value)) {
    throw new RequestValidationError("El cuerpo debe ser un objeto JSON.");
  }
  const unknownFields = Object.keys(value).filter((field) => !ALLOWED_REQUEST_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw new RequestValidationError(`Campo(s) no permitido(s): ${unknownFields.join(", ")}.`);
  }
  const customerName = requiredText(value["customerName"], "nombre del cliente", 120);
  const contactEmail = optionalContact(value["contactEmail"], "correo electrónico", 254);
  const contactPhone = optionalContact(value["contactPhone"], "teléfono", 30);
  if (contactEmail === null && contactPhone === null) {
    throw new RequestValidationError("Indique al menos un medio de contacto: correo o teléfono.");
  }
  if (contactEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new RequestValidationError("El correo electrónico no tiene un formato válido.");
  }
  return {
    customerName,
    contactEmail,
    contactPhone,
    serviceDescription: requiredText(value["serviceDescription"], "descripción del servicio", MAX_TEXT_LENGTH),
    serviceAddress: requiredText(value["serviceAddress"], "dirección del servicio", 300),
    preferredDate: optionalDate(value["preferredDate"]),
  };
}

export function validateReviewInput(value: unknown): ReviewInput {
  if (!isObject(value)) {
    throw new RequestValidationError("El cuerpo debe ser un objeto JSON.");
  }
  const allowedFields = new Set(["status", "notes"]);
  const unknownFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new RequestValidationError(`Campo(s) no permitido(s): ${unknownFields.join(", ")}.`);
  }
  const status = value["status"];
  if (status !== "pending_review"
    && status !== "needs_information"
    && status !== "approved"
    && status !== "rejected") {
    throw new RequestValidationError("El estado solicitado no es válido.");
  }
  const rawNotes = value["notes"] ?? "";
  if (typeof rawNotes !== "string") {
    throw new RequestValidationError("Las notas de revisión deben ser texto.");
  }
  const notes = rawNotes.trim();
  if (notes.length > MAX_TEXT_LENGTH) {
    throw new RequestValidationError(`Las notas superan el máximo de ${MAX_TEXT_LENGTH} caracteres.`);
  }
  if ((status === "needs_information" || status === "rejected") && notes === "") {
    throw new RequestValidationError("Indique el motivo para solicitar información o rechazar la solicitud.");
  }
  return { status, notes };
}

const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  pending_review: ["needs_information", "approved", "rejected"],
  needs_information: ["pending_review", "approved", "rejected"],
  approved: [],
  rejected: [],
};

export class RequestService {
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(private readonly repository: RequestRepository) {}

  list(): Promise<RequestRecord[]> {
    return this.repository.list();
  }

  create(value: unknown): Promise<RequestRecord> {
    const input = validateRequestInput(value);
    return this.serialize(() => this.repository.create(input));
  }

  review(id: string, value: unknown): Promise<RequestRecord> {
    return this.serialize(async () => {
      const review = validateReviewInput(value);
      const requests = await this.repository.list();
      const existing = requests.find((request) => request.id === id);
      if (existing === undefined) {
        throw new RequestNotFoundError();
      }
      if (!TRANSITIONS[existing.status].includes(review.status)) {
        throw new RequestConflictError(
          `No se puede cambiar una solicitud de "${existing.status}" a "${review.status}".`,
        );
      }
      const updated = await this.repository.updateReview(id, review);
      if (updated === null) {
        throw new RequestNotFoundError();
      }
      return updated;
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingOperation.then(operation);
    this.pendingOperation = result.then(() => undefined, () => undefined);
    return result;
  }
}
