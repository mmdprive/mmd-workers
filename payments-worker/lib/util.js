export function str(v) {
  return (v ?? "").toString().trim();
}

export function num(v) {
  const s = (v ?? "").toString().replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function toMs(v) {
  if (!v) return 0;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

export function toISODate(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function normalizeTier(s) {
  s = (s ?? "").toString().trim().toLowerCase();
  if (!s) return "";
  const map = {
    svip: "svip",
    black: "blackcard",
    blackcard: "blackcard",
    black_card: "blackcard",
    vip: "vip",
    premium: "premium",
    standard: "standard",
    member: "standard",
    guest: "guest",
    admin: "admin",
    "7days": "7days",
    "7-days": "7days",
    "7_days": "7days",
  };
  return map[s] || s;
}

export function normalizeStatus(s) {
  s = (s ?? "").toString().trim().toLowerCase();
  if (!s) return "active";
  if (["active", "expired"].includes(s)) return s;
  return "active";
}

export function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
