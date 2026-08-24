# Admin Dashboard — v3 fidelity pass (Banani `AdminDashboard.jsx`, flow `l_YkRVFXx5e9`)

## Source
- Re-fetched 2026-08-22 (same screen as the v2 merge and the color/icon pass — user says it still doesn't match: wants real member photos and the exact stats-tile look).

## Root causes found (diffing the fresh fetch against the live page)

1. **Avatars are fake.** Every row (Membres récents, File vérification) renders a plain initials circle. Banani's mock uses `UserAvatar` (its own illustration generator); the *real* equivalent in this codebase is `components/ui/UserAvatar.tsx` (real photo, initials fallback) — already used on every consumer-facing screen, never wired into the admin dashboard. `avatarUrl` is already selected/returned by `/api/admin/users`; `/api/admin/verification-queue` selects photo `id` but not the Cloudinary key, so it can't render a photo yet.
2. **KPI tiles are tinted, Banani's are solid.** Current `KPI_TONES` uses `bg-X/10` + `text-X` (pale badge). Banani's 4 tiles are solid fills: `bg-secondary/text-secondary-foreground`, `bg-primary/text-primary-foreground`, `bg-card/text-foreground` (plain), `bg-gold/text-gold-foreground`. Card 2 (Abonnés Premium) is literally `bg-primary` in Banani — the v2 pass deliberately kept it gold for thematic reasons; reverting to match, per this round's explicit fidelity ask.
3. **Chart series colors are wrong.** Banani: series 1 (Inscrits) = solid `bg-secondary` (dark green), series 2 (Abonnés) = `bg-primary` at 50%. Live page: series 1 = `bg-primary/80`, series 2 = `bg-gold/80` — no green anywhere in the chart, which is very likely the actual "colors don't look like Banani" complaint.
4. **Row/grid structure drift.** Banani's second row is a single 3-col grid: chart (`col-span-2`) + "Activité aujourd'hui" (`col-span-1`) side by side. The live page put the donut where quick-stats belongs (2-col grid) and pushed quick-stats into its own full-width row below. Donut has no Banani counterpart in this fetch (added last round, real data, kept) — gets its own row instead of stealing the chart row's second slot.
5. **Header is bare.** Banani's header has a date subtitle ("Vue d'ensemble") + a period pill + an Exporter action; live page is just an `<h1>`.
6. **Table column order/labels.** Banani: Membre | Ville | Inscrit le | Statut | Action. Live: Membre | Ville | Statut | Inscrit le, no Action.

## Decisions (flagged for veto, proceeding with these defaults)

- **Membres récents' "Action" column dropped**, not faked — there is no `/admin/membres/[id]` detail route to link to, and the existing "Voir tout" link already goes to `/admin/membres`. Adding a per-row link to the same list page would be a dead/confusing affordance. Column order still reflows to match Banani (Ville, Inscrit le, Statut).
- **"Ce mois" rendered as a static, non-interactive label** (same look, no `cursor-pointer`/handler) — no period-filtering exists in `/api/admin/stats/overview` and inventing a fake dropdown would be worse than the gap it "fixes".
- **"Exporter" is real**, not decorative — client-side CSV export of the currently-loaded `recentUsers`, no backend change needed.
- **Abonnés Premium KPI tile reverts primary→gold's opposite: goes back to matching Banani's literal `bg-primary`.** The v2 pass's "gold = Premium is our own convention" reasoning is overridden this round by the explicit "reproduce Banani exactly" ask.
- **Signalements KPI tile becomes Banani's static neutral (`bg-card` + border) instead of the dynamic red/green-by-count tone.** Same reasoning — literal match requested twice now.
- **Bad-direction KPI delta color switches from Tailwind `red-500` (not a theme token) to `text-primary`**, matching what Banani's own markup actually does (`up ? text-verified : text-primary`).

## Implementation checklist
- [ ] `api/admin/verification-queue/route.ts` — select `fileUpload.key` on the primary photo, return `photoUrl` via `cloudinaryUrlForKey`
- [ ] `admin/(dashboard)/page.tsx` — add `avatarUrl`/`photoUrl` to interfaces; swap initials `<span>` for `<UserAvatar>` in both row lists; rebuild header with date subtitle + Ce mois pill + real CSV Exporter; solid KPI tiles + corrected tone assignment; green/primary chart series + updated legend + title/subtitle text; regroup chart+quick-stats into one 3-col row, donut to its own row; reorder Membres récents columns, drop Action
- [ ] `components/ui/Icon.tsx` — add `download`
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test`, dev-server smoke check of `/admin`
