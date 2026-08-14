# Accueil (Home) — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `l_YkRVFXx5e9/screens/HomeScreen.jsx`
- screenName: "YeOyo — Accueil"
- screenSize: `desktop` (Banani exported desktop-only; no mobile variant provided)
- Fetched: 2026-08-13, part of this session's batch fetch of the "Rencontres Sérieuses Congo" flow (screens still branded "YeOyo")

## Structure map
Top to bottom, `HomeScreen.jsx`:

1. **TopNav** (`activeTab="accueil"`) — shared component, full-width, fixed above content.
2. **Page container** — `max-w-7xl mx-auto px-8 py-6`, two-column flex layout (`gap-6`): left sidebar (`w-72`, fixed width) + main content (`flex-1`).
3. **Sidebar** (`aside`, `flex flex-col gap-4`), top to bottom:
   - `ProfileProgress` (name="Jos", pct=86) — dark card, greeting + completion bar.
   - `WhoLikedBanner` (count=3) — accent banner, "who liked you" upsell.
   - **Trust badge card** (NEW, not a shared component) — white card, title "Pourquoi faire confiance à YeOyo ?" + 3 rows, each an icon-in-colored-square + bold micro-title + muted description:
     - shield-check / secondary tint → "Profils vérifiés IA"
     - gem / primary tint → "Intention matrimoniale déclarée"
     - smartphone / accent tint → "Paiement Mobile Money"
   - **"Profil du jour" card** (NEW) — uppercase accent-colored eyebrow label, then a row with `UserAvatar` (mock stock avatar, 48px rounded) + name/age, city/job, verified badge (shield-check + "Vérifiée" text) — then a full-width outlined "Voir son profil" link/button below.
4. **Main content** (`main`, `flex-1 flex flex-col gap-6`):
   - **Section header** — flex row: left = `h1` "La sélection YeOyo" (PT Serif, 2xl, bold) + subtitle "Des profils sérieux choisis pour toi"; right = "Voir tous les profils" link with arrow-right icon.
   - **Profile grid** — `grid grid-cols-4 gap-4`, 8 `ProfileCard`s from a hardcoded `profiles` mock array (name, age, city, job, matchPct, verified, liked, gender/heritage/index for avatar picker).
   - **"New profiles teaser" banner** (NEW) — card, flex row: icon-in-square (user-plus/primary tint) + bold title "12 nouveaux profils depuis hier" + muted subtitle "Des Kinois sérieux qui viennent de rejoindre YeOyo", right side a solid primary "Découvrir" button.
   - **Témoignage (testimonial) card** (NEW) — secondary-tinted card, quote icon in circle + italic French testimonial quote (Lingala-inflected) + attribution line "Emmanuel K. · Kinshasa · Marié en janvier 2025".

No footer, no stats row, no visibility toggle, no daily-content widget beyond "Profil du jour" — this Banani screen is narrower in scope than the current `/app/decouvrir` dashboard.

## Component breakdown

