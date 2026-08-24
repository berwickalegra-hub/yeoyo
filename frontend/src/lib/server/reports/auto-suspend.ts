// Auto-suspends a profile once it accumulates AUTO_SUSPEND_REPORT_THRESHOLD
// reports — ever received, any status, pending manual review (2026-08-22,
// explicit user ask, matches the original spec: "un profil recevant 3+
// signalements est automatiquement suspendu"). A human admin still reviews
// and restores via /api/admin/users/[id]/status or resolves the underlying
// reports via /api/admin/reports/[id]/resolve — this only flips the switch
// early so a clearly-flagged account doesn't stay live while that happens.
//
// Deliberately NOT wrapped in a $transaction: this is a system-triggered
// action (not an admin one — AdminAction.actorId is a real User foreign
// key, and there's no service/system user to attribute it to, so this does
// NOT call logAdminAction). The guarded `updateMany` below is itself
// atomic per Postgres row-lock semantics, so two reports landing at once
// can't double-suspend or double-notify — whichever commits second finds
// status already 'SUSPENDED' and matches zero rows.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export const AUTO_SUSPEND_REPORT_THRESHOLD = 3;

export interface AutoSuspendResult {
  /** True only if THIS call was the one that flipped the status — false if already suspended or under threshold. */
  suspended: boolean;
  reportCount: number;
}

export async function maybeAutoSuspend(
  prisma: PrismaClient,
  targetUserId: string,
): Promise<AutoSuspendResult> {
  const reportCount = await prisma.report.count({ where: { targetId: targetUserId } });
  if (reportCount < AUTO_SUSPEND_REPORT_THRESHOLD) {
    return { suspended: false, reportCount };
  }

  const result = await prisma.user.updateMany({
    where: { id: targetUserId, status: { not: 'SUSPENDED' } },
    data: { status: 'SUSPENDED' },
  });
  return { suspended: result.count > 0, reportCount };
}
