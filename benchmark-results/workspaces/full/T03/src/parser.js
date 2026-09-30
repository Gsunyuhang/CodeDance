export function parse(text) {
  return text.split(",").map((part) => part.trim())
}
