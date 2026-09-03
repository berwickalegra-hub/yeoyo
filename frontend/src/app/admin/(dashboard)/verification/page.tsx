// Admin — Vérification queue. Members who submitted a code-in-hand selfie
// (/app/verification) and are waiting on a decision. Each card puts the
// selfie next to the profile photos and shows the code the member was asked
// to write, so the reviewer checks: (1) same person, (2) the paper shows
// that exact code. Approve / reject inline; a reject reason is sent to the
// member so they can redo it.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface QueueItem {
  id: string;
  userId: string;
  firstName: string;
  age: number;
  city: string;
  waitingSince: string | null;
  code: string | null;
  selfieUrl: string | null;
  photoCount: number;
  photoUrls: string[];
}

export default function AdminVerificationPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

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
      const reason = reasons[id]?.trim();
      await api(`/api/admin/verification-queue/${id}/process`, {
        method: 'POST',
        body: { action, ...(action === 'REJECT' && reason ? { reason } : {}) },
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
      <h1 className="font-headings text-2xl font-bold text-foreground">Vérification</h1>
      <p className="font-body text-sm text-muted-foreground">
        {items.length} demande(s) en attente. Compare le selfie avec les photos du profil et vérifie
        que le code écrit sur la feuille correspond.
      </p>

      {loading ? (
        <AdminTableSkeleton rows={3} columns={2} />
      ) : (
        <div className="animate-fade-in flex flex-col gap-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Link
                  href={`/admin/membres/${item.userId}`}
                  className="font-body text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {item.firstName}, {item.age} ans — {item.city}
                </Link>
                <span className="font-body text-xs text-muted-foreground">
                  {item.waitingSince
                    ? `depuis le ${new Date(item.waitingSince).toLocaleDateString('fr-FR')}`
                    : ''}
                </span>
              </div>

              <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                <Icon name="shield-check" size={14} className="text-primary" />
                <span className="font-body text-xs text-muted-foreground">Code demandé :</span>
                <span className="font-mono text-sm font-bold text-primary">{item.code ?? '—'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-1">
                  <p className="mb-1 font-body text-[11px] font-bold uppercase tracking-wide text-primary">
                    Selfie envoyé
                  </p>
                  {item.selfieUrl ? (
                    <a href={item.selfieUrl} target="_blank" rel="noopener noreferrer">
                      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-primary/40">
                        <Image
                          src={item.selfieUrl}
                          alt={`Selfie de vérification de ${item.firstName}`}
                          fill
                          sizes="25vw"
                          className="object-cover"
                        />
                      </div>
                    </a>
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-border bg-muted font-body text-xs text-muted-foreground">
                      Aucun selfie
                    </div>
                  )}
                </div>

                {item.photoUrls.slice(0, 3).map((url, i) => (
                  <div key={url} className="col-span-1">
                    <p className="mb-1 font-body text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {i === 0 ? 'Photo profil' : `Photo ${i + 1}`}
                    </p>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border">
                        <Image
                          src={url}
                          alt={`Photo de profil de ${item.firstName}`}
                          fill
                          sizes="25vw"
                          className="object-cover"
                        />
                      </div>
                    </a>
                  </div>
                ))}
              </div>

              <textarea
                value={reasons[item.id] ?? ''}
                onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
                rows={2}
                maxLength={500}
                placeholder="Motif (optionnel, envoyé au membre en cas de rejet) — ex : le code ne correspond pas, visage masqué…"
                className="mt-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
              />

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void process(item.id, 'REJECT')}
                  disabled={processingId === item.id}
                  className="btn-press rounded-lg border border-red-500/40 px-4 py-1.5 font-body text-xs font-semibold text-red-500 disabled:opacity-50"
                >
                  Rejeter
                </button>
                <button
                  type="button"
                  onClick={() => void process(item.id, 'APPROVE')}
                  disabled={processingId === item.id}
                  className="btn-press rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Approuver
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">Aucune demande en attente.</p>
          )}
        </div>
      )}
    </div>
  );
}
