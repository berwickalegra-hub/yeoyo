// /affilie dashboard — the affiliate's ("marketeur") own money-tracking
// screen. Single data source: GET /api/affiliate/me.
//
// 2026-08-28 design pass (explicit user ask): rebuilt to feel like a place
// a marketer *wants* to open — a gold "money" hero leading with the amount
// waiting to be paid out, a real 6-month earnings bar chart (data.monthly,
// server-computed from AffiliateEarning.createdAt), a referral funnel
// (signups → verified) and a friendlier referral-link card. Every figure
// is real; the chart shows an invitation-to-share empty state when there's
// nothing yet.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon, type IconName } from '@/components/ui/Icon';

interface MonthPoint {
  month: string; // YYYY-MM
  earned: number;
  signups: number;
}

interface AffiliateMe {
  affiliateCode: string;
  referralUrl: string;
  counters: { totalSignups: number; verifiedMen: number; verifiedWomen: number };
  earnings: {
    total: number;
    pending: number;
    paid: number;
    verificationBonusTotal: number;
    commissionTotal: number;
  };
  lastPaidAt: string | null;
  monthly: MonthPoint[];
  referredUsers: {
    firstName: string | null;
    verificationStatus: string | null;
    totalEarned: number;
  }[];
}

function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

function monthLabel(key: string): string {
  // key is YYYY-MM — build a UTC date on the 1st to avoid TZ drift.
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'short',
    timeZone: 'UTC',
  });
}

