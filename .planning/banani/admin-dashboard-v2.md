# Admin Dashboard v2 — Banani → Next.js/Tailwind

## Source
- Banani flow: "Rencontres Sérieuses Congo" (`l_YkRVFXx5e9`) — same in-progress flow tracked in STATUS.md
- Screen: `AdminDashboard.jsx` ("YeOyo — Admin Dashboard"), desktop-only
- Fetched: 2026-08-20
- User clarified (chat): "un formulaire" was a mislabel — the screen is a Dashboard, not a form. User wants Banani's new visual design **merged into**, not replacing, the existing real-data dashboard at `frontend/src/app/admin/(dashboard)/page.tsx`.

## Why merge, not replace
The already-shipped dashboard (`frontend/src/app/admin/(dashboard)/page.tsx`, `frontend/src/app/api/admin/stats/overview/route.ts`) is wired to real Prisma data and has features this new Banani export doesn't know about (donut member breakdown, the audit-log "Activité récente" feed). Banani's sidebar (`AdminDashboard.jsx`'s `navItems`: Support/Abonnements/Administration as flat top-level items) is also older/different from the real `AdminSidebar.tsx`, which already has working links this export doesn't show (Rôles admin, 2FA — built this session). Replacing wholesale would regress shipped, working features. **Recommendation: keep `AdminSidebar.tsx` untouched; only rebuild the Dashboard page's main content to adopt Banani's new visual pieces, additively.**

## Structure map (Banani → what changes)
- **KPI row** (4 cards, icon + value + trend delta) — we already have 4 real KPI cards (Membres totaux/Abonnés Premium/Signalements/Revenus). Banani adds a colored icon tile + up/down trend delta per card. Real month-over-month delta is computable (compare current vs. prior calendar month for each KPI) — not fabricated.
- **Bar chart "Nouvelles inscriptions"** — Banani's version is **dual-series** (Inscrits vs Abonnés, 12 months). We already have single-series `signupsByMonth`. Needs one new grouped query: `Subscription` rows by `date_trunc('month', createdAt)`, excluding `provider: 'admin-grant'` (same exclusion the KPI already applies).
- **Donut "Répartition membres"** — not in this Banani export at all (replaced by "Activité aujourd'hui" in their mock). **Kept** (existing real feature) — placed alongside rather than removed.
- **"Activité aujourd'hui" quick-stats block** (new) — 5 rows, each needs a real *today-scoped* count:
  - Nouvelles inscriptions → `User.count({ createdAt: { gte: today } })`
  - Messages envoyés → `Message.count({ createdAt: { gte: today } })`
  - Matchs créés → `Conversation.count({ createdAt: { gte: today } })` (a Conversation is created exactly when a contact request is accepted — the closest real concept to "match" in this schema)
  - Comptes suspendus → `AdminAction.count({ action: 'user.suspend', createdAt: { gte: today } })` (confirmed action name in `api/admin/users/[id]/status/route.ts:105`)
  - Abonnements payés → `Order.count({ status: 'PAID', updatedAt: { gte: today } })`
- **"Membres récents" table** — currently a list of rows; Banani shows an actual `<table>` with a **Ville** column. `USER_SELECT` in `api/admin/users/route.ts` doesn't select `Profile.commune` today — needs a join/include. Table columns: Membre (avatar+name), Ville, Inscrit le, Statut, Action (Voir → `/admin/membres?...` or profile link).
- **Signalements panel** — currently a static count line ("0 signalement(s) en attente"); Banani shows real rows (severity dot, reporter → target, reason, time). `GET /api/admin/reports` already returns exactly this shape (`reporter`/`target`/`reason`/`createdAt`) — just needs to be fetched and rendered on the dashboard. **Flagged departure**: Banani's severity dot (red=high/gold=medium) has no backing field on `Report` — no severity concept exists in the schema. Will render a single neutral dot rather than fabricate a severity classification.
- **File vérification panel** — same situation: currently just a count; `GET /api/admin/verification-queue` already returns real rows (firstName/age/photoCount/waitingSince). **Flagged departure**: Banani's "type" column (Selfie + ID / ID uniquement) has no backing field — verification here is admin-manual-approval with no submission-method tracking. Will show `photoCount` instead (real data) rather than fabricate a type.
- **"Activité récente" (audit log)** — existing feature, not in this Banani export. **Kept as-is**, placed below the new panels.

## Component breakdown
- **MODIFY** `frontend/src/app/admin/(dashboard)/page.tsx` — restructure layout, add new sections
- **MODIFY** `frontend/src/app/api/admin/stats/overview/route.ts` — add subscription-by-month series, 5 "today" counts, KPI deltas
- **MODIFY** `frontend/src/app/api/admin/users/route.ts` — add `commune` to `USER_SELECT` (join `Profile`)
- **REUSE** `GET /api/admin/reports`, `GET /api/admin/verification-queue` — fetched fresh on the dashboard (both already `requireAdmin('MODERATOR')`, consistent with dashboard access)
- **REUSE** `Icon`, `UserAvatar` — no new primitives needed, same tokens (`--color-primary`/`--color-gold`/`--color-verified`) already in `globals.css`

## Token mapping
No new tokens — this project's `globals.css` already carries every color Banani's export references (`--color-primary`, `--color-secondary`, `--color-gold`, `--color-verified`, `--color-card`→mapped to `--color-surface` per the existing project convention). No `@theme` changes needed.

## Responsive plan
Banani's export is desktop-only (no `sm:`/`md:`/`lg:` prefixes — consistent with every other admin screen per STATUS.md's responsive-pass entry). The existing dashboard is already responsive (`AdminSidebar` collapses to a drawer below `lg`, content padding `p-4 md:p-6 lg:p-8`). New sections follow the same pattern already established:
- **Base (375px)**: KPI cards stack 1-column, "Activité aujourd'hui" and the two panels (Signalements/Vérification) stack full-width, table becomes horizontally scrollable inside its own `overflow-x-auto` wrapper (never breaks page layout)
- **md (768px)**: KPI cards 2-column, chart/donut/activité-aujourd'hui in a 2-col grid
- **lg (1024px+)**: matches Banani's desktop layout — KPI cards 4-across, chart+quick-stats 2/3+1/3 split, table+panels 2/3+1/3 split

