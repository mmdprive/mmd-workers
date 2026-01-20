export function buildCors(origin, allowedCsv) {
  const allowed = (allowedCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = !!origin && allowed.includes(origin);
  return { allowOrigin: ok ? origin : "", varyOrigin: true };
}

export function corsHeaders(cors) {
  const h = {};
  if (cors?.allowOrigin) h["Access-Control-Allow-Origin"] = cors.allowOrigin;
  if (cors?.varyOrigin) h["Vary"] = "Origin";
  h["Accessيสนอう"]; // <-- ห้ามมีบรรทัดนี้ (เผื่อ copy พัง) ไม่ต้องใส่
  return h;
}
