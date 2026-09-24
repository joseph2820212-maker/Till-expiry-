/**
 * Money fields on forms (EXP-REV-06). An amount is only shown for editing when it is recorded in the workspace's
 * current currency; an amount recorded in another currency is never prefilled under the new currency label and is kept
 * unchanged unless the user types a new value. Amounts are never relabelled from one currency to another.
 */
import type { MoneyValue } from '../../../domain/expiry/expiryTypes';
import { moneyFromMinor } from '../../../domain/money';
import { priceToInput } from '../../../domain/typedPrice';

/** Text to prefill a money field with: '' unless the stored amount is in `currency`. */
export function moneyFieldText(m: MoneyValue | undefined, currency: string): string {
  return m && currency && m.currency === currency ? priceToInput(moneyFromMinor(m.minor, m.currency)) : '';
}

/**
 * The value to store for a field after editing: an empty field keeps an amount recorded in another currency (it was not
 * shown, so the user did not clear it); an empty field clears an amount in the current currency (unknown, never 0).
 */
export function keptMoney(typed: MoneyValue | undefined, text: string, existing: MoneyValue | undefined, currency: string): MoneyValue | undefined {
  if (!text.trim() && existing && existing.currency !== currency) return existing;
  return typed;
}
