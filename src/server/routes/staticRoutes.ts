import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { INDEX_FILE, LOGIN_FILE, STATIC_MOUNTS } from "../config";

/** Extensiones públicas permitidas. Todo lo demás (.ts, .map, .json, ...) se rechaza. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function getMimeType(filePath: string): string | undefined {
  const extension = extname(filePath).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MIME_TYPES, extension)
    ? MIME_TYPES[extension]
    : undefined;
}

/**
 * Un segmento es seguro si no está vacío, no empieza por punto
 * (bloquea ".", ".." y archivos ocultos) y no contiene separadores ni bytes nulos.
 */
function isSafeRelativePath(relativePath: string): boolean {
  if (relativePath === "" || relativePath.includes("\0") || relativePath.includes("\\")) {
    return false;
  }
  return relativePath
    .split("/")
    .every((segment) => segment !== "" && !segment.startsWith("."));
}

/**
 * Traduce una ruta URL ya decodificada a un archivo del disco permitido.
 * Devuelve null si la ruta no está en la lista blanca. No toca el sistema de archivos.
 */
export function resolveStaticPath(pathname: string): string | null {
  if (pathname === "/" || pathname === "/index.html") {
    return INDEX_FILE;
  }
  if (pathname === "/login" || pathname === "/login.html"
    || pathname === "/setup" || pathname === "/setup.html") {
    return LOGIN_FILE;
  }

  const mount = STATIC_MOUNTS.find((candidate) => pathname.startsWith(candidate.urlPrefix));
  if (mount === undefined) {
    return null;
  }

  const relativePath = pathname.slice(mount.urlPrefix.length);
  if (!isSafeRelativePath(relativePath)) {
    return null;
  }

  const filePath = resolve(mount.directory, relativePath);
  if (!filePath.startsWith(mount.directory + sep)) {
    return null;
  }

  return getMimeType(filePath) === undefined ? null : filePath;
}

/** Comprueba que, tras resolver enlaces simbólicos, el archivo sigue dentro de su montaje. */
async function isInsideMount(filePath: string): Promise<boolean> {
  if (filePath === INDEX_FILE || filePath === LOGIN_FILE) {
    return true;
  }
  const mount = STATIC_MOUNTS.find((candidate) => filePath.startsWith(candidate.directory + sep));
  if (mount === undefined) {
    return false;
  }
  const [realFile, realDirectory] = await Promise.all([
    realpath(filePath),
    realpath(mount.directory),
  ]);
  return realFile.startsWith(realDirectory + sep);
}

function sendText(res: ServerResponse, statusCode: number, message: string, extra?: Record<string, string>): void {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    ...extra,
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message),
  });
  res.end(message);
}

function isNotFoundError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Atiende solicitudes GET/HEAD de archivos estáticos.
 * Lanza el error original solo ante fallos inesperados; el servidor responde 500.
 */
export async function handleStaticRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Método no permitido.", { Allow: "GET, HEAD" });
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    sendText(res, 400, "Solicitud no válida.");
    return;
  }

  const filePath = resolveStaticPath(pathname);
  if (filePath === null) {
    sendText(res, 404, "Recurso no encontrado.");
    return;
  }

  let size: number;
  try {
    if (!(await isInsideMount(filePath))) {
      sendText(res, 404, "Recurso no encontrado.");
      return;
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendText(res, 404, "Recurso no encontrado.");
      return;
    }
    size = fileStat.size;
  } catch (error) {
    if (isNotFoundError(error)) {
      sendText(res, 404, "Recurso no encontrado.");
      return;
    }
    throw error;
  }

  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": getMimeType(filePath) ?? "application/octet-stream",
    "Content-Length": String(size),
    "Cache-Control": "no-cache",
  };

  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.once("open", () => {
    res.writeHead(200, headers);
    stream.pipe(res);
  });
  stream.once("error", (error) => {
    console.error("Error al leer un archivo estático:", error);
    if (res.headersSent) {
      res.destroy();
    } else {
      sendText(res, 500, "Error interno del servidor.");
    }
  });
}
