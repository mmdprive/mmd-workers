export function rankResults(results = []) {
  return [...results].sort((a, b) => (b.score || 0) - (a.score || 0));
}
