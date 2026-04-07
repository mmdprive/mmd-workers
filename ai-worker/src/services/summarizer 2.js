export function summarizeResults(query, results = []) {
  if (!results.length) {
    return `No matching results found for: ${query}`;
  }
  const top = results[0];
  return `Top result for \"${query}\" is ${top.title || top.id} (${top.type}). ${top.summary || ''}`.trim();
}
