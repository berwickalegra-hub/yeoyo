// Paramètres — account settings, built from the Banani "Paramètres
// (Desktop)" screen's 7 sections (Compte, Profil, Notifications,
// Préférences de recherche, Paiement, Données et confidentialité, À propos)
// plus the "Utilisateurs bloqués" row and the "Se déconnecter" footer
// action. No mobile mockup was exported for this screen (same gap as every
// authenticated screen except Landing) — built mobile-first regardless.
//
// Flagged departures from the mockup:
//   - "Numéro de téléphone" (+ Modifier) has no backing field — User/Profile
//     have no phone column in this kit, and adding one is an auth-boundary
//     decision (verification flow, uniqueness) bigger than a settings-page
//     edit. Left out rather than faked.
//   - "Méthodes de paiement" (saved M-Pesa/Airtel/Orange entries) isn't a
//     persisted concept yet — there's no real provider tokenizing a method
//     to save. Replaced with a link to Premium Checkout and a plain
//     "historique des paiements" list built from the user's own Orders.
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { Toggle } from '@/components/ui/Toggle';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Icon } from '@/components/ui/Icon';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { KINSHASA_COMMUNES, INTENT_OPTIONS } from '@/lib/yeoyo/constants';
import { RELIGION_LABELS, MARITAL_STATUS_LABELS } from '@/lib/yeoyo/types';
import { SuggestionChips } from '@/components/yeoyo/SuggestionChips';
import {
  BIO_SUGGESTIONS,
  QUALITIES_SUGGESTIONS,
  FLAWS_SUGGESTIONS,
  DEALBREAKERS_SUGGESTIONS,
} from '@/lib/yeoyo/content';
import type { NotificationPrefs } from '@/lib/server/notifications/prefs-merge';

const CHILDREN_OPTIONS = [
  { value: '0', label: 'Sans enfant' },
  { value: '1', label: '1 enfant' },
  { value: '2', label: '2 enfants' },
  { value: '3+', label: '3 enfants ou plus' },
];

const WANTS_CHILDREN_OPTIONS = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'PEUT_ETRE', label: 'Peut-être' },
];

const RELOCATE_OPTIONS = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'A_DISCUTER', label: 'À discuter' },
];

const INTERESTED_IN_OPTIONS = [
  { value: 'FEMME', label: 'Femmes' },
  { value: 'HOMME', label: 'Hommes' },
  { value: 'TOUS', label: 'Les deux' },
];

interface ProfileSettings {
  firstName: string;
  photoUrl: string | null;
  visibilityPublic: boolean;
  onlineStatusVisible: boolean;
  commune: string | null;
  intent: string;
  verifiedAt: string | null;
  bio: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  qualities: string | null;
  flaws: string | null;
  dealbreakers: string | null;
  interestedIn: string | null;
}

interface SubscriptionInfo {
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
}

interface BlockedRow {
  userId: string;
  profile: { firstName: string; photoUrl: string | null };
}

interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

const NOTIF_EVENTS: { key: string; label: string; helper: string }[] = [
  {
    key: 'CONTACT_REQUEST',
    label: 'Demandes de contact',
    helper: 'Quand quelqu’un souhaite entrer en contact',
  },
  {
    key: 'MESSAGE_RECEIVED',
    label: 'Messages reçus',
    helper: 'Nouveaux messages dans tes conversations',
  },
  { key: 'LIKE_RECEIVED', label: 'Likes reçus', helper: 'Quand quelqu’un aime ton profil' },
  {
    key: 'PROFILE_RECOMMENDED',
    label: 'Profils recommandés',
    helper: 'Suggestions de profils compatibles',
  },
];

