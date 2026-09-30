import test from "node:test"
import assert from "node:assert/strict"
import { parseQuery } from "../src/query.js"

test("parses pairs", () => {
  assert.deepEqual(parseQuery("a=1&b=2"), { a: "1", b: "2" })
})

test("empty query", () => {
  assert.deepEqual(parseQuery(""), {})
})

test("single pair", () => {
  assert.deepEqual(parseQuery("msg=hi"), { msg: "hi" })
})
