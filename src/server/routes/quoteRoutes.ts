import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CATALOG_SERVICES_FILE,
  CATALOG_TARIFF_VERSIONS_FILE,
  QUOTES_FILE,
  REQUESTS_FILE,
} from "../config";
import { JsonCatalogRepository } from "../repositories/catalogRepository";
import { JsonQuoteRepository, QuoteConflictError, type QuoteRepository } from "../repositories/quoteRepository";
import { JsonRequestRepository, type RequestRepository } from "../repositories/requestRepository";
import { CatalogService } from "../services/catalogService";
import { QuoteService } from "../services/quoteService";
import type { QuoteCalculationResult } from "../../shared/models/quote";

const MAX_BODY_BYTES = 32 * 1024;
const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export interface QuoteRouteDependencies {
  readonly requests: Pick<RequestRepository, "list">;
  readonly quotes: QuoteRepository;
  readonly service: QuoteService;
}

export type QuoteRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    ...API_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

class QuoteApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly result?: QuoteCalculationResult,
  ) {
    super(message);
    this.name = "QuoteApiError";
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new QuoteApiError(400, "El contenido debe enviarse como application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new QuoteApiError(400, "El cuerpo supera el tamaño máximo de 32 KB.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new QuoteApiError(400, "El cuerpo no contiene JSON válido.");
    }
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAllowedFields(value: unknown): void {
  if (!isObject(value)) {
    throw new QuoteApiError(400, "La entrada de cotización debe ser un objeto JSON.");
  }
  const allowed = new Set([
    "requestId",
    "city",
    "visitDate",
    "startTime",
    "durationMinutes",
    "urgent",
    "isHoliday",
    "lines",
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new QuoteApiError(400, `La entrada contiene campos no permitidos: ${unknown.join(", ")}.`);
  }
  if (!Array.isArray(value["lines"])) {
    return;
  }
  const lineFields = new Set(["serviceCode", "quantity", "technicalAssessment", "technicalNotes"]);
  for (let index = 0; index < value["lines"].length; index += 1) {
    const line = value["lines"][index];
    if (!isObject(line)) {
      continue;
    }
    const unknownLineFields = Object.keys(line).filter((key) => !lineFields.has(key));
    if (unknownLineFields.length > 0) {
      throw new QuoteApiError(
        400,
        `El concepto ${index + 1} contiene campos no permitidos: ${unknownLineFields.join(", ")}.`,
      );
    }
  }
}

function hasOnlyParameters(url: URL): boolean {
  return Array.from(url.searchParams.keys()).length === 0;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function requireApprovedRequest(
  requestId: string,
  dependencies: QuoteRouteDependencies,
) {
  const requests = await dependencies.requests.list();
  const request = requests.find((item) => item.id === requestId);
  if (request === undefined) {
    throw new QuoteApiError(404, "No se encontró la solicitud indicada.");
  }
  if (request.status !== "approved") {
    throw new QuoteApiError(409, "La solicitud debe estar aprobada antes de calcular o emitir una cotización.");
  }
  return request;
}

function invalidInputResult(result: QuoteCalculationResult): QuoteApiError | null {
  if (result.kind !== "blocked") {
    return null;
  }
  const invalidCodes = new Set([
    "invalid_input",
    "invalid_date",
    "invalid_time",
    "invalid_duration",
    "invalid_city",
    "invalid_quantity",
    "travel_line_not_allowed",
  ]);
  if (result.reasons.some((item) => invalidCodes.has(item.code))) {
    return new QuoteApiError(400, result.reasons.map((item) => item.message).join(" "), result);
  }
  if (result.reasons.some((item) => item.code === "service_not_found")) {
    return new QuoteApiError(404, result.reasons.map((item) => item.message).join(" "), result);
  }
  return null;
}

export function createQuoteHandler(dependencies: QuoteRouteDependencies): QuoteRequestHandler {
  return async (req, res): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/quotes" && !url.pathname.startsWith("/api/quotes/")) {
      return false;
    }
    try {
      if (!hasOnlyParameters(url)) {
        throw new QuoteApiError(400, "La API de cotizaciones no admite parámetros de consulta.");
      }
      if (url.pathname === "/api/quotes/eligible") {
        if (req.method !== "GET") {
          res.writeHead(405, { ...API_HEADERS, Allow: "GET" });
          res.end();
          return true;
        }
        const [requests, quotes] = await Promise.all([
          dependencies.requests.list(),
          dependencies.quotes.list(),
        ]);
        const issuedRequestIds = new Set(quotes.map((quote) => quote.requestId));
        sendJson(res, 200, requests.filter((request) =>
          request.status === "approved" && !issuedRequestIds.has(request.id),
        ));
        return true;
      }

      if (url.pathname === "/api/quotes") {
        if (req.method !== "GET") {
          res.writeHead(405, { ...API_HEADERS, Allow: "GET" });
          res.end();
          return true;
        }
        sendJson(res, 200, await dependencies.quotes.list());
        return true;
      }

      if (url.pathname === "/api/quotes/calculate" || url.pathname === "/api/quotes/issue") {
        if (req.method !== "POST") {
          res.writeHead(405, { ...API_HEADERS, Allow: "POST" });
          res.end();
          return true;
        }
        const input = await readJsonBody(req);
        validateAllowedFields(input);
        if (!isObject(input) || typeof input["requestId"] !== "string" || input["requestId"].trim() === "") {
          throw new QuoteApiError(400, "Debe indicar la solicitud relacionada.");
        }
        await requireApprovedRequest(input["requestId"], dependencies);
        const result = await dependencies.service.calculate(input);
        const invalidInput = invalidInputResult(result);
        if (invalidInput !== null) {
          if (url.pathname === "/api/quotes/issue") {
            throw invalidInput;
          }
          sendJson(res, invalidInput.status, {
            error: invalidInput.message,
            result,
          });
          return true;
        }
        if (url.pathname === "/api/quotes/calculate") {
          sendJson(res, 200, result);
          return true;
        }
        if (result.kind === "blocked") {
          throw new QuoteApiError(
            409,
            "La propuesta requiere revisión manual y no puede emitirse.",
            result,
          );
        }
        const issued = await dependencies.service.issue(result);
        sendJson(res, 201, issued);
        return true;
      }

      const match = /^\/api\/quotes\/([^/]+)$/.exec(url.pathname);
      if (match === null) {
        sendJson(res, 404, { error: "Ruta de cotizaciones no encontrada." });
        return true;
      }
      if (req.method !== "GET") {
        res.writeHead(405, { ...API_HEADERS, Allow: "GET" });
        res.end();
        return true;
      }
      const id = decodePathSegment(match[1] ?? "");
      if (id === null || id === "") {
        throw new QuoteApiError(400, "El identificador de la cotización no es válido.");
      }
      const quote = (await dependencies.quotes.list()).find((item) => item.id === id);
      if (quote === undefined) {
        throw new QuoteApiError(404, "No se encontró la cotización indicada.");
      }
      sendJson(res, 200, quote);
      return true;
    } catch (error) {
      if (error instanceof QuoteApiError) {
        sendJson(res, error.status, {
          error: error.message,
          ...(error.result === undefined ? {} : { result: error.result }),
        });
        return true;
      }
      if (error instanceof QuoteConflictError) {
        sendJson(res, 409, { error: error.message });
        return true;
      }
      throw error;
    }
  };
}

const defaultQuoteRepository = new JsonQuoteRepository(QUOTES_FILE);

export const defaultQuoteHandler = createQuoteHandler({
  requests: new JsonRequestRepository(REQUESTS_FILE),
  quotes: defaultQuoteRepository,
  service: new QuoteService(
    new CatalogService(new JsonCatalogRepository(CATALOG_SERVICES_FILE, CATALOG_TARIFF_VERSIONS_FILE)),
    defaultQuoteRepository,
  ),
});
