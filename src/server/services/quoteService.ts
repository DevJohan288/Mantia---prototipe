import { randomUUID } from "node:crypto";
import type {
  QuoteCalculationResult,
  QuoteCity,
  QuoteDraft,
  QuoteInput,
  QuoteLineInput,
  QuoteLineSnapshot,
  QuoteReviewReason,
  QuoteReviewReasonCode,
  TechnicalAssessment,
  IssuedQuote,
} from "../../shared/models/quote";
import { QUOTE_REFERENCE_DATE } from "../config";
import type { QuoteRepository } from "../repositories/quoteRepository";
import { CatalogService } from "./catalogService";

const TAX_RATE_PERCENT = 19;
const WEEKEND_SURCHARGE_PERCENT = 25;
const MAX_TEXT_LENGTH = 2000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dateInSystemTimeZone(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function decimalFraction(value: number): { numerator: bigint; denominator: bigint } {
  const [mantissa = "", exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole = "0", decimal = ""] = mantissa.split(".");
  const digits = BigInt(`${whole}${decimal}`);
  const scale = decimal.length - exponent;
  if (scale <= 0) {
    return { numerator: digits * (10n ** BigInt(-scale)), denominator: 1n };
  }
  return { numerator: digits, denominator: 10n ** BigInt(scale) };
}

export function roundTaxToCop(taxableBaseCop: number): number {
  if (!Number.isFinite(taxableBaseCop) || taxableBaseCop < 0) {
    throw new RangeError("La base gravable debe ser un importe finito no negativo.");
  }
  const { numerator, denominator } = decimalFraction(taxableBaseCop);
  const taxNumerator = numerator * BigInt(TAX_RATE_PERCENT);
  const rounded = (taxNumerator * 2n + denominator * 100n) / (denominator * 200n);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("El IVA supera el importe máximo seguro en COP.");
  }
  return result;
}

function reason(
  code: QuoteReviewReasonCode,
  message: string,
  serviceCode?: string,
): QuoteReviewReason {
  return serviceCode === undefined ? { code, message } : { code, message, serviceCode };
}

function parseLine(value: unknown, index: number, reasons: QuoteReviewReason[]): QuoteLineInput | null {
  if (!isObject(value)) {
    reasons.push(reason("invalid_input", `El concepto ${index + 1} debe ser un objeto.`));
    return null;
  }
  const unknownFields = Object.keys(value).filter((field) =>
    !["serviceCode", "quantity", "technicalAssessment", "technicalNotes"].includes(field),
  );
  if (unknownFields.length > 0) {
    reasons.push(reason("invalid_input", `El concepto ${index + 1} contiene campos no permitidos.`));
  }
  const serviceCode = value["serviceCode"];
  if (typeof serviceCode !== "string" || !/^[A-Z0-9-]{2,20}$/.test(serviceCode)) {
    reasons.push(reason("invalid_input", `El código del concepto ${index + 1} no es válido.`));
    return null;
  }
  const quantity = value["quantity"];
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    reasons.push(reason("invalid_quantity", `La cantidad de ${serviceCode} debe ser un número positivo.`, serviceCode));
  }
  const assessment = value["technicalAssessment"];
  if (assessment !== undefined
    && assessment !== "complete"
    && assessment !== "incomplete"
    && assessment !== "outside_scope") {
    reasons.push(reason("invalid_input", `La evaluación técnica de ${serviceCode} no es válida.`, serviceCode));
  }
  const technicalNotes = value["technicalNotes"];
  if (technicalNotes !== undefined
    && (typeof technicalNotes !== "string" || technicalNotes.length > MAX_TEXT_LENGTH)) {
    reasons.push(reason("invalid_input", `Las notas técnicas de ${serviceCode} no son válidas.`, serviceCode));
  }
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0
    || (assessment !== undefined
      && assessment !== "complete"
      && assessment !== "incomplete"
      && assessment !== "outside_scope")
    || (technicalNotes !== undefined
      && (typeof technicalNotes !== "string" || technicalNotes.length > MAX_TEXT_LENGTH))) {
    return null;
  }
  return {
    serviceCode,
    quantity,
    ...(assessment === undefined ? {} : { technicalAssessment: assessment as TechnicalAssessment }),
    ...(technicalNotes === undefined ? {} : { technicalNotes: technicalNotes as string }),
  };
}

