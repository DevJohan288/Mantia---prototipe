import { resolve } from "node:path";

/**
 * Raíz del proyecto. Este archivo se compila a dist/server/config.js,
 * por lo que la raíz está dos niveles por encima.
 */
export const PROJECT_ROOT: string = resolve(__dirname, "..", "..");

export const DEFAULT_PORT = 3000;
export const REQUESTS_FILE: string = resolve(PROJECT_ROOT, "data", "requests", "requests.json");
export const AUTH_USER_FILE: string = resolve(PROJECT_ROOT, "data", "auth", "user.json");
export const SESSION_COOKIE_NAME = "mantia_session";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;

/** Páginas HTML permitidas, servidas por ruta exacta y nunca como directorio. */
export const INDEX_FILE: string = resolve(PROJECT_ROOT, "src", "client", "index.html");
export const LOGIN_FILE: string = resolve(PROJECT_ROOT, "src", "client", "login.html");

export interface StaticMount {
  /** Prefijo de URL, siempre con barra inicial y final. */
  readonly urlPrefix: string;
  /** Directorio absoluto del que se pueden servir archivos. */
  readonly directory: string;
}

/**
 * Lista blanca de carpetas públicas. Cualquier ruta fuera de estos montajes
 * (src, data, node_modules, dist/server, archivos de configuración...) responde 404.
 */
export const STATIC_MOUNTS: readonly StaticMount[] = [
  { urlPrefix: "/css/", directory: resolve(PROJECT_ROOT, "public", "css") },
  { urlPrefix: "/assets/", directory: resolve(PROJECT_ROOT, "public", "assets") },
  { urlPrefix: "/js/", directory: resolve(PROJECT_ROOT, "dist", "client", "scripts") },
];
