function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/ping")) {
      return json({
        ok: true,
        worker: "api-worker",
        role: "public_proxy_placeholder",
        ready: false,
        routes: [],
        rules: {
          frontend_must_not_call_truth_workers_directly: true,
          dashboard_must_remain_single_real_dashboard: true,
          session_id_is_primary_operational_reference: true,
          public_token_param: "t",
        },
      });
    }

    return json(
      {
        ok: false,
        error: "not_ready",
        message: "api-worker scaffold exists but no public routes are wired yet.",
      },
      503
    );
  },
};
