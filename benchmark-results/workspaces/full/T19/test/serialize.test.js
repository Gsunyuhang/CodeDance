import test from "node:test"
import assert from "node:assert/strict"
import { serialize, deserialize } from "../src/serialize.js"

test("round trip", () => {
  assert.deepEqual(deserialize(serialize({ a: 1 })), { a: 1 })
})

test("deserialize rejects invalid JSON", () => {
  assert.throws(() => deserialize("{bad"), /JSON|token/)
})

test("deserialize rejects non-object", () => {
  assert.throws(() => deserialize('"str"'), /invalid state/)
})