## Interactions / state
- Table rows: hover background, "Voir" links to `/admin/membres?search=<email>` (no per-user detail page exists yet — same precedent as the existing list view's row links)
- Signalements/Vérification panel rows: link into `/admin/signalements` / `/admin/verification` respectively (existing pages) rather than inline actions on the dashboard itself
- Loading/empty states: dashboard already has a `Chargement…` gate on `!overview`; new panels reuse the same `!loading` pattern, empty states get a short "Aucun signalement en attente." / "Aucun profil en attente." line (matches existing copy conventions in `visiteurs`/`favoris` pages)

## Copy / i18n
All French, matching existing dashboard copy conventions. No new strings need `constants.ts` (this page's copy is inline, matching the existing dashboard's own convention — not extracted anywhere else in the admin surface either).

## Implementation checklist
- [ ] `api/admin/stats/overview/route.ts`: add subscription-by-month query, 5 today-counts, prior-month KPI deltas
- [ ] `api/admin/users/route.ts`: include `Profile.commune` in the response
- [ ] `admin/(dashboard)/page.tsx`: KPI cards gain icon tile + delta; add dual-series bar chart; keep donut; add "Activité aujourd'hui" panel; convert Membres récents to a `<table>` with Ville; expand Signalements/Vérification into real row lists; keep Activité récente feed
- [ ] 375px check — table scrolls horizontally, no page-level overflow
- [ ] 768px / 1280px checks against Banani's layout
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
- [ ] Update `STATUS.md`

## Open questions for user
1. **KPI trend deltas** ("+3.2%", "-2 hier") — compute real prior-month comparisons (adds a few more queries), or skip the delta line for now and keep just the 4 numbers?
2. **Severity/type fabrication** — confirmed above we will NOT invent severity or verification-type data; flagging in case you actually want those as new real fields later (separate task).
3. Is `/admin/membres?search=<email>` an acceptable "Voir" target for a table row, or do you want a dedicated per-user detail page (bigger, separate task)?
