// Admin — Journal d'activité. ADMIN+ (server-enforced by
// GET /api/admin/audit-log — requireAdmin('ADMIN'), see its doc comment on
// why ADMIN suffices for this read-only listing; the sidebar link is
// ADMIN-gated too).
//
// 2026-08-30 (explicit user ask before launch): the AdminAction audit trail
// was only surfaced as a short "recent activity" strip on the dashboard —
// this is the full, filterable history ("qui a fait quoi, quand"). Actor
// ids are resolved to emails via one extra call to the staff list (there
// are only a handful of admins). Read-only, cursor pagination.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface AuditRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

interface StaffRow {
  id: string;
  email: string;
  name: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  'user.suspend': 'Membre suspendu',
  'user.restore': 'Membre réactivé',
  'user.role_change': 'Rôle modifié',
  'user.delete': 'Compte supprimé',
  'user.credits_grant': 'Crédits ajustés',
  'withdrawal.cancel': 'Retrait annulé',
  'report.resolve': 'Signalement traité',
  'verification.process': 'Vérification traitée',
  'affiliate.create': 'Affilié créé',
  'affiliate.mark_paid': 'Affilié payé',
  'support.reply': 'Réponse support',
  'admin.invite_created': 'Invitation admin envoyée',
  'admin.invite_revoked': 'Invitation admin révoquée',
  'admin.invite_accepted': 'Invitation admin acceptée',
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

function summariseMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k} : ${String(v)}`);
  return entries.join(' · ');
}

export default function AdminJournalPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [staff, setStaff] = useState<Map<string, string>>(new Map());
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      const res = await api<{ items: StaffRow[] }>(
        '/api/admin/users?role=MODERATOR,ADMIN,SUPERADMIN&limit=50',
      );
      setStaff(new Map(res.items.map((s) => [s.id, s.name ?? s.email])));
    } catch {
      /* non-fatal — the table falls back to a shortened actor id */
    }
  }, []);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (!reset && cursor) params.set('cursor', cursor);
        params.set('limit', '25');
        const res = await api<{ items: AuditRow[]; nextCursor: string | null }>(
          `/api/admin/audit-log?${params.toString()}`,
        );
        setRows((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
        setHasMore(!!res.nextCursor);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        setLoading(false);
      }
    },
    [cursor, toast],
  );

  useEffect(() => {
    // Mount only — `load`/`loadStaff` read the latest `cursor` via closure.
    void loadStaff();
    void load(true);
  }, []);

  function actorName(actorId: string): string {
    return staff.get(actorId) ?? `${actorId.slice(0, 8)}…`;
  }

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <div>
        <h1 className="font-headings text-2xl font-bold text-foreground">Journal d'activité</h1>
        <p className="font-body text-sm text-muted-foreground">
          Historique des actions d'administration — qui a fait quoi, et quand
        </p>
      </div>

      {loading && rows.length === 0 ? (
        <AdminTableSkeleton rows={8} columns={4} />
      ) : (
        <div className="animate-fade-in overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Quand</th>
                <th className="px-4 py-3 font-medium">Par</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Détails</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-foreground">{actorName(r.actorId)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                      {actionLabel(r.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {summariseMetadata(r.metadata) ||
                      (r.targetType ? `${r.targetType} ${r.targetId?.slice(0, 8) ?? ''}` : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loading}
          className="self-start rounded-lg border border-border px-4 py-2 font-body text-sm text-muted-foreground disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Charger plus'}
        </button>
      )}

      {!loading && rows.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">Aucune action enregistrée.</p>
      )}
    </div>
  );
}
