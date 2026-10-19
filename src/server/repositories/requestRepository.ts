import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RequestInput, RequestRecord, RequestStatus } from "../../shared/models/request";

export interface RequestRepository {
  list(): Promise<RequestRecord[]>;
  create(input: RequestInput): Promise<RequestRecord>;
  updateReview(
    id: string,
    review: { status: RequestStatus; notes: string },
  ): Promise<RequestRecord | null>;
}

function isRequestStatus(value: unknown): value is RequestStatus {
  return value === "pending_review"
    || value === "needs_information"
    || value === "approved"
    || value === "rejected";
}

function isRequestRecord(value: unknown): value is RequestRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record["id"] === "string"
    && typeof record["customerName"] === "string"
    && (typeof record["contactEmail"] === "string" || record["contactEmail"] === null)
    && (typeof record["contactPhone"] === "string" || record["contactPhone"] === null)
    && typeof record["serviceDescription"] === "string"
    && typeof record["serviceAddress"] === "string"
    && (typeof record["preferredDate"] === "string" || record["preferredDate"] === null)
    && isRequestStatus(record["status"])
    && typeof record["reviewNotes"] === "string"
    && typeof record["createdAt"] === "string"
    && typeof record["updatedAt"] === "string";
}

export class JsonRequestRepository implements RequestRepository {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async list(): Promise<RequestRecord[]> {
    return this.serialize(async () => this.readAll());
  }

  async create(input: RequestInput): Promise<RequestRecord> {
    return this.serialize(async () => {
      const requests = await this.readAll();
      const now = new Date().toISOString();
      const request: RequestRecord = {
        ...input,
        id: randomUUID(),
        status: "pending_review",
        reviewNotes: "",
        createdAt: now,
        updatedAt: now,
      };
      requests.push(request);
      await this.writeAll(requests);
      return request;
    });
  }

  async updateReview(
    id: string,
    review: { status: RequestStatus; notes: string },
  ): Promise<RequestRecord | null> {
    return this.serialize(async () => {
      const requests = await this.readAll();
      const index = requests.findIndex((request) => request.id === id);
      if (index === -1) {
        return null;
      }
      const existing = requests[index];
      if (existing === undefined) {
        return null;
      }
      const updated: RequestRecord = {
        ...existing,
        status: review.status,
        reviewNotes: review.notes,
        updatedAt: new Date().toISOString(),
      };
      requests[index] = updated;
      await this.writeAll(requests);
      return updated;
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingWrite.then(operation);
    this.pendingWrite = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readAll(): Promise<RequestRecord[]> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents) as unknown;
    } catch (error) {
      throw new Error("El archivo local de solicitudes contiene JSON inválido.", { cause: error });
    }
    if (!Array.isArray(parsed) || !parsed.every(isRequestRecord)) {
      throw new Error("El archivo local de solicitudes no tiene el formato esperado.");
    }
    return parsed;
  }

  private async writeAll(requests: RequestRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(requests, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, this.filePath);
  }
}
