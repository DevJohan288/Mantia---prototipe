import { createServer } from "node:http";
import { DEFAULT_PORT } from "./config";
import { handleRequestRoutes } from "./routes/requestRoutes";
import { handleStaticRequest } from "./routes/staticRoutes";

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

let port: number;
try {
  port = readPort();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const server = createServer((req, res) => {
  const requestHandler = req.url?.startsWith("/api/requests")
    ? handleRequestRoutes(req, res)
    : handleStaticRequest(req, res);
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

server.listen(port, () => {
  console.log(`Mantia disponible en http://localhost:${port}`);
});
