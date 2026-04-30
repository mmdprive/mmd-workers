(() => {
  "use strict";

  const API = {
    status: "/member/api/renewal/status",
    intake: "/member/api/renewal/intake",
  };

  const VIP_POINTS_REQUIRED = 1200;
  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value || "").trim();
  const formatPoints = (value) => Number(value || 0).toLocaleString("th-TH");

  const state = {
    action: "VIP_RENEWAL",
    paymentMethod: "Points / Per Review",
    lastStatus: null,
    pointsBalance: null,
    pointsShortfall: null,
    route: "unknown",
  };

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function value(id) {
    const el = byId(id);
    return el && "value" in el ? clean(el.value) : "";
  }

  function fileName(id) {
    const el = byId(id);
    if (!el || !el.files || !el.files.length) return "ไม่มี";
    return el.files[0].name || "มีไฟล์แนบ";
  }

  function email() {
    return value("emailNow") || value("emailOld");
  }

  function syncSummary() {
    setText("sumNick", value("nick") || "—");
    setText("sumEmail", email() || "—");
    setText("sumContact", [value("phone"), value("telegram")].filter(Boolean).join(" / ") || "—");
    setText("sumProof", fileName("oldProof"));
    setText("sumPay", state.paymentMethod);
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent || "";
      button.textContent = label;
      button.disabled = true;
      button.style.opacity = "0.7";
      return;
    }
    button.textContent = button.dataset.originalText || button.textContent || "";
    button.disabled = false;
    button.style.opacity = "";
  }

  function validate() {
    const missing = [];
    if (!value("nick")) missing.push("ชื่อเล่น");
    if (!email()) missing.push("email");
    if (!value("phone")) missing.push("เบอร์โทร");
    if (!value("telegram")) missing.push("Telegram");
    if (missing.length) {
      alert("ขอข้อมูลเพิ่มก่อนครับ: " + missing.join(", "));
      return false;
    }
    return true;
  }

  function statusPayload() {
    return {
      nickname: value("nick"),
      display_name: value("nick"),
      email_primary: value("emailNow"),
      email_secondary: value("emailOld"),
      phone: value("phone"),
      telegram_username: value("telegram"),
      search_priority: state.action === "PER_REVIEW" ? "per_review" : "vip_renewal",
      source_page: "sigil_inme_renewal",
      include_context: false,
    };
  }

  function intakePayload() {
    return {
      flow: state.route === "per_review" ? "review" : "renewal",
      source_page: "sigil_inme_renewal",
      display_name: value("nick"),
      nickname: value("nick"),
      email: email(),
      email_primary: value("emailNow"),
      email_secondary: value("emailOld"),
      phone: value("phone"),
      telegram_username: value("telegram"),
      target_tier: "vip",
      points_required: VIP_POINTS_REQUIRED,
      points_balance: state.pointsBalance,
      points_shortfall: state.pointsShortfall,
      points_action: state.route,
      payment_method: state.paymentMethod,
      service_history_note: [
        `proof:${fileName("oldProof")}`,
        `route:${state.route}`,
        `points_required:${VIP_POINTS_REQUIRED}`,
        `points_balance:${state.pointsBalance ?? "unknown"}`,
        `points_shortfall:${state.pointsShortfall ?? "unknown"}`,
      ].join("; "),
      notify_telegram: true,
    };
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) throw new Error("request_failed");
    return data;
  }

  function decideRoute(result) {
    const balance = Number(result?.points_balance ?? result?.context?.points?.balance ?? NaN);
    if (!Number.isFinite(balance)) {
      state.pointsBalance = null;
      state.pointsShortfall = null;
      state.route = "per_review";
      state.paymentMethod = "Points / Per Review";
      return "ยังอ่าน points balance อัตโนมัติไม่ได้ครับ ผมจะรับไว้เป็น Per review ก่อน";
    }

    state.pointsBalance = balance;
    state.pointsShortfall = Math.max(0, VIP_POINTS_REQUIRED - balance);

    if (state.action === "PER_REVIEW") {
      state.route = "per_review";
      state.paymentMethod = "Points / Per Review";
      return `มี ${formatPoints(balance)} points · รับเป็น Per review ให้ก่อนครับ`;
    }

    if (balance >= VIP_POINTS_REQUIRED) {
      state.route = "vip_auto";
      state.paymentMethod = "Points";
      return `มี ${formatPoints(balance)} points · พร้อมเปิด / ต่อสิทธิ์ VIP 1,200 points`;
    }

    state.route = "points_topup_required";
    state.paymentMethod = "Top up / Per Review";
    return `มี ${formatPoints(balance)} points · ขาดอีก ${formatPoints(state.pointsShortfall)} points เพื่อเปิด / ต่อสิทธิ์ VIP`;
  }

  function renderStatus(data) {
    state.lastStatus = data;
    const result = data && data.data ? data.data : null;
    const found = result?.found ? "พบข้อมูลสมาชิก" : "ยังไม่พบข้อมูลเดิม";
    const routeText = decideRoute(result || {});
    setText("sumStatus", `${found} · ${routeText}`);
    syncSummary();
  }

  function setActive(selector, active) {
    document.querySelectorAll(selector).forEach((button) => button.classList.remove("active"));
    active.classList.add("active");
  }

  function bindActions() {
    document.querySelectorAll(".mmd-choice[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        setActive(".mmd-choice[data-action]", button);
        state.action = button.dataset.action || "VIP_RENEWAL";
        state.route = state.action === "PER_REVIEW" ? "per_review" : "unknown";
        state.lastStatus = null;
        setText("sumStatus", state.action === "PER_REVIEW" ? "ผมจะรับไว้ตรวจเป็น Per review ก่อนครับ" : "VIP Access ใช้ 1,200 points");
      });
    });
  }

  function bindPayments() {
    document.querySelectorAll(".mmd-pay[data-pay]").forEach((button) => {
      button.addEventListener("click", () => {
        setActive(".mmd-pay[data-pay]", button);
        state.paymentMethod = button.dataset.pay || "Points / Per Review";
        syncSummary();
      });
    });
  }

  function bindInputs() {
    ["nick", "emailNow", "emailOld", "phone", "telegram", "oldProof"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", syncSummary);
      el.addEventListener("change", syncSummary);
    });
  }

  function bindPrimary() {
    const check = byId("checkBtn");
    if (check) {
      check.addEventListener("click", async () => {
        syncSummary();
        if (!validate()) return;
        setBusy(check, true, "กำลังเช็ก points...");
        setText("sumStatus", "กำลังเช็ก points balance กับระบบ MMD ครับ");
        try {
          renderStatus(await postJson(API.status, statusPayload()));
        } catch (error) {
          state.route = "per_review";
          state.paymentMethod = "Points / Per Review";
          setText("sumStatus", "เช็ก points อัตโนมัติไม่สำเร็จ ผมจะรับเป็น Per review ก่อนครับ");
          syncSummary();
        } finally {
          setBusy(check, false);
        }
      });
    }

    const submit = byId("submitBtn");
    if (submit) {
      submit.addEventListener("click", async () => {
        syncSummary();
        if (!validate()) return;
        const consent = byId("consent");
        if (!consent || !consent.checked) {
          alert("กรุณาติ๊กยินยอมก่อนส่งตรวจสิทธิ์ครับ");
          return;
        }
        setBusy(submit, true, "กำลังส่งข้อมูล...");
        try {
          await postJson(API.intake, intakePayload());
          const done = state.route === "vip_auto" ? "ส่งคำขอเปิด / ต่อสิทธิ์ VIP ด้วย points แล้วครับ" : "ส่งเข้า Per review แล้วครับ";
          setText("sumStatus", done);
          alert(done);
        } catch (error) {
          setText("sumStatus", "ส่งอัตโนมัติไม่สำเร็จ กรุณาทัก Per โดยตรงครับ");
        } finally {
          setBusy(submit, false);
        }
      });
    }
  }

  function init() {
    bindInputs();
    bindActions();
    bindPayments();
    bindPrimary();
    syncSummary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
