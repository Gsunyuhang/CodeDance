export function createStore(initial = {}) {
  const state = { ...initial }
  return {
    get(key) {
      return state[key]
    },
    set(key, value) {
      state[key] = value
    },
    remove(key) {
      delete state[key]
    },
  }
}
