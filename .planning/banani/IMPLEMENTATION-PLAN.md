# YeOyo Mariage — Implementation Plan (Banani → izi kit)

Last updated: 2026-07-30
Source: Banani flow `alMLvZczLcpt` ("YeOyo Mariage"), 9 screens fetched via `mcp__banani__banani_get_selected_designs`.

## 1. Product summary

A "serious marriage-intent" dating app for Congolese users based in Kinshasa, DRC. AI-verified profiles, declared marriage intent, Mobile Money payments only (M-Pesa, Airtel Money, Orange Money) — no bank cards. FCFA-style currency labels in the mockups ("FC"), copy mixes French and Lingala.

## 2. Screen inventory → route mapping

| Banani screen | Proposed route | Auth | Starter kit coverage today |
|---|---|---|---|
| Landing Mobile/Desktop | `/` | Public | `frontend/src/app/page.tsx` exists but is the generic starter welcome page — full replace |
| Onboarding Flow (Desktop, 4 steps) + Onboarding Profil (mobile, step 1/4 — same flow, single-step mobile rendering) | `/onboarding` (multi-step wizard) | Public → creates account | Nothing — no wizard, no Profile domain model. **Confirmed 2026-07-30**: the desktop screen shows the full 4-step payload (`gender, firstName, dateOfBirth, commune, religion?, maritalStatus, childrenCount, intent, photo`) — resolves the earlier "steps 2-4 not designed" open question. |
| Découverte Profils | `/app/decouvrir` | Auth | Nothing — no matching/ranking logic |
| Explorer | `/app/explorer` | Auth | Nothing — no profile grid, no filters |
| Demandes | `/app/demandes` | Auth | Nothing — no contact-request domain model |
| Messages | `/app/messages` | Auth | Nothing — no chat/conversation model. Real-time from day one per user decision (§ Real-time) |
| Paramètres | `/app/parametres` | Auth | Partially — `frontend/src/app/settings/page.tsx` exists (password change + Google link only), `/api/auth/me`, `/api/auth/change-password` exist; profile visibility/notif-prefs/blocked-users/data-export/search-prefs are new |
| Premium Checkout | `/app/premium` | Auth | Partially — `/api/orders` (generic Order model) exists and is provider-agnostic-ish, but no subscription/plan concept, and the wired provider (Bictorys) is being replaced (§4) |
| **Admin Panel (Desktop)** — NEW, 2nd fetch | `/admin` (extends existing back-office) | Admin/Superadmin | Partially — `/api/admin/users`, `/api/admin/audit-log` etc. already exist and cover the "Membres" table + suspend action almost 1:1. New sub-resources needed: **Signalements** (flags/reports), **Vérification IA** (AI verification queue), **Likes & Matches** / **Demandes** admin views, **Abonnements/Transactions** (subscription admin view once Stripe/Moneroo land). KPI cards + charts (inscriptions/mois, répartition membres) are new aggregate-query endpoints. |

**Net new pages: 8 of 9** (Admin Panel reuses the most existing backend of any screen; settings partially reuses existing routes; the rest is new UI + new backend).

## 3. Backend gap analysis

### 3.1 What the starter already gives us for free
- Auth (signup/login/verify-email/forgot-reset/change-password), session cookies, CSRF — Onboarding step 1 can create the `User` row via the existing signup flow, then extend with a `Profile` model.
- `Order` model + Bictorys `PaymentProvider` interface — the *shape* (amount, currency, provider, webhook, idempotency) is reusable for Premium Checkout; the *provider* is not (see §4).
- `Notification` + `NotificationPreferences` + outbox — reusable as-is for "Demandes de contact", "Messages reçus", "Likes reçus", "Profils recommandés" toggles seen in Paramètres.
- `FileUpload` + Cloudinary — reusable for profile photos (Onboarding steps 2-4, presumably).
- Admin back-office (`/api/admin/users`, audit log) — reusable for moderation (block/report, suspend fake profiles) with zero changes.
- Withdrawal PIN/guards infra — not needed here (YeOyo has no payout side, only inbound subscription charges), skip.

