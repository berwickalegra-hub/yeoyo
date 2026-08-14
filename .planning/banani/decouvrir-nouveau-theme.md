# Découvrir — Banani → Next.js/Tailwind

## Source
- Banani flow: "Rencontres Sérieuses Congo" (screens still branded "YeOyo")
- Screen ID: `l_YkRVFXx5e9/screens/DiscoverScreen.jsx`
- Screen name: "YeOyo — Découvrir" (`displayName`), `screenSize: 'desktop'`
- Imports: `TopNav` (`@components/TopNav`), `Icon` (`@global/Icon`), `UserAvatar` (`@global/UserAvatar`) — no `ProfileCard` import in this particular file, despite it being listed in shared context. This screen only renders the **swipe/stack** view state, not a grid state.

## Structure map
Top to bottom, desktop single-column-with-sidebar layout:

1. **TopNav** (shared component, `activeTab="decouvrir"`)
2. **Toolbar** (centered row, border-bottom): home icon button → "Filtres" button (sliders icon) → a **view-mode toggle** (two-button segmented control: "layers" icon = **active/selected** state, "grid-2x2" icon = inactive state). Only the **stack/swipe** mode is actually rendered below — the grid mode this toggle points to is not captured in this screen's JSX.
3. **Main content row** (flex, centered): swipe-stack column (left) + filters/stats side panel (right, `w-56`, `ml-10`)
   - **Swipe-stack column**:
     - 3 absolutely-positioned stacked cards (visual depth illusion): stack card 3 (bottom, rotate 3deg, 50% opacity), stack card 2 (rotate -1.5deg, 75% opacity), active card (full detail, on top, no drag/gesture code present — purely a static visual mock of the stack)
     - **Active card**:
       - Photo (`UserAvatar` mock prop shape: gender/ageGroup/heritage/index, aspect 3:4)
       - "Boost" badge, top-left (zap icon + "En avant")
       - "Favorite/star" button, top-right (star icon, not a heart — distinct from like)
       - "Online" indicator, bottom-left over photo (green dot + "En ligne")
       - Bottom gradient overlay: name+age, secondary star button, "Vérifiée" badge (shield-check icon) — then city row (map-pin + "Kinshasa, RDC") — then two pill tags (heart+"Célibataire", briefcase+"Pharmacienne")
       - Below photo: "Ma vision du mariage" labeled block (heart icon + heading + 3-line-clamp bio paragraph)
       - Action row: reject (X, red-tinted circle) / message (message-circle, accent-tinted circle) / "Ajouter" (pill button, secondary bg, plus icon — this is the "like" action, not literally "add")
     - Profile counter: "3 / 18 profils" + 5-dot progress indicator (first dot wide/primary = current position)
     - Keyboard hint row: `←` "Passer" (skip) / `→` "Ajouter" (like) — desktop keyboard affordance, no touch/drag code present in this screen
   - **Side panel** (2 stacked cards):
     - "Filtres actifs" (active filters summary): Âge "28 – 42 ans", Ville "Kinshasa", Statut "Célibataire", Profil vérifié "Oui", + "Modifier les filtres" button
     - "Mes stats du jour" (daily stats): Ajouts count "7" (heart icon), Messages envoyés "3 / 5" (message-circle icon, implies a daily send cap), Premium upsell banner (crown icon + "Premium = messages illimités")

## Component breakdown
- **TopNav** — NEW (shared across all screens, tracked separately). Desktop-only horizontal bar (logo, 5 tabs incl. gold Premium, Boost button, Messages/Notifications badges, avatar dropdown). No equivalent today — our nav is `Sidebar.tsx` (desktop) + `MobileTabBar.tsx` (mobile). Do not rebuild per-screen; needs one cross-screen decision (see open questions).
- **Swipe-stack card** — REUSE-WITH-REBUILD `frontend/src/components/yeoyo/SwipeCard.tsx`. The interaction model (drag-to-decide, fixed frame) already exists and is our real mobile answer for browsing — good news, this isn't a net-new pattern. But the *content layout* inside the card differs from what SwipeCard currently renders and needs restructuring to match: boost badge, separate star/favorite button (distinct from like), online dot, verified badge inline in the name row, tag pills (relationship status + job) directly in the photo overlay, and a "Ma vision du mariage" bio block below the photo. Compare against current `SwipeCard.tsx` content structure line-by-line before restyling.
- **Stacked-cards-behind visual** (2 decorative absolutely-positioned cards for depth) — NEW, small addition to SwipeCard's wrapper (currently likely renders only the active card + maybe next card).
- **Toolbar (Filtres + view toggle)** — NEW compared to current `/app/explorer`, which has filter chips inline; this Banani screen instead has a single "Filtres" button (implies filters live in a drawer/modal, not inline chips) plus a persistent swipe⇄grid segmented toggle. Our current toggle mechanism in `/app/explorer` should be auditable against this new segmented-control visual.
- **"Filtres actifs" side panel** — NEW. No equivalent persistent summary panel exists today; current filter state is presumably shown via chips only.
- **"Mes stats du jour" side panel** — NEW CONCEPT, no backend/data equivalent identified in CLAUDE.md or known routes (daily like count, daily message-send count vs a cap, Premium upsell tied to unlimited messaging). Needs a data-source decision before implementation (see open questions).
- **Keyboard nav (←/→)** — NEW, desktop-only affordance not present in the current touch-first `SwipeCard.tsx`.
- **Favorite/star action** — NEW or MAPPING NEEDED. Distinct from the existing "like" concept (`GET/POST /api/likes`) — unclear if this is a new "favorite" feature or a relabeling of an existing one.
- **Boost badge ("En avant")** — NEW CONCEPT. No "boost"/paid-visibility feature found in current routes; TopNav also has a "Boost" button, so this is a recurring cross-screen concept, not one-off.
- PRIMITIVES: `Icon` → maps directly to existing `frontend/src/components/ui/Icon.tsx` (Lucide wrapper, confirmed compatible). `UserAvatar` (Banani mock prop shape `gender/ageGroup/heritage/index`) is a Banani mockup-only convention for picking a placeholder photo — NOT our real `frontend/src/lib/yeoyo` avatar/photo component; do not import Banani's prop contract, just reuse it as a stand-in for "real profile photo URL" during implementation.

