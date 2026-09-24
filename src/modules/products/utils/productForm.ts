/**
 * Product editor form (E11) ↔ ProductDraft. Unknown cost / price stay undefined (never 0); money is exact minor units
 * and only accepted when the workspace has a currency. Names of new categories / suppliers are resolved by the screen.
 */
import type { BarcodeRole, DateKind, Product, TrackingUnit } from '../../../domain/expiry/expiryTypes';
import { moneyFromMinor } from '../../../domain/money';
import { parseTypedPrice, priceToInput } from '../../../domain/typedPrice';
import type { ProductDraft } from '../productStore';

export interface ProductForm {
  name: string;
  barcodes: { code: string; symbology?: string; role: BarcodeRole; unitCount?: number }[];
  sku: string;
  categoryId?: string;
  supplierId?: string;
  unit: TrackingUnit;
  customUnit: string;
  defaultLocationId?: string;
  defaultDateKind?: DateKind;
  defaultRuleId?: string;
  isPrepared: boolean;
  costText: string;
  priceText: string;
  notes: string;
}

export function emptyProductForm(): ProductForm {
  return { name: '', barcodes: [], sku: '', unit: 'each', customUnit: '', isPrepared: false, costText: '', priceText: '', notes: '' };
}

export function productToForm(p: Product): ProductForm {
  const money = (m: Product['sellingPrice']) => (m ? priceToInput(moneyFromMinor(m.minor, m.currency)) : '');
  return {
    name: p.name,
    barcodes: p.barcodes.map(b => ({ code: b.code, symbology: b.symbology, role: b.role, unitCount: b.unitCount })),
    sku: p.sku ?? '',
    categoryId: p.categoryId,
    supplierId: p.supplierId,
    unit: p.trackingUnit,
    customUnit: p.customUnitLabel ?? '',
    defaultLocationId: p.defaultLocationId,
    defaultDateKind: p.defaultDateKind,
    defaultRuleId: p.defaultRuleId,
    isPrepared: !!p.isPrepared,
    costText: money(p.costPerTrackingUnit),
    priceText: money(p.sellingPrice),
    notes: p.notes ?? '',
  };
}

export type ProductFormResult = { ok: true; draft: ProductDraft } | { ok: false; errors: Partial<Record<string, string>> };

export function formToDraft(f: ProductForm, currency: string): ProductFormResult {
  const errors: Partial<Record<string, string>> = {};
  if (!f.name.trim()) errors.name = 'nameRequired';
  if (f.unit === 'custom' && !f.customUnit.trim()) errors.unit = 'customUnitRequired';
  const money = (text: string, key: string) => {
    if (!text.trim()) return undefined;
    if (!currency) { errors[key] = 'money_noCurrency'; return undefined; }
    const r = parseTypedPrice(text, currency);
    if (!r.ok) { errors[key] = `money_${r.error}`; return undefined; }
    return { minor: r.money.minor, currency: r.money.currency };
  };
  const costPerTrackingUnit = money(f.costText, 'cost');
  const sellingPrice = money(f.priceText, 'price');
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    draft: {
      name: f.name,
      sku: f.sku,
      barcodes: f.barcodes.filter(b => b.code.trim()),
      categoryId: f.categoryId,
      supplierId: f.supplierId,
      trackingUnit: f.unit,
      customUnitLabel: f.unit === 'custom' ? f.customUnit : undefined,
      costPerTrackingUnit,
      sellingPrice,
      defaultLocationId: f.defaultLocationId,
      defaultDateKind: f.defaultDateKind,
      defaultRuleId: f.defaultRuleId,
      isPrepared: f.isPrepared,
      notes: f.notes,
    },
  };
}

/** Add a typed or scanned code unless it is already on the list (exact text). */
export function addBarcode(list: ProductForm['barcodes'], code: string, symbology?: string): ProductForm['barcodes'] {
  const c = code.trim();
  if (!c || list.some(b => b.code === c)) return list;
  return [...list, { code: c, symbology: symbology && symbology !== 'unknown' ? symbology : undefined, role: 'single' }];
}
