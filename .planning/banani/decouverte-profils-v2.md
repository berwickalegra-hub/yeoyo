# Découverte Profils — Banani → Next.js (re-fetch, v2)

## Source
- Banani screen ID: `alMLvZczLcpt/screens/YeOyoDecouverteDesktop.jsx`
- Fetched: 2026-08-07 (re-fetch — original Phase C fetch on 2026-07-30 built a
  single-profile-only layout; this fetch shows the actual screen is a
  **grid of many profiles + a right-hand "Profil du jour" panel**, not a
  standalone single-card screen. Phase C's implementation diverged from the
  real mockup — this is a correction, not a redesign.)

## Decisions confirmed with user (2026-08-07)
1. **Card CTA stays "Envoyer un message"** (opens chat instantly), not
   Banani's "Voir le profil" — no full profile-view page exists yet and the
   message-first flow was just built + tested. Button text/action diverges
   from Banani; spacing/typography still matches (`font-headings
   font-semibold text-sm py-2.5`, full width, no icon).
2. **Search box stays decorative**, matching Banani exactly (static box, no
   filtering logic, no state).
3. **"Filtres" button toggles a panel** reusing Explorer's existing filter
   controls (âge / religion / enfants) — duplicated locally in this page
   rather than extracted into a shared component, since Explorer's own
   panel is out of scope for this task and touching it risks an unrelated
   regression.

## Structure map
- Top bar: title + subtitle (left) — decorative search box + "Filtres"
  toggle button (right)
- Filter panel (NEW, toggled): age range, religion multi-select, enfants —
  same fields/logic as Explorer's panel, applied to local `filters` state
- Chip row: Tous / Femmes / Hommes / Mariage rapide / Kinshasa-Gombe /
  Chrétien(ne) — real filters (gender, intent, commune, religion) — plus a
  right-aligned live counter ("`{total}` profils actifs")
- Grid: `ProfileDetailCard` × N, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
  gap-5`, backed by `GET /api/profiles/explorer` (already supports
  gender/commune/religion/ageMin/ageMax/intent/childrenCount — no backend
  change needed)
- "Voir plus de profils" load-more button (same pattern as Explorer)
- Right panel (`lg:w-72 lg:border-l`, stacks full-width below the grid on
  mobile/tablet): "Profil du jour" header + one `ProfileDetailCard` +
  compatibility score card, backed by `GET /api/profiles/discover`
  (unchanged, already built in Phase C)

## Component changes
- **`ProfileDetailCard.tsx`** (reused for both grid + right panel, exactly
  as Banani's source does): button styling aligned to Banani
  (`font-headings font-semibold py-2.5`, no icon); everything else
  (photo 220px cover, top-left verified badge, top-right heart-on-image,
  name/age + location row, job, intent, tags) already matched Banani from
  Phase C — no structural change needed there.
- **`decouvrir/page.tsx`** — full rebuild of the page shell (topbar, chips,
  grid, load-more, right panel) reusing Explorer's already-established
  patterns (chip toggle logic, filter panel fields, pagination) rather than
  inventing new ones.
- No new icons needed (`search`, `sliders-horizontal`, `users`,
  `refresh-cw`, `check`, `map-pin`, `gem`, `heart` all already in `Icon.tsx`).

## Responsive plan
- **Base (375px)**: header stacks title above the search+filtres row;
  chips wrap (`flex-wrap`); grid is 1 column; right panel renders as a
  full-width block *below* the grid+load-more (not hidden — it's real
  content, just not side-by-side on a narrow screen).
- **sm (640px+)**: grid becomes 2 columns.
- **lg (1024px+)**: grid becomes 3 columns; right panel becomes a true
  `w-72` right column with `border-l`, matching Banani's desktop mockup
  exactly.

## Verification
- `pnpm typecheck && pnpm lint && pnpm test`
- Dev-server smoke check + live curl against `/api/profiles/explorer` and
  `/api/profiles/discover` with a real fixture session
