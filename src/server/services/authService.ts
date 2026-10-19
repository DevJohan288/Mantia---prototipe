import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { dirname } from "node:path";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "../config";

interface StoredUser {
  username: string;
  salt: string;
  passwordHash: string;
}

const PASSWORD_HASH_LENGTH = 64;

export class AccountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountValidationError";
  }
}

function derivePasswordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_HASH_LENGTH, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function readSessionToken(req: IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader === undefined) {
    return null;
  }
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }
    return cookie.slice(separator + 1).trim();
  }
  return null;
}

export class AuthService {
  private user: StoredUser | null = null;
  private readonly sessions = new Map<string, number>();
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(
    private readonly userFilePath: string,
    private readonly now: () => number = Date.now,
  ) {}

  async initialize(): Promise<void> {
    let contents: string;
    try {
      contents = await readFile(this.userFilePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.user = null;
        return;
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents) as unknown;
    } catch (error) {
      throw new Error("El archivo local de usuario contiene JSON inválido.", { cause: error });
    }
    if (!this.isStoredUser(parsed)) {
      throw new Error("El archivo local de usuario no tiene el formato esperado.");
    }
    this.user = parsed;
  }

  isConfigured(): boolean {
    return this.user !== null;
  }

  async createAccount(username: unknown, password: unknown): Promise<string | null> {
    return this.serialize(async () => {
      if (this.user !== null) {
        return null;
      }
      const normalizedUsername = this.validateUsername(username);
      const validPassword = this.validatePassword(password);
      const salt = randomBytes(16).toString("base64url");
      const passwordHash = (await derivePasswordHash(validPassword, salt)).toString("base64url");
      const user: StoredUser = { username: normalizedUsername, salt, passwordHash };
      await this.writeUser(user);
      this.user = user;
      return this.createSession();
    });
  }

  async authenticate(username: unknown, password: unknown): Promise<string | null> {
    const user = this.user;
    if (
      user === null
      || typeof username !== "string"
      || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())
      || typeof password !== "string"
      || password.length > 128
    ) {
      return null;
    }
    const candidateHash = await derivePasswordHash(password, user.salt);
    const expectedHash = Buffer.from(user.passwordHash, "base64url");
    const usernameMatches = username.trim().toLowerCase() === user.username.toLowerCase();
    const passwordMatches = expectedHash.length === candidateHash.length
      && timingSafeEqual(candidateHash, expectedHash);
    if (!usernameMatches || !passwordMatches) {
      return null;
    }
    return this.createSession();
  }

  private createSession(): string {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, this.now() + SESSION_DURATION_SECONDS * 1000);
    return token;
  }

  private validateUsername(value: unknown): string {
    if (typeof value !== "string") {
      throw new AccountValidationError("El nombre de usuario es obligatorio.");
    }
    const username = value.trim();
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      throw new AccountValidationError("El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.");
    }
    return username;
  }

  private validatePassword(value: unknown): string {
    if (typeof value !== "string" || value.length < 8 || value.length > 128) {
      throw new AccountValidationError("La contraseña debe tener entre 8 y 128 caracteres.");
    }
    return value;
  }

  private isStoredUser(value: unknown): value is StoredUser {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record["username"] === "string"
      && /^[a-zA-Z0-9._-]{3,40}$/.test(record["username"])
      && typeof record["salt"] === "string"
      && Buffer.from(record["salt"], "base64url").length === 16
      && typeof record["passwordHash"] === "string"
      && Buffer.from(record["passwordHash"], "base64url").length === PASSWORD_HASH_LENGTH;
  }

  private async writeUser(user: StoredUser): Promise<void> {
    await mkdir(dirname(this.userFilePath), { recursive: true });
    const temporaryPath = `${this.userFilePath}.${randomBytes(12).toString("hex")}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(user, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, this.userFilePath);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingOperation.then(operation);
    this.pendingOperation = result.then(() => undefined, () => undefined);
    return result;
  }

  isAuthenticated(req: IncomingMessage): boolean {
    const token = readSessionToken(req);
    if (token === null) {
      return false;
    }
    const expiresAt = this.sessions.get(token);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= this.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  logout(req: IncomingMessage): void {
    const token = readSessionToken(req);
    if (token !== null) {
      this.sessions.delete(token);
    }
  }
}
