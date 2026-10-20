import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IssuedQuote } from "../../shared/models/quote";

export interface QuoteRepository {
  list(): Promise<IssuedQuote[]>;
  append(quote: IssuedQuote): Promise<void>;
}

export class QuoteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteConflictError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isQuoteLine(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  return typeof value["serviceCode"] === "string"
    && typeof value["description"] === "string"
    && typeof value["unit"] === "string"
    && typeof value["quantity"] === "number"
    && Number.isFinite(value["quantity"])
    && value["quantity"] > 0
    && (value["technicalAssessment"] === undefined || value["technicalAssessment"] === "complete")
    && (value["technicalNotes"] === undefined
      || (typeof value["technicalNotes"] === "string" && value["technicalNotes"].length <= 2000))
    && Number.isSafeInteger(value["unitPriceCop"])
    && (value["unitPriceCop"] as number) > 0
    && typeof value["amountCop"] === "number"
    && Number.isFinite(value["amountCop"])
    && value["amountCop"] >= 0
    && typeof value["surchargeRatePercent"] === "number"
    && (value["surchargeRatePercent"] === 0 || value["surchargeRatePercent"] === 25)
    && typeof value["surchargeCop"] === "number"
    && Number.isFinite(value["surchargeCop"])
    && value["surchargeCop"] >= 0
    && typeof value["tariffVersionId"] === "string";
}

function isIssuedQuote(value: unknown): value is IssuedQuote {
  if (!isObject(value)) {
    return false;
  }
  return typeof value["id"] === "string"
    && value["id"].trim() !== ""
    && typeof value["requestId"] === "string"
    && value["requestId"].trim() !== ""
    && value["status"] === "issued"
    && isDate(value["emissionDate"])
    && isDate(value["expirationDate"])
    && (value["city"] === "bogota" || value["city"] === "chia")
    && isDate(value["visitDate"])
    && isTime(value["startTime"])
    && isTime(value["endTime"])
    && Number.isSafeInteger(value["durationMinutes"])
    && (value["durationMinutes"] as number) > 0
    && typeof value["urgent"] === "boolean"
    && typeof value["isHoliday"] === "boolean"
    && Array.isArray(value["lines"])
    && value["lines"].length > 0
    && value["lines"].every(isQuoteLine)
    && typeof value["taxableBaseCop"] === "number"
    && Number.isFinite(value["taxableBaseCop"])
    && value["taxableBaseCop"] >= 0
    && value["taxRatePercent"] === 19
    && Number.isSafeInteger(value["taxCop"])
    && (value["taxCop"] as number) >= 0
    && typeof value["totalCop"] === "number"
    && Number.isFinite(value["totalCop"])
    && (value["previousRevisionId"] === null || typeof value["previousRevisionId"] === "string")
    && Array.isArray(value["reviewReasons"])
    && value["reviewReasons"].length === 0
    && isIsoTimestamp(value["createdAt"])
    && isIsoTimestamp(value["updatedAt"]);
}

export class JsonQuoteRepository implements QuoteRepository {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  list(): Promise<IssuedQuote[]> {
    return this.serialize(() => this.readAll());
  }

  append(quote: IssuedQuote): Promise<void> {
    return this.serialize(async () => {
      if (!isIssuedQuote(quote)) {
        throw new Error("La cotización no tiene una estructura válida para persistir.");
      }
      const quotes = await this.readAll();
      if (quotes.some((existing) => existing.id === quote.id)) {
        throw new QuoteConflictError(`Ya existe una cotización con el identificador ${quote.id}.`);
      }
      if (quotes.some((existing) => existing.requestId === quote.requestId)) {
        throw new QuoteConflictError(`La solicitud ${quote.requestId} ya tiene una cotización emitida.`);
      }
      quotes.push(quote);
      await this.writeAll(quotes);
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingWrite.then(operation);
    this.pendingWrite = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readAll(): Promise<IssuedQuote[]> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw new Error(`No se pudieron leer las cotizaciones (${this.filePath}).`, { cause: error });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents) as unknown;
    } catch (error) {
      throw new Error("El archivo local de cotizaciones contiene JSON inválido.", { cause: error });
    }
    if (!Array.isArray(parsed) || !parsed.every(isIssuedQuote)) {
      throw new Error("El archivo local de cotizaciones no tiene el formato esperado.");
    }
    const ids = parsed.map((quote) => quote.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("El archivo local de cotizaciones contiene identificadores duplicados.");
    }
    return parsed;
  }

  private async writeAll(quotes: readonly IssuedQuote[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(quotes, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, this.filePath);
  }
}
