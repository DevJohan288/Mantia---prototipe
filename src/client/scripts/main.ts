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
  type RequestStatus = "pending_review" | "needs_information" | "approved" | "rejected";
  interface RequestRecord {
    id: string;
    customerName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    serviceDescription: string;
    serviceAddress: string;
    preferredDate: string | null;
    status: RequestStatus;
    reviewNotes: string;
    createdAt: string;
    updatedAt: string;
  }
  interface CatalogService {
    code: string;
    name: string;
    unit: "equipment" | "square_meter" | "unit" | "point" | "visit";
    category: "service" | "travel";
  }
  interface CatalogTariff {
    serviceCode: string;
    amountCop: number;
  }
  interface CatalogTariffVersion {
    id: string;
    validFrom: string;
    validThrough: string;
    tariffs: CatalogTariff[];
  }
  interface CatalogData {
    services: CatalogService[];
    tariffVersions: CatalogTariffVersion[];
  }
  type QuoteCity = "bogota" | "chia";
  type TechnicalAssessment = "complete" | "incomplete" | "outside_scope";
  interface QuoteLineInput {
    serviceCode: string;
    quantity: number;
    technicalAssessment: TechnicalAssessment;
    technicalNotes?: string;
  }
  interface QuoteInput {
    requestId: string;
    city: QuoteCity;
    visitDate: string;
    startTime: string;
    durationMinutes: number;
    urgent: boolean;
    isHoliday: boolean;
    lines: QuoteLineInput[];
  }
  interface QuoteLineSnapshot extends QuoteLineInput {
    description: string;
    unit: string;
    unitPriceCop: number;
    amountCop: number;
    surchargeRatePercent: number;
    surchargeCop: number;
    tariffVersionId: string;
  }
  interface QuoteView {
    id: string;
    requestId: string;
    status: "calculated" | "issued";
    emissionDate: string;
    expirationDate: string;
    city: QuoteCity;
    visitDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    urgent: boolean;
    isHoliday: boolean;
    lines: QuoteLineSnapshot[];
    taxableBaseCop: number;
    taxRatePercent: 19;
    taxCop: number;
    totalCop: number;
    previousRevisionId: string | null;
    reviewReasons: [];
    createdAt?: string;
    updatedAt?: string;
  }
  interface QuoteCalculationResult {
    kind: "calculated" | "blocked";
    quote?: QuoteView;
    status?: "pending_review";
    requestId?: string | null;
    reasons?: Array<{ code: string; message: string; serviceCode?: string }>;
  }
  type TariffLookupResult =
    | {
        kind: "available";
        service: CatalogService;
        tariff: CatalogTariff;
        versionId: string;
      }
    | { kind: "service_not_found"; serviceCode: string }
    | { kind: "no_applicable_tariff"; service: CatalogService; date: string };
  const UNIT_LABELS: Record<CatalogService["unit"], string> = {
    equipment: "equipo",
    square_meter: "m²",
    unit: "unidad",
    point: "punto",
    visit: "visita",
  };
  const STATUS_LABELS: Record<RequestStatus, string> = {
    pending_review: "Pendiente de revisión",
    needs_information: "Requiere información",
    approved: "Aprobada para cotizar",
    rejected: "Rechazada",
  };

  const views = Array.from(document.querySelectorAll<HTMLElement>("[data-view]"));
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-nav]"));
  let quoteCatalog: CatalogData | null = null;
  let currentQuoteProposal: QuoteView | null = null;
  let calculatedInputSnapshot = "";

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

  function setMessage(elementId: string, message: string, isError = false): void {
    const element = document.getElementById(elementId);
    if (element !== null) {
      element.textContent = message;
      element.classList.toggle("is-error", isError);
    }
  }

  async function requestApi<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, options);
    const result: unknown = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        window.location.assign("/login");
      }
      const message = typeof result === "object" && result !== null && "error" in result
        ? String(result.error)
        : "No se pudo completar la operación.";
      throw new Error(message);
    }
    return result as T;
  }

  function createRequestCard(request: RequestRecord, reviewMode: boolean): HTMLElement {
    const article = document.createElement("article");
    article.className = "request-card";

    const heading = document.createElement("div");
    heading.className = "card-head";
    const title = document.createElement("h4");
    title.textContent = request.customerName;
    const status = document.createElement("span");
    status.className = "badge";
    status.textContent = STATUS_LABELS[request.status];
    heading.append(title, status);
    article.append(heading);

    const details = document.createElement("dl");
    details.className = "request-details";
    const values: Array<[string, string]> = [
      ["Contacto", [request.contactEmail, request.contactPhone].filter(Boolean).join(" · ")],
      ["Dirección", request.serviceAddress],
      ["Fecha preferida", request.preferredDate ?? "Sin preferencia indicada"],
      ["Recibida", new Date(request.createdAt).toLocaleString("es-CO")],
      ["Servicio solicitado", request.serviceDescription],
    ];
    if (request.reviewNotes !== "") {
      values.push(["Notas de revisión", request.reviewNotes]);
    }
    for (const [label, value] of values) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    }
    article.append(details);

    if (reviewMode && (request.status === "pending_review" || request.status === "needs_information")) {
      const form = document.createElement("form");
      form.className = "review-form";
      const notesLabel = document.createElement("label");
      notesLabel.textContent = "Nota de revisión";
      const notes = document.createElement("textarea");
      notes.maxLength = 2000;
      notes.rows = 2;
      notesLabel.append(notes);
      const actions = document.createElement("div");
      actions.className = "review-actions";
      const options: Array<[RequestStatus, string]> = [
        ["needs_information", "Solicitar información"],
        ["approved", "Aprobar para cotizar"],
        ["rejected", "Rechazar"],
      ];
      if (request.status === "needs_information") {
        options.unshift(["pending_review", "Marcar lista para revisar"]);
      }
      for (const [nextStatus, label] of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", async () => {
          setMessage("review-message", "");
          button.disabled = true;
          try {
            const updated = await requestApi<RequestRecord>(
              `/api/requests/${encodeURIComponent(request.id)}/review`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus, notes: notes.value }),
              },
            );
            setMessage("review-message", `Solicitud de ${updated.customerName}: ${STATUS_LABELS[updated.status]}.`);
            await loadRequests();
          } catch (error) {
            setMessage("review-message", error instanceof Error ? error.message : "No se pudo guardar la revisión.", true);
          } finally {
            button.disabled = false;
          }
        });
        actions.append(button);
      }
      form.append(notesLabel, actions);
      article.append(form);
    }
    return article;
  }

  async function loadRequests(): Promise<void> {
    const requests = await requestApi<RequestRecord[]>("/api/requests");
    const allList = document.getElementById("request-list");
    const reviewList = document.getElementById("review-list");
    if (allList === null || reviewList === null) {
      return;
    }
    allList.replaceChildren();
    reviewList.replaceChildren();
    if (requests.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aún no hay solicitudes registradas.";
      allList.append(empty);
      const reviewEmpty = document.createElement("p");
      reviewEmpty.className = "empty-state";
      reviewEmpty.textContent = "No hay solicitudes pendientes de revisión.";
      reviewList.append(reviewEmpty);
      return;
    }
    for (const request of requests) {
      allList.append(createRequestCard(request, false));
      if (request.status === "pending_review" || request.status === "needs_information") {
        reviewList.append(createRequestCard(request, true));
      }
    }
    if (reviewList.childElementCount === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No hay solicitudes pendientes de revisión.";
      reviewList.append(empty);
    }
  }

  function formatCop(amount: number): string {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function appendCell(row: HTMLTableRowElement, text: string, header = false): void {
    const cell = document.createElement(header ? "th" : "td");
    if (header) {
      cell.scope = "col";
    }
    cell.textContent = text;
    row.append(cell);
  }

  function renderCatalog(catalog: CatalogData): void {
    quoteCatalog = catalog;
    const tableWrap = document.getElementById("catalog-table-wrap");
    const serviceSelect = document.getElementById("catalog-service-code");
    if (!(tableWrap instanceof HTMLElement) || !(serviceSelect instanceof HTMLSelectElement)) {
      return;
    }

    const table = document.createElement("table");
    table.className = "catalog-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    appendCell(headerRow, "Código", true);
    appendCell(headerRow, "Servicio", true);
    appendCell(headerRow, "Unidad", true);
    for (const version of catalog.tariffVersions) {
      appendCell(
        headerRow,
        `${version.id} · ${version.validFrom} a ${version.validThrough} (COP antes de IVA)`,
        true,
      );
    }
    head.append(headerRow);
    table.append(head);

    const body = document.createElement("tbody");
    serviceSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccione un servicio";
    serviceSelect.append(placeholder);
    for (const service of catalog.services) {
      const row = document.createElement("tr");
      appendCell(row, service.code);
      appendCell(row, service.name);
      appendCell(row, UNIT_LABELS[service.unit]);
      for (const version of catalog.tariffVersions) {
        const tariff = version.tariffs.find((item) => item.serviceCode === service.code);
        appendCell(row, tariff === undefined ? "Sin tarifa" : formatCop(tariff.amountCop));
      }
      body.append(row);

      const option = document.createElement("option");
      option.value = service.code;
      option.textContent = `${service.code} · ${service.name}`;
      serviceSelect.append(option);
    }
    table.append(body);
    tableWrap.replaceChildren(table);
  }

  async function loadCatalog(): Promise<void> {
    const message = document.getElementById("catalog-message");
    const tableWrap = document.getElementById("catalog-table-wrap");
    if (message === null || tableWrap === null) {
      return;
    }
    try {
      const catalog = await requestApi<CatalogData>("/api/catalog");
      renderCatalog(catalog);
      setMessage("catalog-message", "");
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudo cargar el catálogo.";
      setMessage("catalog-message", text, true);
    }
  }

  const catalogQueryForm = document.getElementById("catalog-query-form");
  if (catalogQueryForm instanceof HTMLFormElement) {
    catalogQueryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(catalogQueryForm);
      const serviceCode = String(formData.get("serviceCode") ?? "");
      const date = String(formData.get("date") ?? "");
      const button = document.getElementById("catalog-query-button");
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
      }
      setMessage("catalog-query-result", "");
      try {
        const result = await requestApi<TariffLookupResult>(
          `/api/catalog/tariffs?serviceCode=${encodeURIComponent(serviceCode)}&date=${encodeURIComponent(date)}`,
        );
        if (result.kind === "available") {
          setMessage(
            "catalog-query-result",
            `${result.service.code} — tarifa ${formatCop(result.tariff.amountCop)} por ${UNIT_LABELS[result.service.unit]}; versión ${result.versionId}, vigente para ${date}.`,
          );
        } else if (result.kind === "no_applicable_tariff") {
          setMessage(
            "catalog-query-result",
            `No hay una tarifa aplicable para ${result.service.code} en la fecha ${result.date}. No se asignó ningún precio.`,
            true,
          );
        } else {
          setMessage("catalog-query-result", `No se encontró el servicio ${result.serviceCode}.`, true);
        }
      } catch (error) {
        setMessage(
          "catalog-query-result",
          error instanceof Error ? error.message : "No se pudo consultar la tarifa.",
          true,
        );
      } finally {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
        }
      }
    });
  }

  const requestForm = document.getElementById("request-form");
  if (requestForm instanceof HTMLFormElement) {
    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(requestForm);
      const payload = Object.fromEntries(formData.entries());
      setMessage("request-form-message", "");
      const submitButton = requestForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitButton !== null) {
        submitButton.disabled = true;
      }
      try {
        const created = await requestApi<RequestRecord>("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        requestForm.reset();
        setMessage("request-form-message", `Solicitud de ${created.customerName} registrada.`);
        await loadRequests();
      } catch (error) {
        setMessage("request-form-message", error instanceof Error ? error.message : "No se pudo guardar la solicitud.", true);
      } finally {
        if (submitButton !== null) {
          submitButton.disabled = false;
        }
      }
    });
  }

  document.getElementById("refresh-requests")?.addEventListener("click", () => {
    loadRequests().then(
      () => setMessage("requests-message", "Lista actualizada."),
      (error: unknown) => setMessage(
        "requests-message",
        error instanceof Error ? error.message : "No se pudieron cargar las solicitudes.",
        true,
      ),
    );
  });
  document.getElementById("logout-button")?.addEventListener("click", async () => {
    const button = document.getElementById("logout-button");
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
    }
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new Error("No se pudo cerrar la sesión.");
      }
      await response.json();
      window.location.assign("/login");
    } catch (error) {
      setMessage("requests-message", error instanceof Error ? error.message : "No se pudo cerrar la sesión.", true);
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
      }
    }
  });
  loadRequests().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "No se pudieron cargar las solicitudes.";
    setMessage("requests-message", message, true);
    setMessage("review-message", message, true);
  });
  void loadCatalog();

  window.addEventListener("hashchange", () => {
    const viewId = resolveViewFromHash();
    if (viewId !== null) {
      showView(viewId, true);
    }
  });

  showView(resolveViewFromHash() ?? DEFAULT_VIEW, false);
})();
