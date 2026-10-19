import type { IncomingMessage, ServerResponse } from "node:http";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "../config";
import { AccountValidationError, AuthService } from "../services/authService";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const MAX_BODY_BYTES = 8 * 1024;

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readCredentials(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("El contenido debe enviarse como application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("El cuerpo supera el tamaño máximo permitido.");
    }
    chunks.push(buffer);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("El cuerpo no contiene JSON válido.", { cause: error });
    }
    throw error;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("El cuerpo debe ser un objeto JSON.");
  }
  const values = payload as Record<string, unknown>;
  if (Object.keys(values).some((key) => !["username", "password", "confirmPassword"].includes(key))) {
    throw new Error("La solicitud contiene campos no permitidos.");
  }
  return values;
}

function setSessionCookie(res: ServerResponse, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}`,
  );
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

async function readCredentialsOrRespond(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  try {
    return await readCredentials(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Solicitud de acceso inválida." });
    return null;
  }
}

export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  auth: AuthService,
): Promise<void> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname === "/api/auth/session" && req.method === "GET") {
    sendJson(res, 200, {
      configured: auth.isConfigured(),
      authenticated: auth.isAuthenticated(req),
    });
    return;
  }
  if (pathname === "/api/auth/setup" && req.method === "POST") {
    const values = await readCredentialsOrRespond(req, res);
    if (values === null) {
      return;
    }
    if (values["confirmPassword"] !== values["password"]) {
      sendJson(res, 400, { error: "Las contraseñas no coinciden." });
      return;
    }
    let token: string | null;
    try {
      token = await auth.createAccount(values["username"], values["password"]);
    } catch (error) {
      if (error instanceof AccountValidationError) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      throw error;
    }
    if (token === null) {
      sendJson(res, 409, { error: "El usuario ya está creado. Inicie sesión." });
      return;
    }
    setSessionCookie(res, token);
    sendJson(res, 201, { configured: true, authenticated: true });
    return;
  }
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const values = await readCredentialsOrRespond(req, res);
    if (values === null) {
      return;
    }
    const token = await auth.authenticate(values["username"], values["password"]);
    if (token === null) {
      sendJson(res, 401, { error: "El usuario o la contraseña no son correctos." });
      return;
    }
    setSessionCookie(res, token);
    sendJson(res, 200, { authenticated: true });
    return;
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    auth.logout(req);
    clearSessionCookie(res);
    sendJson(res, 200, { authenticated: false });
    return;
  }
  res.writeHead(405, { ...SECURITY_HEADERS, Allow: "GET, POST" });
  res.end();
}
