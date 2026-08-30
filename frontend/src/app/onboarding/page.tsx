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

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { COOKIE_PREFIX } from '@/lib/constants';
import { looksLikeEmail } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { PasswordInput } from '@/components/yeoyo/PasswordInput';
import { BrandMark } from '@/components/yeoyo/BrandMark';
import { DateOfBirthFields } from '@/components/yeoyo/DateOfBirthFields';
import { COUNTRIES, KINSHASA_COMMUNES, MAJOR_CITIES_BY_COUNTRY } from '@/lib/yeoyo/constants';
import { SuggestionChips } from '@/components/yeoyo/SuggestionChips';
import { BIO_SUGGESTIONS } from '@/lib/yeoyo/content';

const MIN_AGE_YEARS = 18;
// Mirrors the real server policy (AUTH_PASSWORD_MIN_LENGTH=10 in this
// project's .env, not the framework default of 10) so client-side
// validation never disagrees with what POST /api/auth/signup will actually
// enforce.
const SIGNUP_PASSWORD_MIN = 10;

function ageFromIso(iso: string): number {
  const dob = new Date(iso);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

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

const WANTS_CHILDREN_OPTIONS = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'PEUT_ETRE', label: 'Peut-être' },
];

// Not shown as "required" — leaving it unset keeps the existing default
// (opposite of `gender`) exactly as before this preference existed.
// Binary only (no "Les deux") — explicit user ask 2026-08-14: choosing one
// should immediately scope Découvrir/Explorer to that gender, not leave a
// third "both" option that dilutes the point of asking at all. "Ce que je
// recherche" on /app/profil still allows opting into "Les deux" later if
// someone changes their mind — this restriction is onboarding-only.
const INTERESTED_IN_OPTIONS = [
  { value: 'FEMME', label: 'Femmes' },
  { value: 'HOMME', label: 'Hommes' },
];

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
  promoCode: string;
  gender: 'HOMME' | 'FEMME' | null;
  interestedIn: string | null;
  firstName: string;
  dateOfBirth: string;
  country: string | null;
  city: string;
  commune: string;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  intent: string | null;
  bio: string;
}

const INITIAL_DATA: WizardData = {
  email: '',
  promoCode: '',
  gender: null,
  interestedIn: null,
  firstName: '',
  dateOfBirth: '',
  country: null,
  city: '',
  commune: '',
  religion: null,
  maritalStatus: null,
  childrenCount: null,
  wantsChildren: null,
  intent: null,
  bio: '',
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

// The 15-min access-token JWT can easily expire while someone fills out the
// 4-step wizard, but this raw multipart fetch bypasses api.ts's auto-refresh
// (JSON-only bodies) — so a stale token used to surface as a bare 401 with
// no `message` field, which the catch below silently mislabelled as a
// generic "upload failed" error. Mirrors api.ts's own refresh-then-retry
// once, using the same public POST /api/auth/refresh endpoint.
async function uploadPhotoWithAuthRetry(file: File): Promise<string> {
  async function attempt(): Promise<Response> {
    const form = new FormData();
    form.append('file', file);
    const csrfToken = readCsrfToken();
    return fetch('/api/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
  }

  let res = await attempt();
  if (res.status === 401) {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);
    if (refreshRes?.ok) {
      const refreshBody = (await refreshRes.json().catch(() => ({}))) as {
        csrfToken?: string;
      };
      if (refreshBody.csrfToken) storeCsrfToken(refreshBody.csrfToken);
      res = await attempt();
    } else {
      throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "L'envoi de la photo a échoué. Réessaie.");
  }
  const uploaded = (await res.json()) as { id: string };
  return uploaded.id;
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
      className={`w-full rounded-xl border-2 py-2.5 text-center font-body text-sm font-semibold transition-all duration-150 active:scale-95 ${
        active
          ? 'border-primary bg-secondary text-primary shadow-md shadow-primary/20'
          : 'border-border bg-surface text-foreground shadow-sm hover:border-primary/40 hover:shadow-md'
      }`}
    >
      {label}
    </button>
  );
}

