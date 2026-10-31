export const auditAreas = [
  'Customer satisfaction surveys', 'Customer complaints', 'Incident reports',
  'Adverse events and equipment malfunction', 'Customer records',
  'P&L and budgets', 'Billing accuracy', 'Service plans and handouts',
] as const;
export type AuditCheck = { area: string; result: 'not_reviewed' | 'pass' | 'finding' | 'not_applicable'; evidence: string; finding: string; correctiveAction: string; responsible: string; dueDate: string; verification: string };
export type ComplianceRecord = {
  id: string; version: number; title: string; kind: 'audit' | 'complaint' | 'incident' | 'adverse_event' | 'survey';
  status: 'open' | 'in_progress' | 'complete'; priority: 'urgent' | 'high' | 'normal' | 'low';
  periodStart: string; periodEnd: string; scope: string; sample: string; summary: string;
  owner: string; dueDate: string; evidenceIds: string[]; checks: AuditCheck[];
  correctiveAction: string; verification: string; signedBy?: string; signedAt?: string;
  createdAt?: string; updatedAt?: string;
};
export function freshChecks(): AuditCheck[] {
  return auditAreas.map(area => ({ area, result: 'not_reviewed', evidence: '', finding: '', correctiveAction: '', responsible: '', dueDate: '', verification: '' }));
}
export function closureError(record: ComplianceRecord): string | null {
  if (record.status !== 'complete') return null;
  if (!record.summary.trim() || !record.verification.trim()) return 'Add a review summary and verification before sign-off.';
  if (record.kind !== 'audit') return record.correctiveAction.trim() ? null : 'Document the action taken before closing this record.';
  if (!record.periodStart || !record.periodEnd || !record.scope.trim() || !record.sample.trim()) return 'Document the audit period, scope, and sample selection before sign-off.';
  if (record.checks.length !== auditAreas.length || auditAreas.some(area => record.checks.filter(c => c.area === area).length !== 1)) return 'Review each of the eight audit areas exactly once.';
  for (const c of record.checks) {
    if (c.result === 'not_reviewed') return `Review ${c.area} before sign-off.`;
    if (!c.evidence.trim()) return `Document evidence or the reason for not applying ${c.area}.`;
    if (c.result === 'finding' && (!c.finding.trim() || !c.correctiveAction.trim() || !c.responsible.trim() || !c.dueDate || !c.verification.trim())) return `Complete the finding, corrective action, owner, due date, and verification for ${c.area}.`;
  }
  return null;
}
export function isValidDate(value: string): boolean {
  if (!value) return true;
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
