export async function verifyTurnstile(token, ip, secret) {
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return { ok: false, detail: "turnstile_verify_failed" };
    if (!data.success) return { ok: false, detail: data["error-codes"] || "not_success" };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) };
  }
}
