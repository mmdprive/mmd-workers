(() => {
  const selector = "[data-mmd-create-session-pro]";
  const currentScript = document.currentScript;
  const origin =
    currentScript && currentScript.src
      ? new URL(currentScript.src, window.location.href).origin
      : window.location.origin;
  const assetUrl = new URL("/a/create-session.js", origin).toString();

  window.MMD_CREATE_SESSION_DIAG = {
    ok: true,
    message: "loader_served",
    rootFound: Boolean(document.querySelector(selector)),
    assetUrl,
    at: new Date().toISOString(),
  };

  if (document.querySelector('script[data-mmd-create-session-asset="true"]')) {
    return;
  }

  const script = document.createElement("script");
  script.src = assetUrl;
  script.defer = true;
  script.dataset.mmdCreateSessionAsset = "true";
  script.addEventListener("load", () => {
    window.MMD_CREATE_SESSION_DIAG = {
      ...window.MMD_CREATE_SESSION_DIAG,
      assetLoaded: true,
      loadedAt: new Date().toISOString(),
    };
  });
  script.addEventListener("error", () => {
    window.MMD_CREATE_SESSION_DIAG = {
      ok: false,
      message: "create_session_asset_failed",
      rootFound: Boolean(document.querySelector(selector)),
      assetUrl,
      at: new Date().toISOString(),
    };
    console.warn("[MMD Create Session] loader could not load create-session.js", window.MMD_CREATE_SESSION_DIAG);
  });
  (document.head || document.documentElement).appendChild(script);
})();
