// Visiteurs — who viewed my profile (GET /api/profile/visitors, written by
// GET /api/profiles/[userId]). New tab from the "Rencontres Sérieuses Congo"
// Banani re-theme (2026-08-13) — no dedicated Banani screen was fetched for
// this list view, so it follows the existing /app/likes list pattern for
// consistency rather than a pixel-matched mockup.
// 2026-08-25 (credit gating Script 3): "Débloquer" spends 1 credit via
// POST /api/credits/spend { action: 'view_visitors' }, confirmed first
// through CreditConfirmModal. The reveal is PERMANENT per-visitor (server-
// tracked via Profile.visitorsUnlockedAt, see the API route's comment) —
// each row's own `revealed` flag decides whether it's blurred, and
// `unrevealedCount` decides whether the paywall banner still shows at all.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCredits } from '@/contexts/CreditsContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AppShell } from '@/components/yeoyo/AppShell';
import { MessageListSkeleton } from '@/components/yeoyo/MessageListSkeleton';
import { CreditConfirmModal } from '@/components/yeoyo/CreditConfirmModal';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';

const COST = 1;

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
  const { balance, unlimited, visitorsFavoritesFree, refresh: refreshCredits } = useCredits();
  const badgeCounts = useNavCounts();
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [unrevealedCount, setUnrevealedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [spending, setSpending] = useState(false);
  const freeToView = unlimited || visitorsFavoritesFree;
  const hasUnrevealed = unrevealedCount > 0 && !freeToView;

  const load = useCallback(() => {
    return api<{ visitors: VisitorRow[]; unrevealedCount: number }>('/api/profile/visitors').then(
      (res) => {
        setVisitors(res.visitors);
        setUnrevealedCount(res.unrevealedCount);
      },
    );
  }, []);

  async function unlock() {
    setSpending(true);
    try {
      await api('/api/credits/spend', { method: 'POST', body: { action: 'view_visitors' } });
      setShowConfirm(false);
      void refreshCredits();
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSpending(false);
    }
  }

  function reveal() {
    if (freeToView) {
      void unlock();
      return;
    }
    setShowConfirm(true);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    load()
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
  }, [user, toast, load]);

  if (!user) return null;

  return (
    <AppShell
      active="visiteurs"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <h1 className="font-headings text-xl font-bold text-foreground">Visiteurs</h1>
          <p className="mt-0.5 font-body text-sm text-muted-foreground">
            Qui a consulté ton profil récemment
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        {loading && <MessageListSkeleton count={4} />}
        {!loading && visitors.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-8 text-center">
            <Icon name="eye" size={28} className="text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Personne n’a encore consulté ton profil. Complète-le et explore pour te faire
              remarquer.
            </p>
          </div>
        )}
        {!loading && hasUnrevealed && visitors.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gold bg-gold/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold/20">
                <Icon name="eye" size={18} className="text-gold" />
              </div>
              <div>
                <p className="font-body text-sm font-bold text-foreground">
                  {visitors.length}{' '}
                  {visitors.length > 1 ? 'personnes ont consulté' : 'personne a consulté'} ton
                  profil
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {COST} crédit pour voir{' '}
                  {unrevealedCount < visitors.length ? `${unrevealedCount} de plus` : 'qui'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={reveal}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gold px-4 py-2 font-body text-sm font-bold text-gold-foreground transition-transform active:scale-95"
            >
              <Icon name="gem" size={14} />
              Débloquer
            </button>
          </div>
        )}
        {!loading && visitors.length > 0 && (
          <div className="animate-fade-in flex flex-col gap-3">
            {visitors.map((v) =>
              !freeToView && !v.profile.revealed ? (
                <button
                  key={v.profile.userId}
                  type="button"
                  onClick={reveal}
                  className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left"
                >
                  <div className="blur-sm select-none">
                    <UserAvatar
                      name={v.profile.firstName}
                      avatarUrl={v.profile.photoUrl}
                      size={56}
                    />
                  </div>
                  <div className="min-w-0 flex-1 select-none blur-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-headings text-base font-bold text-foreground">
                        {v.profile.firstName}
                      </span>
                      <span className="font-body text-sm text-muted-foreground">
                        {v.profile.age} ans
                      </span>
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
                  <Icon name="gem" size={18} className="flex-shrink-0 text-gold" />
                </button>
              ) : (
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
                      <span className="font-body text-sm text-muted-foreground">
                        {v.profile.age} ans
                      </span>
                      {v.profile.verified && (
                        <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                      )}
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
                  <Icon
                    name="chevron-right"
                    size={18}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                </Link>
              ),
            )}
          </div>
        )}
      </div>

      <CreditConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        cost={COST}
        balance={balance}
        actionLabel="Voir qui a visité ton profil"
        onConfirm={unlock}
        confirming={spending}
      />
    </AppShell>
  );
}