### 3.2 New domain models needed (Prisma)
- `Profile` — 1:1 with `User`. Fields seen in the designs: gender, dateOfBirth, city/location, marriage intent (enum: court/moyen/long terme), job title, religion, children status, interests, languages, bio, verification status/date. Drives Onboarding, Découverte, Explorer, Messages side-panel.
- `ProfilePhoto` — N:1 with `Profile`, backed by `FileUpload`/Cloudinary. Needed for AI verification pipeline (§5) and `ProfileDetailCard`/`ProfileCardSmall`.
- `Like` (or `ProfileLike`) — userId → targetUserId, unique pair. Drives "Ajouter un like", "Voir les likes reçus" (Premium-gated per the comparison table).
- `ContactRequest` — requesterId, targetId, status (PENDING/VIEWED/ACCEPTED/CANCELLED), timestamps. Drives the entire Demandes screen (3 tabs) and gates Messages ("Nouveau message" implies an accepted contact request unlocks a thread).
- `Conversation` + `Message` — Conversation has 2 participants (derived from an accepted `ContactRequest`), Message has senderId/body/createdAt/readAt. Drives Messages screen.
- `BlockedUser` — blockerId, blockedId, unique pair. Drives "Bloquer" action + Paramètres "Utilisateurs bloqués" count.
- `SubscriptionPlan` (or a static config, see note) + `Subscription` — plan catalog (Mensuel/6 Mois/Annuel, price, discount %, feature flags) and the user's active subscription (status, currentPeriodEnd, cancelAtPeriodEnd). Drives Premium Checkout + Paramètres "Plan actuel".
  - *Lean alternative*: keep the 3 plans as a static TS config (not a DB table) since Banani shows a fixed catalog, and only persist `Subscription` rows. Cheaper to ship, revisit if plans need to become admin-editable.
- `SearchPreferences` — could live as JSON on `Profile` (localité, intention filters) rather than a new table — matches the kit's "flexible JSON prefs" pattern already used by `NotificationPreferences`.

### 3.3 New API routes needed
Following the existing `requireAuth` + `verifyCsrf` + `withRequestContext` boilerplate:
- `POST /api/profile` (create, used by onboarding steps), `GET /api/profile/me`, `PATCH /api/profile` (settings edits)
- `GET /api/profiles/discover` (profile-of-the-day + compatibility), `GET /api/profiles/explorer` (paginated/filtered grid)
- `POST /api/likes`, `GET /api/likes/received`
- `POST /api/contact-requests`, `GET /api/contact-requests` (3 tabs via `?status=`), `PATCH /api/contact-requests/[id]/cancel`
- `GET /api/conversations`, `GET /api/conversations/[id]/messages`, `POST /api/conversations/[id]/messages`
- `POST /api/blocks`, `GET /api/blocks` (for the "Utilisateurs bloqués" count/manage)
- `GET /api/subscriptions/plans`, `POST /api/subscriptions/checkout` (wraps the existing `Order` + payment-provider flow), webhook extension for subscription activation
- `GET /api/data-export` (Paramètres "Télécharger mes données")

### 3.4 What can be deferred / simplified for a first cut
- Full AI verification pipeline — stub as a manual/admin-reviewed flag first (`Profile.verifiedAt` set by an admin action via the existing audit-logged admin routes, surfaced in the Admin Panel's "Vérification IA" queue — see §7 Admin Panel), real AI check is a v2.
- ~~Real-time messaging~~ — **decided 2026-07-30: real-time from day one** (§ Real-time below), not deferred.

## 4. Payments — provider decision confirmed

**Decided 2026-07-30**: **Stripe** (card, worldwide, USD) + **Moneroo** (Mobile Money) — replacing Bictorys as the wired default. The kit's `PaymentProvider` interface (`frontend/src/lib/server/payments/`) supports multiple providers side by side, so this is an additive change, not a rewrite. The `izisaas-payments-handler` skill ships drop-in adapters for both — use `examples/stripe.ts` and `examples/moneroo.ts` as the starting point, adapted to this repo's existing `Order`/webhook/outbox pattern rather than the skill's own BYOK multi-tenant schema (we don't need per-merchant BYOK here — one platform-owned Stripe + Moneroo account).

