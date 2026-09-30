export function titleCase(text) {
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max) + "..."
}
