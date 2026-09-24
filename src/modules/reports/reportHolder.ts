/**
 * Hands a generated report PDF from the report screen to ReportPreview (E30) without putting file data in route
 * params. The preview shows, and shares, exactly this file.
 */
import type { ReportKind } from './reportCsv';

export interface PendingReport { report: ReportKind; title: string; uri: string; fileName: string }

const pending: Partial<Record<ReportKind, PendingReport>> = {};

export function setPendingReport(p: PendingReport): void { pending[p.report] = p; }
export function getPendingReport(kind: ReportKind): PendingReport | null { return pending[kind] ?? null; }
export function clearPendingReports(): void { delete pending.expiry; delete pending.waste; }
