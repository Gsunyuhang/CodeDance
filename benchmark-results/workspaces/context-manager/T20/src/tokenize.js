export function tokenize(input) {
  const tokens = []
  let current = ""
  let quote = null
  for (const char of input) {
    if (char === "\"" || char === "'") {
      if (quote === char) {
        quote = null
      } else if (quote === null) {
        quote = char
      } else {
        current += char
      }
    } else if (/\s/.test(char) && quote === null) {
      if (current !== "") {
        tokens.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }
  if (current !== "") tokens.push(current)
  return tokens
}
