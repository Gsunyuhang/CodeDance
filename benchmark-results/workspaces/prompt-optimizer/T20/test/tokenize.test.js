import test from "node:test"
import assert from "node:assert/strict"
import { tokenize } from "../src/tokenize.js"

test("splits on whitespace", () => {
  assert.deepEqual(tokenize("a b  c"), ["a", "b", "c"])
})

test("keeps quoted spaces", () => {
  assert.deepEqual(tokenize('"a b" c'), ["a b", "c"])
})

test("single quotes", () => {
  assert.deepEqual(tokenize("'a b' c"), ["a b", "c"])
})

test("empty input", () => {
  assert.deepEqual(tokenize(""), [])
})

test("nested quotes", () => {
  assert.deepEqual(tokenize('"a \'b\' c"'), ["a 'b' c"])
})

test("escaped quotes", () => {
  assert.deepEqual(tokenize('"a \\"b\\" c"'), ['a "b" c'])
})