**⚠️ Open risk, needs verification before Premium Checkout ships a real charge**: the payments skill's own currency-coverage table lists Moneroo as supporting **XOF / XAF / USD / EUR** — it does **not** list CDF (Congolese Franc) explicitly, and DRC is neither a UEMOA (XOF) nor CEMAC (XAF) country. Two ways this resolves, and only Moneroo's own dashboard/sales team can confirm which:
1. Moneroo's "all Africa" mobile money claim does reach DRC's telcos (Vodacom M-Pesa, Airtel Money, Orange Money DRC) but **settles the charge in USD**, not CDF. If so — this actually lines up well with your ask for USD support, and matches DRC market reality (many Kinshasa businesses price in USD already because CDF is volatile). **Recommended default**: price and charge in USD via Moneroo, show a CDF-equivalent as a display-only reference (fetched from a public FX rate, refreshed periodically) rather than as the actual charge currency.
2. Moneroo does not reach DRC telcos at all, in which case a DRC-specific aggregator (CinetPay, Flutterwave) would be needed alongside/instead of Moneroo for the mobile-money leg.

**Action before Phase E (Premium Checkout) starts**: confirm with Moneroo (dashboard docs or support) that Vodacom/Airtel/Orange **DRC** are live operators on your account, and in which settlement currency. Stripe side has no ambiguity (USD cards work globally).

### Currency handling (confirmed 2026-07-30: CDF + USD)
- `Order.currency` / `Subscription` pricing: **USD** as the source of truth for the actual charge (Stripe is USD-native; Moneroo per above likely settles USD too) — both are integer-cents per this kit's "smallest unit" convention (`toStripeAmount`/`fromStripeAmount` helpers from the payments skill handle this).
- **CDF is display-only** in the UI (price shown in both USD and an approximate CDF equivalent) unless Moneroo confirms native CDF settlement — do not build a dual-currency ledger until that's confirmed, it's a real complexity that may turn out to be unnecessary.
- Premium Checkout's 3 plan cards (currently priced in "FC" in the mockup — 2 500 / 12 500 / 20 000 FC) will need their canonical USD prices decided once the CDF-vs-USD settlement question above is resolved.

## 5. Real-time messaging (confirmed 2026-07-30: from day one)

