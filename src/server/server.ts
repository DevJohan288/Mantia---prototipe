import { createServer } from "node:http";
import { DEFAULT_PORT } from "./config";
import { handleAuthRoutes } from "./routes/authRoutes";
import { handleRequestRoutes } from "./routes/requestRoutes";
import { handleStaticRequest } from "./routes/staticRoutes";
import { AUTH_USER_FILE } from "./config";
import { AuthService } from "./services/authService";

function readPort(): number {
  const raw = process.env["PORT"];
  if (raw === undefined || raw === "") {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`El valor de PORT no es válido: "${raw}".`);
  }
  return port;
}

async function startServer(): Promise<void> {
  const port = readPort();
  const auth = new AuthService(AUTH_USER_FILE);
  await auth.initialize();
  const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  let requestHandler: Promise<void>;
  if (pathname.startsWith("/api/auth/")) {
    requestHandler = handleAuthRoutes(req, res, auth);
  } else if (pathname.startsWith("/api/") && !auth.isAuthenticated(req)) {
    const body = JSON.stringify({ error: "Inicie sesión para continuar." });
    res.writeHead(401, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
    return;
  } else if (
    (pathname === "/" || pathname === "/index.html" || pathname === "/login" || pathname === "/login.html" || pathname === "/setup" || pathname === "/setup.html")
    && !auth.isAuthenticated(req)
  ) {
    const entryPage = auth.isConfigured() ? "/login" : "/setup";
    const requestedSetup = pathname === "/setup" || pathname === "/setup.html";
    const requestedLogin = pathname === "/login" || pathname === "/login.html";
    if ((auth.isConfigured() && requestedSetup) || (!auth.isConfigured() && requestedLogin) || pathname === "/" || pathname === "/index.html") {
      res.writeHead(303, { Location: entryPage, "Cache-Control": "no-store" });
      res.end();
      return;
    }
    requestHandler = handleStaticRequest(req, res);
  } else if (auth.isAuthenticated(req) && (pathname === "/login" || pathname === "/login.html" || pathname === "/setup" || pathname === "/setup.html")) {
    res.writeHead(303, { Location: "/", "Cache-Control": "no-store" });
    res.end();
    return;
  } else if (pathname.startsWith("/api/requests")) {
    requestHandler = handleRequestRoutes(req, res);
  } else {
    requestHandler = handleStaticRequest(req, res);
  }
  requestHandler.catch((error: unknown) => {
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
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`El puerto ${port} ya está en uso. Cierra el otro proceso o define PORT.`);
    } else {
      console.error("No se pudo iniciar el servidor:", error);
    }
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Mantia disponible en http://127.0.0.1:${port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("No se pudo iniciar Mantia:", error instanceof Error ? error.message : error);
  process.exit(1);
});
