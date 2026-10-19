/**
 * Navegación del cliente de Mantia.
 *
 * Este archivo se carga como script clásico del navegador: no tiene import/export
 * porque el proyecto compila a CommonJS y no se usa bundler. Todo vive en una IIFE
 * para no contaminar el ámbito global.
 *
 * Mejora progresiva: sin JavaScript todas las secciones permanecen visibles y los
 * enlaces del menú funcionan como anclas. Con JavaScript solo se muestra la vista activa.
 */
(() => {
  const DEFAULT_VIEW = "panel";
  const APP_NAME = "Mantia";

  const views = Array.from(document.querySelectorAll<HTMLElement>("[data-view]"));
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-nav]"));

  if (views.length === 0) {
    console.error(`${APP_NAME}: no se encontraron vistas en la página.`);
    return;
  }

  const viewIds = new Set(views.map((view) => view.dataset["view"] ?? ""));

  function safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }

  /**
   * Devuelve el id de la vista indicada por el hash de la URL.
   * Devuelve null si el hash apunta a otro elemento de la página (por ejemplo, el enlace
   * "Saltar al contenido"), en cuyo caso la vista actual no debe cambiar.
   */
  function resolveViewFromHash(): string | null {
    const id = safeDecode(window.location.hash.slice(1));
    if (id === "" || !viewIds.has(id)) {
      return id !== "" && document.getElementById(id) !== null ? null : DEFAULT_VIEW;
    }
    return id;
  }

  function showView(viewId: string, moveFocus: boolean): void {
    const active = views.find((view) => view.dataset["view"] === viewId) ?? views[0];
    if (active === undefined) {
      return;
    }
    const activeId = active.dataset["view"] ?? DEFAULT_VIEW;

    for (const view of views) {
      view.hidden = view !== active;
    }

    for (const link of navLinks) {
      if (link.dataset["nav"] === activeId) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }

    const heading = active.querySelector<HTMLElement>("h2");
    const headingText = heading?.textContent?.trim() ?? "";
    document.title = headingText === "" ? APP_NAME : `${headingText} · ${APP_NAME}`;

    if (moveFocus) {
      heading?.focus();
    }
  }

  window.addEventListener("hashchange", () => {
    const viewId = resolveViewFromHash();
    if (viewId !== null) {
      showView(viewId, true);
    }
  });

  showView(resolveViewFromHash() ?? DEFAULT_VIEW, false);
})();
