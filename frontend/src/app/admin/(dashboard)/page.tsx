// Admin Dashboard — built from the Banani "Admin Panel (Desktop)" screen:
// KPI row, 2 charts (CSS bar chart + CSS conic-gradient donut, matching the
// mockup's own implementation approach rather than pulling in a chart
// library), Membres récents / Signalements / Vérification IA panels (small
// slices with links to their full pages), Activité récente feed (reuses
// the existing AdminAction audit log).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface Overview {
  kpis: {
    totalMembers: number;
    premiumSubscribers: number;
    pendingReports: number;
    revenueCentsTotal: number;
  };
  signupsByMonth: { month: string; count: number }[];
  memberBreakdown: {
    active: number;
    verified: number;
    pendingVerification: number;
    suspended: number;
  };
}

interface RecentUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: string;
}

const DONUT_COLORS = ['#c9a84c', '#4caf72', '#e8d5a3', '#8a8a8a'];

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    void (async () => {
      const [overviewRes, usersRes, auditRes] = await Promise.all([
        api<Overview>('/api/admin/stats/overview'),
        api<{ items: RecentUser[] }>('/api/admin/users?limit=5'),
        api<{ items: AuditRow[] }>('/api/admin/audit-log?limit=6'),
      ]);
      setOverview(overviewRes);
      setRecentUsers(usersRes.items);
      setAuditRows(auditRes.items);
    })();
  }, []);

  if (!overview) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-2 h-6 w-1/2" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <AdminTableSkeleton rows={5} columns={3} />
      </div>
    );
  }

  const { kpis, signupsByMonth, memberBreakdown } = overview;
  const maxSignups = Math.max(1, ...signupsByMonth.map((s) => s.count));
  const breakdownTotal =
    memberBreakdown.active +
    memberBreakdown.verified +
    memberBreakdown.pendingVerification +
    memberBreakdown.suspended;
  const breakdownSlices = [
    { label: 'Actifs', value: memberBreakdown.active },
    { label: 'Vérifiés', value: memberBreakdown.verified },
    { label: 'En attente', value: memberBreakdown.pendingVerification },
    { label: 'Inactifs', value: memberBreakdown.suspended },
  ];
  let cumulative = 0;
  const conicStops = breakdownSlices
    .map((slice, i) => {
      const pct = breakdownTotal > 0 ? (slice.value / breakdownTotal) * 100 : 0;
      const start = cumulative;
      cumulative += pct;
      return `${DONUT_COLORS[i]} ${start}% ${cumulative}%`;
    })
    .join(', ');

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <h1 className="font-headings text-2xl font-bold text-foreground">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Membres totaux"
          value={kpis.totalMembers.toLocaleString('fr-FR')}
          icon="users"
          tone="secondary"
        />
        <KpiCard
          label="Abonnés Premium"
          value={kpis.premiumSubscribers.toLocaleString('fr-FR')}
          icon="crown"
          tone="gold"
        />
        <KpiCard
          label="Signalements"
          value={kpis.pendingReports.toLocaleString('fr-FR')}
          icon="shield"
          tone={kpis.pendingReports > 0 ? 'warning' : 'verified'}
        />
        <KpiCard
          label="Revenus"
          value={`$${(kpis.revenueCentsTotal / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}`}
          icon="credit-card"
          tone="primary"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-headings text-sm font-bold text-foreground">
              Inscriptions mensuelles
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 font-body text-[11px] font-medium text-muted-foreground">
              {signupsByMonth.reduce((sum, s) => sum + s.count, 0)} au total
            </span>
          </div>
          <div className="flex h-32 items-end gap-1.5 border-b border-border">
            {signupsByMonth.map((s) => (
              <div
                key={s.month}
                className="group flex flex-1 flex-col items-center justify-end gap-1"
                title={`${s.month} — ${s.count} inscription(s)`}
              >
                <span className="font-body text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {s.count}
                </span>
                <div
                  className="w-full rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary"
                  style={{ height: `${(s.count / maxSignups) * 100}%`, minHeight: 3 }}
                />
              </div>
            ))}
            {signupsByMonth.length === 0 && (
              <p className="font-body text-xs text-muted-foreground">Aucune donnée.</p>
            )}
          </div>
          {signupsByMonth.length > 0 && (
            <div className="mt-1.5 flex gap-1.5">
              {signupsByMonth.map((s) => (
                <span
                  key={s.month}
                  className="flex-1 text-center font-body text-[9px] text-muted-foreground"
                >
                  {s.month.slice(5)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm">
          <h2 className="mb-4 font-headings text-sm font-bold text-foreground">
            Répartition membres
          </h2>
          <div className="flex items-center gap-6">
            <div
              className="relative h-28 w-28 flex-shrink-0 rounded-full"
              style={{
                background:
                  breakdownTotal > 0 ? `conic-gradient(${conicStops})` : 'var(--color-muted)',
              }}
            >
              <div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-surface">
                <span className="font-headings text-lg font-bold text-foreground">
                  {breakdownTotal}
                </span>
                <span className="font-body text-[9px] text-muted-foreground">membres</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {breakdownSlices.map((slice, i) => {
                const pct =
                  breakdownTotal > 0 ? Math.round((slice.value / breakdownTotal) * 100) : 0;
                return (
                  <div key={slice.label} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: DONUT_COLORS[i] }}
                    />
                    <span className="flex-1 font-body text-xs text-muted-foreground">
                      {slice.label}
                    </span>
                    <span className="font-body text-xs font-semibold text-foreground">
                      {slice.value}
                    </span>
                    <span className="w-9 text-right font-body text-[10px] text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-headings text-sm font-bold text-foreground">Membres récents</h2>
          <Link
            href="/admin/membres"
            className="flex cursor-pointer items-center gap-1 font-body text-xs font-medium text-primary transition-opacity hover:opacity-70"
          >
            Voir tout <Icon name="arrow-right" size={12} />
          </Link>
        </div>
        {recentUsers.length === 0 ? (
          <p className="px-5 py-6 font-body text-xs text-muted-foreground">Aucun membre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  <th className="px-5 py-2 font-medium">Membre</th>
                  <th className="px-5 py-2 font-medium">Statut</th>
                  <th className="px-5 py-2 font-medium">Inscrit le</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-border transition-colors hover:bg-muted/40"
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted font-body text-[11px] font-semibold text-foreground">
                          {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate text-foreground">{u.name ?? u.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.status === 'SUSPENDED'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-verified/10 text-verified'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryPanel
          icon="shield"
          tone={kpis.pendingReports > 0 ? 'warning' : 'verified'}
          title="Signalements"
          href="/admin/signalements"
          description={
            kpis.pendingReports > 0
              ? `${kpis.pendingReports} signalement(s) en attente.`
              : 'Aucun signalement en attente.'
          }
        />
        <SummaryPanel
          icon="bot"
          tone={memberBreakdown.pendingVerification > 0 ? 'warning' : 'verified'}
          title="Vérification IA"
          href="/admin/verification"
          description={
            memberBreakdown.pendingVerification > 0
              ? `${memberBreakdown.pendingVerification} profil(s) en attente de vérification.`
              : 'Aucun profil en attente.'
          }
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Activité récente</h2>
        <div className="flex flex-col">
          {auditRows.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 border-b border-border py-2.5 font-body text-xs last:border-0"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon name={activityIcon(a.action)} size={13} />
              </span>
              <span className="flex-1 text-foreground">{a.action}</span>
              <span className="text-muted-foreground">
                {new Date(a.createdAt).toLocaleString('fr-FR')}
              </span>
            </div>
          ))}
          {auditRows.length === 0 && (
            <p className="font-body text-xs text-muted-foreground">Aucune activité récente.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const KPI_TONES = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  secondary: { bg: 'bg-secondary/10', text: 'text-secondary' },
  gold: { bg: 'bg-gold/10', text: 'text-gold' },
  verified: { bg: 'bg-verified/10', text: 'text-verified' },
  warning: { bg: 'bg-red-500/10', text: 'text-red-500' },
} as const;

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone: keyof typeof KPI_TONES;
}) {
  const { bg, text } = KPI_TONES[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-body text-xs text-muted-foreground">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${text}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p className="mt-2 font-headings text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function SummaryPanel({
  icon,
  tone,
  title,
  href,
  description,
}: {
  icon: IconName;
  tone: keyof typeof KPI_TONES;
  title: string;
  href: string;
  description: string;
}) {
  const { bg, text } = KPI_TONES[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${text}`}>
            <Icon name={icon} size={16} />
          </span>
          <h2 className="font-headings text-sm font-bold text-foreground">{title}</h2>
        </div>
        <Link
          href={href}
          className="flex cursor-pointer items-center gap-1 font-body text-xs font-medium text-primary transition-opacity hover:opacity-70"
        >
          Voir tout <Icon name="arrow-right" size={12} />
        </Link>
      </div>
      <p className="font-body text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function activityIcon(action: string): IconName {
  const a = action.toLowerCase();
  if (a.includes('suspend') || a.includes('ban')) return 'ban';
  if (a.includes('restore') || a.includes('verify') || a.includes('approve')) return 'check-circle';
  if (a.includes('role') || a.includes('admin')) return 'shield-check';
  if (a.includes('2fa') || a.includes('auth')) return 'smartphone';
  if (a.includes('premium') || a.includes('subscription')) return 'crown';
  if (a.includes('report')) return 'shield';
  return 'zap';
}