// Red "you still need to fill…" banner shown when the user taps Continuer
// with a required field empty (2026-08-31, explicit user ask — greyed-out
// buttons left beginners guessing which field was blocking).
function MissingFieldsBanner({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 font-body text-sm text-red-600"
    >
      <Icon name="info" size={16} className="mt-0.5 shrink-0" />
      <span>
        {names.length === 1 ? 'Ce champ est obligatoire : ' : 'Il te manque : '}
        <strong>{names.join(', ')}</strong>.
      </span>
    </div>
  );
}

// Border class for an input/select — red outline when it's a required field
// still empty after a failed Continuer tap, the normal border otherwise.
function missingRing(active: boolean): string {
  return active ? 'border-red-500 ring-2 ring-red-500/20' : 'border-border';
}

// Callers key each `<WizardShell>` invocation by step id (see the three
// call sites below) so React remounts this whole subtree on every step
// change — the cheapest way to guarantee the `.animate-fade-in-up` on the
// content wrapper actually replays every time, rather than relying on
// React reusing DOM nodes whose position/type happens to match across
// differently-shaped steps (which would silently skip the animation).
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
        <Link
          href="/"
          aria-label="Fermer et revenir à l'accueil"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="x" size={20} />
        </Link>
      </div>
      <div className="h-1 flex-shrink-0 bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="animate-fade-in-up flex-1 overflow-y-auto px-5 py-6">{children}</div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('signup');
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordConfirmError, setPasswordConfirmError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  // Names of the required profile-step fields the user still needs to fill.
  // The "Continuer" buttons no longer just sit disabled+greyed (a beginner
  // couldn't tell WHICH field was blocking) — they stay clickable and, on a
  // click with something missing, this drives a red banner + red field
  // outlines (2026-08-31, explicit user ask).
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);
  // Progressive disclosure — email/password fields stay hidden until the
  // user picks "Continuer avec email" (2026-08-19 explicit ask, reference:
  // a Farata-style signup screen). Terms gate BOTH methods now (previously
  // only email's submit checked acceptTerms — Google had no gate at all).
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [code, setCode] = useState('');
  // TEMPORARY dev aid — see frontend/src/app/api/auth/dev-verification-code
  // (remove both once RESEND_API_KEY is configured for real).
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Index 0 is always the mandatory primary photo; 1..5 are the optional
  // extra photos added in the same step (2026-08-30 explicit user ask —
  // previously onboarding only ever collected one photo, extras had to
  // wait until Mon profil after finishing). Mirrors POST /api/profile/
  // photos' own MAX_PHOTOS=6 cap.
  const MAX_ONBOARDING_PHOTOS = 6;
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const extraPhotoInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingExistingProfile, setCheckingExistingProfile] = useState(true);

  // Drop any "champ manquant" highlight when the user moves between steps
  // (forward or via the back arrow) — the next Continuer tap re-checks.
  useEffect(() => {
    setMissingFields([]);
  }, [step]);

  // Live preview of the selected/dropped photos — object URLs are cheap and
  // local (no upload happens until "Terminer et explorer"), revoked on
  // every change so we don't leak blob URLs across re-selections.
  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photoFiles]);

  function setPrimaryPhoto(file: File | null) {
    setPhotoFiles((prev) => {
      if (!file) return prev.slice(1);
      const next = [...prev];
      next[0] = file;
      return next;
    });
  }

  function addExtraPhoto(file: File) {
    setPhotoFiles((prev) => (prev.length >= MAX_ONBOARDING_PHOTOS ? prev : [...prev, file]));
  }

  function removeExtraPhoto(index: number) {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Prefills the promo field from an affiliate referral link
  // (https://yeoyo.net/onboarding?promo=CODE). Read once on mount — the
  // user can still edit or clear it manually afterward.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const promo = new URLSearchParams(window.location.search).get('promo');
    if (promo) setData((d) => ({ ...d, promoCode: promo }));
  }, []);

  // Returning user who already has a session — figure out where they
  // actually belong instead of always dumping them into the wizard:
  //   - no profile yet → skip signup, go straight to the profile wizard
  //     (verified their email but abandoned before finishing their profile)
  //   - profile already exists → send them to the app. Previously this
  //     branch didn't exist, so an already-onboarded user landing on
  //     /onboarding would fill out the entire 4-step wizard again and only
  //     discover it was pointless at the very last step, when POST
  //     /api/profile 409s with PROFILE_ALREADY_EXISTS — confusing, since
  //     nothing they filled in looked wrong.
  useEffect(() => {
    if (loading) return;
    if (!user || step !== 'signup') {
      setCheckingExistingProfile(false);
      return;
    }
    let cancelled = false;
    api('/api/profile')
      .then(() => {
        if (!cancelled) router.push('/app/decouvrir');
      })
      .catch(() => {
        if (!cancelled) {
          setStep(1);
          setCheckingExistingProfile(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omits `step` — this only fires the initial
    // signup→profile-or-app routing and must not re-run every time `step`
    // changes afterward.
  }, [loading, user, router]);

  function requireTermsAccepted(): boolean {
    if (acceptTerms) return true;
    const msg = 'Merci d’accepter les conditions pour continuer.';
    setTermsError(msg);
    toast(msg, 'error');
    return false;
  }

  function onGoogleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!requireTermsAccepted()) {
      e.preventDefault();
      return;
    }
    setGoogleRedirecting(true);
  }

  function onContinueWithEmail() {
    if (!requireTermsAccepted()) return;
    setEmailExpanded(true);
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    setPasswordError(null);
    setPasswordConfirmError(null);
    setTermsError(null);

    // Each check sets its own inline error under the relevant field instead
    // of bailing on the first failure, so a user fixing one mistake doesn't
    // get surprised by a second one appearing only after resubmitting.
    let hasError = false;
    if (!looksLikeEmail(data.email)) {
      setEmailError('Merci de saisir une adresse email valide.');
      hasError = true;
    }
    if (password.length < SIGNUP_PASSWORD_MIN) {
      setPasswordError(`Le mot de passe doit contenir au moins ${SIGNUP_PASSWORD_MIN} caractères.`);
      hasError = true;
    }
    if (passwordConfirm !== password) {
      setPasswordConfirmError('Les deux mots de passe ne correspondent pas.');
      hasError = true;
    }
    if (!acceptTerms) {
      setTermsError('Merci d’accepter les conditions pour continuer.');
      hasError = true;
    }
    if (hasError) return;

    setSubmitting(true);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: {
          email: data.email,
          password,
          ...(data.promoCode.trim() ? { promoCode: data.promoCode.trim() } : {}),
        },
      });
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError) {
        // Signup is enumeration-resistant by design (POST /api/auth/signup
        // always returns 201 whether the email is new or already taken) —
        // there is deliberately no "email already in use" branch here.
        if (err.code === 'PASSWORD_TOO_SHORT' || err.code === 'PASSWORD_BANNED') {
          setPasswordError(err.message);
        } else if (err.code === 'VALIDATION_FAILED') {
          setEmailError(err.message);
        } else {
          setError(err.message);
          toast(err.message, 'error');
        }
      } else {
        const msg = 'Une erreur est survenue. Réessaie.';
        setError(msg);
        toast(msg, 'error');
      }
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
    setError(null);

    if (code.length !== 8) {
      const msg = 'Merci de saisir le code à 8 caractères reçu par email.';
      setError(msg);
      toast(msg, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: data.email, code },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      setStep(1);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Code invalide ou expiré.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // Client-side politeness on top of the server's 3-per-15min limiter —
  // stops accidental double-clicks, not abuse.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function onResend() {
    setResending(true);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email: data.email } });
      toast('Code renvoyé — vérifie ta boîte mail (et le dossier spam).', 'success');
      setResendCooldown(30);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessaie.';
      toast(msg, 'error');
    } finally {
      setResending(false);
    }
  }

  async function onFinish() {
    if (photoFiles.length === 0) return; // button stays disabled, but guard anyway
    setSubmitting(true);
    setError(null);
    try {
      const photoUploadId = await uploadPhotoWithAuthRetry(photoFiles[0] as File);

      await api('/api/profile', {
        method: 'POST',
        body: {
          gender: data.gender,
          interestedIn: data.interestedIn || undefined,
          firstName: data.firstName,
          dateOfBirth: data.dateOfBirth,
          country: data.country,
          city: data.city.trim(),
          commune: data.commune || undefined,
          religion: data.religion || undefined,
          maritalStatus: data.maritalStatus || undefined,
          childrenCount: data.childrenCount || undefined,
          wantsChildren: data.wantsChildren || undefined,
          intent: data.intent,
          bio: data.bio.trim() || undefined,
          photoUploadId,
        },
      });

      // Extra photos (beyond the mandatory first one) are a nice-to-have —
      // uploaded best-effort, one at a time, so a single failed upload
      // (network blip, oversized file) never blocks finishing onboarding
      // once the profile + primary photo are already saved. The user can
      // always add more from Mon profil afterward.
      for (const file of photoFiles.slice(1)) {
        try {
          const uploadId = await uploadPhotoWithAuthRetry(file);
          await api('/api/profile/photos', { method: 'POST', body: { uploadId } });
        } catch {
          /* best-effort, see comment above */
        }
      }

      // AuthContext's cached `user.profileCompleted` is still false at this
      // point (it was fetched before the profile existed) — without this,
      // AppShell's redirect gate on /app/decouvrir sees the stale flag and
      // bounces straight back to /onboarding, which then finds the
      // now-existing profile and pushes forward again: an infinite loop.
      await refresh();
      router.push('/app/decouvrir');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Une erreur est survenue. Réessaie.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // Avoid flashing "Créer ton compte" for a split second while we check
  // whether a returning, already-authenticated visitor should instead be
  // redirected straight to the app (see the effect above).
  if (checkingExistingProfile) {
    return <div className="min-h-screen bg-background" />;
  }

  if (step === 'signup') {
    return (
      <WizardShell key="signup" stepLabel="Compte" progressPct={0}>
        {/* Logo, centered — reuses the existing brand mark (BrandMark.tsx),
            not a fresh asset, per explicit instruction. */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <BrandMark className="h-10 w-auto" />
          <span className="font-headings text-lg font-bold text-foreground">YeOyo</span>
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-2 font-headings text-2xl font-bold text-foreground">Crée ton profil</h1>
          <p className="font-body text-sm text-muted-foreground">
            C&rsquo;est rapide et sécurisé. Tes infos restent confidentielles.
          </p>
        </div>

        {/* Terms card — gates BOTH signup methods (previously only the
            email form's submit validated acceptTerms; Google had no gate at
            all). Shown once, up front, before either method is chosen. */}
        <div className="mb-5 rounded-xl border border-border bg-surface p-4">
          <label className="flex items-start gap-2.5 font-body text-sm text-foreground">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => {
                setAcceptTerms(e.target.checked);
                if (termsError) setTermsError(null);
              }}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
            />
            <span>
              J&rsquo;accepte les{' '}
              <Link
                href="/conditions-utilisation"
                target="_blank"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                conditions d&rsquo;utilisation
              </Link>
              , la{' '}
              <Link
                href="/confidentialite"
                target="_blank"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                politique de confidentialité
              </Link>{' '}
              et le{' '}
              <Link
                href="/reglement"
                target="_blank"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                règlement de la communauté
              </Link>
            </span>
          </label>
          {termsError && (
            <span role="alert" className="mt-2 block font-body text-xs text-red-500">
              {termsError}
            </span>
          )}
        </div>

        {!emailExpanded ? (
          /* Method choice — Google and email carry equal visual weight
             (same bordered-button treatment) since the terms card above
             already established which one is "primary": neither. Picking
             "Continuer avec email" reveals the form in place of these two
             buttons instead of stacking everything at once (2026-08-19
             explicit ask, reference: a Farata-style signup screen). */
          <div className="flex flex-col gap-3">
            <a
              href="/api/auth/oauth/google/start?next=/onboarding"
              onClick={onGoogleClick}
              aria-disabled={googleRedirecting}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-foreground/15 bg-surface py-3.5 font-body text-sm font-semibold text-foreground transition-colors hover:bg-background"
            >
              {googleRedirecting ? (
                <Icon name="refresh-cw" size={17} className="animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continuer avec Google
            </a>

            <div className="my-1 flex items-center gap-3 font-body text-xs uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou
              <span className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              onClick={onContinueWithEmail}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-foreground/15 bg-surface py-3.5 font-body text-sm font-semibold text-foreground transition-colors hover:bg-background"
            >
              <Icon name="inbox" size={17} />
              Continuer avec email
            </button>
          </div>
        ) : (
          <form onSubmit={onSignup} noValidate className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setEmailExpanded(false)}
              className="flex items-center gap-1 self-start font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="chevron-left" size={14} />
              Changer de méthode
            </button>
            <label className="flex flex-col gap-2 font-body text-sm text-muted-foreground">
              Email
              <input
                type="email"
                autoComplete="email"
                value={data.email}
                onChange={(e) => {
                  setData((d) => ({ ...d, email: e.target.value }));
                  if (emailError) setEmailError(null);
                }}
                aria-invalid={!!emailError}
                className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {emailError && (
                <span role="alert" className="font-body text-xs text-red-500">
                  {emailError}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-2 font-body text-sm text-muted-foreground">
              Mot de passe
              <PasswordInput
                id="signup-password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (passwordError) setPasswordError(null);
                }}
                autoComplete="new-password"
                minLength={SIGNUP_PASSWORD_MIN}
              />
              {passwordError && (
                <span role="alert" className="font-body text-xs text-red-500">
                  {passwordError}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-2 font-body text-sm text-muted-foreground">
              Confirmer le mot de passe
              <PasswordInput
                id="signup-password-confirm"
                value={passwordConfirm}
                onChange={(v) => {
                  setPasswordConfirm(v);
                  if (passwordConfirmError) setPasswordConfirmError(null);
                }}
                autoComplete="new-password"
              />
              {passwordConfirmError && (
                <span role="alert" className="font-body text-xs text-red-500">
                  {passwordConfirmError}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 font-body text-sm text-muted-foreground">
              Code promo (optionnel)
              <input
                type="text"
                autoComplete="off"
                value={data.promoCode}
                onChange={(e) => setData((d) => ({ ...d, promoCode: e.target.value }))}
                placeholder="Ex. AFF23456"
                className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm uppercase text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground active:scale-[0.99] disabled:opacity-50"
            >
              {submitting && <Icon name="refresh-cw" size={16} className="animate-spin" />}
              {submitting ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center font-body text-sm text-muted-foreground">
          Tu as déjà un compte ?{' '}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </WizardShell>
    );
  }

  if (step === 'verify') {
    return (
      <WizardShell key="verify" stepLabel="Compte" progressPct={0} onBack={() => setStep('signup')}>
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
        <form onSubmit={onVerify} noValidate className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Code de vérification
            <input
              type="text"
              maxLength={8}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm uppercase tracking-widest text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="mt-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
          >
            {submitting ? 'Vérification…' : 'Continuer'}
          </button>
        </form>
        <p className="mt-4 text-center font-body text-sm text-muted-foreground">
          Rien reçu ?{' '}
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resending || resendCooldown > 0}
            className="font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {resendCooldown > 0
              ? `Renvoyer le code (${resendCooldown}s)`
              : resending
                ? 'Envoi…'
                : 'Renvoyer le code'}
          </button>
        </p>
      </WizardShell>
    );
  }

  const profileStep = step;
  const progressPct = (profileStep / 4) * 100;

  return (
    <WizardShell
      key={`profile-${profileStep}`}
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

          <div>
            <label className="mb-2 block font-body text-sm text-foreground">
              Je souhaite voir (optionnel)
            </label>
            <div className="flex gap-3">
              {INTERESTED_IN_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex-1">
                  <PillOption
                    label={opt.label}
                    active={data.interestedIn === opt.value}
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        interestedIn: d.interestedIn === opt.value ? null : opt.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Prénom
            <input
              type="text"
              value={data.firstName}
              onChange={(e) => setData((d) => ({ ...d, firstName: e.target.value }))}
              placeholder="ex. Nadège"
              className={`rounded-lg border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${missingRing(
                missingFields.includes('Prénom'),
              )}`}
            />
          </label>

          <div className="flex flex-col gap-2">
            <label className="font-body text-sm text-foreground">Date de naissance</label>
            <div
              className={
                missingFields.includes('Date de naissance')
                  ? 'rounded-lg ring-2 ring-red-500/30'
                  : ''
              }
            >
              <DateOfBirthFields
                value={data.dateOfBirth}
                onChange={(iso) => setData((d) => ({ ...d, dateOfBirth: iso }))}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="font-body text-sm text-red-500">
              {error}
            </p>
          )}

          <MissingFieldsBanner names={missingFields} />

          <button
            type="button"
            onClick={() => {
              const miss: string[] = [];
              if (!data.gender) miss.push('Genre');
              if (!data.firstName.trim()) miss.push('Prénom');
              if (!data.dateOfBirth) miss.push('Date de naissance');
              if (miss.length > 0) {
                setMissingFields(miss);
                toast('Complète les champs en rouge pour continuer.', 'error');
                return;
              }
              if (data.dateOfBirth && ageFromIso(data.dateOfBirth) < MIN_AGE_YEARS) {
                const msg = `Tu dois avoir au moins ${MIN_AGE_YEARS} ans pour utiliser YeOyo.`;
                setError(msg);
                toast(msg, 'error');
                return;
              }
              setMissingFields([]);
              setError(null);
              setStep(2);
            }}
            className="mt-1 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
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

          <div className="flex flex-col gap-2">
            <label className="font-body text-sm text-foreground">Ton pays</label>
            <CustomSelect
              ariaLabel="Ton pays"
              placeholder="Choisis ton pays"
              value={data.country ?? ''}
              options={COUNTRIES.map((c) => ({ value: c.value, label: c.label }))}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  country: v,
                  // A commune only makes sense for RDC (Kinshasa neighborhoods)
                  // — switching country clears a stale one from another pick.
                  commune: v === 'CD' ? d.commune : '',
                }))
              }
            />
          </div>

          <label className="flex flex-col gap-2 font-body text-sm text-foreground">
            Ta ville
            <input
              type="text"
              list="onboarding-city-suggestions"
              value={data.city}
              onChange={(e) => setData((d) => ({ ...d, city: e.target.value }))}
              placeholder="ex. Kinshasa"
              className={`rounded-lg border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${missingRing(
                missingFields.includes('Ville'),
              )}`}
            />
            <datalist id="onboarding-city-suggestions">
              {(data.country
                ? MAJOR_CITIES_BY_COUNTRY[data.country as keyof typeof MAJOR_CITIES_BY_COUNTRY]
                : undefined
              )?.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </label>

          {data.country === 'CD' && (
            <div className="flex flex-col gap-2">
              <label className="font-body text-sm text-foreground">Ta commune à Kinshasa</label>
              <CustomSelect
                ariaLabel="Ta commune à Kinshasa"
                placeholder="Choisis ta commune (optionnel)"
                value={data.commune}
                searchable
                options={KINSHASA_COMMUNES.map((c) => ({ value: c, label: c }))}
                onChange={(v) => setData((d) => ({ ...d, commune: v }))}
              />
            </div>
          )}

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
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-150 active:scale-[0.99] ${
                      active
                        ? 'border-primary bg-secondary/20 shadow-md shadow-primary/20'
                        : 'border-border bg-surface shadow-sm hover:border-primary/40 hover:shadow-md'
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        active ? 'border-primary' : 'border-border'
                      }`}
                    >
                      {active && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
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

          <div>
            <label className="mb-2 block font-body text-sm text-foreground">
              Souhaites-tu (encore) des enfants ? (optionnel)
            </label>
            <div className="flex gap-3">
              {WANTS_CHILDREN_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex-1">
                  <PillOption
                    label={opt.label}
                    active={data.wantsChildren === opt.value}
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        wantsChildren: d.wantsChildren === opt.value ? null : opt.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <MissingFieldsBanner names={missingFields} />

          <button
            type="button"
            onClick={() => {
              const miss: string[] = [];
              if (!data.country) miss.push('Pays');
              if (!data.city.trim()) miss.push('Ville');
              if (!data.maritalStatus) miss.push('Situation familiale');
              if (!data.childrenCount) miss.push("Nombre d'enfants");
              if (miss.length > 0) {
                setMissingFields(miss);
                toast('Complète les champs en rouge pour continuer.', 'error');
                return;
              }
              setMissingFields([]);
              setStep(3);
            }}
            className="mt-1 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
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
                  className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 text-left transition-all duration-150 active:scale-[0.99] ${
                    active
                      ? 'border-primary bg-secondary/20 shadow-md shadow-primary/20'
                      : 'border-border bg-surface shadow-sm hover:border-primary/40 hover:shadow-md'
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
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      active ? 'border-primary' : 'border-border'
                    }`}
                  >
                    {active && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </div>
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

          <div>
            <label className="mb-1.5 block font-headings text-sm font-semibold text-foreground">
              Ta vision du mariage{' '}
              <span className="font-body text-xs font-normal text-muted-foreground">
                (optionnel)
              </span>
            </label>
            <textarea
              value={data.bio}
              onChange={(e) => setData((d) => ({ ...d, bio: e.target.value.slice(0, 500) }))}
              placeholder="Ex : Pour moi, le mariage c'est avant tout un engagement sincère et..."
              rows={3}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-right font-body text-xs text-muted-foreground">
              {data.bio.length}/500
            </p>
            <SuggestionChips
              suggestions={BIO_SUGGESTIONS}
              onSelect={(text) => setData((d) => ({ ...d, bio: text }))}
            />
          </div>

          <MissingFieldsBanner names={missingFields} />

          <button
            type="button"
            onClick={() => {
              if (!data.intent) {
                setMissingFields(['Ton intention']);
                toast('Choisis ton intention pour continuer.', 'error');
                return;
              }
              setMissingFields([]);
              setStep(4);
            }}
            className="mt-1 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
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

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) setPrimaryPhoto(dropped);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-12 transition-colors ${
              photoPreviews[0]
                ? 'border-primary bg-secondary/10'
                : 'border-border bg-surface hover:border-primary/50'
            }`}
          >
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-muted">
              {photoPreviews[0] ? (
                <>
                  {/* Local blob: preview — next/image can't optimize object URLs. */}
                  <img
                    src={photoPreviews[0]}
                    alt="Aperçu de ta photo de profil"
                    className="h-24 w-24 rounded-full object-cover"
                  />
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-verified ring-2 ring-surface">
                    <Icon name="check" size={14} className="text-white" />
                  </span>
                </>
              ) : (
                <Icon name="camera" size={36} />
              )}
            </div>
            <div className="text-center">
              <p className="mb-1 font-headings text-base font-semibold text-foreground">
                {photoFiles[0] ? 'Photo sélectionnée ✓' : 'Ajoute ta photo'}
                <span className="ml-1 font-body text-sm font-normal text-red-500">*</span>
              </p>
              <p className="max-w-[220px] truncate font-body text-sm text-muted-foreground">
                {photoFiles[0] ? photoFiles[0].name : 'Glisse ici ou clique pour sélectionner'}
              </p>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setPrimaryPhoto(e.target.files?.[0] ?? null)}
            />
            <span className="rounded-lg bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-95">
              {photoFiles[0] ? 'Changer de photo' : 'Choisir une photo'}
            </span>
          </label>

          {photoFiles[0] && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Photos supplémentaires (optionnel)
                </p>
                <span className="font-body text-xs text-muted-foreground">
                  {photoFiles.length} / {MAX_ONBOARDING_PHOTOS}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {photoFiles.slice(1).map((file, i) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${i}`}
                    className="relative aspect-square overflow-hidden rounded-lg border-2 border-border"
                  >
                    {photoPreviews[i + 1] && (
                      <img
                        src={photoPreviews[i + 1]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeExtraPhoto(i + 1)}
                      aria-label="Retirer cette photo"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/50"
                    >
                      <Icon name="x" size={9} className="text-background" />
                    </button>
                  </div>
                ))}
                {photoFiles.length < MAX_ONBOARDING_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => extraPhotoInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground"
                  >
                    <Icon name="plus" size={18} />
                    <span className="font-body text-xs">Ajouter</span>
                  </button>
                )}
              </div>
              <input
                ref={extraPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) addExtraPhoto(picked);
                  e.target.value = '';
                }}
              />
            </div>
          )}

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
              onClick={() => {
                if (!photoFiles[0]) {
                  setMissingFields(['Photo de profil']);
                  toast('Ajoute une première photo pour continuer.', 'error');
                  return;
                }
                setMissingFields([]);
                void onFinish();
              }}
              className="rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
            >
              {submitting ? 'Finalisation…' : 'Terminer et explorer 🎉'}
            </button>
            {!photoFiles[0] && (
              <p
                className={`text-center font-body text-xs ${
                  missingFields.includes('Photo de profil')
                    ? 'font-semibold text-red-600'
                    : 'text-muted-foreground'
                }`}
              >
                Une première photo est obligatoire pour continuer.
              </p>
            )}
          </div>
        </div>
      )}
    </WizardShell>
  );
}
