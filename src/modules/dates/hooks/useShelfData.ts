import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { DateBatch, Product } from '../../../domain/types';
import { todayLocal } from '../../../domain/dates';
import { alertDaysFor } from '../../../domain/expiry';
import { listBatches } from '../storage/batchStore';
import { listProducts } from '../../products/storage/productStore';
import { useExpirySettings } from '../../settings/settingsStore';

export interface ShelfData {
  batches: DateBatch[] | null;
  products: Product[];
  byId: Map<string, Product>;
  today: string;
  alertDaysOf: (b: DateBatch) => number;
  error: boolean;
  reload: () => void;
}

/** Dates and products, re-read every time the screen gains focus (another tab may have changed them). */
export function useShelfData(status?: DateBatch['status']): ShelfData {
  const settings = useExpirySettings();
  const [batches, setBatches] = useState<DateBatch[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const [today, setToday] = useState(todayLocal());

  useFocusEffect(useCallback(() => {
    let live = true;
    setToday(todayLocal());
    Promise.all([listBatches(status ? { status } : {}), listProducts({ includeArchived: true })])
      .then(([b, p]) => { if (live) { setBatches(b); setProducts(p); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [status, tick]));

  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const alertDaysOf = useCallback((b: DateBatch) => alertDaysFor(byId.get(b.productId), settings.alertDays), [byId, settings.alertDays]);
  const reload = useCallback(() => setTick(x => x + 1), []);
  return { batches, products, byId, today, alertDaysOf, error, reload };
}
