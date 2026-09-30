import test from "node:test"
import assert from "node:assert/strict"
import { serialize, deserialize } from "../src/serialize.js"

test("round trip", () => {
  assert.deepEqual(deserialize(serialize({ a: 1 })), { a: 1 })
})

test("deserialize is lenient", () => {
  assert.deepEqual(deserialize("{bad"), {})
})

test("deserialize accepts strings", () => {
  assert.equal(deserialize('"str"'), "str")
})
