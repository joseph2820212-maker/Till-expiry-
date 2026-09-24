/** Ordering of work queues: most urgent status first, then the earliest deadline, hard before quality, then name. */
import type { Batch, StatusSettings } from './expiryTypes';
import { deadlineInstant } from './datePrecision';
import { evaluateBatch, STATUS_RANK, type Evaluation } from './statusEngine';

export interface Ranked<T extends Batch = Batch> { batch: T; evaluation: Evaluation; instant: number }

export function rankBatches<T extends Batch>(batches: T[], now: number, settings: StatusSettings): Ranked<T>[] {
  return batches
    .map(batch => ({
      batch,
      evaluation: evaluateBatch(batch, now, settings),
      instant: batch.effective.deadline ? deadlineInstant(batch.effective.deadline, batch.timeZone) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) =>
      STATUS_RANK[a.evaluation.status] - STATUS_RANK[b.evaluation.status]
      || a.instant - b.instant
      || Number(b.evaluation.isHard) - Number(a.evaluation.isHard)
      || a.batch.productName.localeCompare(b.batch.productName)
      || a.batch.id.localeCompare(b.batch.id));
}
