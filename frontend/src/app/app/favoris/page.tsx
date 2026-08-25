// Favoris — profiles the user has bookmarked (POST/DELETE /api/favorites).
// Distinct from /app/likes ("Mes likes" = who liked me). New tab from the
// "Rencontres Sérieuses Congo" Banani re-theme (2026-08-13) — no Banani
// screen was fetched for this list view specifically (only the star/
// favorite action button appears on Découvrir's card), so this page's
// layout follows the existing /app/likes list pattern for consistency
// rather than a pixel-matched Banani mockup.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AppShell } from '@/components/yeoyo/AppShell';
import { MessageListSkeleton } from '@/components/yeoyo/MessageListSkeleton';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { useCardExit } from '@/lib/yeoyo/useCardExit';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';

interface FavoriteRow {
  favoriteId: string;
  createdAt: string;
  profile: ProfileCard;
}

// Row is its own component (not inlined in the map) so each card owns an
// independent useCardExit instance — same reasoning as ProfileGridCard.
// The remove button defers to the exit animation before calling the real
// (async) removeFavorite, which still does its own await-then-filter, so a
// failed request simply lets the row fade back in via the animation reset
// rather than leaving a "ghost" row.
function FavoriteRowCard({
  row,
  onRemove,
  removing,
  index,
}: {
  row: FavoriteRow;
  onRemove: (row: FavoriteRow) => void;
  removing: boolean;
  index: number;
}) {
  const { exitClassName, trigger } = useCardExit();
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border border-border bg-surface p-4 animate-fade-in-up ${exitClassName}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Link href={`/app/profils/${row.profile.userId}`} className="flex-shrink-0">
        <UserAvatar name={row.profile.firstName} avatarUrl={row.profile.photoUrl} size={56} />
      </Link>
      <Link href={`/app/profils/${row.profile.userId}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-headings text-base font-bold text-foreground">
            {row.profile.firstName}
          </span>
          <span className="font-body text-sm text-muted-foreground">{row.profile.age} ans</span>
          {row.profile.verified && <div className="h-1.5 w-1.5 rounded-full bg-verified" />}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Icon name="gem" size={11} />
          <span className="font-body text-xs">
            {INTENT_LABELS[row.profile.intent] ?? row.profile.intent}
          </span>
          {(row.profile.city || row.profile.commune) && (
            <>
              <span className="text-border">•</span>
              <Icon name="map-pin" size={11} />
              <span className="font-body text-xs">
                {[row.profile.city, row.profile.commune].filter(Boolean).join(', ')}
              </span>
            </>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => trigger('left', () => onRemove(row))}
        disabled={removing}
        aria-label="Retirer des favoris"
        className={`btn-press flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${
          removing ? 'opacity-50' : ''
        }`}
      >
        <Icon name="heart" size={16} fill="currentColor" />
      </button>
    </div>
  );
}

export default function FavorisPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ favorites: FavoriteRow[] }>('/api/favorites');
      setFavorites(res.favorites);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function removeFavorite(row: FavoriteRow) {
    setRemovingId(row.favoriteId);
    try {
      await api('/api/favorites', { method: 'DELETE', body: { targetUserId: row.profile.userId } });
      setFavorites((prev) => prev.filter((f) => f.favoriteId !== row.favoriteId));
      toast('Retiré des favoris', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setRemovingId(null);
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="favoris"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <h1 className="font-headings text-xl font-bold text-foreground">Favoris</h1>
          <p className="mt-0.5 font-body text-sm text-muted-foreground">
            Les profils que tu as mis de côté
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        {loading && <MessageListSkeleton count={4} />}
        {!loading && favorites.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-8 text-center">
            <Icon name="heart" size={28} className="text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Aucun favori pour l’instant. Ajoute des profils depuis Découvrir.
            </p>
          </div>
        )}
        {favorites.map((f, i) => (
          <FavoriteRowCard
            key={f.favoriteId}
            row={f}
            index={i}
            onRemove={(row) => void removeFavorite(row)}
            removing={removingId === f.favoriteId}
          />
        ))}
      </div>
    </AppShell>
  );
}
