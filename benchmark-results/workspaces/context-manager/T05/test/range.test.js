import test from "node:test"
import assert from "node:assert/strict"
import { sumRange } from "../src/range.js"

test("sumRange sums an inclusive range", () => {
  assert.equal(sumRange(1, 4), 10)
})

test("sumRange handles a single value", () => {
  assert.equal(sumRange(5, 5), 5)
})
