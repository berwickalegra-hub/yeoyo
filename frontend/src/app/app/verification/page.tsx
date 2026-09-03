// /app/verification — self-service identity verification (2026-08-31,
// explicit user ask: "que n'importe qui puisse le faire, avec des exemples
// clairs, des textes lisibles et un exemple d'image"). The user writes a
// short code we give them on a sheet of paper, takes a selfie holding it,
// and submits. An admin then compares that selfie to the profile photos
// (/admin/verification) and approves or rejects; a rejection shows the
// reason here and lets the user redo it. See /api/profile/verification.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { uploadFileWithAuthRetry } from '@/lib/yeoyo/upload-file';

interface VerificationState {
  status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  code: string | null;
  selfieUrl: string | null;
  submittedAt: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  hasPhoto: boolean;
}

const DO_LIST = [
  'On voit ton visage en entier, sans lunettes ni chapeau',
  'La feuille avec le code est bien lisible',
  'Bonne lumière, photo nette',
  "C'est bien toi qui prends le selfie, maintenant",
];

const DONT_LIST = [
  'Pas de filtre ni de retouche',
  "Pas une photo d'une autre photo ou d'un écran",
  'Le code ne doit pas être coupé ou flou',
];

// Simple friendly illustration — a person holding up a sheet with the code.
// Inline SVG so there's no asset to ship and it adapts to the theme.
function ExampleIllustration({ code }: { code: string }) {
  return (
    <svg
      viewBox="0 0 220 170"
      className="h-auto w-full max-w-[260px]"
      role="img"
      aria-label="Exemple : une personne tient une feuille avec le code à côté de son visage"
    >
      <rect x="0" y="0" width="220" height="170" rx="12" className="fill-muted" />
      {/* head */}
      <circle cx="78" cy="60" r="26" className="fill-surface stroke-foreground" strokeWidth="2.5" />
      <circle cx="70" cy="58" r="2.5" className="fill-foreground" />
      <circle cx="86" cy="58" r="2.5" className="fill-foreground" />
      <path
        d="M70 70 q8 7 16 0"
        className="fill-none stroke-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* shoulders */}
      <path
        d="M44 132 q34 -30 68 0 Z"
        className="fill-surface stroke-foreground"
        strokeWidth="2.5"
      />
      {/* arm to the sheet */}
      <path
        d="M104 116 q26 -6 34 -20"
        className="fill-none stroke-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* sheet of paper */}
      <rect
        x="120"
        y="54"
        width="82"
        height="58"
        rx="4"
        className="fill-surface stroke-foreground"
        strokeWidth="2.5"
      />
      <text
        x="161"
        y="80"
        textAnchor="middle"
        className="fill-foreground"
        style={{ font: 'bold 15px ui-monospace, monospace' }}
      >
        {code}
      </text>
      <line x1="130" y1="92" x2="192" y2="92" className="stroke-border" strokeWidth="2" />
      <line x1="130" y1="100" x2="176" y2="100" className="stroke-border" strokeWidth="2" />
    </svg>
  );
}

