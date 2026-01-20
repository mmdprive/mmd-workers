import { escapeHtml, num } from "./util.js";

function int(v) {
  const n = Number(String(v || "").trim());
  return Number.isFinite(n) ? n : 0;
}

export const TG_THREADS = (env) => ({
  membership: int(env.TG_THREAD_MEMBERSHIP) || 20,
  confirm: int(env.TG_THREAD_CONFIRM) || 21,
  points_threshold: int(env.TG_THREAD_POINTS) || 17,
});

export async function telegramNotify(payload, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, skipped: true, reason: "missing_telegram_env" };
  }

  const threads = TG_THREADS(env);
  const flow = String(payload.flow || "").toLowerCase().trim();
  const threadId = threads[flow] || 0;
  if (!threadId) {
    return { ok: false, error: "thread_lock_missing", detail: `missing thread for flow=${flow}` };
  }

  const text = formatTelegramMessage(payload);

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      message_thread_id: threadId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.ok === false)) return { ok: false, status: res.status, error: data || null };
  return { ok: true, thread_id: threadId };
}

export function formatTelegramMessage(p) {
  const flow = String(p.flow || "").toLowerCase();

  const isMembership = flow === "membership";
  const isConfirm = flow === "confirm";
  const isPoints = flow === "points_threshold";

  if (isPoints) {
    const lines = [];
    lines.push(`<b>📈 MMD • POINTS THRESHOLD</b>`);
    if (p.tier) lines.push(`<b>Tier:</b> ${escapeHtml(p.tier)}`);
    if (p.member_id) lines.push(`<b>MemberId:</b> ${escapeHtml(p.member_id)}`);
    lines.push(`<b>Total:</b> ${escapeHtml(String(p.points_total ?? "-"))}`);
    lines.push(`<b>Threshold:</b> ${escapeHtml(String(p.points_threshold ?? "-"))}`);
    if (p.source) lines.push(`<b>Source:</b> ${escapeHtml(p.source)}`);
    if (p.page) lines.push(`<b>Page:</b> ${escapeHtml(p.page)}`);
    lines.push(``);
    lines.push(`<b>TS:</b> ${escapeHtml(p.ts || new Date().toISOString())}`);
    return lines.join("\n");
  }

  const title = isMembership
    ? "🧾 MMD • MEMBERSHIP SUBMIT"
    : isConfirm
    ? "✅ MMD • CONFIRM SUBMIT"
    : "🔔 MMD • PAYMENT NOTIFY";

  const lines = [];
  lines.push(`<b>${title}</b>`);
  lines.push(`<b>Flow:</b> ${escapeHtml(flow || "-")}`);

  if (p.tier) lines.push(`<b>Tier:</b> ${escapeHtml(p.tier)}`);
  lines.push(`<b>Amount:</b> ${escapeHtml(String(num(p.amount_thb) || "-"))} ${escapeHtml(p.currency || "THB")}`);
  if (p.payment_method) lines.push(`<b>Method:</b> ${escapeHtml(p.payment_method)}`);
  if (p.ref) lines.push(`<b>Ref:</b> ${escapeHtml(p.ref)}`);
  if (p.page) lines.push(`<b>Page:</b> ${escapeHtml(p.page)}`);

  if (isMembership) {
    if (p.promptpay_url) lines.push(`<b>PromptPay:</b> ${escapeHtml(p.promptpay_url)}`);
    if (p.promo_code) lines.push(`<b>Promo:</b> ${escapeHtml(p.promo_code)}`);

    const c = p.customer || {};
    if (c.member_id || c.email || c.name) {
      lines.push(``);
      lines.push(`<b>Customer</b>`);
      if (c.member_id) lines.push(`• id: ${escapeHtml(c.member_id)}`);
      if (c.email) lines.push(`• email: ${escapeHtml(c.email)}`);
      if (c.name) lines.push(`• name: ${escapeHtml(c.name)}`);
    }
  }

  if (isConfirm) {
    if (p.deposit_thb) lines.push(`<b>Deposit:</b> ${escapeHtml(String(p.deposit_thb))}`);
    if (p.balance_thb) lines.push(`<b>Balance:</b> ${escapeHtml(String(p.balance_thb))}`);
    if (p.model) lines.push(`<b>Model:</b> ${escapeHtml(p.model)}`);
    if (p.intent) lines.push(`<b>Intent:</b> ${escapeHtml(p.intent)}`);

    const m = p.member || {};
    if (m.member_id || m.email || m.phone || m.name) {
      lines.push(``);
      lines.push(`<b>Member</b>`);
      if (m.member_id) lines.push(`• id: ${escapeHtml(m.member_id)}`);
      if (m.email) lines.push(`• email: ${escapeHtml(m.email)}`);
      if (m.phone) lines.push(`• phone: ${escapeHtml(m.phone)}`);
      if (m.name) lines.push(`• name: ${escapeHtml(m.name)}`);
    }
  }

  lines.push(``);
  lines.push(`<b>TS:</b> ${escapeHtml(p.ts || new Date().toISOString())}`);
  return lines.join("\n");
}
