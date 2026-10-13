const hiddenSellerKeys = new Set(["purchaseCost", "purchase_cost", "purchaseCostSnapshot", "purchase_cost_snapshot"]);

export function stripSellerFinancials<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload, (key, value) => (hiddenSellerKeys.has(key) ? undefined : value))) as T;
}