export default function VerificationPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<VerificationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<VerificationState>('/api/profile/verification');
      setState(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        router.replace('/onboarding');
        return;
      }
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onFilePicked(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function submit() {
    if (!pendingFile) return;
    setSubmitting(true);
    try {
      const uploadId = await uploadFileWithAuthRetry(pendingFile);
      await api('/api/profile/verification', { method: 'POST', body: { uploadId } });
      toast('Demande envoyée ! Notre équipe va la vérifier.', 'success');
      setPendingFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="profil"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-4 lg:px-8">
        <button type="button" onClick={() => router.push('/app/profil')} aria-label="Retour">
          <Icon name="chevron-left" size={22} />
        </button>
        <h1 className="font-headings text-lg font-bold text-foreground">Vérifier mon profil</h1>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-6 lg:px-8">
        {loading && (
          <p className="text-center font-body text-sm text-muted-foreground">Chargement…</p>
        )}

        {!loading && state && (
          <div className="flex flex-col gap-5">
            {/* ---- VERIFIED ---- */}
            {state.status === 'VERIFIED' && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-verified/40 bg-verified/10 p-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified text-verified-foreground">
                  <Icon name="shield-check" size={30} />
                </span>
                <p className="font-headings text-lg font-bold text-foreground">
                  Ton profil est vérifié
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  {state.verifiedAt
                    ? `Validé le ${new Date(state.verifiedAt).toLocaleDateString('fr-FR')}.`
                    : 'Le badge « Vérifié » est visible sur ton profil.'}
                </p>
              </div>
            )}

            {/* ---- PENDING ---- */}
            {state.status === 'PENDING' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-8 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/20 text-gold">
                    <Icon name="clock" size={28} />
                  </span>
                  <p className="font-headings text-lg font-bold text-foreground">
                    Demande en cours d&rsquo;examen
                  </p>
                  <p className="font-body text-sm text-muted-foreground">
                    Notre équipe compare ta photo avec ton profil. Tu recevras une notification dès
                    que c&rsquo;est validé — en général sous 48&nbsp;h.
                  </p>
                </div>
                {state.selfieUrl && (
                  <div>
                    <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      La photo que tu as envoyée
                    </p>
                    {/* One-off review image — next/image adds no value here. */}
                    <img
                      src={state.selfieUrl}
                      alt="Ta photo de vérification"
                      className="max-h-72 w-auto rounded-xl border border-border"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ---- UNVERIFIED / REJECTED : the submission flow ---- */}
            {(state.status === 'UNVERIFIED' || state.status === 'REJECTED') && (
              <>
                {state.status === 'REJECTED' && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                    <Icon name="info" size={18} className="mt-0.5 shrink-0 text-red-600" />
                    <div>
                      <p className="font-headings text-sm font-bold text-red-700">
                        Ta demande précédente a été refusée
                      </p>
                      <p className="mt-0.5 font-body text-sm text-red-700/90">
                        {state.rejectionReason
                          ? `Raison : ${state.rejectionReason}`
                          : 'La photo ne permettait pas de te vérifier.'}{' '}
                        Recommence en suivant bien les étapes ci-dessous.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-surface p-5">
                  <p className="font-body text-sm text-muted-foreground">
                    La vérification confirme que ton profil est bien celui d&rsquo;une vraie
                    personne. Ton profil affiche alors le badge{' '}
                    <span className="inline-flex items-center gap-1 rounded-md bg-verified/15 px-1.5 py-0.5 font-semibold text-verified">
                      <Icon name="shield-check" size={11} /> Vérifié
                    </span>{' '}
                    — les profils vérifiés reçoivent beaucoup plus de demandes.
                  </p>
                </div>

                {!state.hasPhoto ? (
                  <div className="flex flex-col items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                    <p className="font-body text-sm text-red-700">
                      Ajoute d&rsquo;abord au moins une photo à ton profil : c&rsquo;est elle
                      qu&rsquo;on comparera avec ton selfie.
                    </p>
                    <Link
                      href="/app/profil"
                      className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground"
                    >
                      Ajouter une photo
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* STEP 1 — the code */}
                    <div className="rounded-2xl border border-border bg-surface p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary font-body text-sm font-bold text-primary-foreground">
                          1
                        </span>
                        <p className="font-headings text-base font-bold text-foreground">
                          Écris ce code sur une feuille de papier
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-5">
                        <span className="select-all font-mono text-3xl font-extrabold tracking-widest text-primary">
                          {state.code ?? '…'}
                        </span>
                        <span className="font-body text-xs text-muted-foreground">
                          En gros, bien lisible, au stylo
                        </span>
                      </div>
                    </div>

                    {/* STEP 2 — the selfie + example */}
                    <div className="rounded-2xl border border-border bg-surface p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary font-body text-sm font-bold text-primary-foreground">
                          2
                        </span>
                        <p className="font-headings text-base font-bold text-foreground">
                          Prends un selfie en tenant la feuille
                        </p>
                      </div>

                      <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/50 p-4">
                        <ExampleIllustration code={state.code ?? 'YO-XXXX'} />
                        <span className="font-body text-xs font-medium text-muted-foreground">
                          Exemple : ton visage + la feuille avec le code, sur la même photo
                        </span>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="mb-2 flex items-center gap-1.5 font-body text-xs font-bold text-verified">
                            <Icon name="check-circle" size={13} /> À faire
                          </p>
                          <ul className="flex flex-col gap-1.5">
                            {DO_LIST.map((t) => (
                              <li
                                key={t}
                                className="flex items-start gap-1.5 font-body text-xs text-foreground"
                              >
                                <Icon
                                  name="check"
                                  size={13}
                                  className="mt-0.5 shrink-0 text-verified"
                                />
                                {t}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-2 flex items-center gap-1.5 font-body text-xs font-bold text-red-600">
                            <Icon name="x-circle" size={13} /> À éviter
                          </p>
                          <ul className="flex flex-col gap-1.5">
                            {DONT_LIST.map((t) => (
                              <li
                                key={t}
                                className="flex items-start gap-1.5 font-body text-xs text-foreground"
                              >
                                <Icon name="x" size={13} className="mt-0.5 shrink-0 text-red-500" />
                                {t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* STEP 3 — upload + send */}
                    <div className="rounded-2xl border border-border bg-surface p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary font-body text-sm font-bold text-primary-foreground">
                          3
                        </span>
                        <p className="font-headings text-base font-bold text-foreground">
                          Envoie ta photo
                        </p>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onFilePicked(file);
                          e.target.value = '';
                        }}
                      />

                      {previewUrl ? (
                        <div className="flex flex-col gap-3">
                          {/* Local blob preview — next/image can't optimize it. */}
                          <img
                            src={previewUrl}
                            alt="Aperçu de ta photo"
                            className="max-h-80 w-auto self-center rounded-xl border border-border"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={submitting}
                              className="rounded-lg border border-border px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
                            >
                              Choisir une autre
                            </button>
                            <button
                              type="button"
                              onClick={() => void submit()}
                              disabled={submitting}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-body text-sm font-bold text-primary-foreground disabled:opacity-50"
                            >
                              {submitting ? (
                                <Icon name="refresh-cw" size={15} className="animate-spin" />
                              ) : (
                                <Icon name="shield-check" size={15} />
                              )}
                              {submitting ? 'Envoi…' : 'Envoyer pour vérification'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-muted-foreground"
                        >
                          <Icon name="camera" size={26} />
                          <span className="font-body text-sm font-medium">
                            Prendre ou choisir la photo
                          </span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
