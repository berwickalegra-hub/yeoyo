// Admin Dashboard — originally built from the Banani "Admin Panel (Desktop)"
// screen; merged 2026-08-20 with visual pieces from a second Banani export
// (`AdminDashboard.jsx`, flow l_YkRVFXx5e9) ADDITIVELY — nothing real was
// removed to make room. KPI row (icon tile + real month-over-month delta),
// 2 charts (CSS bar chart, now dual-series Inscrits/Abonnés, + CSS
// conic-gradient donut — matching each mockup's own from-scratch approach
// rather than pulling in a chart library), a new "Activité aujourd'hui"
// quick-stats panel (5 real today-scoped counts), Membres récents (now a
// table with a Ville column), Signalements / File vérification (now real
// row lists, not just counts), Activité récente feed (reuses the existing
// AdminAction audit log). Two Banani-only data points were deliberately
// NOT reproduced — no fabricated data, see stats/overview route.ts and
// verification-queue route.ts comments: report "severity" (red/gold dot)
// and verification "type" (Selfie+ID / ID only) have no backing schema
// field in this kit.
//
// v3 fidelity pass (2026-08-22, plan: .planning/banani/admin-dashboard-v3-
// fidelity.md) — re-fetched the same screen and diffed literally: real
// member photos via the shared `UserAvatar` primitive (image-or-initials,
// already used everywhere else in the app) instead of fake initials
// circles; KPI tiles now solid fills matching Banani exactly instead of
// tinted badges (this KPI tile reverted primary→gold back to Banani's
// literal `bg-primary`; 2026-08-25: relabeled "Packs de crédits vendus" now
// that YeOyo is pay-per-use credits, not a Premium subscription — see
// stats/overview route.ts). Signalements' dynamic red/green tone replaced with
// Banani's static neutral tile); chart series recolored to the actual
// green/primary pair Banani uses (was primary/gold — no green anywhere,
// likely the real "colors don't look like Banani" complaint); chart +
// "Activité aujourd'hui" merged into one 3-col row per Banani's layout,
// donut moved to its own row; header gained a date subtitle, a static
// "Ce mois" pill, and a real client-side CSV Exporter. Membres récents'
// "Action" column deliberately NOT added — no `/admin/membres/[id]` detail
// route exists to link to.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface Overview {
  kpis: {
    totalMembers: number;
    creditPacksSold: number;
    pendingReports: number;
    revenueCentsTotal: number;
    deltas: {
      totalMembers: number | null;
      creditPacksSold: number | null;
      pendingReports: number | null;
      revenueCentsTotal: number | null;
    };
  };
  signupsByMonth: { month: string; count: number; creditPacksSold: number }[];
  memberBreakdown: {
    active: number;
    verified: number;
    pendingVerification: number;
    suspended: number;
  };
  today: {
    newSignups: number;
    messagesSent: number;
    matchesCreated: number;
    accountsSuspended: number;
    creditPacksPaid: number;
  };
}

interface RecentUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
  city: string | null;
  avatarUrl: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: string;
}

interface ReportRow {
  id: string;
  reason: string;
  createdAt: string;
  reporter: { name: string | null; email: string };
  target: { name: string | null; email: string };
}

interface VerificationRow {
  id: string;
  userId: string;
  firstName: string;
  age: number;
  city: string | null;
  photoCount: number;
  photoUrl: string | null;
  waitingSince: string | null;
}

