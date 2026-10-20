import { readFile } from "node:fs/promises";
import {
  SERVICE_UNITS,
  type CatalogData,
  type ServiceCategory,
  type ServiceDefinition,
  type ServiceTariff,
  type ServiceUnit,
  type TariffVersion,
} from "../../shared/models/catalog";

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

function parseServices(value: unknown): ServiceDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("El archivo de servicios debe contener una lista.");
  }
  const codes = new Set<string>();
  return value.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`El servicio en la posición ${index} no es un objeto.`);
    }
    const { code, name, unit, category } = item;
    if (typeof code !== "string" || !/^[A-Z0-9-]{2,20}$/.test(code) || codes.has(code)) {
      throw new Error(`El código del servicio en la posición ${index} es inválido o está duplicado.`);
    }
    if (typeof name !== "string" || name.trim() === "" || name.length > 200) {
      throw new Error(`El nombre del servicio ${code} no es válido.`);
    }
    if (typeof unit !== "string" || !SERVICE_UNITS.includes(unit as ServiceUnit)) {
      throw new Error(`La unidad del servicio ${code} no es válida.`);
    }
    if (category !== "service" && category !== "travel") {
      throw new Error(`La categoría del servicio ${code} no es válida.`);
    }
    codes.add(code);
    return {
      code,
      name: name.trim(),
      unit: unit as ServiceUnit,
      category: category as ServiceCategory,
    };
  });
}

function parseTariffVersions(value: unknown, serviceCodes: ReadonlySet<string>): TariffVersion[] {
  if (!Array.isArray(value)) {
    throw new Error("El archivo de versiones tarifarias debe contener una lista.");
  }
  const versionIds = new Set<string>();
  const versions = value.map((item, index): TariffVersion => {
    if (!isObject(item)) {
      throw new Error(`La versión tarifaria en la posición ${index} no es un objeto.`);
    }
    const { id, validFrom, validThrough, tariffs } = item;
    if (typeof id !== "string" || id.trim() === "" || versionIds.has(id)) {
      throw new Error(`El identificador de versión en la posición ${index} es inválido o está duplicado.`);
    }
    if (!isValidDate(validFrom) || !isValidDate(validThrough) || validFrom > validThrough) {
      throw new Error(`La vigencia de la versión ${id} no es válida.`);
    }
    if (!Array.isArray(tariffs) || tariffs.length === 0) {
      throw new Error(`La versión ${id} debe contener al menos una tarifa.`);
    }
    const tariffCodes = new Set<string>();
    const parsedTariffs = tariffs.map((tariff, tariffIndex): ServiceTariff => {
      if (!isObject(tariff)) {
        throw new Error(`La tarifa ${tariffIndex} de la versión ${id} no es un objeto.`);
      }
      const { serviceCode, amountCop } = tariff;
      if (typeof serviceCode !== "string" || !serviceCodes.has(serviceCode)) {
        throw new Error(`La tarifa ${tariffIndex} de la versión ${id} referencia un servicio inexistente.`);
      }
      if (tariffCodes.has(serviceCode)) {
        throw new Error(`La versión ${id} contiene más de una tarifa para ${serviceCode}.`);
      }
      if (!Number.isSafeInteger(amountCop) || (amountCop as number) <= 0) {
        throw new Error(`El importe de ${serviceCode} en la versión ${id} debe ser un entero positivo en COP.`);
      }
      tariffCodes.add(serviceCode);
      return { serviceCode, amountCop: amountCop as number };
    });
    versionIds.add(id);
    return {
      id,
      validFrom,
      validThrough,
      tariffs: parsedTariffs,
    };
  });

  for (let firstIndex = 0; firstIndex < versions.length; firstIndex += 1) {
    const first = versions[firstIndex];
    if (first === undefined) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < versions.length; secondIndex += 1) {
      const second = versions[secondIndex];
      if (second === undefined) {
        continue;
      }
      const hasOverlappingService = first.tariffs.some((firstTariff) =>
        second.tariffs.some((secondTariff) => firstTariff.serviceCode === secondTariff.serviceCode),
      );
      if (
        hasOverlappingService
        && first.validFrom <= second.validThrough
        && second.validFrom <= first.validThrough
      ) {
        throw new Error(`Las versiones ${first.id} y ${second.id} tienen vigencias solapadas.`);
      }
    }
  }
  return versions;
}

async function readJson(filePath: string, label: string): Promise<unknown> {
  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`No se pudo leer ${label} (${filePath}).`, { cause: error });
  }
  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`${label} contiene JSON inválido.`, { cause: error });
  }
}

export class JsonCatalogRepository {
  constructor(
    private readonly servicesFilePath: string,
    private readonly tariffVersionsFilePath: string,
  ) {}

  async load(): Promise<CatalogData> {
    const [rawServices, rawVersions] = await Promise.all([
      readJson(this.servicesFilePath, "El catálogo de servicios"),
      readJson(this.tariffVersionsFilePath, "El catálogo de tarifas"),
    ]);
    const services = parseServices(rawServices);
    const serviceCodes = new Set(services.map((service) => service.code));
    const tariffVersions = parseTariffVersions(rawVersions, serviceCodes);
    return { services, tariffVersions };
  }
}
