import test from "node:test"
import assert from "node:assert/strict"
import { fetchValueAsync } from "../src/legacy.js"

test("resolves with the value", async () => {
  assert.equal(await fetchValueAsync("a"), "value:a")
})

test("rejects without a key", async () => {
  await assert.rejects(() => fetchValueAsync(null), /key required/)
})
