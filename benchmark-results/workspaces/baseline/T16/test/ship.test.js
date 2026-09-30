import test from "node:test"
import assert from "node:assert/strict"
import { shippingFee } from "../src/ship.js"

test("express member", () => {
  assert.equal(shippingFee(1, true, true), 5)
})

test("express non-member", () => {
  assert.equal(shippingFee(1, true, false), 10)
})

test("standard", () => {
  assert.equal(shippingFee(1, false, true), 3)
})

test("invalid weight", () => {
  assert.throws(() => shippingFee(0, true, true), /invalid weight/)
})
