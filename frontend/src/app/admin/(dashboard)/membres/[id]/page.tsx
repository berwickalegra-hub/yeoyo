// Admin — Fiche membre. Reachable from the Membres list ("Voir" per row)
// and from the Vérification IA queue (clicking a pending profile) — both
// link by User id, so this single fiche serves both entry points.
//
// No AI verification vendor is wired in this kit (verification-queue's own
// header comment) — there is no similarity/confidence score and no
// reverse-image/AI-generated-photo signal anywhere in the schema. Rather
// than fabricate one, the "Comparaison visuelle" section shows the real
// submitted photos side by side and states plainly that no automated
// signal exists yet, instead of a fake percentage.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { INTENT_LABELS } from '@/lib/yeoyo/types';
import { REPORT_REASONS } from '@/lib/yeoyo/constants';

interface MemberDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: 'USER' | 'ADMIN' | 'SUPERADMIN';
    status: 'ACTIVE' | 'SUSPENDED';
    emailVerifiedAt: string | null;
    creditBalance: number;
    createdAt: string;
  };
  profile: {
    id: string;
    firstName: string;
    lastName: string | null;
    age: number;
    city: string;
    country: string | null;
    intent: string;
    bio: string | null;
    verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    verifiedAt: string | null;
    verificationCode: string | null;
    verificationSelfieUrl: string | null;
    verificationSubmittedAt: string | null;
    verificationRejectionReason: string | null;
    moderationHeldAt: string | null;
    moderationReason: string | null;
    onboardingCompletedAt: string | null;
    photos: { id: string; url: string | null; isPrimary: boolean }[];
  } | null;
  activity: { likesSent: number; contactRequestsSent: number };
  reportsReceived: {
    id: string;
    reason: string;
    details: string | null;
    status: string;
    createdAt: string;
    reporterName: string;
  }[];
  reportsFiled: {
    id: string;
    reason: string;
    status: string;
    createdAt: string;
    targetName: string;
  }[];
}

function reasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}

const VERIFICATION_BADGE: Record<string, { label: string; className: string }> = {
  UNVERIFIED: { label: 'Non vérifié', className: 'bg-muted text-muted-foreground' },
  PENDING: { label: 'En attente', className: 'bg-gold/10 text-gold' },
  VERIFIED: { label: 'Vérifié', className: 'bg-verified/10 text-verified' },
  REJECTED: { label: 'Rejeté', className: 'bg-red-500/10 text-red-500' },
};

