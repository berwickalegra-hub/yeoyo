// Visiteurs — who viewed my profile (GET /api/profile/visitors, written by
// GET /api/profiles/[userId]). New tab from the "Rencontres Sérieuses Congo"
// Banani re-theme (2026-08-13) — no dedicated Banani screen was fetched for
// this list view, so it follows the existing /app/likes list pattern for
// consistency rather than a pixel-matched mockup.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';

interface VisitorRow {
  profile: ProfileCard;
  viewedAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export default function VisiteursPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    api<{ visitors: VisitorRow[] }>('/api/profile/visitors')
      .then((res) => {
        if (!cancelled) setVisitors(res.visitors);
      })
      .catch((err) => {
        if (!cancelled)
          toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, toast]);

  if (!user) return null;

  return (
    <AppShell active="visiteurs" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <h1 className="font-headings text-xl font-bold text-foreground">Visiteurs</h1>
          <p className="mt-0.5 font-body text-sm text-muted-foreground">
            Qui a consulté ton profil récemment
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}
        {!loading && visitors.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-8 text-center">
            <Icon name="eye" size={28} className="text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Personne n’a encore consulté ton profil. Complète-le et explore pour te faire
              remarquer.
            </p>
          </div>
        )}
        {visitors.map((v) => (
          <Link
            key={v.profile.userId}
            href={`/app/profils/${v.profile.userId}`}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <UserAvatar name={v.profile.firstName} avatarUrl={v.profile.photoUrl} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-headings text-base font-bold text-foreground">
                  {v.profile.firstName}
                </span>
                <span className="font-body text-sm text-muted-foreground">{v.profile.age} ans</span>
                {v.profile.verified && <div className="h-1.5 w-1.5 rounded-full bg-verified" />}
              </div>
              <div className="mt-1 flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1 font-body text-xs">
                  <Icon name="gem" size={11} />
                  {INTENT_LABELS[v.profile.intent] ?? v.profile.intent}
                </span>
                <span className="flex items-center gap-1 font-body text-xs">
                  <Icon name="clock" size={11} />
                  {timeAgo(v.viewedAt)}
                </span>
              </div>
            </div>
            <Icon name="chevron-right" size={18} className="flex-shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
