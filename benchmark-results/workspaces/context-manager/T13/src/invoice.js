function calcTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

function applyDiscount(total) {
  return total > 200 ? total * 0.9 : total
}

export function finalPriceRegular(items) {
  return applyDiscount(calcTotal(items))
}

export function finalPriceMember(items) {
  return applyDiscount(calcTotal(items))
}
