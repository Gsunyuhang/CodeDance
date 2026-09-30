import test from "node:test"
import assert from "node:assert/strict"
import { parseConfig } from "../src/config.js"

test("timeout defaults to 30", () => {
  assert.deepEqual(parseConfig({ host: "x" }), {
    host: "x",
    timeout: "30",
  })
})

test("explicit timeout is formatted", () => {
  assert.equal(parseConfig({ host: "y", timeout: 5.4 }).timeout, "5")
})
