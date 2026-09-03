'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';

// Pinned "Équipe YeOyo" row at the top of the Messages inbox. Surfaces the
// SupportMessage thread (admin ↔ user) right inside the chat space — this is
// where a moderation notice or any admin message lands. Tapping opens
// /app/messages/equipe.

const SEEN_KEY = 'yeoyo.team.seenAt';

interface TeamMsg {
  id: string;
  senderRole: 'USER' | 'ADMIN';
  content: string;
  createdAt: string;
}

export function TeamThreadRow() {
  const [last, setLast] = useState<TeamMsg | null>(null);
  const [hasUnseenAdmin, setHasUnseenAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ messages: TeamMsg[] }>('/api/support/messages')
      .then((res) => {
        if (cancelled) return;
        const lm = res.messages[res.messages.length - 1] ?? null;
        setLast(lm);
        let seenAt = 0;
        try {
          seenAt = Number(window.localStorage.getItem(SEEN_KEY) ?? 0);
        } catch {
          /* ignore */
        }
        if (lm && lm.senderRole === 'ADMIN' && new Date(lm.createdAt).getTime() > seenAt) {
          setHasUnseenAdmin(true);
        }
      })
      .catch(() => {
        /* thread is optional chrome — stay quiet on failure */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;

  const preview = last
    ? last.content.replace(/\s+/g, ' ').trim().slice(0, 90)
    : 'Une question ? Écris-nous, on te répond ici.';

  return (
    <Link
      href="/app/messages/equipe"
      className="flex items-center gap-3 border-b border-border bg-primary/[0.03] px-5 py-3.5 transition-colors hover:bg-primary/[0.06]"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Icon name="shield-check" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-headings text-sm font-semibold text-foreground">Équipe YeOyo</p>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-body text-[10px] font-bold uppercase text-primary">
            Officiel
          </span>
        </div>
        <p className="truncate font-body text-xs text-muted-foreground">{preview}</p>
      </div>
      {hasUnseenAdmin && (
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary"
          aria-label="Nouveau message"
        />
      )}
    </Link>
  );
}
