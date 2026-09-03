// Admin — Membres. The back-office roster: identity + role + account status
// + identity-verification state, with tab presets, country / role filters
// and cursor pagination. Reads GET /api/admin/users (q + status + role +
// country + verification + withCounts) and mutates through the existing
// /api/admin/users/[id]/status, /credits and DELETE routes — the row menu
// is a thin shell over those, the member fiche (/admin/membres/[id]) still
// owns the deeper actions (moderation hold, reports…).
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';
import { COUNTRIES } from '@/lib/yeoyo/constants';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN' | 'AFFILIATE';
  status: 'ACTIVE' | 'SUSPENDED';
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  verified: boolean;
  held: boolean;
  country: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  creditBalance: number;
}

interface TabCounts {
  all: number;
  verified: number;
  pending: number;
  unverified: number;
  rejected: number;
  suspended: number;
  held: number;
}

type TabId = 'all' | 'verified' | 'pending' | 'unverified' | 'rejected' | 'suspended' | 'held';

const TABS: { id: TabId; label: string; countKey: keyof TabCounts }[] = [
  { id: 'all', label: 'Tous', countKey: 'all' },
  { id: 'verified', label: 'Vérifiés', countKey: 'verified' },
  { id: 'pending', label: 'En attente', countKey: 'pending' },
  { id: 'unverified', label: 'Non vérifiés', countKey: 'unverified' },
  { id: 'rejected', label: 'Rejetés', countKey: 'rejected' },
  { id: 'suspended', label: 'Suspendus', countKey: 'suspended' },
  { id: 'held', label: 'En retrait', countKey: 'held' },
];

// A tab is just a preset over the API's status / verification params.
function tabParams(tab: TabId): Record<string, string> {
  switch (tab) {
    case 'verified':
      return { verification: 'VERIFIED' };
    case 'pending':
      return { verification: 'PENDING' };
    case 'unverified':
      return { verification: 'UNVERIFIED' };
    case 'rejected':
      return { verification: 'REJECTED' };
    case 'suspended':
      return { status: 'SUSPENDED' };
    case 'held':
      return { status: 'HELD' };
    default:
      return {};
  }
}

const COUNTRY_OPTIONS = [{ value: '', label: 'Tous les pays' }, ...COUNTRIES];
const ROLE_OPTIONS = [
  { value: '', label: 'Tous les rôles' },
  { value: 'USER', label: 'Membre' },
  { value: 'MODERATOR', label: 'Modérateur' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPERADMIN', label: 'Superadmin' },
  { value: 'AFFILIATE', label: 'Affilié' },
];
const PER_PAGE_OPTIONS = [
  { value: '25', label: '25 / page' },
  { value: '50', label: '50 / page' },
];

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  USER: 'Membre',
  MODERATOR: 'Modérateur',
  ADMIN: 'Admin',
  SUPERADMIN: 'Superadmin',
  AFFILIATE: 'Affilié',
};

function countryLabel(code: string | null): string {
  if (!code) return '—';
  return COUNTRIES.find((c) => c.value === code)?.label ?? code;
}

function VerificationBadge({ status }: { status: AdminUser['verificationStatus'] }) {
  const map: Record<
    AdminUser['verificationStatus'],
    { label: string; cls: string; icon: boolean }
  > = {
    VERIFIED: { label: 'Vérifié', cls: 'bg-verified/10 text-verified', icon: true },
    PENDING: { label: 'En attente', cls: 'bg-gold/10 text-gold', icon: false },
    REJECTED: { label: 'Rejeté', cls: 'bg-red-500/10 text-red-500', icon: false },
    UNVERIFIED: { label: 'Non vérifié', cls: 'bg-muted text-muted-foreground', icon: false },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}
    >
      {v.icon && <Icon name="shield-check" size={12} />}
      {v.label}
    </span>
  );
}

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.held) {
    return (
      <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-medium text-secondary">
        En retrait
      </span>
    );
  }
  if (user.status === 'SUSPENDED') {
    return (
      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
        Suspendu
      </span>
    );
  }
  return (
    <span className="rounded-full bg-verified/10 px-2 py-0.5 text-xs font-medium text-verified">
      Actif
    </span>
  );
}

// Row action menu — portalled to <body> with fixed positioning so the
// table's horizontal scroll container never clips it.
function RowMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-press flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
      >
        <Icon name="more-vertical" size={16} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 50 }}
            className="animate-fade-in-down min-w-[190px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuButton({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left font-body text-xs transition-colors hover:bg-muted ${
        danger ? 'text-red-500' : 'text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