**NEW components needed** (not in Banani's shared bundle, must be built as real TSX):
- `TrustBadgeCard` (or inline section) — 3-row trust/value-prop list.
- `ProfileOfDayCard` — daily featured profile teaser card.
- `SelectionSectionHeader` — title + "voir tout" link row (could be a small reusable pattern, low priority to componentize vs inline).
- `NewProfilesTeaser` — count-since-yesterday CTA banner.
- `TestimonialCard` — quote/attribution card.

**REUSE from existing project** (real files, need Banani-visual restyle, not rebuild from scratch):
- `frontend/src/components/yeoyo/RecommendedProfileCard.tsx` and/or `ProfileGridCard.tsx` — closest existing analogs to Banani's `ProfileCard` (photo, name/age, city, job, match%, verified badge, like heart). Likely needs restyle to match new token set + Banani's exact layout (verified badge top-left, heart top-right, match% bottom-right overlay) rather than a full rewrite.
- `frontend/src/components/ui/Icon.tsx` — Lucide wrapper; extend with any missing icon names (`shield-check`, `gem`, `smartphone`, `user-plus`, `quote`, `arrow-right` — check which are already mapped).
- `frontend/src/app/app/decouvrir/page.tsx` — current home page; this Banani screen is the replacement candidate but is materially narrower (no stats row, no visibility toggle, no real profile-completion widget wiring shown) — see open questions.
- User avatar / profile image: project's real `UserAvatar` component (image-or-initials) is NOT a drop-in replacement for Banani's `UserAvatar` (gender/ageGroup/heritage/index stock-avatar picker) — see translation concern below.

**FROM Banani shared bundle (need translating to real TSX, not copy-paste)**:
- `TopNav.jsx` → new `TopNav.tsx` (or repurpose `Sidebar.tsx`/`MobileTabBar.tsx`) — desktop horizontal nav is a structural departure from current side/bottom nav.
- `ProfileProgress.jsx` → should ideally bind to the REAL profile-completion % already computed for `/app/decouvrir` today, not a static `pct={86}` prop.
- `WhoLikedBanner.jsx` → needs a real "who liked me" count from backend (likes API) — currently no evidence this exists as a countable/blurred-preview surface; check `frontend/src/app/api/likes/route.ts`.
- `ProfileCard.jsx` → merge into / replace `ProfileGridCard.tsx` or `RecommendedProfileCard.tsx`.

**PRIMITIVES**: buttons, badges, cards, icon-in-tinted-square wrapper (repeated pattern across trust badge, teaser banner — worth extracting as a small `IconTile` primitive), progress bar (inside ProfileProgress).

## Token mapping (Banani token → project token)

| Banani token | Value | Maps to project (Tailwind v4 `@theme`) |
|---|---|---|
| `--color-background` | #fdfbf8 | `background` |
| `--color-foreground` | #1A1208 | `foreground` |
| `--color-border` | #e8dfd6 | `border` |
| `--color-input` | #F3EDE0 | `input` |
| `--color-primary` | #c17a4e | `primary` |
| `--color-primary-foreground` | #ffffff | `primary-foreground` |
| `--color-secondary` | #1f3a2e | `secondary` |
| `--color-secondary-foreground` | #ffffff | `secondary-foreground` |
| `--color-accent` | #f3e4d9 | `accent` |
| `--color-accent-foreground` | #8a4a28 | `accent-foreground` |
| `--color-muted` | #f1eae2 | `muted` |
| `--color-muted-foreground` | #7A6B52 | `muted-foreground` |
| `--color-card` | #FFFFFF | `card` |
| `--color-card-foreground` | #1A1208 | `card-foreground` |
| `--color-verified` | #2D6A4F | `verified` (new — no current equivalent, used for "Vérifiée" badge/text) |
| `--color-verified-foreground` | #ffffff | `verified-foreground` |
| `--color-gold` | #C8932A | `gold` (new — Premium tab, gold CTA) |
| `--color-gold-foreground` | #1A1208 | `gold-foreground` |
| radii sm/md/lg/xl | 6/10/16/28px | Tailwind `rounded-*` scale needs remapping; default radius = sm (6px), note current app likely uses different default |
| font body | DM Sans | replaces current Inter (`layout.tsx` currently loads Inter — needs swap) |
| font headings | PT Serif | new — no heading font currently declared separately |
| text scale | xs11/sm13/base15/lg17/xl20/2xl24/3xl32/4xl44/5xl58 | needs custom `fontSize` scale in Tailwind config/`@theme`, differs from Tailwind defaults |

This is a full theme replacement (`globals.css` `@theme` block), not an additive change — must confirm with user whether ALL existing pages should also repaint to these tokens simultaneously or if this is scoped to the Accueil screen first.

## Responsive plan (mobile-first mandatory, Banani screen is desktop-only)

- **Base (375px, mobile)**: single column. TopNav → collapses to existing `MobileTabBar` pattern (bottom tab bar) since Banani's TopNav has no mobile spec; sidebar widgets (`ProfileProgress`, `WhoLikedBanner`, trust badge, profil-du-jour) stack above or below the main profile grid — recommend: greeting/progress first, then "who liked" banner, then profile grid (2 columns), then trust badge + profil-du-jour + teaser + testimonial as stacked cards below the fold. Profile grid: `grid-cols-2`.
- **sm (≥640px)**: profile grid → `grid-cols-2` or `grid-cols-3`, sidebar still stacked above main (single column page).
- **md (≥768px)**: consider introducing two-column layout if width allows (sidebar 280px + main), or keep stacked until lg.
- **lg (≥1024px)**: two-column layout activates — sidebar `w-72` + main `flex-1`, matches Banani's structure. Profile grid `grid-cols-3`.
- **xl (≥1280px)**: profile grid `grid-cols-4` as in Banani source, `max-w-7xl` container.

TopNav itself needs a responsive contract that doesn't exist in the Banani source (desktop-only) — decide whether TopNav becomes the sole nav (hamburger drawer on mobile) replacing Sidebar+MobileTabBar, or whether MobileTabBar persists as the mobile nav and TopNav only renders ≥lg.

## Interactions / state

- TopNav: tab switching (Accueil/Découvrir/Visiteurs/Favoris/Demandes/Premium), Boost button, Messages icon (badge count), Notifications bell (badge count), avatar dropdown — all mocked, no real navigation wired in source.
- `ProfileProgress`: "Cliquer pour compléter" — link, presumably to `/app/profil` edit flow.
- `WhoLikedBanner`: "Découvrir" CTA — gold button, likely links to a Premium upsell or paywall.
- Trust badge card: static, no interaction.
- "Profil du jour" card: "Voir son profil" — link to a profile detail page (`/app/profils/[userId]`).
- Section header "Voir tous les profils" — link with arrow, likely to `/app/explorer` or `/app/decouvrir` full listing.
- `ProfileCard` grid items: implied click-through to profile detail (`/app/profils/[userId]`); heart icon top-right = like/unlike toggle (`liked` boolean already in mock data — maps to real like state).
- "New profiles teaser" — "Découvrir" button, same ambiguity as WhoLikedBanner's CTA (two different CTAs both labeled "Découvrir" pointing to unclear distinct destinations).
- Testimonial card: static, no interaction.
- All data in this screen is **hardcoded mock data** (the `profiles` array, `pct={86}`, `count={3}`, "12 nouveaux profils depuis hier", the testimonial). Every one of these needs a real data source when translated to the actual app.

## Copy (all French strings found, verbatim)

- "Pourquoi faire confiance à YeOyo ?"
- "Profils vérifiés IA"
- "Chaque profil est contrôlé avant activation"
- "Intention matrimoniale déclarée"
- "Ici, tout le monde cherche le sérieux"
- "Paiement Mobile Money"
- "Airtel Money · Orange Money · M-Pesa"
- "Profil du jour"
- "Bénédicte O., 33"
- "Kinshasa · Pharmacienne"
- "Vérifiée"
- "Voir son profil"
- "La sélection YeOyo"
- "Des profils sérieux choisis pour toi"
- "Voir tous les profils"
- "12 nouveaux profils depuis hier"
- "Des Kinois sérieux qui viennent de rejoindre YeOyo"
- "Découvrir" (appears twice — WhoLikedBanner CTA and New-profiles-teaser CTA, both shared-component/inline)
- "\"YeOyo na biso — c'est ici que j'ai trouvé ma moitié. En 3 semaines, profil vérifié, premier message, et maintenant on parle mariage.\""
- "Emmanuel K. · Kinshasa · Marié en janvier 2025"

(Mock profile data — names/jobs/cities, not real UI copy but worth noting for realism reference: Carine M./Infirmière, Rosette K./Comptable, Nadège B./Avocate, Prisca N./Enseignante, Grâce T./Médecin, Dorcas L./Entrepreneuse, Yvette M./Journaliste, Flora K./Designer — all Kinshasa except Prisca N. (Lubumbashi).)

## Implementation checklist

- [ ] Confirm scope: full theme swap (`globals.css` `@theme`) vs scoped-to-Accueil first (see open questions)
- [ ] Add DM Sans + PT Serif via `next/font`, replace Inter in `layout.tsx`
- [ ] Define new `@theme` tokens (colors, radii, font sizes) in `frontend/src/app/globals.css`
- [ ] Build/restyle `TopNav` — decide relationship to `Sidebar.tsx`/`MobileTabBar.tsx`
- [ ] Build `ProfileProgress` bound to real completion % (check existing calc in `/app/decouvrir`)
- [ ] Build `WhoLikedBanner` bound to real like-count data (check `frontend/src/app/api/likes/route.ts`)
- [ ] Build `TrustBadgeCard` (static content, low risk)
- [ ] Build `ProfileOfDayCard` — needs a "pick of the day" data source (new logic or omit/mock)
- [ ] Restyle `ProfileGridCard.tsx`/`RecommendedProfileCard.tsx` to match Banani `ProfileCard` layout (verified badge, heart, match% overlay)
- [ ] Build `NewProfilesTeaser` — needs "new since yesterday" count query (new logic or omit/mock)
- [ ] Build `TestimonialCard` — static/CMS content, decide if hardcoded or content-managed
- [ ] Wire mobile-first responsive breakpoints (grid-cols 2/3/4, sidebar stacking)
- [ ] Extend `Icon.tsx` with any missing icon names (`shield-check`, `gem`, `smartphone`, `user-plus`, `quote`)
- [ ] Resolve `UserAvatar` signature mismatch (Banani's stock-picker prop shape vs project's real image/initials component)
- [ ] Decide fate of existing `/app/decouvrir` widgets not present in Banani screen (stats row, visibility toggle, daily content) — merge, drop, or relocate

## Open questions for user

1. **Scope of replacement**: Does this Banani "Accueil" screen replace `/app/decouvrir` wholesale, or merge with the existing dashboard's real-data widgets (actual profile-completion %, premium upsell, daily content, stats row, visibility toggle) that the Banani mock doesn't show? The Banani screen is narrower — several real widgets currently on `/app/decouvrir` have no equivalent here.
2. **"Visiteurs" and other new concepts**: `TopNav` references a "Visiteurs" (profile-view tracking) tab and a "Favoris" tab that don't map to existing schema/routes. Also "Profil du jour", "12 nouveaux profils depuis hier", and the testimonial are all backed by mock/hardcoded data with no real equivalent yet — build real data sources, or ship as static/omitted for v1?
3. **Nav architecture**: Is `TopNav` meant to fully replace `Sidebar.tsx` + `MobileTabBar.tsx`, and if so what's the mobile nav story since Banani only exported a desktop-only `TopNav`? Also note the "Boost" button and gold "Premium" tab in TopNav imply monetization surfaces not yet scoped.
