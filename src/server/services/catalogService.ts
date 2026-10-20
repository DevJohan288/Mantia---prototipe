import type {
  CatalogData,
  TariffLookupResult,
} from "../../shared/models/catalog";
import { JsonCatalogRepository } from "../repositories/catalogRepository";

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

export class CatalogService {
  constructor(private readonly repository: JsonCatalogRepository) {}

  getCatalog(): Promise<CatalogData> {
    return this.repository.load();
  }

  async findTariffOnDate(serviceCode: string, date: string): Promise<TariffLookupResult> {
    if (!this.isValidDate(date)) {
      throw new CatalogValidationError("La fecha de consulta debe ser una fecha real con formato AAAA-MM-DD.");
    }
    const catalog = await this.repository.load();
    const service = catalog.services.find((item) => item.code === serviceCode);
    if (service === undefined) {
      return { kind: "service_not_found", serviceCode };
    }
    const applicableVersions = catalog.tariffVersions.filter((version) =>
      date >= version.validFrom && date <= version.validThrough
      && version.tariffs.some((tariff) => tariff.serviceCode === serviceCode),
    );
    if (applicableVersions.length === 0) {
      return { kind: "no_applicable_tariff", service, date };
    }
    if (applicableVersions.length > 1) {
      throw new Error(`Hay más de una tarifa aplicable para ${serviceCode} en ${date}.`);
    }
    const version = applicableVersions[0];
    if (version === undefined) {
      throw new Error("No se pudo determinar la versión tarifaria aplicable.");
    }
    const tariff = version.tariffs.find((item) => item.serviceCode === serviceCode);
    if (tariff === undefined) {
      throw new Error(`La versión ${version.id} no contiene la tarifa esperada para ${serviceCode}.`);
    }
    return { kind: "available", service, tariff, versionId: version.id };
  }

  private isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
}
