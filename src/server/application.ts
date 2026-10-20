import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAuthRoutes } from "./routes/authRoutes";
import { handleCatalogRoutes } from "./routes/catalogRoutes";
import { defaultQuoteHandler, type QuoteRequestHandler } from "./routes/quoteRoutes";
import { handleRequestRoutes } from "./routes/requestRoutes";
import { handleStaticRequest } from "./routes/staticRoutes";
import type { AuthService } from "./services/authService";

function sendUnauthorized(res: ServerResponse): void {
  const body = JSON.stringify({ error: "Inicie sesión para continuar." });
  res.writeHead(401, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

export function handleApplicationRequest(
  req: IncomingMessage,
  res: ServerResponse,
  auth: AuthService,
  quoteHandler: QuoteRequestHandler = defaultQuoteHandler,
): Promise<void> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname.startsWith("/api/auth/")) {
    return handleAuthRoutes(req, res, auth);
  }
  if (pathname.startsWith("/api/") && !auth.isAuthenticated(req)) {
    sendUnauthorized(res);
    return Promise.resolve();
  }
  if (pathname === "/api/quotes" || pathname.startsWith("/api/quotes/")) {
    return quoteHandler(req, res).then(() => undefined);
  }
  const entryPath = pathname === "/"
    || pathname === "/index.html"
    || pathname === "/login"
    || pathname === "/login.html"
    || pathname === "/setup"
    || pathname === "/setup.html";
  if (entryPath && !auth.isAuthenticated(req)) {
    const entryPage = auth.isConfigured() ? "/login" : "/setup";
    const requestedSetup = pathname === "/setup" || pathname === "/setup.html";
    const requestedLogin = pathname === "/login" || pathname === "/login.html";
    if (
      pathname === "/"
      || pathname === "/index.html"
      || (auth.isConfigured() && requestedSetup)
      || (!auth.isConfigured() && requestedLogin)
    ) {
      redirect(res, entryPage);
      return Promise.resolve();
    }
  } else if (
    auth.isAuthenticated(req)
    && (pathname === "/login" || pathname === "/login.html" || pathname === "/setup" || pathname === "/setup.html")
  ) {
    redirect(res, "/");
    return Promise.resolve();
  }

  if (pathname.startsWith("/api/requests")) {
    return handleRequestRoutes(req, res);
  }
  if (pathname === "/api/catalog" || pathname.startsWith("/api/catalog/")) {
    return handleCatalogRoutes(req, res);
  }
  return handleStaticRequest(req, res);
}

export function handleApplicationRequestSafely(
  req: IncomingMessage,
  res: ServerResponse,
  auth: AuthService,
  quoteHandler: QuoteRequestHandler = defaultQuoteHandler,
): void {
  handleApplicationRequest(req, res, auth, quoteHandler).catch((error: unknown) => {
    console.error("Error no controlado al atender la solicitud:", error);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const message = "Error interno del servidor.";
    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": Buffer.byteLength(message),
      "X-Content-Type-Options": "nosniff",
    });
    res.end(message);
  });
}