function validateInput(value: unknown): {
  readonly input: QuoteInput | null;
  readonly reasons: readonly QuoteReviewReason[];
} {
  const reasons: QuoteReviewReason[] = [];
  if (!isObject(value)) {
    return { input: null, reasons: [reason("invalid_input", "La entrada de cotización debe ser un objeto JSON.")] };
  }
  const unknownFields = Object.keys(value).filter((field) =>
    !["requestId", "city", "visitDate", "startTime", "durationMinutes", "urgent", "isHoliday", "lines"].includes(field),
  );
  if (unknownFields.length > 0) {
    reasons.push(reason("invalid_input", `La entrada contiene campos no permitidos: ${unknownFields.join(", ")}.`));
  }

  const requestId = value["requestId"];
  if (typeof requestId !== "string" || requestId.trim() === "") {
    reasons.push(reason("invalid_input", "Debe indicar la solicitud relacionada."));
  }
  const city = value["city"];
  if (city !== "bogota" && city !== "chia") {
    reasons.push(reason("invalid_city", "La ciudad debe ser Bogotá o Chía."));
  }
  const visitDate = value["visitDate"];
  if (!isValidDate(visitDate)) {
    reasons.push(reason("invalid_date", "La fecha de visita debe ser una fecha real con formato AAAA-MM-DD."));
  }
  const startTime = value["startTime"];
  if (!isValidTime(startTime)) {
    reasons.push(reason("invalid_time", "La hora de inicio debe usar el formato HH:MM en horario de 24 horas."));
  }
  const durationMinutes = value["durationMinutes"];
  if (!Number.isSafeInteger(durationMinutes) || (durationMinutes as number) <= 0) {
    reasons.push(reason("invalid_duration", "La duración debe ser un número entero positivo de minutos."));
  }
  const urgent = value["urgent"];
  if (typeof urgent !== "boolean") {
    reasons.push(reason("invalid_input", "Debe indicar si la solicitud es urgente."));
  }
  const isHoliday = value["isHoliday"];
  if (typeof isHoliday !== "boolean") {
    reasons.push(reason("invalid_input", "Debe indicar explícitamente si la fecha es festivo."));
  }
  const rawLines = value["lines"];
  const lines: QuoteLineInput[] = [];
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    reasons.push(reason("invalid_input", "Debe incluir al menos un concepto de servicio."));
  } else {
    rawLines.forEach((line, index) => {
      const parsed = parseLine(line, index, reasons);
      if (parsed !== null) {
        lines.push(parsed);
      }
    });
  }
  if (reasons.length > 0
    || typeof requestId !== "string"
    || requestId.trim() === ""
    || (city !== "bogota" && city !== "chia")
    || !isValidDate(visitDate)
    || !isValidTime(startTime)
    || !Number.isSafeInteger(durationMinutes)
    || typeof urgent !== "boolean"
    || typeof isHoliday !== "boolean"
    || !Array.isArray(rawLines)
    || lines.length !== rawLines.length) {
    return { input: null, reasons };
  }
  return {
    input: {
      requestId: requestId.trim(),
      city: city as QuoteCity,
      visitDate,
      startTime,
      durationMinutes: durationMinutes as number,
      urgent,
      isHoliday,
      lines,
    },
    reasons: [],
  };
}

function blocked(
  requestId: string | null,
  reasons: readonly QuoteReviewReason[],
): QuoteCalculationResult {
  return { kind: "blocked", status: "pending_review", requestId, reasons };
}

export class QuoteService {
  private readonly configuredReferenceDate: string | undefined;

