export function slugify(text) {
  return text.trim().toLowerCase().replace(/\s+/g, "-")
}
