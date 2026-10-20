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
  interface QuoteLineSnapshot {
    serviceCode: string;
    description: string;
    unit: string;
    quantity: number;
    technicalAssessment?: TechnicalAssessment;
    technicalNotes?: string;
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
  let quoteEligibleRequests = new Map<string, RequestRecord>();

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
      void loadDashboard();
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
    void loadDashboard();
  }

  async function loadDashboard(): Promise<void> {
    const countElements: Record<RequestStatus | "issued", HTMLElement | null> = {
      pending_review: document.getElementById("dashboard-pending-review"),
      needs_information: document.getElementById("dashboard-needs-information"),
      approved: document.getElementById("dashboard-approved"),
      rejected: document.getElementById("dashboard-rejected"),
      issued: document.getElementById("dashboard-issued-quotes"),
    };
    if (Object.values(countElements).some((element) => element === null)) {
      return;
    }
    try {
      const [requests, quotes] = await Promise.all([
        requestApi<RequestRecord[]>("/api/requests"),
        requestApi<QuoteView[]>("/api/quotes"),
      ]);
      const counts: Record<RequestStatus | "issued", number> = {
        pending_review: 0,
        needs_information: 0,
        approved: 0,
        rejected: 0,
        issued: quotes.filter((quote) => quote.status === "issued").length,
      };
      for (const request of requests) {
        counts[request.status] += 1;
      }
      for (const status of ["pending_review", "needs_information", "approved", "rejected", "issued"] as const) {
        const element = countElements[status];
        if (element !== null) {
          element.textContent = String(counts[status]);
        }
      }
      setMessage("dashboard-message", "");
    } catch (error) {
      for (const element of Object.values(countElements)) {
        if (element !== null) {
          element.textContent = "—";
        }
      }
      setMessage(
        "dashboard-message",
        error instanceof Error ? `No se pudieron cargar los indicadores: ${error.message}` : "No se pudieron cargar los indicadores.",
        true,
      );
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

  function invalidateQuoteProposal(): void {
    if (currentQuoteProposal !== null) {
      currentQuoteProposal = null;
      calculatedInputSnapshot = "";
      const issueButton = document.getElementById("quote-issue");
      if (issueButton instanceof HTMLButtonElement) {
        issueButton.hidden = true;
      }
      setMessage("quote-message", "Los datos cambiaron. Calcule de nuevo antes de emitir.");
    }
  }

  function createQuoteLineRow(): HTMLElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "quote-line";
    const legend = document.createElement("legend");
    legend.textContent = "Concepto";
    fieldset.append(legend);

    const serviceLabel = document.createElement("label");
    serviceLabel.textContent = "Servicio";
    const serviceSelect = document.createElement("select");
    serviceSelect.dataset["field"] = "serviceCode";
    serviceSelect.required = true;
    const servicePlaceholder = document.createElement("option");
    servicePlaceholder.value = "";
    servicePlaceholder.textContent = "Seleccione un servicio";
    serviceSelect.append(servicePlaceholder);
    for (const service of quoteCatalog?.services.filter((item) => item.category === "service") ?? []) {
      const option = document.createElement("option");
      option.value = service.code;
      option.textContent = `${service.code} · ${service.name}`;
      serviceSelect.append(option);
    }
    serviceLabel.append(serviceSelect);

    const quantityLabel = document.createElement("label");
    quantityLabel.textContent = "Cantidad";
    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.min = "0.01";
    quantityInput.step = "any";
    quantityInput.required = true;
    quantityInput.dataset["field"] = "quantity";
    quantityLabel.append(quantityInput);

    const assessmentLabel = document.createElement("label");
    assessmentLabel.textContent = "Evaluación técnica";
    const assessmentSelect = document.createElement("select");
    assessmentSelect.required = true;
    assessmentSelect.dataset["field"] = "technicalAssessment";
    const assessmentOptions: Array<[string, string]> = [
      ["", "Seleccione"],
      ["complete", "Información completa y dentro del alcance"],
      ["incomplete", "Información incompleta"],
      ["outside_scope", "Fuera del alcance tarifado"],
    ];
    for (const [value, text] of assessmentOptions) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      assessmentSelect.append(option);
    }
    assessmentLabel.append(assessmentSelect);

    const notesLabel = document.createElement("label");
    notesLabel.textContent = "Notas técnicas (opcional)";
    const notes = document.createElement("textarea");
    notes.rows = 2;
    notes.maxLength = 2000;
    notes.dataset["field"] = "technicalNotes";
    notesLabel.append(notes);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button-secondary";
    removeButton.textContent = "Quitar concepto";
    removeButton.addEventListener("click", () => {
      fieldset.remove();
      invalidateQuoteProposal();
    });

    fieldset.append(serviceLabel, quantityLabel, assessmentLabel, notesLabel, removeButton);
    return fieldset;
  }

  function readQuoteInput(): QuoteInput | null {
    const requestSelect = document.getElementById("quote-request-select");
    const city = document.getElementById("quote-city");
    const visitDate = document.getElementById("quote-visit-date");
    const startTime = document.getElementById("quote-start-time");
    const duration = document.getElementById("quote-duration");
    const holiday = document.getElementById("quote-holiday");
    const urgent = document.getElementById("quote-urgent");
    const lineContainer = document.getElementById("quote-lines");
    if (!(requestSelect instanceof HTMLSelectElement)
      || !(city instanceof HTMLSelectElement)
      || !(visitDate instanceof HTMLInputElement)
      || !(startTime instanceof HTMLInputElement)
      || !(duration instanceof HTMLInputElement)
      || !(holiday instanceof HTMLSelectElement)
      || !(urgent instanceof HTMLInputElement)
      || lineContainer === null) {
      return null;
    }
    const lines: QuoteLineInput[] = [];
    for (const fieldset of Array.from(lineContainer.querySelectorAll<HTMLElement>(".quote-line"))) {
      const serviceCode = fieldset.querySelector<HTMLSelectElement>('[data-field="serviceCode"]');
      const quantity = fieldset.querySelector<HTMLInputElement>('[data-field="quantity"]');
      const assessment = fieldset.querySelector<HTMLSelectElement>('[data-field="technicalAssessment"]');
      const technicalNotes = fieldset.querySelector<HTMLTextAreaElement>('[data-field="technicalNotes"]');
      if (serviceCode === null || quantity === null || assessment === null || technicalNotes === null
        || assessment.value === "") {
        return null;
      }
      lines.push({
        serviceCode: serviceCode.value,
        quantity: Number(quantity.value),
        technicalAssessment: assessment.value as TechnicalAssessment,
        ...(technicalNotes.value.trim() === "" ? {} : { technicalNotes: technicalNotes.value.trim() }),
      });
    }
    if (requestSelect.value === ""
      || (city.value !== "bogota" && city.value !== "chia")
      || visitDate.value === ""
      || startTime.value === ""
      || duration.value === ""
      || (holiday.value !== "true" && holiday.value !== "false")
      || lines.length === 0) {
      return null;
    }
    return {
      requestId: requestSelect.value,
      city: city.value,
      visitDate: visitDate.value,
      startTime: startTime.value,
      durationMinutes: Number(duration.value),
      urgent: urgent.checked,
      isHoliday: holiday.value === "true",
      lines,
    };
  }

  function appendQuoteCell(row: HTMLTableRowElement, text: string, header = false): void {
    const cell = document.createElement(header ? "th" : "td");
    if (header) {
      cell.scope = "col";
    }
    cell.textContent = text;
    row.append(cell);
  }

  function renderQuoteBreakdown(quote: QuoteView): HTMLElement {
    const wrapper = document.createElement("div");
    const details = document.createElement("p");
    details.textContent = `Emisión: ${quote.emissionDate} · Vence: ${quote.expirationDate} · Visita: ${quote.visitDate}, ${quote.startTime}–${quote.endTime} · ${quote.city === "bogota" ? "Bogotá" : "Chía"}${quote.urgent ? " · Urgente" : ""}${quote.isHoliday ? " · Festivo indicado" : ""}`;
    wrapper.append(details);

    const table = document.createElement("table");
    table.className = "quote-breakdown";
    const head = document.createElement("thead");
    const header = document.createElement("tr");
    for (const title of ["Concepto", "Cantidad", "Unidad", "Precio unitario", "Importe", "Recargo", "Versión"]) {
      appendQuoteCell(header, title, true);
    }
    head.append(header);
    table.append(head);
    const body = document.createElement("tbody");
    for (const line of quote.lines) {
      const row = document.createElement("tr");
      appendQuoteCell(row, `${line.serviceCode} · ${line.description}`);
      appendQuoteCell(row, String(line.quantity));
      appendQuoteCell(row, UNIT_LABELS[line.unit as CatalogService["unit"]] ?? line.unit);
      appendQuoteCell(row, formatCop(line.unitPriceCop));
      appendQuoteCell(row, formatCop(line.amountCop));
      appendQuoteCell(row, line.surchargeCop === 0
        ? "—"
        : `${formatCop(line.surchargeCop)} (${line.surchargeRatePercent} %)`);
      appendQuoteCell(row, line.tariffVersionId);
      body.append(row);
    }
    table.append(body);
    wrapper.append(table);

    const totals = document.createElement("dl");
    for (const [label, amount] of [
      ["Base gravable", quote.taxableBaseCop],
      [`IVA (${quote.taxRatePercent} %; redondeado una sola vez)`, quote.taxCop],
      ["Total", quote.totalCop],
    ] as const) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = formatCop(amount);
      if (label === "Total") {
        description.className = "quote-total";
      }
      totals.append(term, description);
    }
    wrapper.append(totals);
    return wrapper;
  }

  function renderQuoteCalculation(result: QuoteCalculationResult): void {
    const resultElement = document.getElementById("quote-result");
    const issueButton = document.getElementById("quote-issue");
    if (resultElement === null || !(issueButton instanceof HTMLButtonElement)) {
      return;
    }
    resultElement.replaceChildren();
    currentQuoteProposal = null;
    calculatedInputSnapshot = "";
    issueButton.hidden = true;

    if (result.kind === "blocked") {
      const heading = document.createElement("h4");
      heading.textContent = "Requiere revisión manual";
      const message = document.createElement("p");
      message.textContent = "No se generó una propuesta emitible. Corrija los datos indicados y vuelva a calcular. Si la regla comercial requiere revisión manual, no emita esta cotización.";
      const list = document.createElement("ul");
      list.className = "quote-review-reasons";
      for (const item of result.reasons ?? []) {
        const entry = document.createElement("li");
        entry.textContent = item.serviceCode === undefined
          ? item.message
          : `${item.serviceCode}: ${item.message}`;
        list.append(entry);
      }
      resultElement.append(heading, message, list);
      setMessage("quote-message", "La propuesta quedó bloqueada para emisión.", true);
      return;
    }
    if (result.quote === undefined) {
      setMessage("quote-message", "El servidor devolvió un resultado de cálculo incompleto.", true);
      return;
    }
    currentQuoteProposal = result.quote;
    const input = readQuoteInput();
    calculatedInputSnapshot = input === null ? "" : JSON.stringify(input);
    const heading = document.createElement("h4");
    heading.textContent = "Propuesta calculada · aún no emitida";
    resultElement.append(heading, renderQuoteBreakdown(result.quote));
    issueButton.hidden = false;
    setMessage("quote-message", "Revise los importes. La propuesta solo se emitirá al confirmar la acción.");
  }

  function renderIssuedQuotes(quotes: QuoteView[]): void {
    const container = document.getElementById("issued-quotes-list");
    if (container === null) {
      return;
    }
    container.replaceChildren();
    if (quotes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aún no hay cotizaciones emitidas.";
      container.append(empty);
      return;
    }
    for (const quote of quotes) {
      const details = document.createElement("details");
      details.className = "issued-quote-card";
      const summary = document.createElement("summary");
      summary.textContent = `Cotización ${quote.id} · Solicitud ${quote.requestId} · ${formatCop(quote.totalCop)} · emitida ${quote.emissionDate}`;
      details.append(summary, renderQuoteBreakdown(quote));
      container.append(details);
    }
  }

  async function loadQuoteWorkspace(): Promise<void> {
    const requestSelect = document.getElementById("quote-request-select");
    const lineContainer = document.getElementById("quote-lines");
    if (!(requestSelect instanceof HTMLSelectElement) || lineContainer === null) {
      return;
    }
    try {
      await loadCatalog();
      if (quoteCatalog === null) {
        throw new Error("No se pudo cargar el catálogo de servicios.");
      }
      const [eligible, issued] = await Promise.all([
        requestApi<RequestRecord[]>("/api/quotes/eligible"),
        requestApi<QuoteView[]>("/api/quotes"),
      ]);
      const previousValue = requestSelect.value;
      quoteEligibleRequests = new Map(eligible.map((request) => [request.id, request]));
      requestSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = eligible.length === 0
        ? "No hay solicitudes aprobadas disponibles"
        : "Seleccione una solicitud";
      requestSelect.append(placeholder);
      for (const request of eligible) {
        const option = document.createElement("option");
        option.value = request.id;
        option.textContent = `${request.customerName} · ${request.id}`;
        requestSelect.append(option);
      }
      if (eligible.some((request) => request.id === previousValue)) {
        requestSelect.value = previousValue;
      } else {
        const requestDetails = document.getElementById("quote-request-details");
        requestDetails?.replaceChildren();
      }
      renderIssuedQuotes(issued);
      if (lineContainer.childElementCount === 0) {
        lineContainer.append(createQuoteLineRow());
      }
      setMessage("quote-message", "");
    } catch (error) {
      setMessage(
        "quote-message",
        error instanceof Error ? error.message : "No se pudieron cargar los datos de cotización.",
        true,
      );
    }
  }

  const quoteRequestSelect = document.getElementById("quote-request-select");
  if (quoteRequestSelect instanceof HTMLSelectElement) {
    quoteRequestSelect.addEventListener("change", () => {
      const details = document.getElementById("quote-request-details");
      const selected = quoteRequestSelect.value;
      if (details !== null) {
        details.replaceChildren();
        if (selected !== "") {
          const request = quoteEligibleRequests.get(selected);
          if (request !== undefined) {
            const info = document.createElement("dl");
            const values: Array<[string, string]> = [
              ["Cliente", request.customerName],
              ["Descripción solicitada", request.serviceDescription],
              ["Dirección", request.serviceAddress],
              ["Fecha preferida", request.preferredDate ?? "No indicada"],
            ];
            for (const [label, value] of values) {
              const term = document.createElement("dt");
              term.textContent = label;
              const description = document.createElement("dd");
              description.textContent = value;
              info.append(term, description);
            }
            details.append(info);
          }
        }
      }
      invalidateQuoteProposal();
    });
  }

  const quoteForm = document.getElementById("quote-form");
  const quoteIssueButton = document.getElementById("quote-issue");
  if (quoteForm instanceof HTMLFormElement) {
    quoteForm.addEventListener("input", invalidateQuoteProposal);
    quoteForm.addEventListener("change", invalidateQuoteProposal);
    quoteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const requestSelect = document.getElementById("quote-request-select");
      if (!quoteForm.reportValidity()) {
        return;
      }
      if (!(requestSelect instanceof HTMLSelectElement) || requestSelect.value === "") {
        setMessage("quote-message", "Seleccione una solicitud aprobada.", true);
        return;
      }
      const input = readQuoteInput();
      if (input === null) {
        setMessage("quote-message", "Complete todos los datos requeridos para calcular.", true);
        return;
      }
      const button = document.getElementById("quote-calculate");
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
      }
      if (quoteIssueButton instanceof HTMLButtonElement) {
        quoteIssueButton.hidden = true;
      }
      setMessage("quote-message", "Calculando la propuesta…");
      try {
        const result = await requestApi<QuoteCalculationResult>("/api/quotes/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        renderQuoteCalculation(result);
      } catch (error) {
        setMessage("quote-message", error instanceof Error ? error.message : "No se pudo calcular la propuesta.", true);
      } finally {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
        }
      }
    });
  }

  if (quoteIssueButton instanceof HTMLButtonElement) {
    quoteIssueButton.addEventListener("click", async () => {
      if (currentQuoteProposal === null) {
        setMessage("quote-message", "Calcule una propuesta válida antes de emitir.", true);
        return;
      }
      const input = readQuoteInput();
      if (input === null || JSON.stringify(input) !== calculatedInputSnapshot) {
        invalidateQuoteProposal();
        setMessage("quote-message", "Los datos ya no corresponden a la propuesta. Calcule de nuevo.", true);
        return;
      }
      if (!window.confirm("¿Confirma la emisión? La cotización quedará guardada y no podrá sobrescribirse.")) {
        return;
      }
      quoteIssueButton.disabled = true;
      try {
        const issued = await requestApi<QuoteView>("/api/quotes/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        currentQuoteProposal = null;
        calculatedInputSnapshot = "";
        quoteIssueButton.hidden = true;
        const resultElement = document.getElementById("quote-result");
        if (resultElement !== null) {
          const heading = document.createElement("h4");
          heading.textContent = "Cotización emitida y guardada";
          resultElement.replaceChildren(heading, renderQuoteBreakdown(issued));
        }
        setMessage("quote-message", `Se emitió la cotización ${issued.id}.`);
        await loadQuoteWorkspace();
        setMessage("quote-message", `Se emitió la cotización ${issued.id} y quedó guardada.`);
        await loadDashboard();
      } catch (error) {
        setMessage("quote-message", error instanceof Error ? error.message : "No se pudo emitir la cotización.", true);
      } finally {
        quoteIssueButton.disabled = false;
      }
    });
  }

  document.getElementById("quote-add-line")?.addEventListener("click", () => {
    const container = document.getElementById("quote-lines");
    if (container !== null && quoteCatalog !== null) {
      container.append(createQuoteLineRow());
      invalidateQuoteProposal();
    }
  });
  document.getElementById("quote-refresh")?.addEventListener("click", () => {
    void loadQuoteWorkspace();
  });

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
  void loadQuoteWorkspace();
  void loadDashboard();

  window.addEventListener("hashchange", () => {
    const viewId = resolveViewFromHash();
    if (viewId !== null) {
      showView(viewId, true);
      if (viewId === "panel") {
        void loadDashboard();
      }
      if (viewId === "cotizaciones") {
        void loadQuoteWorkspace();
      }
    }
  });

  showView(resolveViewFromHash() ?? DEFAULT_VIEW, false);
})();
