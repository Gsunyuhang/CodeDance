export function memo(fn) {
  const store = new Map()
  return (key) => {
    if (!store.has(key)) store.set(key, fn(key))
    return store.get(key)
  }
}