## Token mapping
| Banani class | Token | Notes |
|---|---|---|
| `bg-background` | `--color-background` (#fdfbf8) | page bg |
| `border-border` | `--color-border` (#e8dfd6) | toolbar/card borders |
| `bg-card` | `--color-card` (#FFFFFF) | card surfaces |
| `text-muted-foreground` | `--color-muted-foreground` (#7A6B52) | secondary text/icons |
| `bg-foreground text-background` (active toggle btn) | inverted `--color-foreground`/`--color-background` | active state = solid dark chip, needs a real "active" token decision, currently just inverted fg/bg |
| `bg-primary text-primary-foreground` (Boost badge) | `--color-primary` (#c17a4e) | |
| `text-primary` (used oddly on the reject/X icon, which sits on a raw `bg-red-50 border-red-200`) | mismatch — **raw Tailwind red-50/red-200 used instead of a theme token**; no "danger/reject" token exists in the shared palette. Flag for resolution (map to `--color-accent`/a new `--color-danger`, or keep literal red). |
| `bg-secondary text-secondary-foreground` (Ajouter button, Vérifiée badge) | `--color-secondary` (#1f3a2e) | |
| `text-accent` / `border-accent` (message button) | `--color-accent-foreground` (#8a4a28) / `--color-accent` (#f3e4d9) — check contrast, message button uses accent as icon+border color, not the fill | |
| `text-secondary` (online dot) | `--color-secondary` | |
| gradient `from-black to-transparent` (photo name overlay) | not a token — raw black, standard photo-legibility gradient, keep as-is (no token needed) | |
| font-headings (name) | PT Serif | |
| default body text | DM Sans | |
| `text-xs`/`text-sm`/`text-xl` | scale xs 11 / sm 13 / xl 20 | matches given scale |
| `rounded-xl` / `rounded-lg` / `rounded-md` / `rounded-full` | given radii are sm 6/md 10/lg 16/xl 28 — Banani's `rounded-xl` (Tailwind default = 12px) does NOT match this theme's `--radius-xl` (28px). **Radius scale needs an explicit Tailwind config mapping**, not literal Tailwind utility names, or visuals will be off. |

## Responsive plan
Banani screen is desktop-only (`screenSize: 'desktop'`) and this raises the naming-collision + IA question head-on (see Open Questions — this is the central decision blocking implementation):

- Our existing **`/app/explorer`** already has BOTH a swipe deck (`SwipeCard.tsx`, mobile-first, drag-to-decide) and a grid (`ProfileGridCard.tsx`) behind a toggle, backed by `GET /api/profiles/explorer`.
- Banani's "Découvrir" screen is a desktop swipe-stack UI with a toggle pointing at an (uncaptured) grid mode — structurally this is **the same feature as `/app/explorer`**, just a different visual skin plus new desktop-only chrome (side panel, keyboard hints, stacked-card depth effect).
- Our existing **`/app/decouvrir`** route is currently the home DASHBOARD, unrelated in function to this Banani screen.
- Mobile breakpoint: this plan proposes the existing `SwipeCard.tsx` full-bleed mobile layout stays as the small-screen expression of whichever real route this design lands on, with the Banani desktop chrome (toolbar, side panel, keyboard hints) appearing at `md:`/`lg:` breakpoints only. This is a proposal, not a decision — depends on the open question below.

## Interactions / state
- View-mode toggle: swipe-stack ⇄ grid (segmented control, 2 states) — maps to existing explorer toggle state.
- "Filtres" button — opens a filter UI (drawer/modal implied, not shown open in this capture); existing explorer page already has filter chips inline, so this is a UX pattern change (chips → button-triggered panel) worth flagging, not just a restyle.
- Swipe actions: reject (X) / message (message-circle, opens chat directly from card) / like (“Ajouter”, secondary pill button)
- Favorite/star toggle (separate from like) — new persisted state needed if this is a real feature, not just decorative.
- Keyboard shortcuts: `←` = Passer (skip/reject), `→` = Ajouter (like) — desktop only.
- Progress indicator: "3 / 18 profils" + dot stepper — implies a bounded daily/session deck size, not infinite pagination; check against current `/api/profiles/explorer` pagination contract (is it bounded per day, or does the UI just show current-batch position?).
- "Modifier les filtres" button in side panel — same filter-entry-point question as the toolbar "Filtres" button; unclear if these are two triggers for the same UI or different scopes.
- "Mes stats du jour" is read-only display in this screen (no interaction wired), but implies backing data (daily like count, daily message count vs. cap tied to Premium).

## Copy (all French strings, verbatim)
- Filtres
- En avant
- En ligne
- Carine M., 34
- Vérifiée
- Kinshasa, RDC
- Célibataire
- Pharmacienne
- Ma vision du mariage
- Pour moi, le mariage c'est construire quelque chose de solide ensemble — respect, complicité et projets communs. Je cherche quelqu'un de vrai, pas d'illusion.
- Ajouter (appears twice: card action button + keyboard hint label)
- 3 / 18 profils
- Passer
- Filtres actifs
- Âge
- 28 – 42 ans
- Ville
- Kinshasa
- Statut
- Profil vérifié
- Oui
- Modifier les filtres
- Mes stats du jour
- Ajouts
- Messages envoyés
- Premium = messages illimités

## Implementation checklist
- [ ] Resolve the route-target open question (below) before writing any code
- [ ] Confirm Tailwind config maps custom radius scale (sm 6/md 10/lg 16/xl 28) — Banani's literal `rounded-xl`/`rounded-lg` utility usage does not match this theme's token values as authored
- [ ] Decide token/mapping for the reject (X) button's raw `red-50`/`red-200` classes — no danger/reject token in the shared palette
- [ ] Restructure `SwipeCard.tsx` overlay content to match: boost badge, star/favorite button, online dot, inline verified badge, status+job pill tags, "Ma vision du mariage" bio block
- [ ] Add stacked-cards-behind depth effect (2 decorative absolutely-positioned cards) to whichever component owns the swipe view
- [ ] Add desktop keyboard shortcuts (←/→) to swipe interaction, gated to `md:`/`lg:` (mobile keeps touch-drag only)
- [ ] Build "Filtres actifs" summary side panel (new component)
- [ ] Build "Mes stats du jour" side panel (new component) — blocked on data-source decision
- [ ] Reconcile "Filtres" button UX (implies drawer/modal) with existing inline filter chips on `/app/explorer`
- [ ] Clarify "favorite/star" vs existing "like" (`/api/likes`) — new feature or relabel?
- [ ] Clarify "Boost"/"En avant" as a feature (also appears in shared `TopNav` — cross-screen, not one-off)
- [ ] Confirm "3 / 18 profils" bounded-deck semantics against `/api/profiles/explorer` pagination
- [ ] Apply new theme tokens (terracotta/cream palette) globally per the shared token mapping — out of scope for this screen alone, tracked at the cross-screen level

## Open questions for user
1. **Naming/IA collision (blocking, flag prominently):** Banani's "Découvrir" screen is a browse/swipe-and-grid-toggle UI. Our app currently has:
   - `/app/decouvrir` — the home DASHBOARD (unrelated function)
   - `/app/explorer` — our actual browse screen, already has swipe deck (`SwipeCard.tsx`) ⇄ grid (`ProfileGridCard.tsx`) toggle, backed by `GET /api/profiles/explorer`

   Does this Banani screen's design get applied to **`/app/explorer`** (functional match — recommended, since the feature set lines up almost 1:1: swipe/grid toggle, filters, like/skip actions) or should it become a **new `/app/decouvrir` browse screen** (matching the literal name, but then what happens to the current home-dashboard content at that route, and what does `/app/explorer` become)? This decision affects routing, the current dashboard's fate, and every other Banani screen that references "Découvrir" nav state. **Do not proceed with implementation until this is settled.**
2. Is "Boost"/"En avant" a real feature we're building (paid visibility boost, also referenced in shared `TopNav`), or decorative-only for this design pass?
3. Is the star/"favorite" action on the card a new persisted feature distinct from the existing like system, or a relabel of it?
4. Does "Mes stats du jour" (daily Ajouts/Messages envoyés counts, tied to a Premium unlimited-messaging upsell) reflect a real planned feature (daily message cap for non-Premium users), or is it purely decorative for this design and should be stubbed/omitted?
5. Does "Filtres" button imply we're moving from the current inline filter-chip UX (on `/app/explorer`) to a drawer/modal, and if so, is "Filtres actifs" side panel + "Modifier les filtres" a second entry point to the same UI, or a different one?
6. Is "3 / 18 profils" a literal bounded daily deck size (e.g., 18 profiles/day for free tier), or just illustrative placeholder content?
