export function add(a, b) {
  return a + b
}

export function factorial(n) {
  if (n < 0) throw new Error("negative input")
  if (n <= 1) return 1
  return n * factorial(n - 1)
}