export default function AffiliateDashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AffiliateMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<AffiliateMe>('/api/affiliate/me');
      setData(res);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast('Données à jour', 'success');
  }

  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Impossible de copier le lien', 'error');
    }
  }

  async function shareLink() {
    if (!data) return;
    try {
      await navigator.share?.({
        title: 'Rejoins-moi sur YeOyo',
        text: 'Inscris-toi sur YeOyo avec mon lien de parrainage :',
        url: data.referralUrl,
      });
    } catch {
      // user dismissed the share sheet, or it failed — nothing to report
    }
  }

  const verifiedTotal = data ? data.counters.verifiedMen + data.counters.verifiedWomen : 0;

  if (loading || !data) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground">Mon espace affilié</h1>
          <p className="font-body text-sm text-muted-foreground">
            Ton lien travaille pour toi — suis tes gains en temps réel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="btn-press flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-body text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Icon name="refresh-cw" size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      {/* Money hero — leads with what matters most to a marketer: the
          amount that's theirs and waiting to be paid out. */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-[#e6ac44] via-[#c8932a] to-[#a9761d] p-6 text-gold-foreground shadow-lg shadow-gold/20">
        <div className="absolute -right-6 -top-6 opacity-20">
          <Icon name="banknote" size={120} />
        </div>
        <div className="relative">
          <p className="flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wide">
            <Icon name="gift" size={13} />
            En attente de versement
          </p>
          <p className="mt-1 font-headings text-4xl font-bold">
            {formatFcfa(data.earnings.pending)}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-gold-foreground/15 pt-3 font-body text-sm">
            <span className="flex items-center gap-1.5">
              <Icon name="trending-up" size={14} />
              Total gagné&nbsp;: <strong>{formatFcfa(data.earnings.total)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={14} />
              Déjà versé&nbsp;: <strong>{formatFcfa(data.earnings.paid)}</strong>
            </span>
            {data.lastPaidAt && (
              <span className="opacity-80">
                Dernier versement le {new Date(data.lastPaidAt).toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Referral link — the marketer's core tool, kept prominent. */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 flex items-center gap-1.5 font-body text-sm font-semibold text-foreground">
          <Icon name="link" size={14} className="text-primary" />
          Ton lien de parrainage
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-primary/10 px-3 py-2 font-mono text-sm font-semibold text-primary">
            {data.affiliateCode}
          </span>
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
            {data.referralUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="btn-press flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-body text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? 'Copié !' : 'Copier le lien'}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => void shareLink()}
              className="btn-press flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2 font-body text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <Icon name="share" size={14} />
              Partager
            </button>
          )}
        </div>
        <p className="mt-2 font-body text-xs text-muted-foreground">
          Partage-le sur WhatsApp, Facebook ou en story — chaque inscription vérifiée te rapporte.
        </p>
      </div>

      {/* Earnings chart — single gold series, magnitude over time. */}
      <MonthlyEarningsChart points={data.monthly} />

      {/* Referral funnel */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="mb-4 flex items-center gap-1.5 font-body text-sm font-semibold text-foreground">
          <Icon name="users" size={14} className="text-primary" />
          Tes parrainages
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FunnelTile
            icon="user-plus"
            label="Inscriptions totales"
            value={data.counters.totalSignups}
            tone="secondary"
          />
          <FunnelTile
            icon="user-check"
            label="Hommes vérifiés"
            value={data.counters.verifiedMen}
            tone="plain"
          />
          <FunnelTile
            icon="user-check"
            label="Femmes vérifiées"
            value={data.counters.verifiedWomen}
            tone="plain"
          />
        </div>
        <p className="mt-3 font-body text-xs text-muted-foreground">
          {verifiedTotal > 0
            ? `${verifiedTotal} profil${verifiedTotal > 1 ? 's' : ''} vérifié${verifiedTotal > 1 ? 's' : ''} sur ${data.counters.totalSignups} inscription${data.counters.totalSignups > 1 ? 's' : ''} — continue, chaque vérification paie.`
            : 'Une inscription te rapporte dès que le profil est vérifié. Relance tes contacts !'}
        </p>
      </div>

      {/* Earnings breakdown */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="mb-3 flex items-center gap-1.5 font-body text-sm font-semibold text-foreground">
          <Icon name="banknote" size={14} className="text-gold" />
          D&eacute;tail de tes gains
        </p>
        <div className="flex flex-col gap-2">
          <BreakdownRow
            icon="user-check"
            label="Primes de vérification"
            amount={data.earnings.verificationBonusTotal}
          />
          <BreakdownRow
            icon="gem"
            label="Commissions sur crédits"
            amount={data.earnings.commissionTotal}
          />
        </div>
      </div>

      {/* Referred users */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="font-body text-sm font-semibold text-foreground">Mes filleuls</p>
          <span className="rounded-full bg-muted px-2 py-0.5 font-body text-xs font-medium text-muted-foreground">
            {data.referredUsers.length}
          </span>
        </div>
        {data.referredUsers.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-sm text-muted-foreground">
            Aucun filleul pour le moment. Partage ton lien pour démarrer !
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {data.referredUsers.map((u, i) => {
              const verified = u.verificationStatus === 'VERIFIED';
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm text-foreground">
                      {u.firstName ?? 'Sans profil'}
                    </p>
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-body text-[11px] font-medium ${
                        verified ? 'bg-verified/10 text-verified' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {verified && <Icon name="check" size={10} />}
                      {verified ? 'Vérifié' : (u.verificationStatus ?? 'En attente')}
                    </span>
                  </div>
                  <span
                    className={`flex-shrink-0 font-headings text-sm font-bold ${
                      u.totalEarned > 0 ? 'text-gold' : 'text-muted-foreground'
                    }`}
                  >
                    {formatFcfa(u.totalEarned)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chart ────────────────────────────────────────────────────────────────
// Single series (FCFA earned per month) — magnitude over time. One hue
// (gold = money), so no legend; the title names the series. Same
// from-scratch CSS-bar approach the Admin Dashboard uses (no chart lib).
function MonthlyEarningsChart({ points }: { points: MonthPoint[] }) {
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.earned)), [points]);
  const total = useMemo(() => points.reduce((s, p) => s + p.earned, 0), [points]);
  const hasData = total > 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground">
            <Icon name="trending-up" size={14} className="text-gold" />
            Tes gains, 6 derniers mois
          </p>
          <p className="font-body text-xs text-muted-foreground">
            {hasData ? `${formatFcfa(total)} sur la période` : 'Encore rien — mais ça vient'}
          </p>
        </div>
      </div>

      {hasData ? (
        <>
          <div className="flex h-40 items-end gap-2 border-b border-border">
            {points.map((p) => (
              <div
                key={p.month}
                className="group relative flex flex-1 flex-col items-center justify-end"
                title={`${monthLabel(p.month)} — ${formatFcfa(p.earned)} · ${p.signups} inscription${p.signups > 1 ? 's' : ''}`}
              >
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-[#a9761d] to-[#e6ac44] transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max((p.earned / max) * 152, p.earned > 0 ? 4 : 0)}px` }}
                />
                {/* hover tooltip */}
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 font-body text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  <span className="font-semibold">{formatFcfa(p.earned)}</span>
                  <span className="text-muted-foreground"> · {p.signups} inscr.</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {points.map((p) => (
              <span
                key={p.month}
                className="flex-1 text-center font-body text-[10px] capitalize text-muted-foreground"
              >
                {monthLabel(p.month)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold">
            <Icon name="banknote" size={22} />
          </span>
          <p className="font-body text-sm font-medium text-foreground">
            Ton graphique s&apos;anime dès ta première commission
          </p>
          <p className="font-body text-xs text-muted-foreground">
            Partage ton lien aujourd&apos;hui pour voir la première barre monter.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────
const TONES = {
  secondary: 'bg-secondary text-secondary-foreground',
  gold: 'bg-gold text-gold-foreground',
  plain: 'bg-card text-foreground border border-border',
} as const;

function FunnelTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-xs text-muted-foreground">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-2 font-headings text-2xl font-bold text-foreground">
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  );
}

function BreakdownRow({ icon, label, amount }: { icon: IconName; label: string; amount: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
        <Icon name={icon} size={15} />
      </span>
      <span className="flex-1 font-body text-sm text-muted-foreground">{label}</span>
      <span className="font-headings text-sm font-bold text-foreground">{formatFcfa(amount)}</span>
    </div>
  );
}