  constructor(
    private readonly catalog: CatalogService,
    private readonly repository: QuoteRepository,
    options: {
      readonly referenceDate?: string;
      readonly now?: () => Date;
      readonly createId?: () => string;
    } = {},
  ) {
    this.configuredReferenceDate = options.referenceDate ?? QUOTE_REFERENCE_DATE;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    if (this.configuredReferenceDate !== undefined && !isValidDate(this.configuredReferenceDate)) {
      throw new Error("MANTIA_QUOTE_REFERENCE_DATE debe ser una fecha real con formato AAAA-MM-DD.");
    }
  }

  private readonly now: () => Date;
  private readonly createId: () => string;

  async calculate(value: unknown): Promise<QuoteCalculationResult> {
    const validation = validateInput(value);
    const requestId = isObject(value) && typeof value["requestId"] === "string"
      ? value["requestId"].trim()
      : null;
    if (validation.input === null) {
      return blocked(requestId, validation.reasons);
    }
    const input = validation.input;
    const reasons: QuoteReviewReason[] = [];
    const date = new Date(`${input.visitDate}T00:00:00.000Z`);
    const weekday = date.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const startMinutes = Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3, 5));
    const endMinutes = startMinutes + input.durationMinutes;
    if (endMinutes >= 24 * 60) {
      reasons.push(reason("crosses_midnight", "La visita cruza la medianoche y requiere revisión manual."));
    }
    if (!isWeekend) {
      if (input.isHoliday) {
        reasons.push(reason("weekday_holiday", "La visita es un festivo entre semana y requiere revisión manual."));
      }
      if (startMinutes < 8 * 60) {
        reasons.push(reason("weekday_before_hours", "El inicio es anterior a las 08:00 entre semana y requiere revisión manual."));
      }
      if (startMinutes >= 18 * 60 || endMinutes > 18 * 60) {
        reasons.push(reason("weekday_outside_hours", "La visita ocurre fuera del horario ordinario o cruza las 18:00; requiere revisión manual."));
      }
    }

    const catalogData = await this.catalog.getCatalog();
    const serviceByCode = new Map(catalogData.services.map((service) => [service.code, service]));
    for (const line of input.lines) {
      const service = serviceByCode.get(line.serviceCode);
      if (service === undefined) {
        reasons.push(reason("service_not_found", `El servicio ${line.serviceCode} no está catalogado.`, line.serviceCode));
        continue;
      }
      if (service.category === "travel") {
        reasons.push(reason("travel_line_not_allowed", "El desplazamiento se agrega automáticamente una sola vez por visita.", line.serviceCode));
      }
      if (line.technicalAssessment === undefined) {
        reasons.push(reason("technical_information_missing", `Falta confirmar la información técnica de ${line.serviceCode}.`, line.serviceCode));
      } else if (line.technicalAssessment === "incomplete") {
        reasons.push(reason("technical_information_incomplete", `La información técnica de ${line.serviceCode} está incompleta.`, line.serviceCode));
      } else if (line.technicalAssessment === "outside_scope") {
        reasons.push(reason("outside_catalog_scope", `El equipo o servicio ${line.serviceCode} está fuera del alcance tarifado.`, line.serviceCode));
      }
    }
    const emissionDate = this.configuredReferenceDate ?? dateInSystemTimeZone(this.now());
    const tariffLookups = await Promise.all(input.lines.map((line) =>
      this.catalog.findTariffOnDate(line.serviceCode, emissionDate),
    ));
    for (let index = 0; index < tariffLookups.length; index += 1) {
      const lookup = tariffLookups[index];
      const line = input.lines[index];
      if (lookup === undefined || line === undefined) {
        continue;
      }
      if (lookup.kind === "no_applicable_tariff") {
        reasons.push(reason("no_applicable_tariff", `No hay tarifa aplicable para ${line.serviceCode} el ${emissionDate}.`, line.serviceCode));
      } else if (lookup.kind === "service_not_found") {
        if (!reasons.some((item) => item.code === "service_not_found" && item.serviceCode === line.serviceCode)) {
          reasons.push(reason("service_not_found", `El servicio ${line.serviceCode} no está catalogado.`, line.serviceCode));
        }
      }
    }
    if (reasons.length > 0) {
      return blocked(input.requestId, reasons);
    }

    const lines: QuoteLineSnapshot[] = [];
    for (let index = 0; index < input.lines.length; index += 1) {
      const inputLine = input.lines[index];
      const lookup = tariffLookups[index];
      if (inputLine === undefined || lookup === undefined || lookup.kind !== "available") {
        return blocked(input.requestId, [reason("no_applicable_tariff", "No fue posible determinar una tarifa aplicable.")]);
      }
      const amountCop = inputLine.quantity * lookup.tariff.amountCop;
      if (!Number.isFinite(amountCop) || amountCop > Number.MAX_SAFE_INTEGER) {
        return blocked(input.requestId, [reason("invalid_quantity", `El importe de ${inputLine.serviceCode} supera el rango seguro.`, inputLine.serviceCode)]);
      }
      const surchargeRatePercent = isWeekend && lookup.service.category === "service"
        ? WEEKEND_SURCHARGE_PERCENT
        : 0;
      const surchargeCop = amountCop * surchargeRatePercent / 100;
      lines.push({
        serviceCode: lookup.service.code,
        description: lookup.service.name,
        unit: lookup.service.unit,
        quantity: inputLine.quantity,
        technicalAssessment: "complete",
        ...(inputLine.technicalNotes === undefined ? {} : { technicalNotes: inputLine.technicalNotes }),
        unitPriceCop: lookup.tariff.amountCop,
        amountCop,
        surchargeRatePercent,
        surchargeCop,
        tariffVersionId: lookup.versionId,
      });
    }

    const travelCode = input.city === "bogota" ? "DES-BOG" : "DES-CHI";
    const travelLookup = await this.catalog.findTariffOnDate(travelCode, emissionDate);
    if (travelLookup.kind !== "available") {
      return blocked(input.requestId, [
        reason("no_applicable_tariff", `No hay tarifa de desplazamiento aplicable para ${input.city} el ${emissionDate}.`, travelCode),
      ]);
    }
    lines.push({
      serviceCode: travelLookup.service.code,
      description: travelLookup.service.name,
      unit: travelLookup.service.unit,
      quantity: 1,
      unitPriceCop: travelLookup.tariff.amountCop,
      amountCop: travelLookup.tariff.amountCop,
      surchargeRatePercent: 0,
      surchargeCop: 0,
      tariffVersionId: travelLookup.versionId,
    });

    const taxableBaseCop = lines.reduce((total, line) => total + line.amountCop + line.surchargeCop, 0);
    if (!Number.isFinite(taxableBaseCop) || taxableBaseCop > Number.MAX_SAFE_INTEGER) {
      return blocked(input.requestId, [reason("invalid_quantity", "La base gravable supera el rango seguro de cálculo.")]);
    }
    const taxCop = roundTaxToCop(taxableBaseCop);
    const quote: QuoteDraft = {
      id: this.createId(),
      requestId: input.requestId,
      status: "calculated",
      emissionDate,
      expirationDate: addCalendarDays(emissionDate, 14),
      city: input.city,
      visitDate: input.visitDate,
      startTime: input.startTime,
      endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
      durationMinutes: input.durationMinutes,
      urgent: input.urgent,
      isHoliday: input.isHoliday,
      lines,
      taxableBaseCop,
      taxRatePercent: TAX_RATE_PERCENT,
      taxCop,
      totalCop: taxableBaseCop + taxCop,
      previousRevisionId: null,
      reviewReasons: [],
    };
    return { kind: "calculated", quote };
  }

  async issue(result: QuoteCalculationResult): Promise<IssuedQuote> {
    if (result.kind === "blocked") {
      throw new Error("No se puede emitir una cotización que requiere revisión manual.");
    }
    const issuedAt = this.now().toISOString();
    const issued = {
      ...result.quote,
      status: "issued" as const,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    };
    await this.repository.append(issued);
    return issued;
  }
}
