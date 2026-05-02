(() => {
  "use strict";

  const VERSION = "20260502-boot1";
  const CORE_SRC = `https://sigil.mmdbkk.com/a/create-session.js?v=${VERSION}`;
  const ROOT_SELECTOR = "[data-mmd-create-session-pro]";

  function showDiagnostic(message) {
    window.MMD_CREATE_SESSION_DIAG = {
      ok: false,
      message,
      version: VERSION,
      at: new Date().toISOString()
    };
    console.warn(`[MMD Create Session] ${message}`);
  }

  function loadCore(root) {
    if (window.__MMD_CREATE_SESSION_CORE_LOADING__) return;
    window.__MMD_CREATE_SESSION_CORE_LOADING__ = true;
    window.MMD_CREATE_SESSION_DIAG = {
      ok: true,
      message: "loader_ready",
      rootFound: Boolean(root),
      version: VERSION,
      at: new Date().toISOString()
    };

    const script = document.createElement("script");
    script.src = CORE_SRC;
    script.defer = true;
    script.dataset.mmdCreateSessionCore = VERSION;
    script.onload = () => {
      window.MMD_CREATE_SESSION_DIAG = {
        ok: true,
        message: "core_loaded",
        rootFound: Boolean(document.querySelector(ROOT_SELECTOR)),
        version: VERSION,
        at: new Date().toISOString()
      };
      console.info("[MMD Create Session] core loaded", window.MMD_CREATE_SESSION_DIAG);
    };
    script.onerror = () => {
      showDiagnostic(`Failed to load core script: ${CORE_SRC}`);
    };
    document.head.appendChild(script);
  }

  function boot() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) {
      showDiagnostic(
        `Root not found. Webflow HTML must include ${ROOT_SELECTOR}. ` +
          "If you are using the older data-mmd-client-lineage-session HTML, update the HTML to the mmdop/operator version."
      );
      return;
    }
    loadCore(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
