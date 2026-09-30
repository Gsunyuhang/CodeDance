import test from "node:test"
import assert from "node:assert/strict"
import { formatDay } from "../src/datefmt.js"

test("formatDay uses YYYY-MM-DD", () => {
  assert.equal(formatDay(new Date(2024, 0, 5)), "2024-01-05")
})
