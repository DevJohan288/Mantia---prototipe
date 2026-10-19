(() => {
  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const confirmPasswordLabel = document.getElementById("confirm-password-label");
  const instructions = document.getElementById("login-instructions");
  const submitButton = document.getElementById("login-button");
  const message = document.getElementById("login-message");

  if (!(form instanceof HTMLFormElement)
    || !(usernameInput instanceof HTMLInputElement)
    || !(passwordInput instanceof HTMLInputElement)
    || !(confirmPasswordInput instanceof HTMLInputElement)
    || !(confirmPasswordLabel instanceof HTMLLabelElement)
    || !(instructions instanceof HTMLElement)
    || !(submitButton instanceof HTMLButtonElement)
    || message === null) {
    console.error("Mantia: no se encontró el formulario de inicio de sesión.");
    return;
  }
  const statusMessage = message;
  const userField = usernameInput;
  const passwordField = passwordInput;
  const confirmationField = confirmPasswordInput;
  const confirmationLabel = confirmPasswordLabel;
  const pageInstructions = instructions;
  const actionButton = submitButton;

  function showMessage(text: string, isError: boolean): void {
    statusMessage.textContent = text;
    statusMessage.classList.toggle("is-error", isError);
  }

  async function configurePage(): Promise<void> {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No se pudo comprobar el estado del usuario.");
    }
    const session: unknown = await response.json();
    if (typeof session !== "object" || session === null || !("configured" in session)) {
      throw new Error("El servidor devolvió un estado de usuario inválido.");
    }
    if (session.configured === false) {
      if (window.location.pathname !== "/setup") {
        window.location.replace("/setup");
        return;
      }
      pageInstructions.textContent = "Cree el usuario local que usará para acceder a Mantia.";
      passwordField.autocomplete = "new-password";
      confirmationField.hidden = false;
      confirmationField.required = true;
      confirmationLabel.hidden = false;
      actionButton.textContent = "Crear usuario";
    } else if (session.configured === true) {
      if (window.location.pathname === "/setup") {
        window.location.replace("/login");
        return;
      }
      if ("authenticated" in session && session.authenticated === true) {
        window.location.replace("/");
      }
    } else {
      throw new Error("El servidor devolvió un estado de usuario inválido.");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("", false);
    actionButton.disabled = true;
    try {
      const isSetup = window.location.pathname === "/setup";
      if (isSetup && passwordField.value !== confirmationField.value) {
        throw new Error("Las contraseñas no coinciden.");
      }
      const response = await fetch(isSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: userField.value,
          password: passwordField.value,
          ...(isSetup ? { confirmPassword: confirmationField.value } : {}),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "No se pudo completar el acceso.";
        throw new Error(errorMessage);
      }
      passwordField.value = "";
      confirmationField.value = "";
      window.location.replace("/");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo completar el acceso.", true);
      passwordField.focus();
    } finally {
      actionButton.disabled = false;
    }
  });

  configurePage().catch((error: unknown) => {
    showMessage(error instanceof Error ? error.message : "No se pudo comprobar el estado del usuario.", true);
  });
})();
