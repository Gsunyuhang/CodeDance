import test from "node:test"
import assert from "node:assert/strict"
import { finalPriceRegular, finalPriceMember } from "../src/invoice.js"

const items = [{ price: 100, qty: 3 }]

test("discount applies above 200", () => {
  assert.equal(finalPriceRegular(items), 270)
  assert.equal(finalPriceMember(items), 270)
})

test("no discount at exactly 200", () => {
  const small = [{ price: 100, qty: 2 }]
  assert.equal(finalPriceRegular(small), 200)
})
