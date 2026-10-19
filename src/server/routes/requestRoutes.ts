import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { REQUESTS_FILE } from "../config";
import {
  JsonRequestRepository,
  type RequestRepository,
} from "../repositories/requestRepository";
import {
  RequestConflictError,
  RequestNotFoundError,
  RequestService,
  RequestValidationError,
} from "../services/requestService";

const MAX_BODY_BYTES = 32 * 1024;
const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const defaultService = new RequestService(new JsonRequestRepository(REQUESTS_FILE));

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    ...API_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendApiError(res: ServerResponse, error: unknown): boolean {
  if (error instanceof RequestValidationError) {
    sendJson(res, 400, { error: error.message });
  } else if (error instanceof RequestNotFoundError) {
    sendJson(res, 404, { error: error.message });
  } else if (error instanceof RequestConflictError) {
    sendJson(res, 409, { error: error.message });
  } else {
    return false;
  }
  return true;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestValidationError("El contenido debe enviarse como application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RequestValidationError("El cuerpo supera el tamaño máximo de 32 KB.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RequestValidationError("El cuerpo no contiene JSON válido.");
    }
    throw error;
  }
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function createRequestHandler(repository?: RequestRepository) {
  const service = repository === undefined
    ? defaultService
    : new RequestService(repository);
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/requests" && !url.pathname.startsWith("/api/requests/")) {
      return false;
    }
    if (url.pathname === "/api/requests") {
      if (req.method === "GET") {
        sendJson(res, 200, await service.list());
        return true;
      }
      if (req.method === "POST") {
        const created = await service.create(await readJsonBody(req));
        sendJson(res, 201, created);
        return true;
      }
      res.writeHead(405, { ...API_HEADERS, Allow: "GET, POST" });
      res.end();
      return true;
    }
    const match = /^\/api\/requests\/([^/]+)\/review$/.exec(url.pathname);
    if (match === null) {
      sendJson(res, 404, { error: "Ruta de solicitudes no encontrada." });
      return true;
    }
    if (req.method !== "PATCH") {
      res.writeHead(405, { ...API_HEADERS, Allow: "PATCH" });
      res.end();
      return true;
    }
    const id = decodePathSegment(match[1] ?? "");
    if (id === null || id === "") {
      sendJson(res, 400, { error: "El identificador de la solicitud no es válido." });
      return true;
    }
    const updated = await service.review(id, await readJsonBody(req));
    sendJson(res, 200, updated);
    return true;
  };
}

const handleRequests = createRequestHandler();

export async function handleRequestRoutes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const handled = await handleRequests(req, res);
    if (!handled) {
      sendJson(res, 404, { error: "Ruta de solicitudes no encontrada." });
    }
  } catch (error) {
    if (!sendApiError(res, error)) {
      throw error;
    }
  }
}

export function createRequestTestServer(repository: RequestRepository) {
  const handler = createRequestHandler(repository);
  return createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      if (sendApiError(res, error)) {
        return;
      }
      console.error("Error no controlado en la API de solicitudes:", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Error interno del servidor." });
      } else {
        res.destroy();
      }
    });
  });
}
