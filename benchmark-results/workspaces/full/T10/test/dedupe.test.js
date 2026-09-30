import test from "node:test"
import assert from "node:assert/strict"
import { unique } from "../src/dedupe.js"

test("keeps first occurrence order", () => {
  assert.deepEqual(unique([3, 1, 3, 2, 1]), [3, 1, 2])
})

test("handles empty input", () => {
  assert.deepEqual(unique([]), [])
})
