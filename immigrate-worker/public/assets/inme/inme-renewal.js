(() => {
  "use strict";

  const API = {
    status: "/member/api/renewal/status",
    intake: "/member/api/renewal/intake",
    topup: "/member/api/points/topup",
    activate: "/member/api/renewal/activate-vip",
  };

  const VIP_POINTS_REQUIRED = 1200;
  const POINT_THB_RATE = 100;
  const TRUST_INME_URL = "/trust/inme";
  const GAP_DAYS_LIMIT = 365;
  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value || "").trim();
  const formatPoints = (value) => Number(value || 0).toLocaleString("th-TH");
  const formatTHB = (value) => Number(value || 0).toLocaleString("th-TH");

  const COPY = {
    defaultStatus: "รอให้ผมอ่านข้อมูลให้ก่อนครับ",
    loading: "ขอผมเช็กข้อมูลของคุณสักครู่นะครับ",
    checking: "กำลังดู points และประวัติที่เกี่ยวข้องให้ครับ",
    apiFail: "ระบบเช็กอัตโนมัติยังไม่ตอบกลับครับ · ไม่เป็นไร เดี๋ยวผมรับไว้ดูต่อให้ก่อน",
    missingConsent: "กรุณาติ๊กยินยอมก่อนส่งตรวจสิทธิ์ครับ",
    checkFirst: "ขอผมเช็กข้อมูลก่อนส่งต่อครับ จะได้พาไปทางที่เหมาะที่สุด",
    submitBusy: "กำลังพาคุณไปขั้นตอนถัดไป...",
    review: "เคสนี้ผมขอดูให้เองก่อนครับ · ข้อมูลบางส่วนยังต้องตรวจเพิ่มนิดหนึ่ง",
  };

  const state = {
    action: "VIP_RENEWAL",
    paymentMethod: "Points / Per Review",
    lastStatus: null,
    pointsBalance: null,
    pointsShortfall: null,
    topupAmountTHB: null,
    route: "unknown",
    requiresNewSignup: false,
    reason: "",
  };

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function setStatus(value, kind = "waiting") {
    setText("sumStatus", value);
    const statusEl = byId("sumStatus");
    if (statusEl) {
      statusEl.dataset.statusKind = kind;
      statusEl.classList.remove("is-success", "is-warning", "is-review", "is-waiting");
      statusEl.classList.add(`is-${kind}`);
    }
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
      alert("ขอข้อมูลเพิ่มอีกนิดนะครับ: " + missing.join(", "));
      return false;
    }
    return true;
  }

  function identityPayload() {
    return {
      display_name: value("nick"),
      nickname: value("nick"),
      email: email(),
      email_primary: value("emailNow"),
      email_secondary: value("emailOld"),
      phone: value("phone"),
      telegram_username: value("telegram"),
    };
  }

  function statusPayload() {
    return {
      ...identityPayload(),
      search_priority: state.action === "PER_REVIEW" ? "per_review" : "vip_renewal",
      source_page: "sigil_inme_renewal",
      include_context: false,
    };
  }

  function baseFlowPayload(extra = {}) {
    return {
      ...identityPayload(),
      source_page: "sigil_inme_renewal",
      target_tier: "vip",
      points_required: VIP_POINTS_REQUIRED,
      points_balance: state.pointsBalance,
      points_shortfall: state.pointsShortfall,
      topup_amount_thb: state.topupAmountTHB,
      points_action: state.route,
      payment_method: state.paymentMethod,
      requires_new_signup: state.requiresNewSignup,
      reason: state.reason,
      fallback_url: state.requiresNewSignup ? TRUST_INME_URL : "",
      service_history_note: [
        `proof:${fileName("oldProof")}`,
        `route:${state.route}`,
        `reason:${state.reason || "none"}`,
        `requires_new_signup:${state.requiresNewSignup}`,
        `points_required:${VIP_POINTS_REQUIRED}`,
        `points_balance:${state.pointsBalance ?? "unknown"}`,
        `points_shortfall:${state.pointsShortfall ?? "unknown"}`,
        `topup_amount_thb:${state.topupAmountTHB ?? "none"}`,
      ].join("; "),
      notify_telegram: true,
      ...extra,
    };
  }

  function intakePayload() {
    return baseFlowPayload({
      flow: state.route === "per_review" ? "review" : state.route === "trust_inme_resignup_required" ? "resignup_required" : "renewal",
    });
  }

  function topupPayload() {
    return baseFlowPayload({
      flow: "points_topup",
      amount_thb: state.topupAmountTHB,
      points_to_add: state.pointsShortfall,
      payment_type: "points_topup",
    });
  }

  function activatePayload() {
    return baseFlowPayload({
      flow: "vip_auto_activate",
      points_to_deduct: VIP_POINTS_REQUIRED,
      activation_type: "vip_renewal",
    });
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

  function daysSince(dateLike) {
    const raw = clean(dateLike);
    if (!raw) return null;
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.floor((Date.now() - time) / 86400000);
  }

  function getLastServiceDate(result) {
    return result?.last_service_at || result?.last_session_at || result?.last_used_at || result?.context?.current_status?.latest_session_at || result?.context?.membership?.last_service_at || "";
  }

  function isFormerMemberGapOver365(result) {
    const found = Boolean(result?.found || result?.member_id || result?.memberstack_id || result?.current_tier || result?.membership_status);
    const gapDays = daysSince(getLastServiceDate(result));
    return found && gapDays !== null && gapDays > GAP_DAYS_LIMIT;
  }

  function decideRoute(result) {
    state.requiresNewSignup = false;
    state.reason = "";

    if (isFormerMemberGapOver365(result)) {
      state.route = "trust_inme_resignup_required";
      state.paymentMethod = "สมัครสมาชิกใหม่ก่อน";
      state.requiresNewSignup = true;
      state.reason = "former_member_gap_over_365_soft_review";
      state.pointsShortfall = null;
      state.topupAmountTHB = null;
      return "ผมเจอประวัติเดิมของคุณแล้วครับ · แต่ห่างจากการใช้งานไปนาน ผมขอพาไปสมัครสมาชิกใหม่ก่อน แล้วค่อยดูข้อมูลเดิมให้ต่อ";
    }

    const balance = Number(result?.points_balance ?? result?.context?.points?.balance ?? NaN);
    if (!Number.isFinite(balance)) {
      state.pointsBalance = null;
      state.pointsShortfall = null;
      state.topupAmountTHB = null;
      state.route = "per_review";
      state.paymentMethod = "Points / Per Review";
      return COPY.review;
    }

    state.pointsBalance = balance;
    state.pointsShortfall = Math.max(0, VIP_POINTS_REQUIRED - balance);
    state.topupAmountTHB = state.pointsShortfall > 0 ? state.pointsShortfall * POINT_THB_RATE : 0;

    if (state.action === "PER_REVIEW") {
      state.route = "per_review";
      state.paymentMethod = "Points / Per Review";
      return `เคสนี้ผมขอดูให้เองก่อนครับ · ตอนนี้มี ${formatPoints(balance)} points ผมจะอ่านประวัติประกอบให้อีกที`;
    }

    if (balance >= VIP_POINTS_REQUIRED) {
      state.route = "vip_auto";
      state.paymentMethod = "Points";
      return `พร้อมแล้วครับ · คุณมี ${formatPoints(balance)} points ผมสามารถเปิด / ต่อสิทธิ์ VIP ให้ได้เลย`;
    }

    state.route = "points_topup_required";
    state.paymentMethod = "Top up Points";
    return `เกือบพร้อมแล้วครับ · ตอนนี้มี ${formatPoints(balance)} points ขาดอีก ${formatPoints(state.pointsShortfall)} points เดี๋ยวผมพาเติมเฉพาะส่วนที่ขาด`;
  }

  function renderStatus(data) {
    state.lastStatus = data;
    const result = data && data.data ? data.data : null;
    const routeText = decideRoute(result || {});
    const kind = state.route === "vip_auto" ? "success" : state.route === "points_topup_required" ? "warning" : state.route === "per_review" ? "review" : "waiting";
    setStatus(routeText, kind);
    syncSummary();
  }

  async function runFinalFlow() {
    if (state.route === "trust_inme_resignup_required") {
      await postJson(API.intake, intakePayload()).catch(() => null);
      window.location.href = TRUST_INME_URL;
      return "ผมกำลังพาไปสมัครสมาชิกใหม่ก่อนนะครับ ข้อมูลเดิมที่ควรดูต่อผมจะไม่ตัดทิ้งครับ";
    }

    if (state.route === "vip_auto") {
      try {
        await postJson(API.activate, activatePayload());
        return "เรียบร้อยครับ ผมส่งคำขอเปิด / ต่อสิทธิ์ VIP ด้วย points ให้แล้ว";
      } catch (error) {
        await postJson(API.intake, intakePayload());
        return "ระบบหัก points อัตโนมัติยังไม่สำเร็จครับ · ไม่เป็นไร ผมรับไว้ดูต่อให้ก่อน";
      }
    }

    if (state.route === "points_topup_required") {
      try {
        const response = await postJson(API.topup, topupPayload());
        const payUrl = response?.data?.payment_url || response?.payment_url || response?.data?.url || response?.url;
        if (payUrl) window.location.href = payUrl;
        return payUrl ? "เดี๋ยวผมพาไปเติม points เฉพาะส่วนที่ขาดครับ" : "ผมสร้างคำขอเติม points ให้แล้วครับ";
      } catch (error) {
        await postJson(API.intake, intakePayload());
        return "ระบบเติม points อัตโนมัติยังไม่สำเร็จครับ · ผมรับไว้ดูต่อให้ก่อน";
      }
    }

    await postJson(API.intake, intakePayload());
    return "รับเรื่องแล้วครับ เดี๋ยวผมตรวจสิทธิ์ให้ต่อเอง";
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
        setStatus(state.action === "PER_REVIEW" ? "เคสนี้ผมจะดูให้เองก่อนครับ" : "คุณไม่ต้องรู้สถานะตัวเองก่อนครับ · กรอกเท่าที่จำได้ เดี๋ยวผมพาไปทางที่เหมาะที่สุดเอง", "waiting");
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
        setBusy(check, true, "ขอผมเช็กสักครู่นะครับ...");
        setStatus(COPY.checking, "waiting");
        try {
          renderStatus(await postJson(API.status, statusPayload()));
        } catch (error) {
          state.route = "per_review";
          state.paymentMethod = "Points / Per Review";
          setStatus(COPY.apiFail, "review");
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
          alert(COPY.missingConsent);
          return;
        }
        if (state.route === "unknown") {
          alert(COPY.checkFirst);
          return;
        }
        setBusy(submit, true, COPY.submitBusy);
        try {
          const done = await runFinalFlow();
          setStatus(done, state.route === "vip_auto" ? "success" : "review");
          alert(done);
        } catch (error) {
          setStatus("ส่งอัตโนมัติไม่สำเร็จครับ · กรุณาทัก Per โดยตรงพร้อมข้อมูลที่กรอกไว้", "review");
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
    setStatus(COPY.defaultStatus, "waiting");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
