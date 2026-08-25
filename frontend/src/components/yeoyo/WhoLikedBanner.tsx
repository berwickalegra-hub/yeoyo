'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CreditConfirmModal } from '@/components/yeoyo/CreditConfirmModal';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/contexts/ToastContext';
import type { ProfileCard } from '@/lib/yeoyo/types';

const COST = 1;

// Banani's WhoLikedBanner.jsx (Accueil sidebar) — teaser for "X personnes
// apprécient ton profil", backed by real GET /api/profile/favorited-by
// (Favorite rows targeting me). Avatars are real photos, blurred via CSS
// (matches Banani's own `filter blur-sm` — the blur itself IS the paywall
// gate, not a fabricated placeholder), so the count/who is always honest —
// only the "who" resolution is withheld until unlocked.
//
// 2026-08-25: Premium replaced by pay-per-use credits — "Découvrir" spends
// 1 credit via POST /api/credits/spend { action: 'view_favorited_by' },
// confirmed first through CreditConfirmModal. `unlocked` is local component
// state, not persisted — reloading Accueil re-blurs the list, matching the
// product spec's "consommé à l'usage, pas un déblocage permanent". Staff
// (ADMIN/SUPERADMIN, `unlimited`) skip the modal — the server bypasses
// their charge too.
export function WhoLikedBanner({ preview, total }: { preview: ProfileCard[]; total: number }) {
  const { balance, unlimited, refresh: refreshCredits } = useCredits();
  const { toast } = useToast();
  const [unlocked, setUnlocked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [spending, setSpending] = useState(false);

  if (total === 0) return null;

  async function unlock() {
    setSpending(true);
    try {
      await api('/api/credits/spend', { method: 'POST', body: { action: 'view_favorited_by' } });
      setUnlocked(true);
      setShowConfirm(false);
      void refreshCredits();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSpending(false);
    }
  }

  function reveal() {
    if (unlimited) {
      void unlock();
      return;
    }
    setShowConfirm(true);
  }

  if (unlocked || unlimited) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-gold bg-gold/10 p-4">
        <div className="flex items-center gap-2">
          <Icon name="star" size={14} className="text-gold" />
          <p className="font-body text-sm font-bold text-foreground">
            {total} {total > 1 ? 'personnes apprécient' : 'personne apprécie'} ton profil
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {preview.slice(0, 3).map((p) => (
            <Link
              key={p.userId}
              href={`/app/profils/${p.userId}`}
              className="flex items-center gap-2.5"
            >
              <div className="h-9 w-9 overflow-hidden rounded-full border-2 border-background">
                <UserAvatar name={p.firstName} avatarUrl={p.photoUrl} size={36} />
              </div>
              <span className="font-body text-sm text-foreground">{p.firstName}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gold bg-gold/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {preview.slice(0, 3).map((p) => (
              <div
                key={p.userId}
                className="h-9 w-9 overflow-hidden rounded-full border-2 border-background blur-sm"
              >
                <UserAvatar name={p.firstName} avatarUrl={p.photoUrl} size={36} />
              </div>
            ))}
          </div>
          <div>
            <p className="font-body text-sm font-bold text-foreground">
              {total} {total > 1 ? 'personnes apprécient' : 'personne apprécie'} ton profil
            </p>
            <p className="font-body text-xs text-muted-foreground">1 crédit pour les voir</p>
          </div>
        </div>
        <button
          type="button"
          onClick={reveal}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gold px-4 py-2 font-body text-sm font-bold text-gold-foreground"
        >
          <Icon name="gem" size={14} />
          Découvrir
        </button>
      </div>

      <CreditConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        cost={COST}
        balance={balance}
        actionLabel="Voir qui t'a mis en favori"
        onConfirm={unlock}
        confirming={spending}
      />
    </>
  );
}
