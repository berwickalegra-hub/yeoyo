// Admin — Support inbox. One row per end user who has ever messaged
// support, most-recently-active first. Clicking a row opens the full thread
// at /admin/support/[userId] (reply lives there, not inline here — mirrors
// Signalements' list→action split, but a support reply needs a full
// composer, not a one-tap button).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface SupportThreadRow {
  userId: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  lastMessage: { content: string; senderRole: 'USER' | 'ADMIN'; createdAt: string } | null;
  unreadCount: number;
  lastActivityAt: string;
}

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [threads, setThreads] = useState<SupportThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: SupportThreadRow[] }>('/api/admin/support?limit=50');
      setThreads(res.items);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">Support</h1>
      <p className="font-body text-sm text-muted-foreground">
        {threads.length} conversation(s) — messages envoyés depuis le bouton support de
        l&rsquo;application.
      </p>

      {loading ? (
        <AdminTableSkeleton rows={4} columns={3} />
      ) : (
        <div className="animate-fade-in flex flex-col gap-2">
          {threads.map((t) => (
            <Link
              key={t.userId}
              href={`/admin/support/${t.userId}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-body text-sm font-medium text-foreground">
                    {t.user.name ?? t.user.email}
                  </p>
                  {t.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-primary-foreground">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
                {t.lastMessage && (
                  <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">
                    {t.lastMessage.senderRole === 'ADMIN' ? 'Toi : ' : ''}
                    {t.lastMessage.content || '(image)'}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2 text-muted-foreground">
                <span className="font-body text-xs">
                  {new Date(t.lastActivityAt).toLocaleString('fr-FR')}
                </span>
                <Icon name="chevron-right" size={16} />
              </div>
            </Link>
          ))}
          {threads.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">
              Aucun message de support pour l&rsquo;instant.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
