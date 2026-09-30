import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, rmSync } from "node:fs"
import { readConfig } from "../src/load.js"

test("readConfig parses JSON", async () => {
  writeFileSync("tmp-config.json", '{"retries":3}')
  try {
    const config = await readConfig("tmp-config.json")
    assert.equal(config.retries, 3)
  } finally {
    rmSync("tmp-config.json", { force: true })
  }
})
