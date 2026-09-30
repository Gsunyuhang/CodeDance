export function parseQuery(query) {
  const result = {}
  if (query === "") return result
  for (const pair of query.split("&")) {
    const index = pair.indexOf("=")
    if (index === -1) continue
    result[pair.slice(0, index)] = pair.slice(index + 1)
  }
  return result
}
