(() => {
  "use strict";

  const root = document.querySelector("[data-mmd-create-session-pro]");
  if (!root) return;

  const ADMIN_GATE_SESSION_KEY = "mmd_admin_gate_v1";
  const qs = new URLSearchParams(window.location.search);
  const userConfig = window.MMD_CREATE_SESSION_CONFIG || {};
  const config = {
    adminBase:
      root.dataset.adminBase ||
      userConfig.adminBase ||
      "https://admin-worker.malemodel-bkk.workers.dev",
    mock: qs.has("mock") || userConfig.mock === true,
    debug: qs.has("debug") || userConfig.debug === true,
    endpoints: {
      authMe: "/v1/admin/auth/me",
      ping: "/v1/admin/ping",
      clientLookup: "/v1/admin/clients/lineage-lookup",
      recentClients: "/v1/admin/clients/recent",
      modelSearch: "/v1/admin/models/search",
      saveDraft: "/v1/admin/job/draft",
      createSession: "/v1/admin/job/create",
      pushLine: "/v1/admin/line/push",
      ...(userConfig.endpoints || {})
    }
  };

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));

  const state = {
    clients: [],
    selectedClient: null,
    workType: "",
    modelFolder: "",
    models: [],
    selectedModel: null,
    draftId: "",
    created: null,
    lastPayload: null
  };

  const el = {
    connection: $("[data-op-connection]"),
    checkSession: $("[data-op-check-session]"),
    status: $("[data-op-status]"),
    query: $("[data-op-client-query]"),
    searchClient: $("[data-op-search-client]"),
    demoClient: $("[data-op-demo-client]"),
    loadRecent: $("[data-op-load-recent]"),
    clearClient: $("[data-op-clear-client]"),
    clientResults: $("[data-op-client-results]"),
    searchMode: $("[data-op-search-mode]"),
    nextAction: $("[data-op-next-action]"),
    nextCopy: $("[data-op-next-copy]"),
    statClient: $("[data-op-stat-client]"),
    statPackage: $("[data-op-stat-package]"),
    statWork: $("[data-op-stat-work]"),
    statFolder: $("[data-op-stat-folder]"),
    statModel: $("[data-op-stat-model]"),
    statGate: $("[data-op-stat-gate]"),
    statStatus: $("[data-op-stat-status]"),
    clientInitial: $("[data-op-client-initial]"),
    selectedClientName: $("[data-op-selected-client-name]"),
    selectedClientMeta: $("[data-op-selected-client-meta]"),
    selectedConfidence: $("[data-op-selected-confidence]"),
    lineageBadge: $("[data-op-lineage-badge]"),
    lineageNotice: $("[data-op-lineage-notice]"),
    clientName: $("[data-op-client-name]"),
    username: $("[data-op-username]"),
    package: $("[data-op-package]"),
    membershipStatus: $("[data-op-membership-status]"),
    lineDisplay: $("[data-op-line-display]"),
    lineUserId: $("[data-op-line-user-id]"),
    lineRecordId: $("[data-op-line-record-id]"),
    legacyTags: $("[data-op-legacy-tags]"),
    folderGrid: $("[data-op-folder-grid]"),
    folderHelper: $("[data-op-folder-helper]"),
    railFolder: $("[data-op-rail-folder]"),
    railFolderCopy: $("[data-op-rail-folder-copy]"),
    refreshModels: $("[data-op-refresh-models]"),
    modelRule: $("[data-op-model-rule]"),
    modelSelect: $("[data-op-model-select]"),
    modelLookupKey: $("[data-op-model-lookup-key]"),
    modelPool: $("[data-op-model-pool]"),
    modelPreview: $("[data-op-model-preview]"),
    customerTelegram: $("[data-op-customer-telegram]"),
    customerTelegramStatus: $("[data-op-customer-telegram-status]"),
    modelTelegram: $("[data-op-model-telegram]"),
    modelTelegramStatus: $("[data-op-model-telegram-status]"),
    gateLabel: $("[data-op-gate-label]"),
    gateNotice: $("[data-op-gate-notice]"),
    date: $("[data-op-date]"),
    start: $("[data-op-start]"),
    duration: $("[data-op-duration]"),
    end: $("[data-op-end]"),
    location: $("[data-op-location]"),
    map: $("[data-op-map]"),
    amount: $("[data-op-amount]"),
    paymentType: $("[data-op-payment-type]"),
    paymentMethod: $("[data-op-payment-method]"),
    pointsMode: $("[data-op-points-mode]"),
    humanAssistant: $("[data-op-human-assistant]"),
    escalationOwner: $("[data-op-escalation-owner]"),
    handlingNote: $("[data-op-handling-note]"),
    note: $("[data-op-note]"),
    saveDraft: $("[data-op-save-draft]"),
    fillDemoJob: $("[data-op-fill-demo-job]"),
    readyLabel: $("[data-op-ready-label]"),
    readyCopy: $("[data-op-ready-copy]"),
    debugToggle: $("[data-op-debug-toggle]"),
    debugPanel: $("[data-op-debug-panel]"),
    payload: $("[data-op-payload]"),
    create: $("[data-op-create]"),
    output: $("[data-op-output]"),
    outSessionId: $("[data-op-out-session-id]"),
    outPaymentRef: $("[data-op-out-payment-ref]"),
    outLineStatus: $("[data-op-out-line-status]"),
    outTelegramStatus: $("[data-op-out-telegram-status]"),
    outCustomerUrl: $("[data-op-out-customer-url]"),
    outModelUrl: $("[data-op-out-model-url]"),
    outMemberUrl: $("[data-op-out-member-url]"),
    outModelReturnUrl: $("[data-op-out-model-return-url]"),
    outCustomerMessage: $("[data-op-out-customer-message]"),
    outModelMessage: $("[data-op-out-model-message]"),
    copyCustomerLink: $("[data-op-copy-customer-link]"),
    copyModelLink: $("[data-op-copy-model-link]"),
    copyCustomerMsg: $("[data-op-copy-customer-msg]"),
    copyModelMsg: $("[data-op-copy-model-msg]"),
    pushLine: $("[data-op-push-line]"),
    newSession: $("[data-op-new]")
  };

  const folders = {
    public: [
      ["travel", "Travel Model", "แฟ้ม Public Work สำหรับ social / travel / public-facing session", "Choose Travel"],
      ["extreme", "Extreme Model", "แฟ้ม Public Work ที่ต้องใช้ energy / performance / intensity สูงกว่า", "Choose Extreme"]
    ],
    private: [
      ["vip", "VIP", "แฟ้ม Private Work ระดับ VIP", "Choose VIP"],
      ["pn", "PN", "แฟ้ม PN โดยอนุญาต Model ในแฟ้ม VIP ที่ compatible เข้า PN ได้ด้วย", "Choose PN"]
    ]
  };

  const durations = [
    ["01:30", "1.30 ชม."],
    ["02:00", "2.00 ชม."],
    ["02:30", "2.30 ชม."],
    ["03:00", "3.00 ชม."],
    ["03:30", "3.30 ชม."],
    ["04:00", "4.00 ชม."],
    ["05:00", "5.00 ชม."],
    ["06:00", "6.00 ชม."],
    ["06:00+", "มากกว่า 6 ชม."]
  ];

  const demoClients = [
    {
      client_id: "cli_ruch_001",
      client_name: "รัช",
      username: "ruch vip",
      phone: "hidden",
      package_code: "VIP",
      tier: "vip",
      membership_status: "active",
      purchased_history: "purchased / private inquiry",
      line_record_id: "line_rec_ruch_vip_001",
      line_user_id: "U_ruch_vip_line",
      line_display_name: "รัช VIP",
      legacy_tags: ["#client", "#purchased", "-vip-", "private-inquiry"],
      last_line_message: "สอบถาม Private / VIP session จาก LINE ครับ",
      customer_telegram_username: "@ruch_vip",
      customer_telegram_status: "linked",
      confidence: 96
    },
    {
      client_id: "cli_man_001",
      client_name: "Man",
      username: "man 24",
      phone: "hidden",
      package_code: "Premium",
      tier: "premium",
      membership_status: "active",
      purchased_history: "package signup / travel request",
      line_record_id: "line_rec_001",
      line_user_id: "U8a7b2f9c_man",
      line_display_name: "Man",
      legacy_tags: ["#client", "#purchased", "#mem2026"],
      last_line_message: "อยากจอง Travel Model คืนวันศุกร์ครับ",
      customer_telegram_username: "@man_mmd",
      customer_telegram_status: "linked",
      confidence: 91
    },
    {
      client_id: "cli_win_002",
      client_name: "Win",
      username: "win pn",
      phone: "hidden",
      package_code: "VIP",
      tier: "vip",
      membership_status: "active",
      purchased_history: "private package inquiry",
      line_record_id: "line_rec_002",
      line_user_id: "U6d1c9a2b_win",
      line_display_name: "Win",
      legacy_tags: ["#client", "-vip-"],
      last_line_message: "สอบถาม private package ครับ",
      customer_telegram_username: "",
      customer_telegram_status: "missing",
      confidence: 84
    }
  ];

  const demoModels = [
    {
      model_id: "hito",
      model_name: "HITO",
      lookup_key: "TMIB-HITO-01",
      telegram_username: "@hito_sigil",
      telegram_status: "linked",
      folders: ["travel", "extreme", "vip", "pn"],
      vip_can_pn: true,
      status: "available",
      note: "Steady route / calm personal assistant"
    },
    {
      model_id: "kenji",
      model_name: "Kenji",
      lookup_key: "TMIB-KJ-01",
      telegram_username: "@kenji_sigil",
      telegram_status: "linked",
      folders: ["travel", "vip", "pn"],
      vip_can_pn: true,
      status: "available",
      note: "Client continuity / premium lead"
    },
    {
      model_id: "tart",
      model_name: "TarT",
      lookup_key: "TMIB-TT-01",
      telegram_username: "@tart_sigil",
      telegram_status: "linked",
      folders: ["travel", "extreme"],
      vip_can_pn: false,
      status: "available",
      note: "Scout / public work"
    },
    {
      model_id: "yuki",
      model_name: "Yuki",
      lookup_key: "TMIB-YUKI-01",
      telegram_username: "@yuki_sigil",
      telegram_status: "verified",
      folders: ["vip", "pn"],
      vip_can_pn: true,
      status: "approval",
      note: "Approval / partnership authority"
    }
  ];

  const api = (path) => config.adminBase.replace(/\/$/, "") + path;
  const val = (node) => (node ? node.value : "");
  const setVal = (node, value) => {
    if (node) node.value = value == null ? "" : String(value);
  };
  const text = (node, value) => {
    if (node) node.textContent = value == null ? "" : String(value);
  };
  const esc = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  const first = (value, fallback = "C") => (String(value || fallback).trim().charAt(0) || fallback).toUpperCase();

  function stateClass(node, type) {
    if (!node) return;
    node.classList.remove("is-ok", "is-warn", "is-bad");
    if (type) node.classList.add(`is-${type}`);
  }

  function setStatus(message, type) {
    text(el.status, message || "");
    stateClass(el.status, type);
  }

  function setConnection(type, label) {
    stateClass(el.connection, type);
    text(el.connection && el.connection.querySelector("span"), label || "Ready");
  }

  function setHook(name, type) {
    stateClass(root.querySelector(`[data-op-hook="${name}"]`), type);
  }

  function readAdminGate() {
    try {
      const raw = sessionStorage.getItem(ADMIN_GATE_SESSION_KEY);
      const gate = raw ? JSON.parse(raw) : null;
      return gate && gate.ok ? gate : {};
    } catch {
      return {};
    }
  }

  function adminHeaders() {
    const gate = readAdminGate();
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (gate.bearer) headers.Authorization = "Bearer " + gate.bearer;
    if (gate.confirmKey) headers["X-Confirm-Key"] = gate.confirmKey;
    return headers;
  }

  async function requestJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: { ...adminHeaders(), ...(options.headers || {}) }
    });
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = { raw };
    }
    return { ok: res.ok, status: res.status, data };
  }

  function pick(data, ...keys) {
    for (const key of keys) {
      if (data && data[key] != null && String(data[key]) !== "") return data[key];
    }
    return "";
  }

  function normalizeClients(data) {
    return (data?.records || data?.items || data?.data || []).map((item, index) => ({
      client_id: item.client_id || item.id || `client_${index}`,
      client_name: item.client_name || item.clientName || item.name || item.nickname || "",
      username: item.username || item.member_username || "",
      phone: item.phone || item.member_phone || "",
      package_code: item.package_code || item.package || item.tier || "",
      tier: item.tier || item.mmd_tier || "",
      membership_status: item.membership_status || item.mmd_status || "",
      purchased_history: item.purchased_history || item.purchase_history || "",
      line_record_id: item.line_record_id || item.line_record || item.record_id || "",
      line_user_id: item.line_user_id || item.lineUserId || "",
      line_display_name: item.line_display_name || item.displayName || item.line_name || "",
      legacy_tags: Array.isArray(item.legacy_tags) ? item.legacy_tags : Array.isArray(item.tags) ? item.tags : [],
      last_line_message: item.last_line_message || item.last_message || "",
      customer_telegram_username: item.customer_telegram_username || item.telegram_username || "",
      customer_telegram_status: item.customer_telegram_status || item.telegram_status || "missing",
      confidence: Number(item.confidence || item.match_confidence || 70)
    }));
  }

  function normalizeModels(data) {
    return (data?.records || data?.items || data?.data || []).map((item, index) => ({
      model_id: item.model_id || item.id || `model_${index}`,
      model_name: item.model_name || item.name || item.display_name || "",
      lookup_key: item.lookup_key || item.model_lookup_key || "",
      telegram_username: item.telegram_username || item.model_telegram_username || "",
      telegram_status: item.telegram_status || "missing",
      folders: Array.isArray(item.folders) ? item.folders : [],
      vip_can_pn: Boolean(item.vip_can_pn || item.pn_compatible),
      status: item.status || "available",
      note: item.note || item.description || ""
    }));
  }

  async function checkSession() {
    if (config.mock) {
      setConnection("ok", "Demo Mode");
      setHook("auth", "ok");
      return true;
    }
    setConnection("warn", "Checking");
    try {
      let result = await requestJson(api(config.endpoints.authMe));
      if (!result.ok && result.status === 404) result = await requestJson(api(config.endpoints.ping));
      if (result.ok) {
        setConnection("ok", "Connected");
        setHook("auth", "ok");
        setStatus("Admin session verified.", "ok");
        return true;
      }
      setConnection("warn", "Login needed");
      setHook("auth", "warn");
      setStatus("Admin session ยังไม่ผ่าน หรือ cookie หมดอายุ", "bad");
      return false;
    } catch {
      setConnection("bad", "Worker blocked");
      setHook("auth", "bad");
      setStatus("เชื่อมต่อ admin-worker ไม่สำเร็จ ตรวจ CORS / domain / endpoint", "bad");
      return false;
    }
  }

  async function searchClients(useDemo = false) {
    const query = String(val(el.query)).trim();
    if (useDemo || config.mock) {
      const q = query.toLowerCase();
      state.clients = demoClients.filter((client) => {
        if (!q) return true;
        return [
          client.client_name,
          client.username,
          client.phone,
          client.package_code,
          client.tier,
          client.membership_status,
          client.line_user_id,
          client.line_display_name,
          (client.legacy_tags || []).join(" "),
          client.last_line_message
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
      text(el.searchMode, "Demo");
      setHook("lineage", "ok");
      renderClients();
      setStatus("Demo lineage loaded.", "ok");
      return;
    }
    setStatus("กำลังค้น Client Lineage...", "");
    try {
      const result = await requestJson(api(config.endpoints.clientLookup), {
        method: "POST",
        body: JSON.stringify({
          query,
          search_scope: ["package_signup", "members", "clients", "line_identity", "legacy_tags", "purchase_history"]
        })
      });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      state.clients = normalizeClients(result.data);
      text(el.searchMode, "Cloud");
      setHook("lineage", "ok");
      renderClients();
      setStatus("Client lineage loaded.", "ok");
    } catch {
      setHook("lineage", "bad");
      renderClients();
      setStatus("ยังเชื่อมต่อ lineage จริงไม่ได้ กด Demo เพื่อทดสอบ UI ได้", "bad");
    }
  }

  async function loadRecentClients() {
    if (config.mock) {
      state.clients = demoClients.slice();
      renderClients();
      setHook("lineage", "ok");
      setStatus("Recent demo clients loaded.", "ok");
      return;
    }
    setStatus("กำลังโหลด recent clients...", "");
    try {
      const result = await requestJson(api(config.endpoints.recentClients));
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      state.clients = normalizeClients(result.data);
      renderClients();
      setHook("lineage", "ok");
      setStatus("Recent clients loaded.", "ok");
    } catch {
      setHook("lineage", "bad");
      setStatus("โหลด recent clients ไม่สำเร็จ", "bad");
    }
  }

  function renderClients() {
    if (!el.clientResults) return;
    if (!state.clients.length) {
      el.clientResults.innerHTML = '<div class="mmdop__empty">ไม่พบลูกค้าที่ตรงกัน ลองค้นจากชื่อเล่น / username / package / LINE display / tag อีกครั้ง</div>';
      return;
    }
    el.clientResults.innerHTML = state.clients
      .map((client) => {
        const selected = state.selectedClient?.client_id === client.client_id;
        const tags = []
          .concat(client.tier ? [client.tier] : [])
          .concat(client.membership_status ? [client.membership_status] : [])
          .concat(client.legacy_tags || [])
          .slice(0, 7)
          .map((tag) => {
            const gold = /vip|svip|black/i.test(String(tag));
            return `<span class="mmdop__tag${gold ? " mmdop__tag--gold" : ""}">${esc(tag)}</span>`;
          })
          .join("");
        return `
          <button class="mmdop__clientCard${selected ? " is-selected" : ""}" type="button" data-op-select-client="${esc(client.client_id)}">
            <div class="mmdop__clientAvatar">${esc(first(client.client_name || client.line_display_name))}</div>
            <div class="mmdop__clientMain">
              <strong>${esc(client.client_name || client.line_display_name || "Unknown Client")}</strong>
              <span>${esc(client.package_code || "-")} · ${esc(client.purchased_history || "no purchase summary")}</span>
              <span>LINE: ${esc(client.line_display_name || "-")} · ${esc(client.line_user_id || "-")}</span>
            </div>
            <div class="mmdop__tags">
              <span class="mmdop__tag mmdop__tag--green">${esc(client.confidence || 0)}% match</span>
              ${tags}
            </div>
          </button>`;
      })
      .join("");
    $$('[data-op-select-client]').forEach((button) => {
      button.addEventListener("click", () => selectClient(button.dataset.opSelectClient));
    });
  }

  function selectClient(id) {
    const client = state.clients.find((item) => item.client_id === id);
    if (!client) {
      setStatus("ไม่พบ client record นี้", "bad");
      return;
    }
    state.selectedClient = client;
    text(el.clientInitial, first(client.client_name || client.line_display_name));
    text(el.selectedClientName, client.client_name || client.line_display_name || "-");
    text(
      el.selectedClientMeta,
      [client.username, client.package_code, client.membership_status, client.line_display_name].filter(Boolean).join(" · ")
    );
    text(el.selectedConfidence, `${client.confidence || 0}% MATCH`);
    setVal(el.clientName, client.client_name || "");
    setVal(el.username, client.username || "");
    setVal(el.package, [client.package_code, client.tier].filter(Boolean).join(" / "));
    setVal(el.membershipStatus, client.membership_status || "");
    setVal(el.lineDisplay, client.line_display_name || "");
    setVal(el.lineUserId, client.line_user_id || "");
    setVal(el.lineRecordId, client.line_record_id || "");
    setVal(el.legacyTags, (client.legacy_tags || []).join(", "));
    setVal(el.customerTelegram, client.customer_telegram_username || "");
    setVal(el.customerTelegramStatus, client.customer_telegram_status || "missing");
    if (el.lineageBadge) {
      text(el.lineageBadge, "Verified lineage");
      el.lineageBadge.classList.add("is-ok");
    }
    if (el.lineageNotice) {
      text(el.lineageNotice, "Lineage verified from package / member / client / LINE identity. ตรวจชื่อและ LINE ให้ตรงก่อนสร้าง session.");
      el.lineageNotice.classList.remove("is-bad");
      el.lineageNotice.classList.add("is-ok");
    }
    renderClients();
    updateAll();
    setStatus("Client lineage selected.", "ok");
    scrollToNode($("#work-panel"));
  }

  function clearClient() {
    state.selectedClient = null;
    [
      el.clientName,
      el.username,
      el.package,
      el.membershipStatus,
      el.lineDisplay,
      el.lineUserId,
      el.lineRecordId,
      el.legacyTags,
      el.customerTelegram
    ].forEach((node) => setVal(node, ""));
    setVal(el.customerTelegramStatus, "missing");
    text(el.clientInitial, "C");
    text(el.selectedClientName, "-");
    text(el.selectedClientMeta, "-");
    text(el.selectedConfidence, "-");
    if (el.lineageBadge) {
      text(el.lineageBadge, "Not selected");
      el.lineageBadge.classList.remove("is-ok");
    }
    if (el.lineageNotice) {
      text(el.lineageNotice, "ยังไม่ได้เลือกลูกค้า");
      el.lineageNotice.classList.remove("is-ok", "is-bad");
    }
    renderClients();
    updateAll();
    scrollToNode($("#client-search"));
  }

  function selectWorkType(type) {
    state.workType = type;
    state.modelFolder = "";
    state.models = [];
    state.selectedModel = null;
    $$('[data-op-work-type]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.opWorkType === type);
    });
    renderFolders();
    renderModels();
    text(el.folderHelper, type === "public" ? "Public Work: เลือกแฟ้ม Travel Model หรือ Extreme Model" : "Private Work: เลือกแฟ้ม VIP หรือ PN");
    setStatus(type === "public" ? "Public Work selected." : "Private Work selected.", "ok");
    updateAll();
    scrollToNode($("#model-panel"));
  }

  function folderLabel(folderId) {
    const all = [...folders.public, ...folders.private];
    return all.find(([id]) => id === folderId)?.[1] || "-";
  }

  function renderFolders() {
    if (!el.folderGrid) return;
    const rows = folders[state.workType] || [];
    if (!rows.length) {
      el.folderGrid.innerHTML = '<div class="mmdop__empty">เลือก Public Work หรือ Private Work ก่อน</div>';
      return;
    }
    el.folderGrid.innerHTML = rows
      .map(([id, title, copy, cta]) => `
        <button class="mmdop__folder${state.modelFolder === id ? " is-selected" : ""}" type="button" data-op-folder="${esc(id)}">
          <span>${esc(state.workType === "public" ? "PUBLIC MODEL FOLDER" : "PRIVATE MODEL FOLDER")}</span>
          <strong>${esc(title)}</strong>
          <p>${esc(copy)}</p>
          <em>${esc(cta)}</em>
        </button>`)
      .join("");
    $$('[data-op-folder]').forEach((button) => {
      button.addEventListener("click", () => selectFolder(button.dataset.opFolder));
    });
  }

  async function selectFolder(folderId) {
    state.modelFolder = folderId;
    state.selectedModel = null;
    renderFolders();
    await loadModels();
    setStatus(`${folderLabel(folderId)} selected.`, "ok");
    updateAll();
  }

  function demoModelsForFolder(folderId) {
    if (folderId === "pn") {
      return demoModels.filter((model) => model.folders.includes("pn") || (model.folders.includes("vip") && model.vip_can_pn));
    }
    return demoModels.filter((model) => model.folders.includes(folderId));
  }

  async function loadModels() {
    if (!state.modelFolder) {
      state.models = [];
      renderModels();
      return;
    }
    if (config.mock) {
      state.models = demoModelsForFolder(state.modelFolder);
      setHook("models", "ok");
      renderModels();
      return;
    }
    setStatus("กำลังโหลด Model Pool...", "");
    try {
      const url = `${api(config.endpoints.modelSearch)}?work_type=${encodeURIComponent(state.workType)}&folder=${encodeURIComponent(state.modelFolder)}`;
      const result = await requestJson(url);
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      state.models = normalizeModels(result.data);
      setHook("models", "ok");
      renderModels();
      setStatus("Model pool loaded.", "ok");
    } catch {
      state.models = [];
      setHook("models", "bad");
      renderModels();
      setStatus("โหลด Model Pool ไม่สำเร็จ กด mock=1 หรือเช็ก endpoint", "bad");
    }
  }

  function renderModels() {
    if (!el.modelSelect) return;
    if (!state.modelFolder) {
      el.modelSelect.innerHTML = '<option value="">เลือกแฟ้ม Model ก่อน</option>';
      setVal(el.modelLookupKey, "");
      setVal(el.modelPool, "");
      text(el.modelRule, "-");
      renderModelPreview();
      return;
    }
    if (!state.models.length) {
      el.modelSelect.innerHTML = '<option value="">ยังไม่มี Model ในแฟ้มนี้</option>';
      setVal(el.modelLookupKey, "");
      setVal(el.modelPool, folderLabel(state.modelFolder));
      text(el.modelRule, "No model");
      renderModelPreview();
      return;
    }
    el.modelSelect.innerHTML =
      '<option value="">เลือก Model</option>' +
      state.models
        .map((model) => {
          const suffix = state.modelFolder === "pn" && model.folders.includes("vip") ? " · VIP compatible" : "";
          return `<option value="${esc(model.model_id)}">${esc(model.model_name + suffix)}</option>`;
        })
        .join("");
    text(el.modelRule, state.modelFolder === "pn" ? "PN shows PN + VIP-compatible models" : folderLabel(state.modelFolder));
    renderModelPreview();
  }

  function selectModel(modelId) {
    const model = state.models.find((item) => item.model_id === modelId) || null;
    state.selectedModel = model;
    if (!model) {
      setVal(el.modelLookupKey, "");
      setVal(el.modelPool, state.modelFolder ? folderLabel(state.modelFolder) : "");
      setVal(el.modelTelegram, "");
      renderModelPreview();
      updateAll();
      return;
    }
    setVal(el.modelLookupKey, model.lookup_key || "");
    setVal(el.modelPool, folderLabel(state.modelFolder));
    setVal(el.modelTelegram, model.telegram_username || "");
    setVal(el.modelTelegramStatus, model.telegram_status || "missing");
    renderModelPreview();
    updateAll();
    scrollToNode($("#gate-panel"));
  }

  function renderModelPreview() {
    if (!el.modelPreview) return;
    const model = state.selectedModel;
    if (!model) {
      el.modelPreview.innerHTML = '<div class="mmdop__empty mmdop__empty--small">ยังไม่ได้เลือก Model</div>';
      return;
    }
    el.modelPreview.innerHTML = `
      <div class="mmdop__modelCard">
        <div class="mmdop__modelIcon">${esc(first(model.model_name, "M"))}</div>
        <div>
          <strong>${esc(model.model_name || "-")}</strong>
          <span>${esc(model.lookup_key || "-")} · ${esc(model.telegram_username || "telegram missing")}</span>
          <span>${esc(model.note || "")}</span>
        </div>
        <b>${esc(model.status || "-")}</b>
      </div>`;
  }

  function statusOk(status) {
    return status === "linked" || status === "verified";
  }

  function updateGate() {
    const customer = String(val(el.customerTelegramStatus) || "missing");
    const model = String(val(el.modelTelegramStatus) || "missing");
    let label = "Waiting";
    let message = "เลือกประเภทงานก่อน ระบบจะประเมิน Telegram Gate ให้";
    let type = "";
    if (state.workType === "public") {
      const ok = statusOk(customer) || customer === "invited";
      label = ok ? "Ready" : "Pending";
      message = ok ? "Public Work ไปต่อได้ แต่ก่อน final readiness ควร linked/verified" : "Public Work ยังพักเป็น telegram_pending ได้";
      type = ok ? "ok" : "";
    }
    if (state.workType === "private") {
      const ok = statusOk(customer) && statusOk(model);
      label = ok ? "Verified" : "Required";
      message = ok ? "Private Work ผ่าน Telegram hard gate แล้ว" : "Private Work ต้องให้ client และ model linked/verified ก่อน activate งานจริง";
      type = ok ? "ok" : "bad";
    }
    text(el.gateLabel, label);
    stateClass(el.gateLabel, type);
    text(el.gateNotice, message);
    stateClass(el.gateNotice, type);
    text(el.statGate, label);
    return { label, customer, model };
  }

  function addMinutes(hhmm, minutesToAdd) {
    const parts = String(hhmm || "").split(":");
    if (parts.length !== 2) return "";
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
    const safe = (((h * 60 + m + minutesToAdd) % 1440) + 1440) % 1440;
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function computeEndTime() {
    const start = String(val(el.start) || "");
    const duration = String(val(el.duration) || "");
    if (!start) return "";
    if (duration === "06:00+") return "more_than_6h";
    const [h, m] = duration.split(":");
    return addMinutes(start, Number(h) * 60 + Number(m));
  }

  function amountNumber() {
    const n = Number(val(el.amount) || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function getMissingFields() {
    const missing = [];
    if (!state.selectedClient) missing.push("Find Client");
    if (!String(val(el.clientName) || "").trim()) missing.push("Client Name");
    if (!String(val(el.lineUserId) || "").trim()) missing.push("LINE User ID");
    if (!state.workType) missing.push("Work Type");
    if (!state.modelFolder) missing.push("Model Folder");
    if (!state.selectedModel) missing.push("Model");
    if (!String(val(el.date) || "").trim()) missing.push("Date");
    if (!String(val(el.start) || "").trim()) missing.push("Start Time");
    if (!String(val(el.duration) || "").trim()) missing.push("Duration");
    if (!String(val(el.location) || "").trim()) missing.push("Location");
    if (!amountNumber() || amountNumber() <= 0) missing.push("Amount");
    if (state.workType === "private") {
      const gate = updateGate();
      if (!statusOk(gate.customer)) missing.push("Customer Telegram");
      if (!statusOk(gate.model)) missing.push("Model Telegram");
      if (!String(val(el.handlingNote) || "").trim()) missing.push("Handling Note");
    }
    return missing;
  }

  function setActiveStep(step) {
    $$('[data-op-step]').forEach((node) => node.classList.toggle("is-active", node.dataset.opStep === step));
    const map = {
      client: ["client", "lineage"],
      work: ["work", "folder"],
      model: ["model"],
      gate: ["gate"],
      create: ["details", "output"]
    };
    $$('[data-op-mini]').forEach((node) => node.classList.toggle("is-active", (map[node.dataset.opMini] || []).includes(step)));
  }

  function setNext(title, copy) {
    text(el.nextAction, title);
    text(el.nextCopy, copy);
  }

  function updateNextAction() {
    const missing = getMissingFields();
    if (!state.selectedClient) {
      setNext("Find Client", "ค้นจาก package / member / LINE lineage ก่อน");
      setActiveStep("client");
      return;
    }
    if (!state.workType) {
      setNext("เลือก Work Type", "เลือก Public Work หรือ Private Work");
      setActiveStep("work");
      return;
    }
    if (!state.modelFolder) {
      setNext("เลือก Model Folder", state.workType === "public" ? "Travel หรือ Extreme" : "VIP หรือ PN");
      setActiveStep("folder");
      return;
    }
    if (!state.selectedModel) {
      setNext("เลือก Model", "เลือก Model จากแฟ้มที่ถูกต้อง");
      setActiveStep("model");
      return;
    }
    const gate = updateGate();
    if (state.workType === "private" && gate.label !== "Verified") {
      setNext("ตรวจ Telegram Gate", "Private Work ต้อง verified ทั้ง client และ model");
      setActiveStep("gate");
      return;
    }
    if (missing.length) {
      setNext("กรอกข้อมูลให้ครบ", missing.slice(0, 2).join(" / "));
      setActiveStep("details");
      return;
    }
    setNext("พร้อมสร้าง Session", "ตรวจข้อมูลแล้วกด Create Session");
    setActiveStep("details");
  }

  function updateStats() {
    text(el.statClient, state.selectedClient ? state.selectedClient.client_name || "-" : "-");
    text(el.statPackage, state.selectedClient ? state.selectedClient.package_code || "-" : "-");
    text(el.statWork, state.workType ? (state.workType === "public" ? "Public Work" : "Private Work") : "-");
    text(el.statFolder, state.modelFolder ? folderLabel(state.modelFolder) : "-");
    text(el.statModel, state.selectedModel ? state.selectedModel.model_name : "-");
    text(el.statStatus, getMissingFields().length ? "Not ready" : "Ready");
    text(el.railFolder, state.modelFolder ? folderLabel(state.modelFolder) : "Not selected");
    if (state.workType === "public") text(el.railFolderCopy, "Public Work ใช้ Travel Model หรือ Extreme Model");
    else if (state.workType === "private") text(el.railFolderCopy, "Private Work ใช้ VIP / PN และ PN รับ VIP-compatible ได้");
    else text(el.railFolderCopy, "Public = Travel / Extreme · Private = VIP / PN");
  }

  function updateReadyState() {
    setVal(el.end, computeEndTime());
    updateGate();
    const missing = getMissingFields();
    if (el.create) el.create.disabled = missing.length > 0;
    text(el.readyLabel, missing.length ? `ยังขาด: ${missing.slice(0, 3).join(" / ")}${missing.length > 3 ? " ..." : ""}` : "Ready to create");
    text(el.readyCopy, missing.length ? "ระบบยังไม่ส่ง create จนกว่าข้อมูลจำเป็นจะครบ" : "ข้อมูลครบแล้ว กด Create Session เพื่อให้ backend คืนลิงก์");
    updateStats();
    updateNextAction();
    if (el.payload && config.debug) el.payload.textContent = JSON.stringify(getPayload(), null, 2);
  }

  function getPayload() {
    const client = state.selectedClient || {};
    const model = state.selectedModel || {};
    const gate = updateGate();
    return {
      flow_version: "mmd_sigil_create_session_external_js_v3",
      source: "sigil_admin_create_session_client_lineage",
      frontend_surface: "operator_only",
      backend_authority: "admin-worker",
      source_of_truth: "airtable_cloud",
      client_lineage: {
        client_id: client.client_id || "",
        client_name: String(val(el.clientName) || client.client_name || ""),
        username: client.username || "",
        phone: client.phone || "",
        package_code: client.package_code || "",
        tier: client.tier || "",
        membership_status: client.membership_status || "",
        purchased_history: client.purchased_history || "",
        legacy_tags: client.legacy_tags || [],
        match_confidence: client.confidence || null
      },
      line_identity: {
        line_record_id: String(val(el.lineRecordId) || client.line_record_id || ""),
        line_user_id: String(val(el.lineUserId) || client.line_user_id || ""),
        line_display_name: String(val(el.lineDisplay) || client.line_display_name || "")
      },
      work: {
        work_type: state.workType,
        job_visibility: state.workType === "private" ? "private" : "public",
        job_lane: state.workType === "private" ? "private_work" : "public_work",
        model_folder: state.modelFolder,
        model_folder_label: folderLabel(state.modelFolder),
        privacy_level: state.workType === "private" ? "restricted" : "standard"
      },
      model: {
        model_id: model.model_id || "",
        model_name: model.model_name || "",
        model_lookup_key: model.lookup_key || "",
        model_pool: state.modelFolder,
        model_pool_rule: state.modelFolder === "pn" ? "pn_allows_vip_compatible" : "strict_folder_match"
      },
      telegram_gate: {
        telegram_required: true,
        customer_telegram_username: String(val(el.customerTelegram) || ""),
        customer_telegram_status: gate.customer,
        model_telegram_username: String(val(el.modelTelegram) || ""),
        model_telegram_status: gate.model,
        requires_customer_telegram: state.workType === "private",
        requires_model_telegram: state.workType === "private",
        block_activation_until_verified: state.workType === "private",
        current_gate_status: gate.label
      },
      job_details: {
        job_date: String(val(el.date) || ""),
        start_time: String(val(el.start) || ""),
        end_time: computeEndTime(),
        work_duration: String(val(el.duration) || ""),
        location_name: String(val(el.location) || ""),
        google_map_url: String(val(el.map) || "")
      },
      payment: {
        amount_thb: amountNumber(),
        payment_type: String(val(el.paymentType) || "full"),
        payment_method: String(val(el.paymentMethod) || "promptpay"),
        points_mode: String(val(el.pointsMode) || "auto")
      },
      human_support: {
        assigned_assistant: String(val(el.humanAssistant) || "Ewvon"),
        escalation_owner: String(val(el.escalationOwner) || "Boss Per")
      },
      notes: {
        handling_note: String(val(el.handlingNote) || ""),
        operation_note: String(val(el.note) || "")
      },
      return_link_policy: {
        token_param: "t",
        links_must_come_from_backend: true
      },
      requested_outputs: [
        "session_id",
        "payment_ref",
        "customer_confirmation_url",
        "model_confirmation_url",
        "member_return_url",
        "model_return_url",
        "line_push_status",
        "telegram_notify_status"
      ]
    };
  }

  async function saveDraft() {
    if (!state.selectedClient) {
      setStatus("เลือก client ก่อนบันทึก draft", "bad");
      return;
    }
    const payload = getPayload();
    if (config.mock) {
      state.draftId = `draft_demo_${Date.now()}`;
      setStatus(`Demo cloud draft saved: ${state.draftId}`, "ok");
      return;
    }
    setStatus("กำลังบันทึก cloud draft...", "");
    try {
      const result = await requestJson(api(config.endpoints.saveDraft), {
        method: "POST",
        body: JSON.stringify({ draft_id: state.draftId || "", payload })
      });
      if (!result.ok || result.data?.ok === false) throw new Error(result.data?.error || result.data?.message || `HTTP ${result.status}`);
      state.draftId = pick(result.data, "draft_id", "id") || state.draftId;
      setStatus("Cloud draft saved.", "ok");
    } catch {
      setStatus("บันทึก cloud draft ไม่สำเร็จ", "bad");
    }
  }

  async function fillDemoJob() {
    if (!state.selectedClient) {
      state.clients = demoClients.slice();
      renderClients();
      selectClient(state.clients[0].client_id);
    }
    if (!state.workType) selectWorkType("public");
    if (!state.modelFolder) await selectFolder(state.workType === "private" ? "vip" : "travel");
    if (!state.selectedModel) {
      const firstModel = state.models[0] || demoModelsForFolder(state.modelFolder)[0];
      if (firstModel && el.modelSelect) {
        if (!state.models.length) {
          state.models = demoModelsForFolder(state.modelFolder);
          renderModels();
        }
        el.modelSelect.value = firstModel.model_id;
        selectModel(firstModel.model_id);
      }
    }
    if (state.workType === "private") {
      setVal(el.customerTelegramStatus, statusOk(val(el.customerTelegramStatus)) ? val(el.customerTelegramStatus) : "verified");
      setVal(el.modelTelegramStatus, "verified");
      setVal(el.handlingNote, "Private Work handling. Ewvon follows up if needed. Escalate to Boss Per for exceptions.");
    } else {
      setVal(el.modelTelegramStatus, "linked");
      setVal(el.handlingNote, "");
    }
    setVal(el.date, "2026-05-03");
    setVal(el.start, "20:00");
    setVal(el.duration, "01:30");
    setVal(el.location, "SAM E. Hotel Bangkok Sathorn");
    setVal(el.map, "https://maps.app.goo.gl/DUCVVE7utkxFmmtt7");
    setVal(el.amount, state.workType === "private" ? "18000" : "8000");
    setVal(el.paymentType, "full");
    setVal(el.paymentMethod, "promptpay");
    setVal(el.pointsMode, "auto");
    setVal(el.humanAssistant, "Ewvon");
    setVal(el.escalationOwner, "Boss Per");
    setVal(el.note, "Created from Client Lineage flow.");
    updateAll();
    setStatus("Demo job data filled.", "ok");
  }

  async function createSession() {
    const missing = getMissingFields();
    if (missing.length) {
      setStatus(`ยังกรอกไม่ครบ: ${missing.join(" / ")}`, "bad");
      updateAll();
      return;
    }
    const payload = getPayload();
    state.lastPayload = payload;
    if (el.payload) el.payload.textContent = JSON.stringify(payload, null, 2);
    if (el.create) el.create.disabled = true;
    text(el.statStatus, "Creating");
    setStatus("กำลังสร้าง session...", "");
    try {
      let data;
      if (config.mock) {
        data = mockCreateResponse(payload);
      } else {
        const result = await requestJson(api(config.endpoints.createSession), {
          method: "POST",
          body: JSON.stringify(payload)
        });
        if (!result.ok || result.data?.ok === false) throw new Error(result.data?.error || result.data?.message || `HTTP ${result.status}`);
        data = result.data || {};
      }
      setHook("create", "ok");
      fillOutput(payload, data);
      state.created = data;
      if (el.output) el.output.hidden = false;
      setActiveStep("output");
      updateStats();
      setStatus("Session created. Links are ready.", "ok");
      scrollToNode(el.output);
    } catch {
      setHook("create", "bad");
      setStatus("ยังสร้าง session ไม่สำเร็จ กรุณาตรวจ backend endpoint หรือ payload", "bad");
      text(el.statStatus, "Failed");
      updateAll();
    } finally {
      if (el.create) el.create.disabled = false;
    }
  }

  function mockCreateResponse(payload) {
    const token = `demo_t_${Math.random().toString(36).slice(2, 12)}`;
    return {
      ok: true,
      session_id: `sess_demo_${Date.now()}`,
      payment_ref: `PAY-DEMO-${String(Date.now()).slice(-6)}`,
      customer_confirmation_url: `https://mmdbkk.com/confirm/job-confirmation?t=${token}_c`,
      model_confirmation_url: `https://mmdbkk.com/confirm/job-confirmation?t=${token}_m`,
      member_return_url: `https://mmdbkk.com/sigil/member/account?t=${token}_r`,
      model_return_url: `https://mmdbkk.com/sigil/model/dashboard?t=${token}_mr`,
      line_push_status: "not_sent",
      telegram_notify_status: payload.work.job_visibility === "private" ? "private_gate_checked" : "pending"
    };
  }

  function fillOutput(payload, data) {
    const out = {
      session_id: pick(data, "session_id", "sessionId", "id"),
      payment_ref: pick(data, "payment_ref", "paymentRef"),
      customer_confirmation_url: pick(data, "customer_confirmation_url", "customer_confirm_url", "customer_url"),
      model_confirmation_url: pick(data, "model_confirmation_url", "model_confirm_url", "model_url"),
      member_return_url: pick(data, "member_return_url", "member_dashboard_url"),
      model_return_url: pick(data, "model_return_url", "model_dashboard_url"),
      line_push_status: pick(data, "line_push_status") || "not_sent",
      telegram_notify_status: pick(data, "telegram_notify_status") || "pending"
    };
    text(el.outSessionId, out.session_id || "-");
    text(el.outPaymentRef, out.payment_ref || "-");
    text(el.outLineStatus, out.line_push_status || "not_sent");
    text(el.outTelegramStatus, out.telegram_notify_status || "pending");
    setVal(el.outCustomerUrl, out.customer_confirmation_url || "");
    setVal(el.outModelUrl, out.model_confirmation_url || "");
    setVal(el.outMemberUrl, out.member_return_url || "");
    setVal(el.outModelReturnUrl, out.model_return_url || "");
    setVal(el.outCustomerMessage, customerMessage(payload, out));
    setVal(el.outModelMessage, modelMessage(payload, out));
  }

  function customerMessage(payload, out) {
    return [
      `${payload.client_lineage.client_name || "คุณ"} ครับ`,
      "",
      "ขอส่งลิงก์ยืนยัน session ของ MMD SĪGIL ให้ทางนี้นะครับ",
      out.customer_confirmation_url || "",
      "",
      payload.job_details.job_date || payload.job_details.start_time
        ? `วันเวลา: ${[payload.job_details.job_date, payload.job_details.start_time].filter(Boolean).join(" · ")}`
        : "",
      payload.job_details.location_name ? `สถานที่: ${payload.job_details.location_name}` : "",
      payload.payment.amount_thb ? `ยอดรวม: ${Number(payload.payment.amount_thb).toLocaleString("th-TH")} THB` : "",
      "",
      "หากต้องมีขั้นตอนเพิ่มเติม เดี๋ยวระบบจะพาไปหน้าที่ถูกต้องครับ"
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  function modelMessage(payload, out) {
    return [
      `${payload.model.model_name || "Model"} ครับ`,
      "",
      "ขอส่งลิงก์ยืนยันงานจาก MMD SĪGIL:",
      out.model_confirmation_url || "",
      "",
      payload.job_details.job_date || payload.job_details.start_time
        ? `วันเวลา: ${[payload.job_details.job_date, payload.job_details.start_time].filter(Boolean).join(" · ")}`
        : "",
      payload.job_details.location_name ? `สถานที่: ${payload.job_details.location_name}` : "",
      payload.job_details.work_duration ? `ระยะเวลา: ${payload.job_details.work_duration}` : "",
      "",
      "กรุณาตรวจ brief และยืนยัน readiness ผ่านลิงก์นี้ครับ"
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  async function pushLine() {
    if (!state.lastPayload || !state.created) {
      setStatus("ยังไม่มี session ที่สร้างแล้วสำหรับ push LINE", "bad");
      return;
    }
    const message = val(el.outCustomerMessage);
    if (!message) {
      setStatus("Customer message is empty.", "bad");
      return;
    }
    setStatus("กำลังส่ง LINE message...", "");
    if (el.pushLine) el.pushLine.disabled = true;
    try {
      let data;
      if (config.mock) {
        data = { ok: true, line_push_status: "sent_demo" };
      } else {
        const result = await requestJson(api(config.endpoints.pushLine), {
          method: "POST",
          body: JSON.stringify({
            line_record_id: state.lastPayload.line_identity.line_record_id,
            line_user_id: state.lastPayload.line_identity.line_user_id,
            session_id: pick(state.created, "session_id", "sessionId", "id"),
            message,
            source: "sigil_create_session_external_js"
          })
        });
        if (!result.ok || result.data?.ok === false) throw new Error(result.data?.error || result.data?.message || `HTTP ${result.status}`);
        data = result.data || {};
      }
      setHook("push", "ok");
      text(el.outLineStatus, data.line_push_status || "sent");
      setStatus("LINE message sent.", "ok");
    } catch {
      setHook("push", "bad");
      text(el.outLineStatus, "failed");
      setStatus("ยังส่ง LINE ไม่สำเร็จ ตอนนี้ copy message ไปส่งเองก่อนได้", "bad");
    } finally {
      if (el.pushLine) el.pushLine.disabled = false;
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setStatus("Copied.", "ok");
    } catch {
      setStatus("Copy failed.", "bad");
    }
  }

  function resetAll() {
    state.clients = [];
    state.selectedClient = null;
    state.workType = "";
    state.modelFolder = "";
    state.models = [];
    state.selectedModel = null;
    state.draftId = "";
    state.created = null;
    state.lastPayload = null;
    [
      el.query,
      el.clientName,
      el.username,
      el.package,
      el.membershipStatus,
      el.lineDisplay,
      el.lineUserId,
      el.lineRecordId,
      el.legacyTags,
      el.customerTelegram,
      el.modelTelegram,
      el.modelLookupKey,
      el.modelPool,
      el.date,
      el.start,
      el.end,
      el.location,
      el.map,
      el.amount,
      el.handlingNote,
      el.note
    ].forEach((node) => setVal(node, ""));
    setVal(el.customerTelegramStatus, "missing");
    setVal(el.modelTelegramStatus, "missing");
    setVal(el.paymentType, "full");
    setVal(el.paymentMethod, "promptpay");
    setVal(el.pointsMode, "auto");
    setVal(el.duration, "01:30");
    setVal(el.humanAssistant, "Ewvon");
    setVal(el.escalationOwner, "Boss Per");
    text(el.clientInitial, "C");
    text(el.selectedClientName, "-");
    text(el.selectedClientMeta, "-");
    text(el.selectedConfidence, "-");
    if (el.lineageBadge) {
      text(el.lineageBadge, "Not selected");
      el.lineageBadge.classList.remove("is-ok");
    }
    if (el.lineageNotice) {
      text(el.lineageNotice, "ยังไม่ได้เลือกลูกค้า");
      el.lineageNotice.classList.remove("is-ok", "is-bad");
    }
    if (el.output) el.output.hidden = true;
    if (el.payload) el.payload.textContent = "{}";
    $$('[data-op-work-type]').forEach((button) => button.classList.remove("is-selected"));
    renderClients();
    renderFolders();
    renderModels();
    renderModelPreview();
    updateAll();
    setStatus("Ready.", "");
    scrollToNode(root);
  }

  function renderDurations() {
    if (!el.duration) return;
    el.duration.innerHTML = durations.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
    el.duration.value = "01:30";
  }

  function updateAll() {
    updateReadyState();
  }

  function bindEvents() {
    el.checkSession?.addEventListener("click", checkSession);
    el.searchClient?.addEventListener("click", () => searchClients(false));
    el.demoClient?.addEventListener("click", () => searchClients(true));
    el.loadRecent?.addEventListener("click", loadRecentClients);
    el.clearClient?.addEventListener("click", clearClient);
    el.query?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchClients(false);
    });
    $$('[data-op-quick-query]').forEach((button) => {
      button.addEventListener("click", () => {
        setVal(el.query, button.dataset.opQuickQuery || "");
        searchClients(false);
      });
    });
    $$('[data-op-work-type]').forEach((button) => {
      button.addEventListener("click", () => selectWorkType(button.dataset.opWorkType));
    });
    el.refreshModels?.addEventListener("click", loadModels);
    el.modelSelect?.addEventListener("change", () => selectModel(el.modelSelect.value));
    [
      el.clientName,
      el.customerTelegram,
      el.customerTelegramStatus,
      el.modelTelegram,
      el.modelTelegramStatus,
      el.date,
      el.start,
      el.duration,
      el.location,
      el.map,
      el.amount,
      el.paymentType,
      el.paymentMethod,
      el.pointsMode,
      el.humanAssistant,
      el.escalationOwner,
      el.handlingNote,
      el.note
    ].forEach((node) => {
      node?.addEventListener("input", updateAll);
      node?.addEventListener("change", updateAll);
    });
    el.saveDraft?.addEventListener("click", saveDraft);
    el.fillDemoJob?.addEventListener("click", fillDemoJob);
    el.create?.addEventListener("click", createSession);
    el.pushLine?.addEventListener("click", pushLine);
    el.newSession?.addEventListener("click", resetAll);
    el.copyCustomerLink?.addEventListener("click", () => copyText(val(el.outCustomerUrl)));
    el.copyModelLink?.addEventListener("click", () => copyText(val(el.outModelUrl)));
    el.copyCustomerMsg?.addEventListener("click", () => copyText(val(el.outCustomerMessage)));
    el.copyModelMsg?.addEventListener("click", () => copyText(val(el.outModelMessage)));
    if (el.debugToggle && config.debug) {
      el.debugToggle.hidden = false;
      if (el.debugPanel) el.debugPanel.hidden = false;
      el.debugToggle.addEventListener("click", () => {
        if (!el.debugPanel) return;
        el.debugPanel.open = !el.debugPanel.open;
        if (el.payload) el.payload.textContent = JSON.stringify(getPayload(), null, 2);
      });
    }
  }

  function init() {
    renderDurations();
    renderFolders();
    renderModels();
    bindEvents();
    setVal(el.humanAssistant, "Ewvon");
    setVal(el.escalationOwner, "Boss Per");
    setVal(el.paymentMethod, "promptpay");
    setVal(el.pointsMode, "auto");
    updateAll();
    setStatus("ค้นหาลูกค้าก่อนสร้าง session", "");
    if (config.mock) {
      setConnection("ok", "Demo Mode");
      setHook("auth", "ok");
      state.clients = demoClients.slice();
      renderClients();
      return;
    }
    checkSession();
  }

  init();
})();
