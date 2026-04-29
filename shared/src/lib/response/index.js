export function ok(data = {}, meta = {}) {
  return {
    ok: true,
    data,
    meta,
    error: null,
  };
}

export function fail(code, message, meta = {}) {
  return {
    ok: false,
    data: null,
    meta,
    error: {
      code,
      message,
    },
  };
}
