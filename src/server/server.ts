import { createServer } from "node:http";
import { AUTH_USER_FILE, DEFAULT_PORT } from "./config";
import { handleApplicationRequestSafely } from "./application";
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
    handleApplicationRequestSafely(req, res, auth);
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
