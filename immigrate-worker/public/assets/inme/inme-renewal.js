(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const text = (value, fallback = "—") => {
    const output = String(value || "").trim();
    return output || fallback;
  };

  const state = {
    action: "RENEWAL",
    paymentMethod: "Bank Transfer",
  };

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function getValue(id) {
    const el = byId(id);
    return el && "value" in el ? String(el.value || "").trim() : "";
  }

  function getFileName(id) {
    const el = byId(id);
    if (!el || !el.files || !el.files.length) return "ไม่มี";
    return el.files[0].name || "มีไฟล์แนบ";
  }

  function getPrimaryEmail() {
    return getValue("emailNow") || getValue("emailOld");
  }

  function syncSummary() {
    setText("sumNick", text(getValue("nick")));
    setText("sumEmail", text(getPrimaryEmail()));

    const contact = [getValue("phone"), getValue("telegram")].filter(Boolean).join(" / ");
    setText("sumContact", text(contact));
    setText("sumProof", getFileName("oldProof"));
    setText("sumPay", state.paymentMethod);
  }

  function setActiveButton(selector, activeButton) {
    document.querySelectorAll(selector).forEach((button) => button.classList.remove("active"));
    activeButton.classList.add("active");
  }

  function validateBaseForm() {
    const missing = [];
    if (!getValue("nick")) missing.push("ชื่อเล่น");
    if (!getPrimaryEmail()) missing.push("email อย่างน้อย 1 ช่อง");
    if (!getValue("phone")) missing.push("เบอร์โทร");
    if (!getValue("telegram")) missing.push("Telegram username");

    if (missing.length) {
      alert(`ขอข้อมูลเพิ่มก่อนครับ: ${missing.join(", ")}`);
      return false;
    }

    return true;
  }

  function openModal(type) {
    const modal = byId("mmdModal");
    const modalContent = byId("modalContent");
    if (!modal || !modalContent) return;

    if (type === "bank") {
      modalContent.innerHTML = [
        '<div class="mmd-kicker">PRIVATE BANK DETAILS</div>',
        '<h2>รายละเอียดการโอนสำหรับเคสนี้ครับ</h2>',
        '<div class="mmd-bank-line"><span>ธนาคาร</span><strong>ธนาคารกรุงไทย (KTB)</strong></div>',
        '<div class="mmd-bank-line"><span>ชื่อบัญชี</span><strong>ธัชชะ ป.</strong></div>',
        '<div class="mmd-bank-line"><span>เลขบัญชี</span><strong>1420335898</strong></div>',
        '<label>อัพโหลดสลิป</label>',
        '<input type="file" accept="image/*,.pdf">',
      ].join("");
    }

    if (type === "qr") {
      modalContent.innerHTML = [
        '<div class="mmd-kicker">QR CODE - PROMPTPAY</div>',
        '<h2>สแกนชำระผ่าน PromptPay</h2>',
        '<img class="mmd-qr" src="https://promptpay.io/0829528889.png" alt="PromptPay QR">',
        '<div class="mmd-bank-line"><span>ชื่อบัญชี</span><strong>ธัชชะ ป.</strong></div>',
        '<label>อัพโหลดสลิป</label>',
        '<input type="file" accept="image/*,.pdf">',
      ].join("");
    }

    modal.classList.add("show");
  }

  function closeModal() {
    const modal = byId("mmdModal");
    if (modal) modal.classList.remove("show");
  }

  function bindInputs() {
    ["nick", "emailNow", "emailOld", "phone", "telegram", "oldProof"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", syncSummary);
      el.addEventListener("change", syncSummary);
    });
  }

  function bindActionButtons() {
    document.querySelectorAll(".mmd-choice[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveButton(".mmd-choice[data-action]", button);
        state.action = button.dataset.action || "RENEWAL";
        setText(
          "sumStatus",
          state.action === "UPGRADE" ? "รับเคสเป็น Upgrade review ก่อนครับ" : "รอให้ผมตรวจสิทธิ์ก่อนครับ",
        );
      });
    });
  }

  function bindPaymentButtons() {
    document.querySelectorAll(".mmd-pay[data-pay]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveButton(".mmd-pay[data-pay]", button);
        state.paymentMethod = button.dataset.pay || "Bank Transfer";
        syncSummary();
      });
    });
  }

  function bindPrimaryButtons() {
    const checkBtn = byId("checkBtn");
    if (checkBtn) {
      checkBtn.addEventListener("click", () => {
        syncSummary();
        if (!validateBaseForm()) return;
        setText("sumStatus", "ข้อมูลพร้อมส่งเข้า Per review แล้วครับ");
      });
    }

    const submitBtn = byId("submitBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        syncSummary();
        if (!validateBaseForm()) return;

        const consent = byId("consent");
        if (!consent || !consent.checked) {
          alert("กรุณาติ๊กยินยอมก่อนส่งตรวจสิทธิ์ครับ");
          return;
        }

        setText("sumStatus", "ส่งเข้า Per review แล้วครับ");
        alert("รับเรื่องแล้วครับ เดี๋ยวผมตรวจสิทธิ์ให้ต่อในระบบ MMD");
      });
    }
  }

  function bindModalButtons() {
    document.querySelectorAll("[data-modal]").forEach((button) => {
      button.addEventListener("click", () => openModal(button.dataset.modal));
    });

    const closeButton = byId("modalClose");
    if (closeButton) closeButton.addEventListener("click", closeModal);

    const modal = byId("mmdModal");
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function init() {
    bindInputs();
    bindActionButtons();
    bindPaymentButtons();
    bindPrimaryButtons();
    bindModalButtons();
    syncSummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
