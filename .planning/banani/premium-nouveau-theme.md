# Premium — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `l_YkRVFXx5e9/screens/PremiumScreen.jsx`
- screenName: "YeOyo — Premium"
- screenSize: `desktop` (Banani exported desktop-only; no mobile variant provided)
- Fetched: 2026-08-13, part of this session's batch fetch of the "Rencontres Sérieuses Congo" flow (screens still branded "YeOyo")

## Structure map
Top to bottom, `PremiumScreen.jsx`, wrapped in `max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8` under `TopNav activeTab="premium"`:

1. **Hero pitch** — centered, bordered-bottom section: `shield-check` pill badge "Sérieux, vérifié à la main" → `h1` (PT Serif, 3xl) "Jos, ta future moitié t'attend. Ne la rate pas." (name "Jos" is hardcoded, not templated) → muted subtitle paragraph → 3-stat row (3× plus de réponses / 50 000+ profils vérifiés / 100% profils contrôlés) separated by vertical dividers.
2. **Plan selection card** — white card, header "Choisis ta durée" + subtitle "Plus c'est long, plus tu économises", then a vertical list of 4 plan rows (see pricing table below), each with: floating boost badge (top-right, "+N boost(s)"), radio circle, label + "Populaire" pill (if popular) + discount pill, per-month price line, right-aligned old price (strikethrough) + new price. Below the list: dashed-border "J'ai un code promo" button.
3. **Payment method section** — heading "Comment veux-tu payer ?" + 2-column grid of two selectable method cards: **Mobile Money** (selected/highlighted, smartphone icon, badges Airtel/Orange/M-Pesa) and **Carte bancaire** (credit-card icon, badges Visa/MC).
4. **Total + CTA card** — "Total à payer" row with amount (hardcoded "11 000 CDF", matching the '1m' plan's price, not derived from a "selected" state binding), full-width gold/accent "Devenir membre Premium" button (crown icon), footer micro-row: "Activation instantanée" (zap) · "Annulable à tout moment" (x-circle).
5. **Features unlocked card** — heading "Ce que Premium débloque pour toi", vertical list of 6 feature rows (icon tile + bold label [+ "Nouveau" pill on one] + muted description, right side "Bloqué" strikethrough → "Débloqué" pair).
6. **Testimonial card** — accent-tinted, "Histoires vraies" pill + heading "Ils ont trouvé leur moitié" + inner white card: "3 semaines" chip + "Marié" pill, italic quote, attribution "Emmanuel K. · Kinshasa · Marié en janvier 2025", 5-dot carousel indicator (static, first dot active).
7. **FAQ card** — heading "Questions fréquentes", 6-row accordion-look list (question + chevron-down), no expand/collapse logic in source (purely visual, static).
8. **Trust footer card** — 2 rows: shield-check tile "Paiement 100% sécurisé" / "YeOyo & PayTech certifiés"; user-check tile "Profils vérifiés manuellement" / "Notre équipe valide chaque inscription".

No comparison table (free vs premium feature matrix) in this Banani screen — that concept only exists in the current app's `/app/premium/page.tsx`.

## Component breakdown

**NEW components needed** (not in Banani's shared bundle, must be built as real TSX):
- `PremiumHero` — pitch header + 3-stat row.
- `PlanSelectionCard` — plan-row list with boost badge, radio, discount pill, price block (structurally different from the current app's clickable 3-card grid — this is a vertical radio-list, not a grid of cards).
- `PaymentMethodPicker` — 2-card grid (Mobile Money / Carte bancaire), visually distinct from the current app's `<select>` dropdown.
- `PremiumTotalCta` — total row + CTA button + reassurance micro-copy.
- `FeaturesUnlockedList` — icon + label/desc + locked→unlocked pair rows.
- `PremiumTestimonialCard` — quote card with carousel dots (static, no real carousel logic in source).
- `PremiumFaqList` — static Q&A row list (visual accordion, no expand state wired).
- `TrustFooterCard` — 2-row certification blurb.

**REUSE from existing project** (real files, need Banani-visual restyle, not rebuild from scratch):
- `frontend/src/app/app/premium/page.tsx` — CURRENT premium/checkout page is the direct target for replacement. It already wires `GET /api/subscriptions/plans`, `GET /api/subscriptions/me`, `POST /api/subscriptions/checkout`, and an "already Premium" branch — that data-fetching/submit logic should be REUSED, only the JSX/visual layer gets replaced.
- `frontend/src/lib/server/subscriptions/plans.ts` — the real plan catalog. **Major shape mismatch, see below.**
- `frontend/src/components/ui/Icon.tsx` — Lucide wrapper (uses `name=` prop, not Banani's `i=`); missing icon names needed here: `tag` (promo code button), `x-circle` (annulable footer), `user-check` (trust footer) — all present in `lucide-react` but not yet in the `ICONS` map. Already mapped: `heart`, `eye`, `message-circle`, `clock`, `trending-up`, `crown`, `shield-check`, `smartphone`, `credit-card`, `zap`, `chevron-down`.
- `frontend/src/app/app/premium/pending/page.tsx` — untouched by this screen; CTA still routes to the same pending/poll flow.

**PRIMITIVES**: icon-in-tinted-square tile (repeated across features list, trust footer — same pattern flagged in the Accueil plan, worth extracting as a shared `IconTile`), pill/badge (discount, "Populaire", "Nouveau", "Marié"), radio circle, divider.

### PRICING/PLAN-SHAPE MISMATCH (flag, do not silently reconcile)

Banani's static `plans` array (4 plans, priced directly in CDF, no USD layer):

| id | label | duration | discount | price | oldPrice | perMonth | boost | popular/selected |
|---|---|---|---|---|---|---|---|---|
| `15j` | Premium 15 Jours | 15 days | -20% | 16 000 CDF | 20 000 | 15 000 CDF/mois | +1 boost | no |
| `1m` | Premium 1 Mois | 1 month | -40% | 11 000 CDF | 18 000 | 11 000 CDF/mois | +3 boosts | **yes (default selected)** |
| `3m` | Premium 3 Mois | 3 months | -33% | 24 000 CDF | 36 000 | 8 000 CDF/mois | +3 boosts | no |
| `6m` | Premium 6 Mois | 6 months | -49% | 33 000 CDF | 72 000 | 5 500 CDF/mois | +6 boosts | no |

Current `frontend/src/lib/server/subscriptions/plans.ts` catalog: 3 plans (`monthly`=1mo, `semiannual`=6mo, `annual`=12mo), priced in **USD cents** with a fixed display-only USD→CDF rate (`USD_TO_CDF_DISPLAY_RATE = 2500`), default-selected plan in the page is `semiannual`. This is a **different plan count (3 vs 4), different periods (no 15-day or annual tier; Banani has no 12-month plan at all), different currency model (CDF-native vs USD-with-display-conversion), different discount math, and a different default selection**. The "Total à payer" CTA amount is also hardcoded in the Banani source to the `1m` plan's price rather than reactively bound to whichever plan is selected — this is a static mockup, not live state.

## Token mapping (Banani token → project token)

| Banani token | Value | Maps to project (Tailwind v4 `@theme`) |
|---|---|---|
| `--color-background` | #fdfbf8 | `background` |
| `--color-foreground` | #1A1208 | `foreground` |
| `--color-border` | #e8dfd6 | `border` |
| `--color-primary` | #c17a4e | `primary` (used for Mobile Money selected-card border/tile) |
| `--color-primary-foreground` | #ffffff | `primary-foreground` |
| `--color-secondary` | #1f3a2e | `secondary` (used for "Populaire"/"Nouveau"/"Marié" pills) |
| `--color-secondary-foreground` | #ffffff | `secondary-foreground` |
| `--color-accent` | #f3e4d9 bg / #8a4a28 fg | `accent` / `accent-foreground` (dominant color of this screen: hero badge, selected-plan border+radio, discount pill, CTA button, testimonial card, FAQ/features accents) |
| `--color-muted` | #f1eae2 | `muted` (unselected boost badges, unselected payment tile icon bg) |
| `--color-muted-foreground` | #7A6B52 | `muted-foreground` |
| `--color-card` | #FFFFFF | `card` |
| `--color-verified` | #2D6A4F | not directly referenced by class name in source, but semantically matches the "Débloqué" secondary-colored text — confirm vs `secondary` |
| radii | sm6/md10/lg16/xl28 | this screen's cards mostly use `rounded-xl` (16px = `lg`); promo-code button and CTA also `rounded-xl`/`rounded-lg` |
| font body | DM Sans | replaces current Inter |
| font headings | PT Serif | used on `h1`, all `h2`/`h3` section titles |
| text scale | 3xl32 (hero h1), lg17 (card h2), base15 (card h3), sm13 (body/labels), xs11 (micro-copy, pills) | consistent with the shared theme scale already defined in the Accueil plan |

Non-palette colors present in source (payment badges only, likely intentional brand-color exceptions, not theme tokens): `bg-red-500`/`bg-orange-500`/`bg-green-600` (Airtel/Orange/M-Pesa), `bg-blue-700`/`bg-red-600` (Visa/MC) — these are literal Tailwind color utilities in the mockup, not `--color-*` tokens; decide whether to keep as hardcoded brand chips or formalize as tokens.

This is a full theme replacement, same as the Accueil screen — no separate decision needed here if the global swap is already approved.

## Responsive plan (mobile-first mandatory, Banani screen is desktop-only)

- **Base (375px, mobile)**: single column throughout (source is already single-column `max-w-2xl`, so most of the JSX ports directly). Reduce padding (`px-6`→`px-4`, `py-8`→`py-5`). Hero 3-stat row: keep horizontal (3 items fit on mobile) but shrink font/gap. Plan rows: stack price block below label on very narrow screens if `flex items-center gap-4` overflows — test at 375px, may need `flex-wrap`. Payment method grid: keep `grid-cols-2` (both cards are narrow enough) or drop to `grid-cols-1` if badges wrap awkwardly.
- **sm (≥640px)**: as base, more breathing room.
- **md (≥768px)**: source layout (`max-w-2xl mx-auto`) already reads as a mobile-first-friendly single column even at desktop — this screen doesn't need a true desktop-only layout change the way Accueil's 2-column dashboard does.
- **lg/xl (≥1024px/1280px)**: cap at `max-w-2xl`, centered, matches Banani source as-is.
- TopNav: same open question as other screens — desktop-only source, needs a mobile nav story (`MobileTabBar` fallback).

## Interactions / state (map each CTA to the real existing checkout flow)

- **Plan selection rows** → map to existing `selectedPlanId` state + `onClick={() => setSelectedPlanId(plan.id)}` pattern already in `frontend/src/app/app/premium/page.tsx` (currently a card grid; becomes a radio-row list). Radio circle fill = `selectedPlanId === plan.id`.
- **"J'ai un code promo" button** → NEW concept, no promo-code field/endpoint exists in the current checkout flow (`POST /api/subscriptions/checkout` body is just `{ planId, paymentMethod }`). Do not invent a promo-code backend — either omit this button for v1 or flag as a follow-up feature.
- **Payment method cards (Mobile Money / Carte bancaire)** → Mobile Money maps to the existing `PAYMENT_METHODS` (`M_PESA` / `AIRTEL_MONEY` / `ORANGE_MONEY`) collapsed into one selectable tile instead of a dropdown of 3 separate options — needs a UX decision (see open questions). **Carte bancaire (Visa/MC) has no backend equivalent today** — the stub payment provider (`lib/server/payments/stub.ts`) and `PAYMENT_METHODS` list only cover Mobile Money operators; card payment is a new payment path not yet modeled.
- **"Devenir membre Premium" CTA** → maps directly to the existing `checkout()` handler → `POST /api/subscriptions/checkout` → `router.push('/app/premium/pending?orderId=...')`. Do not invent a new flow; only restyle the button.
- **"Total à payer" amount** → must become reactively bound to `selectedPlan` (via `plans.find(...)`), not hardcoded like the Banani mock.
- **FAQ rows** → visual only in source (no `onClick`/expand state); if kept as an accordion, needs real expand/collapse state added (not in scope of the mock).
- **Testimonial carousel dots** → static in source (no click handlers, no rotation logic); either ship as static single-card display or add real carousel state (new feature, not in mock).
- **"Already Premium" state** → existing page already handles this via `GET /api/subscriptions/me` (`subscription.status === 'ACTIVE'`) with its own branch UI; Banani's mock doesn't show this state at all — REUSE the existing branch, just restyle it to match new tokens.

## Copy (all French strings, verbatim)

- "Sérieux, vérifié à la main"
- "Jos," / "ta future moitié t'attend." / "Ne la rate pas."
- "Sans Premium, ton profil reste noyé. Avec Premium, tu apparais en premier, tu vois qui s'intéresse à toi, et tu réponds sans limite."
- "plus de réponses" (3×)
- "profils vérifiés" (50 000+)
- "profils contrôlés" (100%)
- "Choisis ta durée"
- "Plus c'est long, plus tu économises"
- "Premium 15 Jours" / "Premium 1 Mois" / "Premium 3 Mois" / "Premium 6 Mois"
- "Populaire"
- "+1 boost" / "+3 boosts" / "+6 boosts"
- "J'ai un code promo"
- "Comment veux-tu payer ?"
- "Mobile Money" / "Airtel" / "Orange" / "M-Pesa"
- "Carte bancaire" / "Visa" / "MC"
- "Total à payer"
- "Devenir membre Premium"
- "Activation instantanée"
- "Annulable à tout moment"
- "Ce que Premium débloque pour toi"
- "Vois qui t'a mis en favori" / "Découvre toutes les personnes qui te trouvent intéressant(e)."
- "Découvre qui te repère" / "Identifie en un clic qui visite ton profil. Fini les doutes."
- "Contacte sans limite" / "Tu as flashé sur un profil ? Écris-lui maintenant, sans attendre demain." / "5/jour"
- "Vois qui est connecté" / "Repère les profils actifs en temps réel. Écris au bon moment." / "Nouveau"
- "Sois vu(e) en premier" / "Ton profil apparaît en tête de recherches. Plus de visibilité."
- "Boosts de profil inclus" / "Propulse ton profil en première position pendant 24h."
- "Bloqué" / "Débloqué"
- "Histoires vraies"
- "Ils ont trouvé leur moitié"
- "3 semaines" / "Marié"
- "\"YeOyo na biso — ici c'est du sérieux. En 3 semaines, profil vérifié, premier message, et maintenant on parle mariage. Merci YeOyo.\""
- "Emmanuel K. · Kinshasa · Marié en janvier 2025"
- "Questions fréquentes"
- "Quels modes de paiement sont acceptés ?"
- "Mon paiement est-il sécurisé ?"
- "Puis-je annuler mon abonnement ?"
- "Comment fonctionne le renouvellement ?"
- "Combien de temps pour voir des résultats ?"
- "Puis-je faire confiance à YeOyo ?"
- "Paiement 100% sécurisé" / "YeOyo & PayTech certifiés"
- "Profils vérifiés manuellement" / "Notre équipe valide chaque inscription"

## Implementation checklist

- [ ] Confirm scope: reuse this plan file's decisions alongside the Accueil global theme swap (same `@theme` tokens, DM Sans/PT Serif)
- [ ] Reconcile plan catalog: decide 3-tier (current) vs 4-tier (Banani: 15j/1m/3m/6m) — see open questions
- [ ] Update `frontend/src/lib/server/subscriptions/plans.ts` if plan count/periods change (breaking change to `SubscriptionPlan['id']` union and any callers)
- [ ] Restyle `frontend/src/app/app/premium/page.tsx` layout: card-grid → vertical radio-row list for plans
- [ ] Build `PaymentMethodPicker` (2-tile grid) replacing the `<select>` dropdown; decide Mobile Money sub-operator selection UX
- [ ] Decide fate of "Carte bancaire" — new payment path (needs provider support) or drop for v1
- [ ] Decide fate of "J'ai un code promo" — omit or scope as new feature (no backend today)
- [ ] Bind "Total à payer" to `selectedPlan`, not hardcoded
- [ ] Build `FeaturesUnlockedList`, `PremiumTestimonialCard` (static), `PremiumFaqList` (static or real accordion), `TrustFooterCard`
- [ ] Extend `Icon.tsx` ICONS map: `tag`, `x-circle`, `user-check`
- [ ] Decide fate of the existing comparison table (free vs premium) — not present in Banani mock, keep, drop, or relocate
- [ ] Wire mobile-first responsive breakpoints (mostly direct port given `max-w-2xl` single-column source)
- [ ] Preserve existing "already Premium" branch logic, restyle only

## Open questions for user

1. **Plan catalog reconciliation (highest priority)**: Banani shows **4 plans** (15 jours/1 mois/3 mois/6 mois, priced natively in CDF, default-selected = 1 Mois) vs the current app's **3 plans** (Mensuel/6 Mois/Annuel, priced in USD cents with a display-only CDF conversion, default-selected = 6 Mois). Do we adopt Banani's 4-tier CDF-native pricing as the new source of truth (dropping the annual plan, adding a 15-day plan, repricing everything), or keep the existing 3-tier USD catalog and only restyle visually (in which case the plan-row UI needs to show 3 rows, not 4, and copy needs different labels/discounts)? This is a real business-pricing decision, not just a visual one.
2. **Payment methods**: Banani adds a **"Carte bancaire" (Visa/MC) option** with no backend equivalent — current payment methods are Mobile Money operators only (`M_PESA`/`AIRTEL_MONEY`/`ORANGE_MONEY`) via a stub provider. Do we scope card payments in (needs a real provider decision, e.g. Stripe per the `izisaas-payments-handler` skill) or drop the card tile and keep Mobile Money as the only method for v1?
3. **New static-only concepts with no backend**: promo code field, FAQ accordion (visual only, no expand logic in source), testimonial carousel (static dots, no rotation) — ship as inert/static visual dressing, or build real functionality behind them? None of these have any server-side support today.
