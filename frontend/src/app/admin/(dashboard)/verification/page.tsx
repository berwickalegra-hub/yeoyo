// Admin — Vérification IA queue. No AI vendor wired yet (see
// IMPLEMENTATION-PLAN.md §3.4) — this is the manual-review stand-in:
// approve sets Profile.verifiedAt, reject leaves the profile unverified.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface QueueItem {
  id: string;
  userId: string;
  firstName: string;
  age: number;
  waitingSince: string | null;
  photoCount: number;
}

export default function AdminVerificationPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: QueueItem[] }>('/api/admin/verification-queue?limit=50');
      setItems(res.items);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function process(id: string, action: 'APPROVE' | 'REJECT') {
    setProcessingId(id);
    try {
      await api(`/api/admin/verification-queue/${id}/process`, {
        method: 'POST',
        body: { action },
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast(action === 'APPROVE' ? 'Profil vérifié' : 'Profil rejeté', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">Vérification IA</h1>
      <p className="font-body text-sm text-muted-foreground">
        {items.length} profil(s) en attente de vérification.
      </p>

      {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <p className="font-body text-sm font-medium text-foreground">
                {item.firstName}, {item.age} ans
              </p>
              <p className="font-body text-xs text-muted-foreground">
                {item.photoCount} photo(s) —{' '}
                {item.waitingSince
                  ? `en attente depuis le ${new Date(item.waitingSince).toLocaleDateString('fr-FR')}`
                  : 'en attente'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void process(item.id, 'REJECT')}
                disabled={processingId === item.id}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 font-body text-xs text-red-500 disabled:opacity-50"
              >
                Rejeter
              </button>
              <button
                type="button"
                onClick={() => void process(item.id, 'APPROVE')}
                disabled={processingId === item.id}
                className="rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Approuver
              </button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <p className="font-body text-sm text-muted-foreground">Aucun profil en attente.</p>
        )}
      </div>
    </div>
  );
}
