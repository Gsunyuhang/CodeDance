import test from "node:test"
import assert from "node:assert/strict"
import { clamp } from "../src/clamp.js"

test("clamps above range", () => {
  assert.equal(clamp(5, 1, 3), 3)
})

test("clamps below range", () => {
  assert.equal(clamp(0, 1, 3), 1)
})

test("keeps value inside range", () => {
  assert.equal(clamp(2, 1, 3), 2)
})
