export function buildTelegramInternalPayload({
  text = "",
  thread_id = "",
  parse_mode = "HTML",
} = {}) {
  return {
    text,
    thread_id,
    parse_mode,
  };
}
