import test from "node:test"
import assert from "node:assert/strict"
import { slugify } from "../src/strings.js"
import { clamp } from "../src/numbers.js"
import { chunk } from "../src/arrays.js"
import { pick } from "../src/objects.js"
import { VERSION } from "../src/index.js"

test("slugify", () => {
  assert.equal(slugify("Hello World"), "hello-world")
})

test("clamp", () => {
  assert.equal(clamp(10, 0, 5), 5)
})

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]])
})

test("pick", () => {
  assert.deepEqual(pick({ a: 1, b: 2 }, ["a"]), { a: 1 })
})

test("version export", () => {
  assert.equal(VERSION, "1.0.0")
})
