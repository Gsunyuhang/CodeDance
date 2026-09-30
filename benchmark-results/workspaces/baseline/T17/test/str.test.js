import test from "node:test"
import assert from "node:assert/strict"
import { titleCase, truncate } from "../src/str.js"

test("titleCase capitalizes words", () => {
  assert.equal(titleCase("hello world"), "Hello World")
})

test("titleCase handles empty string", () => {
  assert.equal(titleCase(""), "")
})

test("truncate keeps short text", () => {
  assert.equal(truncate("abc", 5), "abc")
})

test("truncate appends ellipsis", () => {
  assert.equal(truncate("abcdef", 3), "abc...")
})
