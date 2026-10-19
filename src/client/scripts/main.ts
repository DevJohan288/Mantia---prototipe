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
  const STATUS_LABELS: Record<RequestStatus, string> = {
    pending_review: "Pendiente de revisión",
    needs_information: "Requiere información",
    approved: "Aprobada para cotizar",
    rejected: "Rechazada",
  };

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
  loadRequests().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "No se pudieron cargar las solicitudes.";
    setMessage("requests-message", message, true);
    setMessage("review-message", message, true);
  });

  window.addEventListener("hashchange", () => {
    const viewId = resolveViewFromHash();
    if (viewId !== null) {
      showView(viewId, true);
    }
  });

  showView(resolveViewFromHash() ?? DEFAULT_VIEW, false);
})();
