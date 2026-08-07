// Admin — Signalements. Approve (RESOLVE, action taken) or dismiss
// (DISMISS, no action) each report filed via POST /api/reports (see the
// Messages thread's "Signaler" button).
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface ReportRow {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  reporter: { email: string; name: string | null };
  target: { email: string; name: string | null };
}

const REASON_LABELS: Record<string, string> = {
  FAKE_PROFILE: 'Faux profil',
  INAPPROPRIATE_CONTENT: 'Contenu inapproprié',
  HARASSMENT: 'Harcèlement',
  SCAM: 'Arnaque',
  OTHER: 'Autre',
};

export default function AdminSignalementsPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: ReportRow[] }>('/api/admin/reports?status=PENDING&limit=50');
      setReports(res.items);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, action: 'RESOLVE' | 'DISMISS') {
    setResolvingId(id);
    try {
      await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { action } });
      setReports((prev) => prev.filter((r) => r.id !== id));
      toast(
        action === 'RESOLVE' ? 'Signalement traité' : 'Signalement classé sans suite',
        'success',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">Signalements</h1>
      <p className="font-body text-sm text-muted-foreground">
        {reports.length} signalement(s) en attente.
      </p>

      {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

      <div className="flex flex-col gap-2">
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-sm text-foreground">
                  <span className="font-medium">{r.reporter.name ?? r.reporter.email}</span> a
                  signalé <span className="font-medium">{r.target.name ?? r.target.email}</span>
                </p>
                <p className="mt-0.5 font-body text-xs text-muted-foreground">
                  {REASON_LABELS[r.reason] ?? r.reason} —{' '}
                  {new Date(r.createdAt).toLocaleString('fr-FR')}
                </p>
                {r.details && (
                  <p className="mt-1 font-body text-xs text-muted-foreground">{r.details}</p>
                )}
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void resolve(r.id, 'DISMISS')}
                  disabled={resolvingId === r.id}
                  className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground disabled:opacity-50"
                >
                  Classer sans suite
                </button>
                <button
                  type="button"
                  onClick={() => void resolve(r.id, 'RESOLVE')}
                  disabled={resolvingId === r.id}
                  className="rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Traiter
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && reports.length === 0 && (
          <p className="font-body text-sm text-muted-foreground">Aucun signalement en attente.</p>
        )}
      </div>
    </div>
  );
}