Per this repo's CLAUDE.md provider table, real-time on Vercel/serverless means **Ably**, not raw WebSockets/SSE/Socket.IO (those don't survive cold starts on a Vercel function). Plan:
- New route `POST /api/realtime/token` — `requireAuth`, issues an Ably capability token scoped to channels the user may subscribe to (`conversation:{conversationId}` for each conversation they're a participant in).
- Server publishes to the Ably channel via the REST API from inside `POST /api/conversations/[id]/messages` (after the DB write commits — same outbox-safe pattern as other side-effects, or a direct publish since Ably delivery isn't transactionally critical the way emails/webhooks are).
- Client (`ably-js`) subscribes to the active conversation's channel; falls back to the existing `GET /api/conversations/[id]/messages` for initial history load and reconnect catch-up.
- Typing indicators / read receipts (not explicitly in the mockup but common chat expectations) can ride the same channel as ephemeral presence events — flag to you as a nice-to-have, not scoped unless you want it.

## 6. Admin Panel (new screen, 2nd Banani fetch)

Distinct dark "admin shell" theme — the export references a second CSS variable namespace (`--color-admin-bg/-surface/-primary/-success/-warning/-danger`, etc.) used via inline `style={{ background: 'var(--color-admin-*)' }}` throughout the `AdminSidebar` and dashboard, but **the actual hex values for these admin tokens were not included in either Banani fetch** — only referenced, never defined. Before pixel-accurate implementation of this screen, re-fetch with the admin theme file selected in Banani (ask it to include whatever file defines `--color-admin-*`), or confirm you want it to inherit the same dark/gold palette as the rest of the app.

Backend mapping — mostly reuse:
- KPI cards (Membres totaux, Abonnés Premium, Signalements, Revenus) + the 2 charts (inscriptions/mois, répartition membres) → new aggregate-query routes, e.g. `GET /api/admin/stats/overview`, reading `User`/`Profile`/`Subscription` counts grouped by month/status. Net new, but read-only and low-risk.
- "Membres récents" table + Voir/Suspendre actions → **already covered** by `/api/admin/users` + `/api/admin/users/[id]/status` — wire the existing endpoints, no new backend.
- "Signalements" (flags/reports) panel → **new**: needs a `Report` model (reporterId, targetId, reason, status, createdAt) + `/api/admin/reports` (list) + `/api/admin/reports/[id]/resolve` (approve/reject), both going through `logAdminAction` per this kit's audit invariant.
- "Vérification IA" queue → **new**: `/api/admin/verification-queue` (list pending `Profile`s) + `/api/admin/verification-queue/[id]/process` (approve/reject, sets `Profile.verifiedAt`), audit-logged.
- Activité récente feed → can reuse `AdminAction` (the existing audit log) filtered to recent rows, no new model needed.

## 7. Design-system setup (before any screen is coded)

Banani tokens are a **dark theme**, DM Sans, base radius 4px — this replaces the kit's current default (Inter, no dark theme, plain Tailwind). One-time setup before Screen 1:
- Add `@theme` block to `frontend/src/app/globals.css` with the color/radius/type-scale tokens from the export (background `#0D0D0D`, primary/gold `#C9A84C`, verified-green `#4CAF72`, radii 4/8/16/28px, DM Sans).
- Swap `Inter` → `DM Sans` in `frontend/src/app/layout.tsx`.
- Extract the shared Banani components (`VerifiedBadge`, `ProfileCardSmall`, `ProfileDetailCard`, `StatChip`, `TestimonialCard`, `YeOyoNav`, `SidebarNav`/`SidebarNavApp` reconciled into one, `FeatureRow`, `AdminSidebar`) into `frontend/src/components/ui/` and `frontend/src/components/yeoyo/` per the skill's reuse rules.
- Reconcile `SidebarNav.jsx` vs `SidebarNavApp.jsx` into one canonical sidebar (items: Explorer/Découvrir, Mes likes, Demandes, Messages, Mon profil, Paramètres) before wiring any authenticated screen — building 7 screens against 2 diverging navs would duplicate work.
- Install `lucide-react` for icons (not yet in `package.json`).
- Install `ably` + `ably-js` for real-time (§5).
- Install Stripe + Moneroo SDKs per the `izisaas-payments-handler` skill (§4).

## 8. Phased roadmap

**Phase A — Foundation (no screens yet)**
- Design tokens + font swap (§7)
- Prisma migration: `Profile`, `ProfilePhoto`
- Reconcile sidebar variants
- Ably token route scaffold

**Phase B — Public + acquisition**
- Landing Mobile + Desktop (`/`)
- Onboarding wizard, all 4 steps (`/onboarding`) — now fully specified thanks to the "Onboarding Flow (Desktop)" screen (§2)

**Phase C — Core discovery loop**
- Découverte Profils (`/app/decouvrir`)
- Explorer (`/app/explorer`)
- `Like` + `ContactRequest` models and routes

**Phase D — Communication**
- Demandes (`/app/demandes`)
- Messages (`/app/messages`) — real-time via Ably from the start (§5)
- `Conversation`/`Message` models, `BlockedUser`

**Phase E — Monetization + account**
- Paramètres (`/app/parametres`)
- Premium Checkout (`/app/premium`) — Stripe + Moneroo adapters (§4); **blocked on confirming Moneroo's DRC/CDF settlement** before wiring a real charge, UI can be built against a stub provider in parallel

**Phase F — Admin Panel**
- KPI/chart aggregate routes, `Report` model + routes, verification-queue routes (§6)
- Reuses existing `/api/admin/users` + audit log heavily — lowest new-backend-per-screen ratio of the whole roadmap

## 9. Open questions (remaining, need your answer before coding starts)

1. **Moneroo DRC/CDF confirmation** — verify with Moneroo (dashboard/docs/support) that Vodacom M-Pesa, Airtel Money DRC, and Orange Money DRC are live reachable operators on your account, and whether settlement is in USD or CDF. This is the one item that can actually block Phase E if it comes back negative.
2. **AI verification** — stub as admin-manual-approval via the new "Vérification IA" queue for v1, or do you already have a vision-AI vendor in mind?
3. **Admin theme colors** — re-fetch from Banani with the admin theme file included, or reuse the app's existing dark/gold palette for the Admin Panel too?
4. Any screen you want built **first**, ahead of the phased order above (A→F)?
