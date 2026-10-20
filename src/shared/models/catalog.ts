export const SERVICE_UNITS = [
  "equipment",
  "square_meter",
  "unit",
  "point",
  "visit",
] as const;

export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export type ServiceCategory = "service" | "travel";

export interface ServiceDefinition {
  readonly code: string;
  readonly name: string;
  readonly unit: ServiceUnit;
  readonly category: ServiceCategory;
}

export interface ServiceTariff {
  readonly serviceCode: string;
  readonly amountCop: number;
}

export interface TariffVersion {
  readonly id: string;
  readonly validFrom: string;
  readonly validThrough: string;
  readonly tariffs: readonly ServiceTariff[];
}

export interface CatalogData {
  readonly services: readonly ServiceDefinition[];
  readonly tariffVersions: readonly TariffVersion[];
}

export type TariffLookupResult =
  | {
      readonly kind: "available";
      readonly service: ServiceDefinition;
      readonly tariff: ServiceTariff;
      readonly versionId: string;
    }
  | {
      readonly kind: "service_not_found";
      readonly serviceCode: string;
    }
  | {
      readonly kind: "no_applicable_tariff";
      readonly service: ServiceDefinition;
      readonly date: string;
    };
