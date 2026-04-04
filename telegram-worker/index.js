// =========================================================
// telegram-worker — internal/system messaging gateway
// =========================================================
// ROLE
//   - internal notifications
//   - payment / membership / points messages
//   - optional Telegram webhook receiver
//
// NOT A PUBLIC CHATBOT.
// Public AI chat belongs to chat-worker.
// =========================================================

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

class HttpError extends Error {
  constructor(status, body) {
    super(body?.error || 'http_error');
    this.status = status;
    this.body = body;
  }
}

function requireInternalToken(req, env) {
  const bearer = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const header = String(req.headers.get('X-Internal-Token') || '').trim();
  const confirmKey = String(req.headers.get('X-Confirm-Key') || '').trim();
  const actual = header || bearer;
  const allowedTokens = [
    String(env.INTERNAL_TOKEN || '').trim(),
    String(env.AUTH_SERVICE_ADMIN_TO_TELEGRAM || '').trim(),
    String(env.AUTH_SERVICE_EVENTS_TO_TELEGRAM || '').trim(),
  ].filter(Boolean);
  const expectedConfirmKey = String(env.CONFIRM_KEY || '').trim();
  const internalOk = Boolean(actual && allowedTokens.includes(actual));
  const confirmOk = Boolean(confirmKey && expectedConfirmKey && confirmKey === expectedConfirmKey);
  if (!internalOk && !confirmOk) {
    throw new HttpError(401, { ok: false, error: 'unauthorized' });
  }
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pickThread(body, env) {
  const explicit = String(body.message_thread_id || '').trim();
  if (explicit) return explicit;

  const type = String(body.type || '').trim().toLowerCase();
  if (type === 'points') return String(env.TG_THREAD_POINTS || '17');
  if (type === 'membership') return String(env.TG_THREAD_MEMBERSHIP || '20');
  return String(env.TG_THREAD_CONFIRM || '61');
}

function formatMessage(body) {
  if (body.text) return String(body.text);

  const lines = [];
  if (body.title) lines.push(`<b>${escapeHtml(body.title)}</b>`);
  if (body.session_id) lines.push(`session: <code>${escapeHtml(body.session_id)}</code>`);
  if (body.payment_ref) lines.push(`payment: <code>${escapeHtml(body.payment_ref)}</code>`);
  if (body.member_name) lines.push(`member: ${escapeHtml(body.member_name)}`);
  if (body.client_name) lines.push(`client: ${escapeHtml(body.client_name)}`);
  if (body.model_name) lines.push(`model: ${escapeHtml(body.model_name)}`);
  if (body.amount_thb != null && body.amount_thb !== '') lines.push(`amount: ${escapeHtml(body.amount_thb)} THB`);
  if (body.status) lines.push(`status: ${escapeHtml(body.status)}`);
  if (body.note) lines.push(`note: ${escapeHtml(body.note)}`);
  return lines.join('\n') || 'MMD system notification';
}

async function telegramNotify(body, env) {
  const botToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!botToken) {
    return { ok: false, skipped: true, error: 'missing_telegram_bot_token' };
  }

  const chat_id = String(body.chat_id || env.TELEGRAM_CHAT_ID || '').trim();
  if (!chat_id) {
    throw new HttpError(500, { ok: false, error: 'missing_telegram_chat_id' });
  }

  const message_thread_id = pickThread(body, env);
  const text = formatMessage(body);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      message_thread_id: Number(message_thread_id),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(res.status, { ok: false, error: 'telegram_send_failed', detail: data });
  }

  return { ok: true, result: data.result || data };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    try {
      if (method === 'GET' && (path === '/' || path === '/health' || path === '/ping')) {
        return json({
          ok: true,
          worker: 'telegram-worker',
          role: 'internal-system-messaging',
          ts: Date.now(),
        }, 200);
      }

      if (path === '/telegram/webhook' && method === 'POST') {
        const update = await safeJson(req);
        if (!update) return json({ ok: false, error: 'invalid_json' }, 400);
        return json({ ok: true, received: true }, 200);
      }

      if (path === '/telegram/internal/send' && method === 'POST') {
        requireInternalToken(req, env);
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: 'invalid_json' }, 400);
        const tg = await telegramNotify(body, env);
        return json({ ok: true, telegram: tg }, 200);
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status);
      return json({ ok: false, error: 'server_error', detail: String(err?.message || err) }, 500);
    }
  },
};
