export function shippingFee(weight, express, member) {
  if (weight <= 0) {
    throw new Error("invalid weight")
  }
  if (!express) {
    return 3
  }
  if (member) {
    return 5
  }
  return 10
}
