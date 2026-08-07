// YeOyo onboarding wizard — built mobile-first from the Banani
// "Onboarding Profil" (mobile, single-step) and "Onboarding Flow (Desktop)"
// (all 4 steps' fields) screens. See .planning/banani/STATUS.md.
//
// Two deliberate departures from the Banani mockups, both flagged in
// .planning/banani/IMPLEMENTATION-PLAN.md:
//   1. Banani's designs never show an account-creation step (no email/
//      password fields anywhere) — this kit's auth is email+password/OAuth
//      only, so a "Compte" phase (signup + verify-email code, reusing the
//      existing protected /api/auth/signup + /verify-email routes exactly
//      as shipped) is prepended before the 4 profile steps.
//   2. Desktop shows all 4 steps stacked at once with future steps dimmed,
//      plus a left brand-image panel and a right sticky completion sidebar.
//      Simplified to one step at a time (matching the mobile screen) at every
//      breakpoint for v1 — the dimmed-preview / split-panel chrome is a
//      polish pass, not core functionality.
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { COOKIE_PREFIX } from '@/lib/constants';
import { Icon } from '@/components/ui/Icon';
import { KINSHASA_COMMUNES } from '@/lib/yeoyo/constants';

type ProfileStep = 1 | 2 | 3 | 4;
type Step = 'signup' | 'verify' | ProfileStep;

const RELIGIONS = [
  { value: 'CHRETIEN', label: 'Chrétien(ne)' },
  { value: 'CATHOLIQUE', label: 'Catholique' },
  { value: 'PROTESTANT', label: 'Protestant(e)' },
  { value: 'MUSULMAN', label: 'Musulman(e)' },
];

const MARITAL_STATUSES = [
  { value: 'CELIBATAIRE', label: 'Célibataire', desc: 'Jamais marié(e)' },
  { value: 'DIVORCE', label: 'Divorcé(e)', desc: 'Mariage terminé' },
  { value: 'VEUF_VEUVE', label: 'Veuf / Veuve', desc: '' },
];

const CHILDREN_OPTIONS = ['0', '1', '2', '3+'];

const INTENTS = [
  {
    value: 'COURT_TERME',
    label: 'Mariage à court terme',
    desc: "D'ici 12 mois",
    icon: 'gem' as const,
  },
  {
    value: 'MOYEN_TERME',
    label: 'Mariage à moyen terme',
    desc: '1 à 3 ans',
    icon: 'clock' as const,
  },
  {
    value: 'LONG_TERME',
    label: 'Mariage à long terme',
    desc: 'Plus de 3 ans',
    icon: 'gem' as const,
  },
];

interface WizardData {
  email: string;
  gender: 'HOMME' | 'FEMME' | null;
  firstName: string;
  dateOfBirth: string;
  commune: string;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  intent: string | null;
}

const INITIAL_DATA: WizardData = {
  email: '',
  gender: null,
  firstName: '',
  dateOfBirth: '',
  commune: '',
  religion: null,
  maritalStatus: null,
  childrenCount: null,
  intent: null,
};

