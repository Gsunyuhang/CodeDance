import { createUser } from "./user.js"
import { formatName } from "./format.js"

export function greet(first, last) {
  const user = createUser(first, last)
  return `hello ${formatName(user)}`
}
