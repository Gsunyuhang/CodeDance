export class Stack {
  constructor() {
    this.items = []
  }

  push(item) {
    this.items.push(item)
  }

  pop() {
    if (this.items.length === 0) {
      throw new Error("stack is empty")
    }
    return this.items.pop()
  }

  peek() {
    if (this.items.length === 0) {
      throw new Error("stack is empty")
    }
    return this.items[this.items.length - 1]
  }

  get size() {
    return this.items.length
  }
}