const PAGE_LIMIT_DEFAULT = 25;

export default function AdminMembresPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [counts, setCounts] = useState<TabCounts | null>(null);

  // Filters
  const [tab, setTab] = useState<TabId>('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [role, setRole] = useState('');
  const [perPage, setPerPage] = useState(PAGE_LIMIT_DEFAULT);

  // Cursor pagination — cursorForPage[0] is always undefined (no cursor).
  const [pageIndex, setPageIndex] = useState(0);
  const cursorForPage = useRef<Record<number, string>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ admin: { role: string } }>('/api/admin/me')
      .then((res) => {
        if (!cancelled) setMyRole(res.admin.role);
      })
      .catch(() => {
        /* layout already guards /admin/* — a failure here just hides a button */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams(tabParams(tab));
        if (q) params.set('q', q);
        if (country) params.set('country', country);
        if (role) params.set('role', role);
        params.set('limit', String(perPage));
        if (targetPage === 0) params.set('withCounts', '1');
        const cursor = targetPage > 0 ? cursorForPage.current[targetPage] : undefined;
        if (cursor) params.set('cursor', cursor);

        const res = await api<{
          items: AdminUser[];
          nextCursor: string | null;
          counts?: TabCounts;
        }>(`/api/admin/users?${params.toString()}`);

        setUsers(res.items);
        setNextCursor(res.nextCursor);
        setPageIndex(targetPage);
        if (res.counts) setCounts(res.counts);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        setLoading(false);
      }
    },
    [tab, q, country, role, perPage, toast],
  );

  // Any filter change resets to page 0 and drops the cursor trail.
  useEffect(() => {
    cursorForPage.current = {};
    void load(0);
  }, [load]);

  function goNext() {
    if (!nextCursor) return;
    cursorForPage.current[pageIndex + 1] = nextCursor;
    void load(pageIndex + 1);
  }

  function goPrev() {
    if (pageIndex === 0) return;
    void load(pageIndex - 1);
  }

  function resetFilters() {
    setTab('all');
    setQInput('');
    setQ('');
    setCountry('');
    setRole('');
  }

  const hasActiveFilters = tab !== 'all' || q !== '' || country !== '' || role !== '';

  async function toggleStatus(user: AdminUser, close: () => void) {
    close();
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus, reason: 'Admin panel action' },
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)));
      toast(nextStatus === 'SUSPENDED' ? 'Membre suspendu' : 'Membre restauré', 'success');
      void load(0);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVerification(user: AdminUser, close: () => void) {
    close();
    const verify = user.verificationStatus !== 'VERIFIED';
    if (
      verify &&
      !window.confirm(
        `Marquer le profil de ${user.name ?? user.email} comme vérifié ?\n\n` +
          `Le badge « Vérifié » apparaîtra sur ses photos et le membre recevra une notification. ` +
          `À ne faire qu'après avoir regardé ses photos.`,
      )
    ) {
      return;
    }
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}/verification`, {
        method: 'POST',
        body: { action: verify ? 'VERIFY' : 'UNVERIFY' },
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? {
                ...u,
                verificationStatus: verify ? 'VERIFIED' : 'UNVERIFIED',
                verified: verify,
              }
            : u,
        ),
      );
      toast(verify ? 'Profil marqué comme vérifié' : 'Vérification retirée', 'success');
      void load(0);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function grantCredits(user: AdminUser, close: () => void) {
    close();
    const raw = window.prompt(
      `Créditer ${user.name ?? user.email}\n\n` +
        `Entre un nombre de crédits à ajouter (nombre négatif pour retirer) :`,
    );
    if (raw === null) return;
    const amount = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(amount) || amount === 0) {
      toast('Entre un nombre de crédits (positif ou négatif)', 'error');
      return;
    }
    setBusyId(user.id);
    try {
      const res = await api<{ balance: number }>(`/api/admin/users/${user.id}/credits`, {
        method: 'PATCH',
        body: { amount },
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, creditBalance: res.balance } : u)),
      );
      toast(`Solde : ${res.balance} crédit${res.balance > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(user: AdminUser, close: () => void) {
    close();
    const typed = window.prompt(
      `Suppression DÉFINITIVE de ce compte (sans retour possible).\n\n` +
        `Pour confirmer, retape l'adresse email exacte :\n${user.email}`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== user.email.toLowerCase()) {
      toast("L'email ne correspond pas — suppression annulée", 'error');
      return;
    }
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        body: { confirmEmail: typed.trim(), reason: 'Admin panel deletion' },
      });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast('Compte supprimé', 'success');
      void load(0);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <div>
        <h1 className="font-headings text-2xl font-bold text-foreground">Membres</h1>
        <p className="font-body text-sm text-muted-foreground">
          {counts ? `${counts.all.toLocaleString('fr-FR')} membre(s) au total` : 'Chargement…'}
        </p>
      </div>

      {/* Tabs */}
      <div className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          const n = counts?.[t.countKey];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-body text-sm transition-colors ${
                active
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {n !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 md:flex-row md:flex-wrap md:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput.trim());
          }}
          className="flex min-w-[220px] flex-1 gap-2"
        >
          <div className="relative flex-1">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              placeholder="Rechercher un email ou un nom…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 font-body text-sm text-foreground"
            />
          </div>
          <button
            type="submit"
            className="btn-press rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground"
          >
            Rechercher
          </button>
        </form>

        <div className="w-full md:w-44">
          <CustomSelect
            value={country}
            onChange={setCountry}
            options={COUNTRY_OPTIONS}
            ariaLabel="Filtrer par pays"
            placeholder="Pays"
          />
        </div>
        <div className="w-full md:w-44">
          <CustomSelect
            value={role}
            onChange={setRole}
            options={ROLE_OPTIONS}
            ariaLabel="Filtrer par rôle"
            placeholder="Rôle"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="btn-press flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-body text-xs text-muted-foreground hover:bg-muted"
          >
            <Icon name="refresh-cw" size={13} />
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      {loading && users.length === 0 ? (
        <AdminTableSkeleton rows={8} columns={7} />
      ) : (
        <div className="animate-fade-in overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-left font-body text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Membre</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Vérification</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Pays</th>
                <th className="px-4 py-3 font-medium">Crédits</th>
                <th className="px-4 py-3 font-medium">Inscrit le</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-border last:border-0 ${
                    busyId === u.id ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/admin/membres/${u.id}`} className="group flex items-center gap-3">
                      {u.avatarUrl ? (
                        // Small avatar thumbnail in a dense table — next/image adds no value here.
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted font-headings text-xs font-bold text-muted-foreground">
                          {(u.firstName ?? u.name ?? u.email).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground group-hover:text-primary">
                          {u.name ?? u.firstName ?? '—'}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-3">
                    <VerificationBadge status={u.verificationStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge user={u} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {countryLabel(u.country)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                      {u.creditBalance}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowMenu>
                      {(close) => (
                        <>
                          <Link
                            href={`/admin/membres/${u.id}`}
                            role="menuitem"
                            onClick={close}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-xs text-foreground transition-colors hover:bg-muted"
                          >
                            <Icon name="arrow-right" size={13} />
                            Voir la fiche
                          </Link>
                          <MenuButton onClick={() => void toggleVerification(u, close)}>
                            <Icon name="shield-check" size={13} />
                            {u.verificationStatus === 'VERIFIED'
                              ? 'Retirer la vérification'
                              : 'Marquer comme vérifié'}
                          </MenuButton>
                          {u.role === 'USER' && (
                            <MenuButton onClick={() => void toggleStatus(u, close)}>
                              <Icon
                                name={u.status === 'ACTIVE' ? 'x-circle' : 'check-circle'}
                                size={13}
                              />
                              {u.status === 'ACTIVE' ? 'Suspendre' : 'Restaurer'}
                            </MenuButton>
                          )}
                          <MenuButton onClick={() => void grantCredits(u, close)}>
                            <Icon name="credit-card" size={13} />
                            Créditer…
                          </MenuButton>
                          {myRole === 'SUPERADMIN' && u.role === 'USER' && (
                            <MenuButton danger onClick={() => void deleteUser(u, close)}>
                              <Icon name="x-circle" size={13} />
                              Supprimer
                            </MenuButton>
                          )}
                        </>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && users.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">Aucun membre ne correspond.</p>
      )}

      {/* Pagination */}
      {(users.length > 0 || pageIndex > 0) && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="w-full sm:w-36">
            <CustomSelect
              value={String(perPage)}
              onChange={(v) => setPerPage(Number(v))}
              options={PER_PAGE_OPTIONS}
              ariaLabel="Membres par page"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={pageIndex === 0 || loading}
              className="btn-press flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-body text-sm text-muted-foreground disabled:opacity-40"
            >
              <Icon name="chevron-left" size={15} />
              Précédent
            </button>
            <span className="font-body text-sm text-muted-foreground">Page {pageIndex + 1}</span>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextCursor || loading}
              className="btn-press flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-body text-sm text-muted-foreground disabled:opacity-40"
            >
              Suivant
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
