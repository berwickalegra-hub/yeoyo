# Demandes — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `l_YkRVFXx5e9/screens/DemandesScreen.jsx`
- screenName: "YeOyo — Demandes"
- Flow: "Rencontres Sérieuses Congo" (`l_YkRVFXx5e9`) — new fetch, 2026-08-13
- Desktop-only export

## Structure map
1. `TopNav` (shared component, `activeTab="demandes"`)
2. Container `max-w-3xl mx-auto px-6 py-8`
3. Page header: h1 "Demandes" + heart icon (secondary, 60% opacity) + subtitle "Gère tes demandes et contacts"; right-aligned outlined "Découvrir" button (search icon) linking back to browse
4. Tabs (segmented control, `bg-card border rounded-xl p-1`): **Reçues** (inbox icon, count badge, active/secondary-filled), **Envoyées** (send icon, count badge), **Contacts** (users icon, count badge) — only the active tab's list renders (mock has `recues`/`envoyees`/`contacts` arrays defined but JSX only maps `recues`)
5. Request list (Reçues, active tab shown): cards per request — avatar (56px) + online-status dot, name+age+"Nouvelle" badge (heart icon) if `isNew`, city (map-pin) + relative time (clock), chevron-right affordance, then a 2-button row: outlined "Refuser" (x icon) / filled secondary "Accepter" (check icon)
6. Bottom upsell banner: crown icon chip + "Booste ton profil pour plus de demandes" / "Les membres Premium reçoivent 3× plus de demandes à Kinshasa" + gold "Découvrir Premium" CTA

## Component breakdown
- **REUSE, restyle only** — this is the closest 1:1 match of all 5 screens to what already exists: `frontend/src/app/app/demandes/page.tsx` already has a 3-tab (Reçues/Envoyées/Contacts) structure with counts, added in the 2026-08-07 "4-screen design-fidelity pass." `ContactRequestCard.tsx` already renders avatar+name+age+city+delay+Accepter/Refuser — needs restyling to new tokens/radii/fonts, not rebuilding.
- **DROP vs. existing**: the current page also has a right-side "Comment ça marche" explainer panel (3 steps + Premium upsell) that Banani's version doesn't show — Banani's is a single centered column, no side panel. Decide: keep the existing explainer panel (real, useful content) even though Banani dropped it, or match Banani exactly and remove it.
- **NEW `TopNav`-equivalent**: depends on the cross-screen nav decision (see Accueil's plan) — this screen's Banani source uses `TopNav`, not our `Sidebar`/`MobileTabBar`.
- **PRIMITIVE**: `Icon` needs `inbox`, `send`, `heart`, `x`, `check`, `crown`, `search`, `chevron-right`, `clock`, `map-pin` — all already present in the project's `Icon.tsx` per STATUS.md history.

## Token mapping
| Banani token | Project token (new theme) |
|---|---|
| `bg-secondary`/`text-secondary-foreground` (active tab, Accepter button, "Nouvelle" badge) | `--color-secondary: #1f3a2e` / `#ffffff` |
| `bg-muted` (inactive badge bg) | `--color-muted: #f1eae2` |
| `bg-accent`/`text-accent-foreground` (upsell banner) | `--color-accent: #f3e4d9` / `#8a4a28` |
| `border-border` | `--color-border: #e8dfd6` |
| `rounded-xl`/`rounded-lg` | `--radius-xl: 28px` / `--radius-lg: 16px` (verify against existing Tailwind scale — this theme's `xl` is unusually large at 28px) |
| `font-headings` (h1, names) | PT Serif |
| body text | DM Sans |

## Responsive plan (mobile-first mandatory, Banani screen is desktop-only)
- **Base (375px)**: header stacks (title block above the "Découvrir" button, or button becomes icon-only); tabs stay a 3-up segmented row (already compact); request cards unchanged (already stack naturally); Refuser/Accepter buttons stay 50/50 (already touch-friendly ≥44px); upsell banner stacks icon+text above the CTA button instead of a single row.
- **sm/md**: header returns to a single row once width allows.
- **lg (1024px)**: full Banani fidelity, `max-w-3xl` centered column, header single row.
- Existing page already has most of this responsive behavior from the prior mobile pass — likely only token/spacing changes needed, not structural rework.

## Interactions / state
- Tab switch: client-side, same as existing (`useState` active tab), wire to real `GET /api/contact-requests?type=received|sent` (unchanged) and the existing merged-ACCEPTED "Contacts" tab logic.
- Refuser/Accepter → existing `POST /api/contact-requests/[id]/respond` (ACCEPT/DECLINE) — no change needed, already wired.
- "Découvrir" header button → routes to whichever route wins the Découvrir/Explorer naming decision (see cross-screen open questions).
- Empty state: Banani doesn't show one — existing page's empty states (if any) should be kept, restyled.

## Copy (French strings, verbatim)
"Demandes", "Gère tes demandes et contacts", "Découvrir", "Reçues", "Envoyées", "Contacts", "Nouvelle", "Refuser", "Accepter", "Booste ton profil pour plus de demandes", "Les membres Premium reçoivent 3× plus de demandes à Kinshasa", "Découvrir Premium", relative-time strings ("Il y a 2 heures", "Il y a 1 jour", etc.), "En attente", "Vue", "Connectée il y a 1h".

## Implementation checklist
- [ ] Confirm nav decision (TopNav vs. Sidebar/MobileTabBar) before restyling this page's shell
- [ ] Decide: keep existing "Comment ça marche" side panel or drop to match Banani exactly
- [ ] Apply new theme tokens/fonts/radii to `demandes/page.tsx` + `ContactRequestCard.tsx`
- [ ] 375 / 768 / 1280 review
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

## Open questions for user
- Keep the existing "Comment ça marche" explainer panel (real content, not in Banani's mock) or drop it to match Banani 1:1?
- This screen is the lowest-risk of the 5 — mostly a token/restyle pass once the nav-shell decision is made. No blocking ambiguity beyond the shared cross-screen questions (nav shell, theme-wide rollout).
