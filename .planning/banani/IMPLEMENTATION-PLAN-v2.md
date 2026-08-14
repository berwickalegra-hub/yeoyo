# Second Banani re-theme — "Rencontres Sérieuses Congo" flow — roadmap

Source flow: `l_YkRVFXx5e9` ("Rencontres Sérieuses Congo", screens still branded "YeOyo"), fetched 2026-08-13.
5 screens: `DemandesScreen`, `HomeScreen` ("Accueil"), `PremiumScreen`, `DiscoverScreen` ("Découvrir"), `LandingPage`.
Per-screen structure/copy plans: `accueil-nouveau-theme.md`, `premium-nouveau-theme.md`, `decouvrir-nouveau-theme.md`, `landing-nouveau-theme-2.md`, `demandes-nouveau-theme.md`.

## Decisions confirmed by user (2026-08-13)

1. **Theme scope**: new terracotta/cream palette (`--color-primary: #c17a4e`, PT Serif headings + DM Sans body, radius 6/10/16/28) becomes the sitewide default theme (9th entry in `ThemeContext.THEMES`), same precedent as the `light-blue` rollout on 2026-08-13. `light-blue` moves from default to opt-in alongside `dark-gold`/`light`/etc.
2. **Navigation**: replace `Sidebar.tsx`/`MobileTabBar.tsx` with a new `TopNav.tsx` (desktop, `lg:`+) reproducing Banani's bar (logo, Accueil/Découvrir/Visiteurs/Favoris/Demandes tabs, gold Premium tab, Boost button, Messages icon+badge, Notifications bell+badge, avatar dropdown). Banani exported desktop only — mobile nav is this session's own design: a bottom tab bar carrying the same 5 primary tabs (Accueil/Découvrir/Visiteurs/Favoris/Demandes), with Boost/Messages/Notifications/Premium/avatar reachable from a compact top strip or the Accueil dashboard instead of competing for bottom-bar space.
3. **Premium pricing**: adopt Banani's 4-plan CDF catalog (15 Jours 16 000 FC / 1 Mois 11 000 FC "Populaire" / 3 Mois 24 000 FC / 6 Mois 33 000 FC), replacing the current 3-plan USD placeholder catalog in `lib/server/subscriptions/plans.ts`. Still runs through the existing stub `PaymentProvider` (real Stripe/Moneroo billing stays out of scope, unchanged from prior status).
4. **New concepts — build now, not stub**:
   - **Visiteurs**: profile-view tracking (`ProfileView` model) + `/app/visiteurs` page.
   - **Favoris**: a bookmark distinct from `Like` (which auto-creates a `ContactRequest`) — new `Favorite` model + `/app/favoris` page. (Existing `/app/likes` = "who liked me", unrelated — kept as-is, reachable from the new nav's avatar/notification area since it's not one of Banani's 5 primary tabs.)
   - **Boost**: `Profile.boostedUntil` — boosted profiles surface first in discovery ordering + show an "En avant" badge; a `POST /api/profile/boost` route with a disclosed default cooldown (see Phase 1 for exact rule).
   - **Daily message stats / cap**: free users get a disclosed daily sent-message cap (mirrors the existing Coach 3-messages/day pattern — `createdAt` range count, no new counter row), Premium = unlimited; surfaced in Découvrir's "Mes stats du jour" panel.

## Phases

- **Phase 1 — Foundation** (this session): Prisma migration (`ProfileView`, `Favorite`, `Profile.boostedUntil`), `POST /api/profile/boost`, `GET /api/profile/visitors`, `POST/DELETE /api/favorites` + `GET /api/favorites`, daily-message-cap helper reused by the messages route; new theme tokens + PT Serif font in `globals.css`, `ThemeContext` entry; `TopNav.tsx` (desktop) + new mobile bottom nav; `Icon.tsx` additions (`tag`, `x-circle`, `user-check`, `user-plus`, `shield`, `arrow-right`, `gift`, `eye`, `star` if missing); wire into `AppShell.tsx` replacing `Sidebar`/`MobileTabBar` on all `/app/*` routes.
- **Phase 2 — Landing**: `page.tsx` full replace per `landing-nouveau-theme-2.md`, new `PricingCard.tsx`, gradient hero block (no fabricated photo).
- **Phase 3 — Accueil** (`/app/decouvrir`): merge Banani's look with the existing real-data dashboard widgets (keep real completion %/premium-upsell/recommendations/daily-content — Banani's mock versions of these are hardcoded, not a real design requirement to match verbatim); add Visiteurs teaser + Boost CTA.
- **Phase 4 — Découvrir/Explorer** (`/app/explorer`): restyle `SwipeCard`/`ProfileGridCard` to new theme+radii, add Boost "En avant" badge, Favoris star action (separate from like), "Mes stats du jour" panel with real daily message count.
- **Phase 5 — Demandes**: token/radius/font restyle of the existing (already-close) 3-tab page; keep the existing "Comment ça marche" panel (real content Banani's mock dropped).
- **Phase 6 — Premium**: new 4-plan CDF catalog in `plans.ts`, checkout UI rebuild, keep existing comparison table (real content), Mobile Money + card-tile UI both route through the existing stub provider (no new real payment integration).

Each phase ends with `pnpm format && pnpm lint && pnpm typecheck && pnpm test` green + a `STATUS.md` update, per project convention.

## Boost & daily-cap rules (disclosed defaults — no spec from Banani beyond the button/badge existing)
- Boost: 30-minute duration, moves the profile to the front of `/api/profiles/explorer`'s ordering (does not affect gender/preference filtering, only tie-break ordering). Free users: 1 boost per rolling 24h. Premium (`Subscription.status === 'ACTIVE'`): unlimited. Enforced server-side in `POST /api/profile/boost`.
- Daily message cap: free users capped at 20 sent `Message` rows per UTC day (mirrors Coach's existing pattern); Premium unlimited. Surfaced as "X messages restants aujourd'hui" in Découvrir's stats panel; enforced in `POST /api/conversations/[id]/messages`.
