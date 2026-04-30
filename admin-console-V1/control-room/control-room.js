(function () {
  const root = document.querySelector("[data-mmd-ops-room]");
  if (!root) return;

  const config = {
    adminBase: cleanBase(root.getAttribute("data-admin-base")),
    aiBase: cleanBase(root.getAttribute("data-ai-base")),
    chatBase: cleanBase(root.getAttribute("data-chat-base")),
    paymentsBase: cleanBase(root.getAttribute("data-payments-base")),
    eventsBase: cleanBase(root.getAttribute("data-events-base")),
    telegramBase: cleanBase(root.getAttribute("data-telegram-base")),
    realtimeBase: cleanBase(root.getAttribute("data-realtime-base"))
  };

  const els = {
    global: root.querySelector("[data-global-status]"),
    adminMessage: root.querySelector("[data-admin-message]"),
    log: root.querySelector("[data-check-log]"),
    runButtons: root.querySelectorAll("[data-run-checks]"),
    clearLog: root.querySelector("[data-clear-log]")
  };

  const workerCards = {
    admin: root.querySelector('[data-worker-card="admin"]'),
    ai: root.querySelector('[data-worker-card="ai"]'),
    chat: root.querySelector('[data-worker-card="chat"]'),
    payments: root.querySelector('[data-worker-card="payments"]'),
    events: root.querySelector('[data-worker-card="events"]'),
    telegram: root.querySelector('[data-worker-card="telegram"]'),
    realtime: root.querySelector('[data-worker-card="realtime"]')
  };

  const workerLabels = {
    admin: root.querySelector('[data-worker-label="admin"]'),
    ai: root.querySelector('[data-worker-label="ai"]'),
    chat: root.querySelector('[data-worker-label="chat"]'),
    payments: root.querySelector('[data-worker-label="payments"]'),
    events: root.querySelector('[data-worker-label="events"]'),
    telegram: root.querySelector('[data-worker-label="telegram"]'),
    realtime: root.querySelector('[data-worker-label="realtime"]')
  };

  const ADMIN_GATE_SESSION_KEY = "mmd_admin_gate_v1";

  function cleanBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function readAdminGate() {
    try {
      const raw = sessionStorage.getItem(ADMIN_GATE_SESSION_KEY);
      const gate = raw ? JSON.parse(raw) : null;
      return gate && gate.ok ? gate : {};
    } catch (err) {
      return {};
    }
  }

  function adminHeaders() {
    const gate = readAdminGate();
    const headers = { "Accept": "application/json" };
    if (gate.bearer) headers.Authorization = "Bearer " + gate.bearer;
    if (gate.confirmKey) headers["X-Confirm-Key"] = gate.confirmKey;
    return headers;
  }

  function nowTime() {
    return new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function addLog(message, kind) {
    if (!els.log) return;

    if (els.log.textContent.trim() === "Waiting for system check.") {
      els.log.innerHTML = "";
    }

    const p = document.createElement("p");
    p.className = kind || "";
    p.textContent = "[" + nowTime() + "] " + message;
    els.log.prepend(p);
  }

  function setGlobal(type, label) {
    if (!els.global) return;

    els.global.classList.remove("is-ok", "is-bad", "is-warn");
    if (type) els.global.classList.add("is-" + type);

    const strong = els.global.querySelector("strong");
    if (strong) strong.textContent = label || "Unknown";
  }

  function setWorker(name, type, label) {
    const card = workerCards[name];
    const labelNode = workerLabels[name];

    if (card) {
      card.classList.remove("is-ok", "is-bad", "is-warn");
      if (type) card.classList.add("is-" + type);
    }

    if (labelNode) {
      labelNode.textContent = label || "Unknown";
    }
  }

  function setAdminMessage(message) {
    if (els.adminMessage) els.adminMessage.textContent = message;
  }

  async function readEndpoint(url, options) {
    const opts = options || {};
    const headers = {
      "Accept": "application/json",
      ...(opts.headers || {})
    };

    const res = await fetch(url, {
      method: "GET",
      credentials: opts.credentials || "omit",
      cache: "no-store",
      ...opts,
      headers
    });

    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      data = { raw: text };
    }

    return {
      ok: res.ok,
      status: res.status,
      data
    };
  }

  async function checkWithFallback(name, base, paths, options) {
    if (!base) {
      setWorker(name, "bad", "Missing URL");
      addLog(name + ": missing base URL", "bad");
      return { name, ok: false, status: 0, label: "Missing URL" };
    }

    setWorker(name, "", "Checking");

    for (const path of paths) {
      const url = base + path;

      try {
        const result = await readEndpoint(url, options);

        if (result.ok) {
          setWorker(name, "ok", "Connected");
          addLog(name + ": OK via " + path, "ok");
          return { name, ok: true, status: result.status, path, data: result.data, label: "Connected" };
        }

        if (name === "admin" && (result.status === 401 || result.status === 403)) {
          setWorker(name, "warn", "Login required");
          addLog(name + ": reachable but login required (" + result.status + ")", "warn");
          return {
            name,
            ok: true,
            authRequired: true,
            status: result.status,
            path,
            data: result.data,
            label: "Login required"
          };
        }

        if (result.status !== 404) {
          setWorker(name, "warn", "HTTP " + result.status);
          addLog(name + ": HTTP " + result.status + " via " + path, "warn");
          return { name, ok: false, status: result.status, path, data: result.data, label: "HTTP " + result.status };
        }
      } catch (err) {
        setWorker(name, "bad", "No connection");
        addLog(name + ": fetch failed / CORS / network", "bad");
        return { name, ok: false, status: 0, error: err, label: "No connection" };
      }
    }

    setWorker(name, "bad", "Not found");
    addLog(name + ": no health endpoint matched", "bad");
    return { name, ok: false, status: 404, label: "Not found" };
  }

  async function checkAdmin() {
    const result = await checkWithFallback("admin", config.adminBase, [
      "/v1/admin/auth/me",
      "/v1/admin/ping",
      "/health",
      "/"
    ], {
      credentials: "include",
      headers: adminHeaders()
    });

    if (result.ok && result.authRequired) {
      setAdminMessage("เชื่อมต่อ admin-worker ได้แล้ว แต่ session นี้ยังไม่ได้รับสิทธิ์ กรุณาเข้า Login Gate ก่อน.");
      return result;
    }

    if (result.ok) {
      setAdminMessage("เชื่อมต่อ admin-worker สำเร็จ พร้อมเข้า Create Job / Session.");
      return result;
    }

    setAdminMessage("เรียก admin-worker ไม่สำเร็จ อาจเป็น CORS, network, domain ผิด หรือ endpoint ยังไม่เปิด.");
    return result;
  }

  async function checkAll() {
    setGlobal("", "Checking");
    addLog("Starting full system check...", "");

    const checks = await Promise.all([
      checkAdmin(),
      checkWithFallback("ai", config.aiBase, ["/health", "/"]),
      checkWithFallback("chat", config.chatBase, ["/health", "/"]),
      checkWithFallback("payments", config.paymentsBase, ["/health", "/v1/pay/health", "/"]),
      checkWithFallback("events", config.eventsBase, ["/health", "/v1/events/health", "/"]),
      checkWithFallback("telegram", config.telegramBase, ["/health", "/telegram/health", "/"]),
      checkWithFallback("realtime", config.realtimeBase, ["/health", "/"])
    ]);

    const hardFailures = checks.filter(item => !item.ok && item.name !== "events");
    const warnings = checks.filter(item => item.authRequired || (item.ok && item.status >= 300));

    if (hardFailures.length === 0 && warnings.length === 0) {
      setGlobal("ok", "System ready");
      addLog("All required systems are ready.", "ok");
      return;
    }

    if (hardFailures.length === 0 && warnings.length > 0) {
      setGlobal("warn", "Action needed");
      addLog("System reachable, but admin login or review is required.", "warn");
      return;
    }

    setGlobal("bad", "Check failed");
    addLog("Some required systems are not reachable. Check CORS, domains, routes, and health endpoints.", "bad");
  }

  function bind() {
    els.runButtons.forEach(function (btn) {
      btn.addEventListener("click", checkAll);
    });

    if (els.clearLog) {
      els.clearLog.addEventListener("click", function () {
        els.log.innerHTML = "<p>Waiting for system check.</p>";
      });
    }
  }

  function init() {
    Object.keys(workerCards).forEach(function (name) {
      setWorker(name, "", "Checking");
    });

    setGlobal("", "Checking");
    setAdminMessage("กำลังตรวจสอบ admin-worker...");
    bind();

    window.setTimeout(checkAll, 500);
  }

  init();
})();
