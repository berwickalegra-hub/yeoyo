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
        <KpiCard label="Membres totaux" value={kpis.totalMembers.toLocaleString('fr-FR')} />
        <KpiCard label="Abonnés Premium" value={kpis.premiumSubscribers.toLocaleString('fr-FR')} />
        <KpiCard label="Signalements" value={kpis.pendingReports.toLocaleString('fr-FR')} />
        <KpiCard
          label="Revenus"
          value={`$${(kpis.revenueCentsTotal / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-headings text-sm font-bold text-foreground">
            Inscriptions mensuelles
          </h2>
          <div className="flex h-32 items-end gap-1.5">
            {signupsByMonth.map((s) => (
              <div key={s.month} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary"
                  style={{ height: `${(s.count / maxSignups) * 100}%`, minHeight: 2 }}
                />
                <span className="font-body text-[9px] text-muted-foreground">
                  {s.month.slice(5)}
                </span>
              </div>
            ))}
            {signupsByMonth.length === 0 && (
              <p className="font-body text-xs text-muted-foreground">Aucune donnée.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-headings text-sm font-bold text-foreground">
            Répartition membres
          </h2>
          <div className="flex items-center gap-6">
            <div
              className="h-28 w-28 flex-shrink-0 rounded-full"
              style={{
                background:
                  breakdownTotal > 0 ? `conic-gradient(${conicStops})` : 'var(--color-muted)',
              }}
            />
            <div className="flex flex-col gap-1.5">
              {breakdownSlices.map((slice, i) => (
                <div key={slice.label} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: DONUT_COLORS[i] }}
                  />
                  <span className="font-body text-xs text-muted-foreground">
                    {slice.label} ({slice.value})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-headings text-sm font-bold text-foreground">Membres récents</h2>
          <Link href="/admin/membres" className="font-body text-xs text-primary underline">
            Voir tout →
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {recentUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between font-body text-xs">
              <span className="text-foreground">{u.name ?? u.email}</span>
              <span className="text-muted-foreground">{u.status}</span>
              <span className="text-muted-foreground">
                {new Date(u.createdAt).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-headings text-sm font-bold text-foreground">Signalements</h2>
            <Link href="/admin/signalements" className="font-body text-xs text-primary underline">
              Voir tout →
            </Link>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {kpis.pendingReports} signalement(s) en attente.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-headings text-sm font-bold text-foreground">Vérification IA</h2>
            <Link href="/admin/verification" className="font-body text-xs text-primary underline">
              Voir tout →
            </Link>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {memberBreakdown.pendingVerification} profil(s) en attente de vérification.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Activité récente</h2>
        <div className="flex flex-col gap-2">
          {auditRows.map((a) => (
            <div key={a.id} className="flex items-center justify-between font-body text-xs">
              <span className="text-foreground">{a.action}</span>
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-body text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-headings text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