// Real theme CSS variables (not magic hex — 2026-08-20, user-reported color
// drift), so the donut always follows whichever theme is active instead of
// four hardcoded hex values that had gone stale relative to this theme's
// actual tokens. Order matches breakdownSlices below (Actifs/Vérifiés/En
// attente/Inactifs).
const DONUT_COLORS = [
  'var(--color-secondary)',
  'var(--color-verified)',
  'var(--color-gold)',
  'var(--color-muted-foreground)',
];

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [verificationRows, setVerificationRows] = useState<VerificationRow[]>([]);

  useEffect(() => {
    void (async () => {
      const [overviewRes, usersRes, auditRes, reportsRes, verificationRes] = await Promise.all([
        api<Overview>('/api/admin/stats/overview'),
        api<{ items: RecentUser[] }>('/api/admin/users?limit=5'),
        api<{ items: AuditRow[] }>('/api/admin/audit-log?limit=6'),
        api<{ items: ReportRow[] }>('/api/admin/reports?limit=4'),
        api<{ items: VerificationRow[] }>('/api/admin/verification-queue?limit=3'),
      ]);
      setOverview(overviewRes);
      setRecentUsers(usersRes.items);
      setAuditRows(auditRes.items);
      setReportRows(reportsRes.items);
      setVerificationRows(verificationRes.items);
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

  const { kpis, signupsByMonth, memberBreakdown, today } = overview;
  const maxSignups = Math.max(1, ...signupsByMonth.flatMap((s) => [s.count, s.creditPacksSold]));
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

  const todayLabel = capitalize(
    new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-headings text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="font-body text-sm text-muted-foreground">
            {todayLabel} — Vue d&apos;ensemble
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 font-body text-sm text-foreground">
            <Icon name="calendar" size={14} />
            Ce mois
            <Icon name="chevron-down" size={12} />
          </span>
          <button
            type="button"
            onClick={() => exportRecentUsersCsv(recentUsers)}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-body text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Icon name="download" size={14} />
            Exporter
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Membres totaux"
          value={kpis.totalMembers.toLocaleString('fr-FR')}
          icon="users"
          tone="secondary"
          delta={kpis.deltas.totalMembers}
        />
        <KpiCard
          label="Packs de crédits vendus"
          value={kpis.creditPacksSold.toLocaleString('fr-FR')}
          icon="gem"
          tone="primary"
          delta={kpis.deltas.creditPacksSold}
        />
        <KpiCard
          label="Signalements"
          value={kpis.pendingReports.toLocaleString('fr-FR')}
          icon="flag"
          tone="plain"
          delta={kpis.deltas.pendingReports}
          deltaGoodDirection="down"
        />
        <KpiCard
          label="Revenus"
          value={`$${(kpis.revenueCentsTotal / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}`}
          icon="banknote"
          tone="gold"
          delta={kpis.deltas.revenueCentsTotal}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-headings text-sm font-bold text-foreground">
                Nouvelles inscriptions
              </h2>
              <p className="font-body text-xs text-muted-foreground">12 derniers mois</p>
            </div>
            <div className="flex items-center gap-3 font-body text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-secondary" />
                Inscrits
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-primary/50" />
                Packs vendus
              </span>
            </div>
          </div>
          <div className="flex h-32 items-end gap-1.5 border-b border-border">
            {signupsByMonth.map((s) => (
              <div
                key={s.month}
                className="group flex flex-1 flex-col items-end justify-end gap-0.5"
                title={`${s.month} — ${s.count} inscription(s), ${s.creditPacksSold} pack(s) vendu(s)`}
              >
                <div className="flex w-full items-end gap-0.5">
                  <div
                    className="flex-1 rounded-t-sm bg-secondary transition-colors group-hover:opacity-90"
                    style={{ height: `${(s.count / maxSignups) * 128}px`, minHeight: 3 }}
                  />
                  <div
                    className="flex-1 rounded-t-sm bg-primary/50 transition-colors group-hover:bg-primary/70"
                    style={{ height: `${(s.creditPacksSold / maxSignups) * 128}px`, minHeight: 3 }}
                  />
                </div>
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
            Activité aujourd&apos;hui
          </h2>
          <div className="flex flex-col gap-3">
            <TodayStatRow
              icon="user-plus"
              label="Nouvelles inscriptions"
              value={today.newSignups}
            />
            <TodayStatRow
              icon="message-circle"
              label="Messages envoyés"
              value={today.messagesSent}
            />
            <TodayStatRow icon="heart" label="Matchs créés" value={today.matchesCreated} />
            <TodayStatRow
              icon="eye-off"
              label="Comptes suspendus"
              value={today.accountsSuspended}
            />
            <TodayStatRow
              icon="credit-card"
              label="Packs de crédits payés"
              value={today.creditPacksPaid}
            />
          </div>
        </div>
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
              const pct = breakdownTotal > 0 ? Math.round((slice.value / breakdownTotal) * 100) : 0;
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
                  <th className="px-5 py-2 font-medium">Ville</th>
                  <th className="px-5 py-2 font-medium">Inscrit le</th>
                  <th className="px-5 py-2 font-medium">Statut</th>
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
                        <UserAvatar name={u.name ?? u.email} avatarUrl={u.avatarUrl} size={28} />
                        <span className="truncate text-foreground">{u.name ?? u.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-muted-foreground">{u.city ?? '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('fr-FR')}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="font-headings text-sm font-bold text-foreground">Signalements</h2>
              {kpis.pendingReports > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 font-body text-[11px] font-bold leading-none text-primary-foreground">
                  {kpis.pendingReports}
                </span>
              )}
            </div>
            <Link
              href="/admin/signalements"
              className="flex cursor-pointer items-center gap-1 font-body text-xs font-medium text-primary transition-opacity hover:opacity-70"
            >
              Voir tout <Icon name="arrow-right" size={12} />
            </Link>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {reportRows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-xs font-medium text-foreground">
                    {r.reason}
                  </p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {r.reporter.name ?? r.reporter.email} → {r.target.name ?? r.target.email}
                  </p>
                </div>
                <span className="flex-shrink-0 font-body text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
            {reportRows.length === 0 && (
              <p className="px-5 py-6 font-body text-xs text-muted-foreground">
                Aucun signalement en attente.
              </p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="font-headings text-sm font-bold text-foreground">File vérification</h2>
              {memberBreakdown.pendingVerification > 0 && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 font-body text-[11px] font-bold leading-none text-secondary-foreground">
                  {memberBreakdown.pendingVerification}
                </span>
              )}
            </div>
            <Link
              href="/admin/verification"
              className="flex cursor-pointer items-center gap-1 font-body text-xs font-medium text-primary transition-opacity hover:opacity-70"
            >
              Voir tout <Icon name="arrow-right" size={12} />
            </Link>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {verificationRows.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                <UserAvatar name={v.firstName} avatarUrl={v.photoUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-xs font-medium text-foreground">
                    {v.firstName}, {v.age} ans
                  </p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {v.city ?? '—'} · {v.photoCount} photo{v.photoCount > 1 ? 's' : ''}
                  </p>
                </div>
                <Link
                  href="/admin/verification"
                  className="flex-shrink-0 rounded-md bg-secondary px-2 py-1 font-body text-xs font-bold text-secondary-foreground"
                >
                  Vérifier
                </Link>
              </div>
            ))}
            {verificationRows.length === 0 && (
              <p className="px-5 py-6 font-body text-xs text-muted-foreground">
                Aucun profil en attente.
              </p>
            )}
          </div>
        </div>
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

// Solid fills, matching Banani's `AdminDashboard.jsx` metric tiles exactly
// (`bg-secondary`/`bg-primary`/`bg-card`/`bg-gold`, each with its own
// `-foreground` text) — not tinted badges. `plain` needs its own border
// since it shares the parent card's background and would otherwise vanish.
const KPI_TONES = {
  primary: { bg: 'bg-primary', text: 'text-primary-foreground', border: '' },
  secondary: { bg: 'bg-secondary', text: 'text-secondary-foreground', border: '' },
  gold: { bg: 'bg-gold', text: 'text-gold-foreground', border: '' },
  plain: { bg: 'bg-card', text: 'text-foreground', border: 'border border-border' },
} as const;

function KpiCard({
  label,
  value,
  icon,
  tone,
  delta,
  deltaGoodDirection = 'up',
}: {
  label: string;
  value: string;
  icon: IconName;
  tone: keyof typeof KPI_TONES;
  delta?: number | null;
  deltaGoodDirection?: 'up' | 'down';
}) {
  const { bg, text, border } = KPI_TONES[tone];
  // "Good" coloring follows deltaGoodDirection — a rising Signalements count
  // is bad news even though the number itself went up, so its card passes
  // deltaGoodDirection="down" to flip which sign reads as verified/primary.
  // Banani's own delta color is a literal up→verified / down→primary
  // mapping (no red — not a token in this theme).
  const isGood = delta != null && (deltaGoodDirection === 'up' ? delta >= 0 : delta <= 0);
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-body text-xs text-muted-foreground">{label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${text} ${border}`}
        >
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-2 font-headings text-2xl font-bold text-foreground">{value}</p>
      {delta != null && (
        <div
          className={`mt-1.5 flex items-center gap-1 font-body text-xs font-medium ${
            isGood ? 'text-verified' : 'text-primary'
          }`}
        >
          <Icon name={delta >= 0 ? 'trending-up' : 'trending-down'} size={12} />
          {delta >= 0 ? '+' : ''}
          {delta}% vs mois dernier
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Real Exporter action (Banani's button is decorative demo chrome) — a CSV
// of whatever's already loaded in the "Membres récents" table, no backend
// endpoint needed for a 5-row export.
//
// `u.name` is user-controlled (set via /api/auth/me PATCH or an OAuth
// display name) — a cell value starting with =/+/-/@ is interpreted as a
// formula by Excel/Sheets on open (CSV injection, OWASP-documented). Prefix
// those with a leading apostrophe so they render as inert text.
function csvSafeCell(value: string): string {
  const escaped = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${escaped.replace(/"/g, '""')}"`;
}

function exportRecentUsersCsv(users: RecentUser[]): void {
  const header = 'Nom,Email,Ville,Statut,Inscrit le';
  const rows = users.map((u) =>
    [
      u.name ?? '',
      u.email,
      u.city ?? '',
      u.status,
      new Date(u.createdAt).toLocaleDateString('fr-FR'),
    ]
      .map(csvSafeCell)
      .join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `membres-recents-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TodayStatRow({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={icon} size={13} />
      </span>
      <span className="flex-1 font-body text-sm text-muted-foreground">{label}</span>
      <span className="font-headings text-sm font-bold text-foreground">
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}

function activityIcon(action: string): IconName {
  const a = action.toLowerCase();
  if (a.includes('suspend') || a.includes('ban')) return 'ban';
  if (a.includes('restore') || a.includes('verify') || a.includes('approve')) return 'check-circle';
  if (a.includes('role') || a.includes('admin')) return 'shield-check';
  if (a.includes('2fa') || a.includes('auth')) return 'smartphone';
  if (a.includes('credit')) return 'gem';
  if (a.includes('report')) return 'shield';
  return 'zap';
}
