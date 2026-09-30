export function serialize(state) {
  return JSON.stringify(state)
}

export function deserialize(text) {
  const parsed = JSON.parse(text)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("invalid state")
  }
  return parsed
}
