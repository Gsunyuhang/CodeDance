export async function fetchValueAsync(key) {
  if (key == null) {
    throw new Error("key required")
  }
  return `value:${key}`
}
