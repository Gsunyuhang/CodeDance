export function pick(source, keys) {
  const result = {}
  for (const key of keys) {
    if (key in source) result[key] = source[key]
  }
  return result
}