// api.ts doesn't export a CSRF-token getter (protected file), and the
// multipart /api/upload call can't go through api()'s JSON-only body — so
// this mirrors api.ts's storage lookup for the one raw-fetch call this page
// needs.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const key = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function PillOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border py-2.5 text-center font-body text-sm font-medium ${
        active
          ? 'border-primary bg-secondary text-primary'
          : 'border-border bg-surface text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function WizardShell({
  stepLabel,
  progressPct,
  onBack,
  children,
}: {
  stepLabel: string;
  progressPct: number;
  onBack?: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background font-body lg:max-w-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className={onBack ? 'text-foreground' : 'invisible'}
          aria-label="Retour"
        >
          <Icon name="chevron-left" size={24} />
        </button>
        <span className="font-body text-xs text-muted-foreground">{stepLabel}</span>
        <Icon name="x" size={20} className="text-muted-foreground" />
      </div>
      <div className="h-1 flex-shrink-0 bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6">{children}</div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [step, setStep] = useState<Step>('signup');
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // TEMPORARY dev aid — see frontend/src/app/api/auth/dev-verification-code
  // (remove both once RESEND_API_KEY is configured for real).
  const [devCode, setDevCode] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Returning user who verified their email but abandoned before finishing
  // their profile — skip straight to the profile wizard instead of asking
  // them to sign up again.
  useEffect(() => {
    if (!loading && user && step === 'signup') {
      setStep(1);
    }
    // Intentionally omits `step` — this only fires the initial signup→profile
    // skip and must not re-run every time `step` changes afterward.
  }, [loading, user]);

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', { method: 'POST', body: { email: data.email, password } });
      setStep('verify');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  }

  // TEMPORARY dev aid — no email provider is configured, so the code never
  // actually arrives by email. Fetch it straight from the DB via the
  // dev-only route (hard-gated to non-production) and offer it as a
  // fill-in label. Remove this effect + the route once Resend is wired.
  useEffect(() => {
    if (step !== 'verify' || process.env.NODE_ENV === 'production') return;
    let cancelled = false;
    api<{ code: string | null }>(
      `/api/auth/dev-verification-code?email=${encodeURIComponent(data.email)}`,
    )
      .then((res) => {
        if (!cancelled) setDevCode(res.code);
      })
      .catch(() => {
        /* dev convenience only — silently unavailable is fine */
      });
    return () => {
      cancelled = true;
    };
  }, [step, data.email]);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: data.email, code },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      setStep(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide ou expiré');
    } finally {
      setSubmitting(false);
    }
  }

  async function onFinish(skipPhoto: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      let photoUploadId: string | undefined;
      if (!skipPhoto && photoFile) {
        const form = new FormData();
        form.append('file', photoFile);
        const csrfToken = readCsrfToken();
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: form,
          credentials: 'include',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        });
        if (!uploadRes.ok) {
          const body = (await uploadRes.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? "L'envoi de la photo a échoué");
        }
        const uploaded = (await uploadRes.json()) as { id: string };
        photoUploadId = uploaded.id;
      }

      await api('/api/profile', {
        method: 'POST',
        body: {
          gender: data.gender,
          firstName: data.firstName,
          dateOfBirth: data.dateOfBirth,
          commune: data.commune || undefined,
          religion: data.religion || undefined,
          maritalStatus: data.maritalStatus || undefined,
          childrenCount: data.childrenCount || undefined,
          intent: data.intent,
          photoUploadId,
        },
      });
      router.push('/app/decouvrir');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'signup') {
    return (
      <WizardShell stepLabel="Compte" progressPct={0}>
        <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">Créer ton compte</h1>
        <p className="mb-6 font-body text-sm text-muted-foreground">
          C&rsquo;est rapide et sécurisé. Tes infos restent confidentielles.
        </p>
        <form onSubmit={onSignup} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={data.email}
              onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Mot de passe
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
            />
          </label>
          {error && (
            <p role="alert" className="font-body text-sm text-red-500">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Création…' : 'Continuer'}
          </button>
        </form>
      </WizardShell>
    );
  }

  if (step === 'verify') {
    return (
      <WizardShell stepLabel="Compte" progressPct={0} onBack={() => setStep('signup')}>
        <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">Vérifie ton email</h1>
        <p className="mb-6 font-body text-sm text-muted-foreground">
          On a envoyé un code à 8 caractères à {data.email}.
        </p>
        {devCode && (
          <button
            type="button"
            onClick={() => setCode(devCode)}
            className="mb-4 self-start rounded-lg border border-dashed border-primary/60 bg-primary/10 px-3 py-2 font-mono text-xs text-primary"
          >
            DEV — code : {devCode} (clique pour remplir — email non configuré)
          </button>
        )}
        <form onSubmit={onVerify} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Code de vérification
            <input
              type="text"
              required
              maxLength={8}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm uppercase tracking-widest text-foreground"
            />
          </label>
          {error && (
            <p role="alert" className="font-body text-sm text-red-500">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Vérification…' : 'Continuer'}
          </button>
        </form>
      </WizardShell>
    );
  }

  const profileStep = step;
  const progressPct = (profileStep / 4) * 100;

  return (
    <WizardShell
      stepLabel={`Étape ${profileStep}/4`}
      progressPct={progressPct}
      onBack={profileStep > 1 ? () => setStep((profileStep - 1) as ProfileStep) : undefined}
    >
      {profileStep === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">
              Parlons de toi
            </h1>
            <p className="font-body text-sm text-muted-foreground">
              C&rsquo;est rapide et sécurisé. Tes infos restent confidentielles.
            </p>
          </div>

          <div>
            <label className="mb-2 block font-body text-sm text-foreground">Genre</label>
            <div className="flex gap-3">
              <PillOption
                label="Homme"
                active={data.gender === 'HOMME'}
                onClick={() => setData((d) => ({ ...d, gender: 'HOMME' }))}
              />
              <PillOption
                label="Femme"
                active={data.gender === 'FEMME'}
                onClick={() => setData((d) => ({ ...d, gender: 'FEMME' }))}
              />
            </div>
          </div>

          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Prénom
            <input
              type="text"
              required
              value={data.firstName}
              onChange={(e) => setData((d) => ({ ...d, firstName: e.target.value }))}
              placeholder="ex. Nadège"
              className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
            />
          </label>

          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Date de naissance
            <input
              type="date"
              required
              value={data.dateOfBirth}
              onChange={(e) => setData((d) => ({ ...d, dateOfBirth: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
            />
          </label>

          {error && (
            <p role="alert" className="font-body text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!data.gender || !data.firstName || !data.dateOfBirth}
            onClick={() => setStep(2)}
            className="mt-1 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            Continuer
          </button>
        </div>
      )}

      {profileStep === 2 && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">Ta situation</h1>
            <p className="font-body text-sm text-muted-foreground">
              Pour te mettre en relation avec les bons profils.
            </p>
          </div>

          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Ta commune à Kinshasa
            <select
              required
              value={data.commune}
              onChange={(e) => setData((d) => ({ ...d, commune: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
            >
              <option value="" disabled>
                Choisis ta commune
              </option>
              {KINSHASA_COMMUNES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label className="mb-2 block font-body text-sm text-foreground">
              Ta religion (optionnel)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RELIGIONS.map((r) => (
                <PillOption
                  key={r.value}
                  label={r.label}
                  active={data.religion === r.value}
                  onClick={() =>
                    setData((d) => ({ ...d, religion: d.religion === r.value ? null : r.value }))
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block font-body text-sm text-foreground">
              Situation familiale
            </label>
            <div className="flex flex-col gap-2">
              {MARITAL_STATUSES.map((m) => {
                const active = data.maritalStatus === m.value;
                return (
                  <button
                    type="button"
                    key={m.value}
                    onClick={() => setData((d) => ({ ...d, maritalStatus: m.value }))}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left ${
                      active ? 'border-primary bg-secondary/20' : 'border-border bg-surface'
                    }`}
                  >
                    <div
                      className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                        active ? 'border-primary bg-primary' : 'border-border'
                      }`}
                    />
                    <div>
                      <span className="font-body text-sm font-medium text-foreground">
                        {m.label}
                      </span>
                      {m.desc && (
                        <span className="ml-2 font-body text-xs text-muted-foreground">
                          {m.desc}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block font-body text-sm text-foreground">
              As-tu des enfants ?
            </label>
            <div className="flex gap-3">
              {CHILDREN_OPTIONS.map((opt) => (
                <div key={opt} className="flex-1">
                  <PillOption
                    label={opt === '0' ? 'Non' : opt}
                    active={data.childrenCount === opt}
                    onClick={() => setData((d) => ({ ...d, childrenCount: opt }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!data.commune || !data.maritalStatus || !data.childrenCount}
            onClick={() => setStep(3)}
            className="mt-1 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            Continuer
          </button>
        </div>
      )}

      {profileStep === 3 && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">
              Ton intention 💍
            </h1>
            <p className="font-body text-sm text-muted-foreground">
              YeOyo, c&rsquo;est ya sérieux. Dis-nous ce que tu cherches vraiment.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {INTENTS.map((opt) => {
              const active = data.intent === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setData((d) => ({ ...d, intent: opt.value }))}
                  className={`flex items-center gap-4 rounded-xl border px-5 py-4 text-left ${
                    active ? 'border-primary bg-secondary/20' : 'border-border bg-surface'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                      active ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon name={opt.icon} size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="font-headings text-base font-semibold text-foreground">
                      {opt.label}
                    </p>
                    <p className="font-body text-sm text-muted-foreground">{opt.desc}</p>
                  </div>
                  <div
                    className={`h-5 w-5 flex-shrink-0 rounded-full border-2 ${
                      active ? 'border-primary bg-primary' : 'border-border'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon name="info" size={15} />
            </div>
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              YeOyo te met en relation uniquement avec des personnes partageant la même intention.
              Zéro perte de temps.
            </p>
          </div>

          <button
            type="button"
            disabled={!data.intent}
            onClick={() => setStep(4)}
            className="mt-1 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            Continuer
          </button>
        </div>
      )}

      {profileStep === 4 && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">
              Ta photo de profil
            </h1>
            <p className="font-body text-sm text-muted-foreground">
              Une vraie photo de toi augmente ta visibilité de 3×. Soyez authentique !
            </p>
          </div>

          <label className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-surface py-12">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
              <Icon name="camera" size={36} />
            </div>
            <div className="text-center">
              <p className="mb-1 font-headings text-base font-semibold text-foreground">
                {photoFile ? photoFile.name : 'Ajoute ta photo'}
              </p>
              <p className="font-body text-sm text-muted-foreground">
                Glisse ici ou clique pour sélectionner
              </p>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
            <span className="rounded-lg bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground">
              Choisir une photo
            </span>
          </label>

          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-secondary/20 p-4">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
              <Icon name="shield-check" size={14} className="text-primary-foreground" />
            </div>
            <div>
              <p className="mb-0.5 font-headings text-sm font-semibold text-foreground">
                Vérification IA automatique
              </p>
              <p className="font-body text-xs leading-relaxed text-muted-foreground">
                Ta photo sera vérifiée par notre IA pour garantir l&rsquo;authenticité. Résultat en
                moins de 2 minutes.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-3 font-body text-xs uppercase tracking-widest text-muted-foreground">
              Conseils pour une bonne photo
            </p>
            <div className="space-y-2">
              {[
                'Visage clairement visible, bonne lumière',
                'Photo récente, pas de filtre excessif',
                'Seul sur la photo — pas de groupe',
              ].map((tip) => (
                <div key={tip} className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" />
                  <span className="font-body text-sm text-muted-foreground">{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="font-body text-sm text-red-500">
              {error}
            </p>
          )}

          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onFinish(false)}
              className="rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Finalisation…' : 'Terminer et explorer 🎉'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onFinish(true)}
              className="rounded-xl border border-border bg-surface py-3 font-body text-sm font-medium text-muted-foreground disabled:opacity-50"
            >
              Passer pour l&rsquo;instant
            </button>
          </div>
        </div>
      )}
    </WizardShell>
  );
}
