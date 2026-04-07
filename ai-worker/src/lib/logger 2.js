export function logInfo(message, extra = {}) {
  console.log(JSON.stringify({ level: 'info', message, ...extra }));
}

export function logError(message, extra = {}) {
  console.error(JSON.stringify({ level: 'error', message, ...extra }));
}
