import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CATALOG_SERVICES_FILE,
  CATALOG_TARIFF_VERSIONS_FILE,
} from "../config";
import { JsonCatalogRepository } from "../repositories/catalogRepository";
import { CatalogService, CatalogValidationError } from "../services/catalogService";

const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const catalogService = new CatalogService(
  new JsonCatalogRepository(CATALOG_SERVICES_FILE, CATALOG_TARIFF_VERSIONS_FILE),
);

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    ...API_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function hasOnlyParameters(url: URL, allowed: readonly string[]): boolean {
  return Array.from(url.searchParams.keys()).every((key) => allowed.includes(key));
}

function hasExactlyOneParameter(url: URL, name: string): boolean {
  return url.searchParams.getAll(name).length === 1;
}

export async function handleCatalogRoutes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "GET") {
    res.writeHead(405, { ...API_HEADERS, Allow: "GET" });
    res.end();
    return;
  }

  if (url.pathname === "/api/catalog") {
    if (!hasOnlyParameters(url, [])) {
      sendJson(res, 400, { error: "La consulta del catálogo no admite parámetros." });
      return;
    }
    sendJson(res, 200, await catalogService.getCatalog());
    return;
  }

  if (url.pathname === "/api/catalog/tariffs") {
    if (
      !hasOnlyParameters(url, ["serviceCode", "date"])
      || !hasExactlyOneParameter(url, "serviceCode")
      || !hasExactlyOneParameter(url, "date")
    ) {
      sendJson(res, 400, { error: "La consulta contiene parámetros no permitidos." });
      return;
    }
    const serviceCode = url.searchParams.get("serviceCode");
    const date = url.searchParams.get("date");
    if (serviceCode === null || serviceCode.trim() === "" || date === null || date === "") {
      sendJson(res, 400, { error: "Indique el código del servicio y la fecha de consulta." });
      return;
    }

    let result;
    try {
      result = await catalogService.findTariffOnDate(serviceCode, date);
    } catch (error) {
      if (error instanceof CatalogValidationError) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      throw error;
    }
    if (result.kind === "service_not_found") {
      sendJson(res, 404, { error: `No se encontró el servicio ${result.serviceCode}.` });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: "Ruta del catálogo no encontrada." });
}
