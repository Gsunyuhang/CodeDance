import test from "node:test"
import assert from "node:assert/strict"
import { createStore } from "../src/store.js"

test("set and get", () => {
  const store = createStore()
  store.set("a", 1)
  assert.equal(store.get("a"), 1)
})

test("remove deletes a key", () => {
  const store = createStore({ a: 1 })
  store.remove("a")
  assert.equal(store.get("a"), undefined)
})