export default function AdminMemberDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState<'APPROVE' | 'REJECT' | null>(null);
  // Manual verification override (no code-in-hand selfie flow).
  const [verifBusy, setVerifBusy] = useState(false);
  // Moderation hold (soft-hide) + free-text admin message.
  const [holdReason, setHoldReason] = useState('');
  const [modBusy, setModBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<MemberDetail>(`/api/admin/users/${params.id}/detail`);
      setDetail(res);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [params.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function process(action: 'APPROVE' | 'REJECT') {
    if (!detail?.profile) return;
    setProcessing(action);
    try {
      await api(`/api/admin/verification-queue/${detail.profile.id}/process`, {
        method: 'POST',
        body: { action, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      toast(action === 'APPROVE' ? 'Profil vérifié' : 'Profil rejeté', 'success');
      router.push('/admin/verification');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setProcessing(null);
    }
  }

  async function manualVerify(action: 'VERIFY' | 'UNVERIFY') {
    if (!detail?.profile) return;
    if (
      action === 'VERIFY' &&
      !window.confirm(
        'Marquer ce profil comme vérifié ?\n\nLe badge « Vérifié » apparaîtra sur ses photos et ' +
          'le membre recevra une notification. À ne faire qu’après avoir regardé les photos ci-dessus.',
      )
    ) {
      return;
    }
    setVerifBusy(true);
    try {
      await api(`/api/admin/users/${detail.user.id}/verification`, {
        method: 'POST',
        body: { action },
      });
      toast(
        action === 'VERIFY' ? 'Profil marqué comme vérifié' : 'Vérification retirée',
        'success',
      );
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setVerifBusy(false);
    }
  }

  async function setModeration(action: 'HOLD' | 'RELEASE') {
    if (!detail) return;
    if (action === 'HOLD' && holdReason.trim().length < 3) {
      toast('Indique une raison (visible par le membre).', 'error');
      return;
    }
    setModBusy(true);
    try {
      await api(`/api/admin/users/${detail.user.id}/moderation`, {
        method: 'POST',
        body: action === 'HOLD' ? { action, reason: holdReason.trim() } : { action },
      });
      toast(
        action === 'HOLD' ? 'Profil mis en retrait — message envoyé.' : 'Profil réactivé.',
        'success',
      );
      setHoldReason('');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setModBusy(false);
    }
  }

  async function sendAdminMessage() {
    if (!detail || adminMsg.trim().length === 0) return;
    setMsgBusy(true);
    try {
      await api(`/api/admin/support/${detail.user.id}/reply`, {
        method: 'POST',
        body: { content: adminMsg.trim() },
      });
      toast('Message envoyé — il apparaît dans son espace Messages.', 'success');
      setAdminMsg('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setMsgBusy(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const { user, profile, activity, reportsReceived, reportsFiled } = detail;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <Link
        href="/admin/membres"
        className="flex w-fit cursor-pointer items-center gap-1 font-body text-sm text-muted-foreground transition-opacity hover:opacity-70"
      >
        <Icon name="chevron-left" size={14} />
        Retour aux membres
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-5">
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.name ?? user.email}
            width={56}
            height={56}
            style={{ width: 56, height: 56 }}
            className="aspect-square flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-headings text-lg font-semibold text-secondary-foreground">
            {(user.name ?? user.email).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-headings text-lg font-bold text-foreground">
            {user.name ?? profile?.firstName ?? user.email}
          </p>
          <p className="truncate font-body text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 font-body text-xs text-muted-foreground">
            {user.role}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-body text-xs ${
              user.status === 'SUSPENDED'
                ? 'bg-red-500/10 text-red-500'
                : 'bg-verified/10 text-verified'
            }`}
          >
            {user.status === 'SUSPENDED' ? 'Suspendu' : 'Actif'}
          </span>
          {profile && (
            <span
              className={`rounded-full px-2 py-0.5 font-body text-xs font-semibold ${VERIFICATION_BADGE[profile.verificationStatus]?.className ?? ''}`}
            >
              {VERIFICATION_BADGE[profile.verificationStatus]?.label ?? profile.verificationStatus}
            </span>
          )}
        </div>
      </div>

      {!profile ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-body text-sm text-muted-foreground">
            Ce membre n&apos;a pas encore complété son profil (onboarding non terminé) — rien à
            vérifier pour l&apos;instant.
          </p>
        </div>
      ) : (
        <>
          {/* 1. Comparaison visuelle */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 font-headings text-sm font-bold text-foreground">
              Comparaison visuelle
            </h2>

            {(profile.verificationSelfieUrl || profile.verificationCode) && (
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-body text-xs font-bold uppercase tracking-wide text-primary">
                    Selfie de vérification
                  </span>
                  {profile.verificationCode && (
                    <span className="font-body text-xs text-muted-foreground">
                      code demandé :{' '}
                      <span className="font-mono font-bold text-primary">
                        {profile.verificationCode}
                      </span>
                    </span>
                  )}
                  {profile.verificationSubmittedAt && (
                    <span className="font-body text-xs text-muted-foreground">
                      · envoyé le{' '}
                      {new Date(profile.verificationSubmittedAt).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
                {profile.verificationSelfieUrl ? (
                  <a
                    href={profile.verificationSelfieUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-lg border-2 border-primary/40">
                      <Image
                        src={profile.verificationSelfieUrl}
                        alt={`Selfie de vérification de ${profile.firstName}`}
                        fill
                        sizes="160px"
                        className="object-cover"
                      />
                    </div>
                  </a>
                ) : (
                  <p className="font-body text-xs text-muted-foreground">
                    Selfie non disponible (demande déjà traitée).
                  </p>
                )}
                {profile.verificationRejectionReason && (
                  <p className="mt-2 font-body text-xs text-red-500">
                    Dernier rejet : {profile.verificationRejectionReason}
                  </p>
                )}
              </div>
            )}

            <p className="mb-2 font-body text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Photos du profil
            </p>
            {profile.photos.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground">Aucune photo soumise.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {profile.photos.map((photo) =>
                  photo.url ? (
                    <div
                      key={photo.id}
                      className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border"
                    >
                      <Image
                        src={photo.url}
                        alt={`Photo de ${profile.firstName}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover"
                      />
                      {photo.isPrimary && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 font-body text-[10px] font-bold text-primary-foreground">
                          Principale
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      key={photo.id}
                      className="flex aspect-[3/4] items-center justify-center rounded-lg border border-border bg-muted font-body text-xs text-muted-foreground"
                    >
                      Image indisponible
                    </div>
                  ),
                )}
              </div>
            )}

            {/* No AI vendor wired in this kit — see file header comment. */}
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 p-3">
              <Icon name="info" size={14} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
              <p className="font-body text-xs text-muted-foreground">
                Aucun système de détection automatique n&apos;est connecté (score de similarité,
                recherche d&apos;image inversée, détection IA) — la vérification se fait entièrement
                à l&apos;œil par comparaison des photos ci-dessus.
              </p>
            </div>
          </div>

          {/* 2. Informations du compte */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 font-headings text-sm font-bold text-foreground">
              Informations du compte
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Prénom" value={profile.firstName} />
              <Field label="Âge" value={`${profile.age} ans`} />
              <Field label="Ville" value={profile.city} />
              <Field label="Pays" value={profile.country ?? '—'} />
              <Field label="Intention" value={INTENT_LABELS[profile.intent] ?? profile.intent} />
              <Field
                label="Compte créé le"
                value={new Date(user.createdAt).toLocaleDateString('fr-FR')}
              />
              <Field label="Likes envoyés" value={String(activity.likesSent)} />
              <Field label="Demandes envoyées" value={String(activity.contactRequestsSent)} />
              <Field label="Crédits" value={String(user.creditBalance)} />
            </div>
            {profile.bio && (
              <div className="mt-4">
                <p className="font-body text-xs font-medium text-muted-foreground">Bio</p>
                <p className="mt-1 font-body text-sm text-foreground">{profile.bio}</p>
              </div>
            )}
          </div>

          {/* Signalements */}
          {(reportsReceived.length > 0 || reportsFiled.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-5">
                <h2 className="mb-3 font-headings text-sm font-bold text-foreground">
                  Signalements reçus ({reportsReceived.length})
                </h2>
                {reportsReceived.length === 0 ? (
                  <p className="font-body text-xs text-muted-foreground">Aucun.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {reportsReceived.map((r) => (
                      <div key={r.id} className="py-2.5 font-body text-xs">
                        <p className="font-medium text-foreground">
                          {reasonLabel(r.reason)}{' '}
                          <span className="text-muted-foreground">— par {r.reporterName}</span>
                        </p>
                        {r.details && <p className="mt-0.5 text-muted-foreground">{r.details}</p>}
                        <p className="mt-0.5 text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString('fr-FR')} · {r.status}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-surface p-5">
                <h2 className="mb-3 font-headings text-sm font-bold text-foreground">
                  Signalements émis ({reportsFiled.length})
                </h2>
                {reportsFiled.length === 0 ? (
                  <p className="font-body text-xs text-muted-foreground">Aucun.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {reportsFiled.map((r) => (
                      <div key={r.id} className="py-2.5 font-body text-xs">
                        <p className="font-medium text-foreground">
                          {reasonLabel(r.reason)}{' '}
                          <span className="text-muted-foreground">— contre {r.targetName}</span>
                        </p>
                        <p className="mt-0.5 text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString('fr-FR')} · {r.status}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Actions */}
          {profile.verificationStatus === 'PENDING' ? (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 font-headings text-sm font-bold text-foreground">
                Décision de vérification
              </h2>
              <label className="mb-1 block font-body text-xs font-medium text-muted-foreground">
                Motif (optionnel, envoyé au membre en cas de rejet)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ex : photo floue, ne correspond pas au selfie…"
                className="mb-4 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void process('REJECT')}
                  disabled={processing !== null}
                  className="btn-press flex-1 rounded-lg border border-red-500/40 px-4 py-2.5 font-body text-sm font-semibold text-red-500 disabled:opacity-50 sm:flex-none"
                >
                  {processing === 'REJECT' ? 'Rejet…' : 'Rejeter'}
                </button>
                <button
                  type="button"
                  onClick={() => void process('APPROVE')}
                  disabled={processing !== null}
                  className="btn-press flex-1 rounded-lg bg-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:flex-none"
                >
                  {processing === 'APPROVE' ? 'Validation…' : 'Approuver'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-1 font-headings text-sm font-bold text-foreground">
                Vérification manuelle
              </h2>
              {profile.verificationStatus === 'VERIFIED' ? (
                <p className="font-body text-sm text-muted-foreground">
                  Profil <span className="font-semibold text-verified">vérifié</span>
                  {profile.verifiedAt &&
                    ` le ${new Date(profile.verifiedAt).toLocaleDateString('fr-FR')}`}
                  . Le badge « Vérifié » est visible sur ses photos.
                </p>
              ) : profile.verificationStatus === 'REJECTED' ? (
                <p className="font-body text-sm text-muted-foreground">
                  Dernière demande <span className="font-semibold text-red-500">rejetée</span>
                  {profile.verificationRejectionReason
                    ? ` — ${profile.verificationRejectionReason}`
                    : ''}
                  .
                </p>
              ) : (
                <p className="font-body text-sm text-muted-foreground">
                  Le membre n&apos;a pas envoyé de demande de vérification. Si tu reconnais ses
                  vraies photos ci-dessus, tu peux le vérifier directement.
                </p>
              )}

              {profile.verificationStatus === 'VERIFIED' ? (
                <button
                  type="button"
                  disabled={verifBusy}
                  onClick={() => void manualVerify('UNVERIFY')}
                  className="btn-press mt-3 rounded-lg border border-border px-4 py-2 font-body text-sm font-semibold text-muted-foreground disabled:opacity-50"
                >
                  {verifBusy ? '…' : 'Retirer la vérification'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={verifBusy}
                  onClick={() => void manualVerify('VERIFY')}
                  className="btn-press mt-3 flex items-center gap-2 rounded-lg bg-verified px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Icon name="shield-check" size={15} />
                  {verifBusy ? 'Validation…' : 'Vérifier manuellement ce profil'}
                </button>
              )}
            </div>
          )}

          {/* 4. Modération du profil — mise en retrait (soft-hide) */}
          <div
            className={`rounded-xl border p-5 ${
              profile.moderationHeldAt
                ? 'border-red-500/40 bg-red-500/5'
                : 'border-border bg-surface'
            }`}
          >
            <p className="font-headings text-sm font-bold text-foreground">Modération du profil</p>
            {profile.moderationHeldAt ? (
              <>
                <p className="mt-1 font-body text-sm text-red-600">
                  En retrait depuis le{' '}
                  {new Date(profile.moderationHeldAt).toLocaleDateString('fr-FR')}
                </p>
                {profile.moderationReason && (
                  <p className="mt-0.5 font-body text-sm text-foreground">
                    Raison : <span className="font-semibold">{profile.moderationReason}</span>
                  </p>
                )}
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  Le membre est invisible dans Découvrir (des deux côtés) et ne peut pas envoyer de
                  nouvelles demandes. Ses conversations en cours restent ouvertes.
                </p>
                <button
                  type="button"
                  disabled={modBusy}
                  onClick={() => void setModeration('RELEASE')}
                  className="mt-3 rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {modBusy ? '…' : 'Réactiver le profil'}
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  Masque le profil (photo non autorisée, contenu interdit…). Le membre garde son
                  accès, peut corriger son profil, reçoit automatiquement un message avec la raison.
                </p>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Raison (visible par le membre) — ex. « Photo non autorisée »"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  disabled={modBusy}
                  onClick={() => void setModeration('HOLD')}
                  className="mt-2 rounded-lg bg-red-600 px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50"
                >
                  {modBusy ? '…' : 'Mettre le profil en retrait'}
                </button>
              </>
            )}
          </div>

          {/* 5. Message direct au membre → arrive dans son espace Messages (Équipe YeOyo) */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="font-headings text-sm font-bold text-foreground">Message au membre</p>
            <p className="mt-1 font-body text-xs text-muted-foreground">
              Apparaît dans sa conversation « Équipe YeOyo », il peut répondre.
            </p>
            <textarea
              value={adminMsg}
              onChange={(e) => setAdminMsg(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Ton message…"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={msgBusy || adminMsg.trim().length === 0}
              onClick={() => void sendAdminMessage()}
              className="mt-2 rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {msgBusy ? 'Envoi…' : 'Envoyer le message'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-body text-sm text-foreground">{value}</p>
    </div>
  );
}
