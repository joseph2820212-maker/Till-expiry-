import type { Batch, MoneyValue, Product } from '../../domain/expiry/expiryTypes';

/**
 * The product's cost for ONE counted unit of this batch, or null when unknown: no cost recorded, or the batch is
 * counted in a different unit than the product's cost (never converted, never guessed, never 0).
 */
export function unitCostFor(batch: Pick<Batch, 'quantityUnit'>, product: Pick<Product, 'costPerTrackingUnit' | 'trackingUnit' | 'customUnitLabel'> | undefined | null): MoneyValue | null {
  const cost = product?.costPerTrackingUnit;
  if (!product || !cost) return null;
  const u = batch.quantityUnit;
  if (!u) return cost;
  if (u === product.trackingUnit) return cost;
  if (product.trackingUnit === 'custom' && u === product.customUnitLabel) return cost;
  return null;
}
