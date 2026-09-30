import test from "node:test"
import assert from "node:assert/strict"
import { Stack } from "../src/stack.js"

test("push and pop are LIFO", () => {
  const stack = new Stack()
  stack.push(1)
  stack.push(2)
  assert.equal(stack.pop(), 2)
  assert.equal(stack.pop(), 1)
})

test("peek does not remove", () => {
  const stack = new Stack()
  stack.push("x")
  assert.equal(stack.peek(), "x")
  assert.equal(stack.size, 1)
})

test("pop on empty throws", () => {
  assert.throws(() => new Stack().pop(), /stack is empty/)
})

test("peek on empty throws", () => {
  assert.throws(() => new Stack().peek(), /stack is empty/)
})

test("size tracks pushes", () => {
  const stack = new Stack()
  stack.push(1)
  stack.push(2)
  assert.equal(stack.size, 2)
})