export default function ParametresPage() {
  const user = useUser();
  const { logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const badgeCounts = useNavCounts();

  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({});
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const load = useCallback(async () => {
    try {
      const [profileRes, prefsRes, subRes, blockedRes] = await Promise.all([
        api<{ profile: ProfileSettings }>('/api/profile'),
        api<{ prefs: NotificationPrefs }>('/api/notifications/prefs'),
        api<{ subscription: SubscriptionInfo | null }>('/api/subscriptions/me'),
        api<{ blocked: BlockedRow[] }>('/api/users/blocked'),
      ]);
      setProfile(profileRes.profile);
      setNotifPrefs(prefsRes.prefs);
      setSubscription(subRes.subscription);
      setBlocked(blockedRes.blocked);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function patchProfile(
    patch: Partial<
      Pick<
        ProfileSettings,
        | 'visibilityPublic'
        | 'onlineStatusVisible'
        | 'commune'
        | 'intent'
        | 'bio'
        | 'religion'
        | 'maritalStatus'
        | 'childrenCount'
        | 'wantsChildren'
        | 'relocateOpen'
        | 'qualities'
        | 'flaws'
        | 'dealbreakers'
        | 'interestedIn'
      >
    >,
  ) {
    if (!profile) return;
    const previous = profile;
    setProfile({ ...profile, ...patch });
    try {
      await api('/api/profile', { method: 'PATCH', body: patch });
    } catch (err) {
      setProfile(previous);
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function toggleNotif(eventKey: string, value: boolean) {
    const previous = notifPrefs;
    setNotifPrefs({ ...notifPrefs, [eventKey]: { email: value, inApp: value } });
    try {
      await api('/api/notifications/prefs', {
        method: 'PATCH',
        body: { prefs: { [eventKey]: { email: value, inApp: value } } },
      });
    } catch (err) {
      setNotifPrefs(previous);
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function unblock(userId: string) {
    try {
      await api(`/api/users/${userId}/block`, { method: 'DELETE' });
      setBlocked((prev) => prev.filter((b) => b.userId !== userId));
      toast('Utilisateur débloqué', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function downloadData() {
    try {
      const data = await api<Record<string, unknown>>('/api/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yeoyo-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function loadOrders() {
    if (orders.length > 0) return;
    // No dedicated "my orders" list route exists yet — the export endpoint
    // already reads them for the data-export section, so reuse that instead
    // of adding a near-duplicate route just for this history view.
    try {
      const data = await api<{ orders: OrderRow[] }>('/api/account/export');
      setOrders(data.orders);
    } catch {
      /* history is non-critical */
    }
  }

  if (!user) return null;

  return (
    <AppShell active="parametres" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="border-b border-border px-5 py-5 lg:px-8">
        <h1 className="font-headings text-xl font-bold text-foreground">Paramètres</h1>
        <p className="mt-0.5 font-body text-sm text-muted-foreground">
          Gérez votre compte et vos préférences
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        {profile && (
          <Link
            href="/app/profil"
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <UserAvatar name={profile.firstName} avatarUrl={profile.photoUrl} size={48} />
              <div>
                <p className="font-headings text-sm font-semibold text-foreground">
                  {profile.firstName}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  Voir mon profil, ajouter une photo
                </p>
              </div>
            </div>
            <Icon name="chevron-right" size={18} className="text-muted-foreground" />
          </Link>
        )}

        <AccountSection userEmail={user.email} verifiedAt={profile?.verifiedAt ?? null} />

        {profile && (
          <SettingsSection title="Profil">
            <SettingsRow
              label="Visibilité du profil"
              helper="Apparaître dans Découvrir et Explorer"
            >
              <Toggle
                label="Visibilité du profil"
                checked={profile.visibilityPublic}
                onChange={(v) => patchProfile({ visibilityPublic: v })}
              />
            </SettingsRow>
            <SettingsRow label="Afficher mon statut en ligne">
              <Toggle
                label="Afficher mon statut en ligne"
                checked={profile.onlineStatusVisible}
                onChange={(v) => patchProfile({ onlineStatusVisible: v })}
              />
            </SettingsRow>
          </SettingsSection>
        )}

        {profile && (
          <SettingsSection title="Détails du profil">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Ta vision du mariage
              </span>
              <textarea
                value={profile.bio ?? ''}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                onBlur={(e) => patchProfile({ bio: e.target.value.trim() || null })}
                maxLength={500}
                rows={3}
                placeholder="Décris en quelques mots ce que tu recherches…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={BIO_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, bio: text });
                  void patchProfile({ bio: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Mes qualités</span>
              <textarea
                value={profile.qualities ?? ''}
                onChange={(e) => setProfile({ ...profile, qualities: e.target.value })}
                onBlur={(e) => patchProfile({ qualities: e.target.value.trim() || null })}
                maxLength={300}
                rows={2}
                placeholder="Ex : Déterminé(e), patient(e), à l'écoute…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={QUALITIES_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, qualities: text });
                  void patchProfile({ qualities: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Mes défauts</span>
              <textarea
                value={profile.flaws ?? ''}
                onChange={(e) => setProfile({ ...profile, flaws: e.target.value })}
                onBlur={(e) => patchProfile({ flaws: e.target.value.trim() || null })}
                maxLength={300}
                rows={2}
                placeholder="Ex : Un peu impatient(e), perfectionniste…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={FLAWS_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, flaws: text });
                  void patchProfile({ flaws: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Ce que je n&rsquo;accepte pas
              </span>
              <textarea
                value={profile.dealbreakers ?? ''}
                onChange={(e) => setProfile({ ...profile, dealbreakers: e.target.value })}
                onBlur={(e) => patchProfile({ dealbreakers: e.target.value.trim() || null })}
                maxLength={300}
                rows={2}
                placeholder="Ex : Le manque de sincérité, la violence…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={DEALBREAKERS_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, dealbreakers: text });
                  void patchProfile({ dealbreakers: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Religion</span>
              <select
                value={profile.religion ?? ''}
                onChange={(e) => patchProfile({ religion: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {Object.entries(RELIGION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Statut marital</span>
              <select
                value={profile.maritalStatus ?? ''}
                onChange={(e) => patchProfile({ maritalStatus: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Enfants</span>
              <select
                value={profile.childrenCount ?? ''}
                onChange={(e) => patchProfile({ childrenCount: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {CHILDREN_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Souhaite (encore) des enfants
              </span>
              <select
                value={profile.wantsChildren ?? ''}
                onChange={(e) => patchProfile({ wantsChildren: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {WANTS_CHILDREN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Ouvert(e) à déménager
              </span>
              <select
                value={profile.relocateOpen ?? ''}
                onChange={(e) => patchProfile({ relocateOpen: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {RELOCATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </SettingsSection>
        )}

        <SettingsSection title="Notifications">
          {NOTIF_EVENTS.map((e) => (
            <SettingsRow key={e.key} label={e.label} helper={e.helper}>
              <Toggle
                label={e.label}
                checked={notifPrefs[e.key]?.inApp !== false}
                onChange={(v) => toggleNotif(e.key, v)}
              />
            </SettingsRow>
          ))}
        </SettingsSection>

        {profile && (
          <SettingsSection title="Préférences de recherche">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Je souhaite voir
              </span>
              <select
                value={profile.interestedIn ?? ''}
                onChange={(e) => patchProfile({ interestedIn: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Par défaut (sexe opposé)</option>
                {INTERESTED_IN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Localité</span>
              <select
                value={profile.commune ?? ''}
                onChange={(e) => patchProfile({ commune: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Tout Kinshasa</option>
                {KINSHASA_COMMUNES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Intention</span>
              <select
                value={profile.intent}
                onChange={(e) => patchProfile({ intent: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                {INTENT_OPTIONS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
          </SettingsSection>
        )}

        <SettingsSection title="Paiement">
          <SettingsRow
            label="Plan actuel"
            helper={
              subscription
                ? `${subscription.planName} — ${subscription.status === 'ACTIVE' ? 'Actif' : 'En attente'}`
                : 'Plan Gratuit'
            }
          >
            <Link
              href="/app/premium"
              className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground"
            >
              {subscription?.status === 'ACTIVE' ? 'Gérer' : 'Passer Premium'}
            </Link>
          </SettingsRow>
          <details onToggle={() => void loadOrders()}>
            <summary className="cursor-pointer font-body text-sm font-medium text-foreground">
              Historique des paiements
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {orders.length === 0 && (
                <p className="font-body text-xs text-muted-foreground">
                  Aucun paiement pour l’instant.
                </p>
              )}
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between font-body text-xs text-muted-foreground"
                >
                  <span>{new Date(o.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span>
                    {(o.amount / 100).toFixed(2)} {o.currency}
                  </span>
                  <span>{o.status}</span>
                </div>
              ))}
            </div>
          </details>
        </SettingsSection>

        <SettingsSection title="Utilisateurs bloqués">
          {blocked.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">Aucun utilisateur bloqué.</p>
          )}
          {blocked.map((b) => (
            <div key={b.userId} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <UserAvatar name={b.profile.firstName} avatarUrl={b.profile.photoUrl} size={32} />
                <span className="font-body text-sm text-foreground">{b.profile.firstName}</span>
              </div>
              <button
                type="button"
                onClick={() => unblock(b.userId)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 font-body text-xs font-medium text-muted-foreground"
              >
                Débloquer
              </button>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title="Données et confidentialité">
          <SettingsRow label="Télécharger mes données" helper="Export JSON de ton compte">
            <button
              type="button"
              onClick={downloadData}
              className="rounded-lg border border-border bg-background px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Télécharger
            </button>
          </SettingsRow>
          <DeleteAccountRow
            hasPassword={user.hasPassword}
            userEmail={user.email}
            onDeleted={async () => {
              await logout();
              router.push('/');
            }}
          />
        </SettingsSection>

        <SettingsSection title="À propos">
          <a href="mailto:contact@yeoyo.app" className="font-body text-sm text-primary underline">
            Nous contacter
          </a>
        </SettingsSection>

        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push('/');
          }}
          className="mt-2 rounded-xl border border-border bg-surface py-3 font-body text-sm font-medium text-muted-foreground"
        >
          Se déconnecter
        </button>
      </div>
    </AppShell>
  );
}

function AccountSection({
  userEmail,
  verifiedAt,
}: {
  userEmail: string;
  verifiedAt: string | null;
}) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
      toast('Mot de passe mis à jour', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsSection title="Compte">
      <SettingsRow label="Adresse email" helper={userEmail}>
        <span className="font-body text-xs text-muted-foreground">Non modifiable</span>
      </SettingsRow>
      <SettingsRow
        label="Statut de vérification"
        helper={
          verifiedAt
            ? `Vérifié le ${new Date(verifiedAt).toLocaleDateString('fr-FR')}`
            : 'Non vérifié'
        }
      >
        <span className={`h-2 w-2 rounded-full ${verifiedAt ? 'bg-verified' : 'bg-muted'}`} />
      </SettingsRow>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="font-body text-sm font-medium text-foreground">
          Changer le mot de passe
        </span>
        <input
          type="password"
          placeholder="Mot de passe actuel"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
        />
        <input
          type="password"
          placeholder="Nouveau mot de passe"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
        />
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 self-start rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Changer
        </button>
      </form>
    </SettingsSection>
  );
}

function DeleteAccountRow({
  hasPassword,
  userEmail,
  onDeleted,
}: {
  hasPassword: boolean;
  userEmail: string;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function confirmDelete() {
    setSubmitting(true);
    try {
      await api('/api/account', {
        method: 'DELETE',
        body: hasPassword ? { password: input } : { confirmEmail: input },
      });
      onDeleted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <SettingsRow
        label="Supprimer mon compte"
        helper="Suppression définitive — pas de retour possible"
      >
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-500 px-4 py-2 font-body text-sm font-medium text-red-500"
        >
          Supprimer
        </button>
      </SettingsRow>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
      <p className="font-body text-xs text-muted-foreground">
        {hasPassword
          ? 'Confirme ton mot de passe pour supprimer définitivement ton compte.'
          : `Retape ton email (${userEmail}) pour confirmer la suppression définitive.`}
      </p>
      <input
        type={hasPassword ? 'password' : 'text'}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={hasPassword ? 'Mot de passe' : userEmail}
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={submitting || !input}
          className="rounded-lg bg-red-500 px-3 py-1.5 font-body text-xs font-semibold text-white disabled:opacity-50"
        >
          Confirmer la suppression
        </button>
      </div>
    </div>
  );
}
