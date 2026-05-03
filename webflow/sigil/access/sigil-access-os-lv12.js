/*
  MMD SIGIL Access - LV12 Event Layer
  Load after sigil-access-os.js
  Adds event-state attributes for LV12 CSS and localized LV12 text hydration.
*/

(function () {
  "use strict";

  const root = document.querySelector("[data-sigil-os]");
  if (!root) return;

  function getLang() {
    return localStorage.getItem("mmd_sigil_lang") || "th";
  }

  const copy = {
    th: {
      inside: "ภายใน SIGIL / INSIDE SIGIL",
      routePrepared: "เตรียมเส้นทางแล้ว / ROUTE PREPARED",
      accessLayerMap: "แผนที่ชั้นสิทธิ์ / ACCESS LAYER MAP",
      kenjiRecommendation: "ข้อเสนอจาก Kenji / KENJI RECOMMENDATION",
      layers: {
        identity: ["ตรวจตัวตน", "ปลดล็อก / UNLOCKED"],
        member: ["ชั้นสมาชิก", "ปลดล็อก / UNLOCKED"],
        private: ["Private Access", "ใช้งานได้ / ACTIVE"],
        review: ["Access Claim", "รอตรวจสอบ / REVIEW"],
        inner: ["Inner Circle", "ยังไม่เปิดเผย / HIDDEN"]
      },
      signals: {
        read: ["CURRENT READ", "ตรวจเสร็จสิ้น / COMPLETED"],
        visibility: ["VISIBILITY", "ควบคุมการมองเห็น / CONTROLLED"],
        session: ["SESSION LAYER", "เตรียมได้ / PREPARABLE"],
        payment: ["PAYMENT TRUST", "ยืนยันแล้ว / VERIFIED"],
        route: ["NEXT ROUTE", "เตรียมไว้แล้ว / PREPARED"]
      },
      protocolLabel: "PROTOCOL ที่แนะนำ / RECOMMENDED PROTOCOL",
      protocol: "เตรียม Private Session ก่อนเปิดเส้นทางถัดไป",
      chain: ["ตัวตน", "สมาชิก", "Private", "Review"],
      eventDefault: "STATE: CONTROLLED VISIBILITY",
      events: {
        analysis: "EVENT: ACCESS ANALYSIS COMPLETE",
        session: "EVENT: PRIVATE SESSION PREPARED",
        payment: "EVENT: PAYMENT READINESS QUEUED",
        route: "EVENT: CONTROLLED ROUTE REGISTERED"
      }
    },
    en: {
      inside: "INSIDE SIGIL",
      routePrepared: "ROUTE PREPARED",
      accessLayerMap: "ACCESS LAYER MAP",
      kenjiRecommendation: "KENJI RECOMMENDATION",
      layers: {
        identity: ["Identity", "Unlocked"],
        member: ["Member", "Unlocked"],
        private: ["Private Access", "Active"],
        review: ["Access Claim", "Review"],
        inner: ["Inner Circle", "Hidden"]
      },
      signals: {
        read: ["CURRENT READ", "COMPLETED"],
        visibility: ["VISIBILITY", "CONTROLLED"],
        session: ["SESSION LAYER", "PREPARABLE"],
        payment: ["PAYMENT TRUST", "VERIFIED"],
        route: ["NEXT ROUTE", "PREPARED"]
      },
      protocolLabel: "RECOMMENDED PROTOCOL",
      protocol: "Prepare private session before opening the next route.",
      chain: ["IDENTITY", "MEMBER", "PRIVATE", "REVIEW"],
      eventDefault: "STATE: CONTROLLED VISIBILITY",
      events: {
        analysis: "EVENT: ACCESS ANALYSIS COMPLETE",
        session: "EVENT: PRIVATE SESSION PREPARED",
        payment: "EVENT: PAYMENT READINESS QUEUED",
        route: "EVENT: CONTROLLED ROUTE REGISTERED"
      }
    }
  };

  function hydrateLv12() {
    const lang = getLang();
    const dict = copy[lang] || copy.en;

    const mapTitle = root.querySelector("[data-lv12='map-title']");
    const recTitle = root.querySelector("[data-lv12='rec-title']");
    const inside = root.querySelector("[data-lv12='inside']");
    const route = root.querySelector("[data-lv12='route-prepared']");
    const protocolLabel = root.querySelector("[data-lv12='protocol-label']");
    const protocol = root.querySelector("[data-lv12='protocol']");
    const chip = root.querySelector("[data-lv12='event-chip']");

    if (mapTitle) mapTitle.textContent = dict.accessLayerMap;
    if (recTitle) recTitle.textContent = dict.kenjiRecommendation;
    if (inside) inside.textContent = dict.inside;
    if (route) route.textContent = dict.routePrepared;
    if (protocolLabel) protocolLabel.textContent = dict.protocolLabel;
    if (protocol) protocol.textContent = dict.protocol;
    if (chip && !root.dataset.lv12Event) chip.lastChild.textContent = dict.eventDefault;

    Object.keys(dict.layers).forEach((key) => {
      const layer = root.querySelector(`[data-layer="${key}"]`);
      if (!layer) return;
      const h4 = layer.querySelector("h4");
      const p = layer.querySelector("p");
      if (h4) h4.textContent = dict.layers[key][0];
      if (p) p.textContent = dict.layers[key][1];
    });

    Object.keys(dict.signals).forEach((key) => {
      const row = root.querySelector(`[data-signal="${key}"]`);
      if (!row) return;
      const label = row.querySelector("span");
      const value = row.querySelector("strong");
      if (label) label.textContent = dict.signals[key][0];
      if (value) value.textContent = dict.signals[key][1];
    });

    const chainItems = root.querySelectorAll("[data-lv12-chain]");
    chainItems.forEach((node, index) => {
      if (dict.chain[index]) node.textContent = dict.chain[index];
    });
  }

  function setEvent(type) {
    const lang = getLang();
    const dict = copy[lang] || copy.en;
    const chip = root.querySelector("[data-lv12='event-chip']");

    root.dataset.lv12Event = type;
    if (chip && dict.events[type]) chip.lastChild.textContent = dict.events[type];
  }

  document.querySelectorAll("[data-event]").forEach((button) => {
    button.addEventListener("click", function () {
      setEvent(button.getAttribute("data-event"));
      window.setTimeout(hydrateLv12, 40);
    });
  });

  const langButton = root.querySelector("[data-sigil-lang]");
  if (langButton) {
    langButton.addEventListener("click", function () {
      window.setTimeout(hydrateLv12, 60);
    });
  }

  hydrateLv12();
})();
