# Landing Page (2nd redesign) — Banani → Next.js/Tailwind

## Source
- Flow: "Rencontres Sérieuses Congo"
- Screen ID: `l_YkRVFXx5e9/screens/LandingPage.jsx`
- Screen name: "YeOyo — Landing Page"
- `displayName`: `'YeOyo — Landing Page'`, `screenSize`: `'desktop'` (desktop-only export, no mobile companion this round)
- Raw JSX source captured in tool-results file (offset 35) from `mcp-banani-banani_get_selected_designs-1786601743961.txt`
- This is the app's **second** from-scratch Banani landing redesign. The first (`.planning/banani/landing-brand-new.md`, flow/fetch unrelated — screen `alMLvZczLcpt/screens/YeOyoLandingDesktopAlt.jsx`) shipped 2026-08-13 and became the sitewide default "light-blue" theme. This plan is for a *different* Banani fetch with a warm terracotta/cream/PT-Serif palette — see the open question below on whether it should supersede light-blue as the new sitewide default.

## Structure map (section by section)
1. **Header** — `bg-card`, bottom border. Left: 8×8 primary-bg rounded-md logo box with `heart-handshake` icon + "YeOyo" wordmark (PT-Serif bold). Center nav (plain text, no active-state styling): Accueil, Comment ça marche, Tarifs, FAQ, Contact. Right: single outlined "Se connecter" pill (border-primary, text-primary) — **no second/primary CTA in the header**, unlike the current nav's login+"Rejoindre" pair.
2. **Hero** — 2-col, text left / image right, `pt-20 pb-24`. Eyebrow pill (`map-pin` icon) "Fait pour les Congolais sérieux". H1 3 lines: "La bonne personne" / "t'attend." / "Sérieusement." (last line in `text-primary`). Paragraph contrasting Tinder/Badoo/Telegram vs YeOyo's serious-intent/verified/no-scam positioning. Two CTAs: primary "Créer mon profil gratuitement" (`user-plus` icon) + outline "Télécharger l'app" (`smartphone` icon). Right: 3:4 image panel — **generative photo placeholder, see flags below** — with two floating badge chips overlaid: "Profil vérifié" (`shield-check`, verified color, bottom-left) and "50 000+ membres" (secondary bg, top-right).
3. **Trust bar** — full-bleed `bg-secondary` band, 3 centered stat chips each with an icon circle above the number: `users`→"50 000+"/"membres actifs", `shield-check`→"100%"/"profils vérifiés IA", `gift`→"Gratuit"/"pour commencer".
4. **Pourquoi YeOyo** — eyebrow pill (`heart`) "Pourquoi YeOyo". H2 2 lines "Pas une app de rencontre." / "Une app pour se marier." + primary underline rule + subtext. 4-col grid of feature cards (icon chip in `bg-accent` + title + desc): `shield-check` Zéro faux profil / `gem` Le sérieux avant tout / `lock` Ta vie privée protégée / `bot` Coach IA Mbote.
5. **Sécurité** — `bg-muted` band. Eyebrow pill (`shield`) "Sécurité". H2 "Ta sécurité n'est pas négociable" + rule + subtext. 3-col grid, same card shape as section 4 but `p-8`: `user-check` Vérification manuelle / `bot` Modération IA intelligente / `lock` Contrôle total.
6. **Comment ça marche** — eyebrow pill (`zap`) "4 étapes". H2 "De l'inscription à la rencontre" + rule + subtext. 4-col numbered-step row (01–04) with a horizontal connector line spanning between the circles: Inscris-toi en 5 min → Découvre des profils compatibles → Échange respectueusement → Rencontre ta moitié.
7. **CTA intermédiaire** — full-bleed `bg-primary` band, centered, H2 "Ta moitié te cherche aussi.", subtext, single primary-foreground/primary-text button "Je me lance" (`user-plus`).
8. **Tarifs** (`id="tarifs"`) — eyebrow pill (`tag`) "Tarifs". H2 "Simple et transparent" + rule + subtext. 2-col pricing grid:
   - **Free card**: "Gratuit" / "Découvre la plateforme à ton rythme", price "0 CDF" / "Pour toujours", 6 included features (`check`, verified color) + 6 locked features shown strikethrough with `x` icon in muted/border color, outline "Commencer" CTA (`arrow-right`).
   - **Premium card**: 2px primary border, "Offre de lancement" gold badge pill (`zap`) floating on top edge, "Premium" / "Maximise tes chances de trouver ta moitié", price struck-through "18 000 CDF" → "11 000 CDF / mois", payment-method line "Airtel Money · Orange Money · M-Pesa", 11 included features (`check`), primary-filled "Commencer" CTA (`arrow-right`), footnote "* Tarif de lancement limité. Prix normal : 18 000 CDF / mois".
9. **Témoignages** — `bg-muted` band. Eyebrow pill (`heart`) "Ils l'ont fait". H2 "Des Congolais qui ont trouvé leur moitié" + rule. 3-col testimonial cards: 5-star row (`star`, gold), italic quote, divider, initials-circle avatar (secondary bg) + name + city. 3 testimonials: Emmanuel K. / Kinshasa / "EK"; Rosette M. / Lubumbashi / "RM"; Patrick N. / Goma / "PN".
10. **Bandeau final** — full-bleed `bg-secondary`, small eyebrow text "YeOyo na biso", H2 2 lines "La bonne personne existe." / "Elle est peut-être là, ce soir.", subtext, primary CTA "Créer mon profil gratuitement" (`user-plus`).
11. **Footer** — `bg-foreground` (dark), 5-col grid: col-span-2 logo+wordmark+tagline+payment-method chip row (Airtel Money/Orange Money/M-Pesa); Navigation column (same 5 links as header); "Rencontre" column (city links: Kinshasa, Lubumbashi, Goma, Matadi, Kisangani); Légal+Contact column (Règlement, Confidentialité, Mentions légales, CGV, then contact@yeoyo.cd + "Kinshasa, RDC"). Bottom bar: copyright + "Conçu avec ❤️ à Kinshasa".

## Component breakdown
- **YeOyoNav.tsx** — REUSE WITH CHANGES. Current component's link set (`Accueil`/`Télécharger`/`Blog`) and dual login+"Rejoindre" CTA don't match this screen (`Accueil`/`Comment ça marche`/`Tarifs`/`FAQ`/`Contact` + single "Se connecter"). Only `Tarifs`→`#tarifs` has a real anchor target in this JSX; `Comment ça marche`/`FAQ`/`Contact`/`Accueil` have no matching section ids in the source — same "inert label" precedent as `landing-brand-new.md`'s "À propos" call. Recommend adding `id`s to the relevant sections so the links actually work rather than shipping dead anchors twice in a row.
- **WhyFeatureCard.tsx** — REUSE AS-IS. Prop shape (`icon`, `title`, `desc`) matches both the "Pourquoi YeOyo" (4×) and "Sécurité" (3×) card grids exactly.
- **StepItem.tsx** / **StepConnector** — REUSE AS-IS. `{n, title, desc}` + connector line matches the 4-step "Comment ça marche" section precisely.
- **StatChip.tsx** — REUSE WITH CHANGES. Current component is `{value, label}` only; this screen's trust-bar chips add an icon circle above the value. Needs an optional `icon?: IconName` prop.
- **SuccessStoryCard.tsx** — REUSE WITH CHANGES. Current shape is `{quote, name, role, status}` (two meta lines, no star rating). This screen's testimonials are `{quote, name, city, initials}` plus a 5-star row not currently rendered. Needs: drop `status` (or repurpose), rename `role`→`city`, add a star-rating row. Current version already uses `UserAvatar` for the initials circle — compatible in spirit with this screen's raw initials div.
- **Icon.tsx** — REUSE, but extend the `ICONS` map. Missing icons used by this screen: `user-plus` (UserPlus), `shield` (plain Shield, distinct from the already-mapped `shield-check`), `user-check` (UserCheck), `tag` (Tag), `arrow-right` (ArrowRight), `gift` (Gift). All available in `lucide-react`, just not yet imported/mapped.
- **NEW `PricingCard.tsx`** — no existing equivalent in the component inventory. Needs a variant prop (`free` | `premium`) or two thin wrapper usages, given differing border weight, badge pill, price-strikethrough, and locked-feature list only on the free tier.
- **NEW hero floating-badge chips** — small inline markup (verified badge + member-count chip), not worth a shared component unless reused elsewhere.
- **PRIMITIVES**: `Icon` (name-mapped, see above); plain `<button>`/`<a>` styled inline per Banani's own pattern (no shared `Button` primitive exists yet in this inventory — matches how the rest of the app currently does buttons).

## Token mapping (replaces current sitewide theme)
This is a full palette swap, not a section-local override — see open question below on scope (landing-only vs sitewide, mirroring how the prior light-blue redesign became the app-wide default).

| Banani screen usage | Project token | Value |
|---|---|---|
| Page bg | `--color-background` | `#fdfbf8` |
| Headings/body text | `--color-foreground` | `#1A1208` |
| Borders (header, cards, dividers) | `--color-border` | `#e8dfd6` |
| Form/chip input bg | `--color-input` | `#F3EDE0` |
| Primary buttons, icon accents, price highlight, active nav | `--color-primary` | `#c17a4e` |
| Text on primary | `--color-primary-foreground` | `#ffffff` |
| Trust bar bg, step circles, final CTA band, testimonial avatar bg | `--color-secondary` | `#1f3a2e` |
| Text on secondary | `--color-secondary-foreground` | `#ffffff` |
| Feature-card icon chip bg | `--color-accent` | `#f3e4d9` |
| Icon-chip icon tint context | `--color-accent-foreground` | `#8a4a28` |
| Section band bgs (Sécurité, Témoignages), card icon-chip bg | `--color-muted` | `#f1eae2` |
| Secondary/meta text, subtext, locked-feature text | `--color-muted-foreground` | `#7A6B52` |
| Card surfaces (header, feature cards, pricing cards, testimonial cards) | `--color-card` | `#FFFFFF` |
| Card text | `--color-card-foreground` | `#1A1208` |
| "Profil vérifié" badge, included-feature checkmarks | `--color-verified` | `#2D6A4F` |
| Text on verified | `--color-verified-foreground` | `#ffffff` |
| "Offre de lancement" badge | `--color-gold` | `#C8932A` |
| Text on gold badge | `--color-gold-foreground` | `#1A1208` |
| Radii | `sm`/`md`/`lg`/`xl` | 6/10/16/28px (Banani uses `rounded-md`/`rounded-xl`/`rounded-2xl`/`rounded-full` throughout — maps cleanly) |
| Body font | `font-body` | DM Sans |
| Headings font | `font-headings` | PT Serif |
| Type scale | xs–5xl | 11/13/15/17/20/24/32/44/58 — screen uses up to `text-5xl` (hero H1) and `text-4xl` (section H2s) |

## Responsive plan (mobile-first mandatory, Banani screen is desktop-only)
- **Base (375px)**: header collapses to logo + "Se connecter" only (nav links hidden below `lg`, same pattern as current `YeOyoNav`'s `lg:flex`). Hero stacks: eyebrow → H1 (drop to `text-3xl`/`text-4xl`) → paragraph → both CTAs full-width stacked → image panel full-width below text, fixed aspect ratio (not the desktop's fixed `w-96`), floating badges may need repositioning inward so they don't clip off-viewport. Trust bar stats stack to 1-col or wrap 2+1. Feature grids (4-col, 3-col) → 1-col. Steps stack vertically, connector line dropped (matches `StepConnector`'s existing `lg:block` gate). Pricing cards stack 1-col, Premium's floating badge re-centered. Testimonials 1-col. Footer 5-col grid → stacked/flat list (mirror the existing footer's already-built mobile treatment).
- **sm (640px)**: feature/testimonial grids begin 2-col.
- **md (768px)**: hero becomes 2-col row; trust bar stays row; pricing may stay 1-col until `lg` (cards need width to breathe, esp. Premium's feature list of 11 items).
- **lg (1024px)**: full Banani fidelity — 4-col feature grids, 3-col Sécurité/testimonials grid, 4-col step row with connector, 2-col pricing, 5-col footer.
- **xl (1280px)**: centered max-width containers per section (`max-w-6xl` header/hero/footer, `max-w-5xl` feature/security/steps/testimonials, `max-w-4xl` trust-bar/pricing, `max-w-3xl` CTA bands) mirroring the screen's own per-section container widths.

## Interactions / state
- Header "Se connecter" → `/login`.
- Hero primary CTA "Créer mon profil gratuitement" → `/onboarding`.
- Hero secondary CTA "Télécharger l'app" → no app-store asset exists yet in this project; needs a decision (scroll-to-footer PWA install prompt via existing `InstallPwaPrompt.tsx`, or relabel/hide until a real app link exists — flagging, don't fabricate a store link).
- Header nav "Tarifs" → `#tarifs` (anchor exists in source). "Accueil"/"Comment ça marche"/"FAQ"/"Contact" → no matching section ids in source; either add ids (Comment ça marche section, a new FAQ/Contact target) or ship as inert labels per prior precedent.
- CTA intermédiaire "Je me lance" → `/onboarding`.
- Pricing Free card "Commencer" → `/onboarding` (free signup path). Pricing Premium card "Commencer" → `/onboarding` with a premium-intent query param or directly into a paywall step, depending on how onboarding currently branches — needs product decision, not assumed here.
- Bandeau final "Créer mon profil gratuitement" → `/onboarding`.
- Footer nav links mirror header nav (same anchor caveats). Footer city links ("Rencontre" column: Kinshasa/Lubumbashi/Goma/Matadi/Kisangani) have no existing city-filtered route — flag as either future `/explorer?city=` deep links or inert labels, don't invent a route.
- Footer Légal links (Règlement/Confidentialité/Mentions légales/CGV) — no existing pages found in this pass; flag as either stub pages needed or inert labels.

## Copy (all French strings, verbatim)
**Header**: YeOyo · Accueil · Comment ça marche · Tarifs · FAQ · Contact · Se connecter

**Hero**: "Fait pour les Congolais sérieux" · "La bonne personne" / "t'attend." / "Sérieusement." · "Tinder pousse vers le casual. Badoo est générique. Les canaux Telegram sont pleins de faux profils. YeOyo, c'est différent : intention matrimoniale déclarée, profils vérifiés IA, zéro arnaque." · "Créer mon profil gratuitement" · "Télécharger l'app" · "Profil vérifié" · "50 000+ membres"

**Trust bar**: "50 000+" / "membres actifs" · "100%" / "profils vérifiés IA" · "Gratuit" / "pour commencer"

**Pourquoi YeOyo**: "Pourquoi YeOyo" · "Pas une app de rencontre." / "Une app pour se marier." · "On a créé YeOyo parce qu'on n'avait pas trouvé ce qu'on cherchait : une plateforme sérieuse, sans arnaques, qui respecte vraiment les gens." · "Zéro faux profil" / "Chaque inscription est vérifiée manuellement. Ici tu parles à de vraies personnes." · "Le sérieux avant tout" / "Pas de drague casual, pas de contenus déplacés. Juste des gens qui veulent vraiment se marier." · "Ta vie privée protégée" / "Mode anonyme, photos floutées jusqu'au match. C'est toi qui décides qui te voit." · "Coach IA Mbote" / "Mbote, ton assistant IA personnel, te guide 24h/24. Conseils et ice-breakers pour bien démarrer."

**Sécurité**: "Sécurité" · "Ta sécurité n'est pas négociable" · "Faux profils, arnaques, harcèlement... On gère tout. Toi, concentre-toi sur ta recherche." · "Vérification manuelle" / "Pas de bot, pas de faux profil. Chaque inscription passe par notre équipe avant d'être validée." · "Modération IA intelligente" / "Notre IA analyse chaque message. Contenu inapproprié ? Bloqué instantanément. Pas de place pour les arnaques." · "Contrôle total" / "Mode anonyme, photos floues jusqu'au match. Tu décides qui te voit. Tes données restent les tiennes."

**Comment ça marche**: "4 étapes" · "De l'inscription à la rencontre" · "Simple, rapide, efficace. Ta future moitié est peut-être à quelques clics." · "01" "Inscris-toi en 5 min" / "Pseudo, email, quelques infos. C'est rapide et 100% gratuit." · "02" "Découvre des profils compatibles" / "Notre IA analyse tes critères et te propose des personnes qui te correspondent vraiment." · "03" "Échange respectueusement" / "Messages modérés par IA, ice-breakers pour bien démarrer. Juste l'essentiel." · "04" "Rencontre ta moitié" / "Quand le courant passe, YeOyo vous accompagne vers la vraie rencontre."

**CTA intermédiaire**: "Ta moitié te cherche aussi." · "Rejoins des milliers de Congolais sérieux qui ont choisi YeOyo." · "Je me lance"

**Tarifs**: "Tarifs" · "Simple et transparent" · "Commence gratuitement. Passe Premium quand tu es prêt(e)." ·
- Free: "Gratuit" / "Découvre la plateforme à ton rythme" / "0" "CDF" / "Pour toujours"
  - Included: "Création de profil complet", "3 photos de profil", "5 demandes de contact par jour", "Répondre aux messages reçus", "Ice Breaker : idées de messages", "Support par email"
  - Locked (strikethrough): "Demandes illimitées", "Voir qui t'a mis en favori", "Voir qui a visité ton profil", "Messages vocaux", "Score de compatibilité IA", "Boosts de profil inclus"
  - CTA: "Commencer"
- Premium: "Offre de lancement" / "Premium" / "Maximise tes chances de trouver ta moitié" / "18 000 CDF" (struck) → "11 000" "CDF / mois" / "Airtel Money · Orange Money · M-Pesa"
  - Included: "Demandes de contact illimitées", "Voir qui t'a mis en favori ★", "Voir qui a visité ton profil", "Jusqu'à 10 photos HD sur ton profil", "Messagerie 100% illimitée", "Messages vocaux — NOUVEAU", "Vois qui est connecté en temps réel", "Score de compatibilité IA détaillé", "Boosts de profil inclus", "Badge Premium vérifié", "Support prioritaire 7j/7"
  - CTA: "Commencer" · Footnote: "* Tarif de lancement limité. Prix normal : 18 000 CDF / mois"

**Témoignages**: "Ils l'ont fait" · "Des Congolais qui ont trouvé leur moitié" ·
- "\"YeOyo na biso. En 3 semaines j'ai rencontré quelqu'un de vrai. Kinshasa, 35 ans, sérieux — exactement ce que je cherchais.\"" — Emmanuel K., Kinshasa (EK)
- "\"J'avais peur des arnaques. Ici tout le monde est vérifié, je me sens respectée. YeOyo c'est vraiment différent.\"" — Rosette M., Lubumbashi (RM)
- "\"Simple, rapide, sérieux. J'ai trouvé ma moitié en moins d'un mois. Merci YeOyo.\"" — Patrick N., Goma (PN)

**Bandeau final**: "YeOyo na biso" · "La bonne personne existe." / "Elle est peut-être là, ce soir." · "Rejoins YeOyo. Crée ton profil en 5 minutes. Rencontre des personnes vraies, sérieuses, qui te ressemblent." · "Créer mon profil gratuitement"

**Footer**: "YeOyo" · "La première application de rencontres sérieuses pensée pour les Congolais. Trouve ta moitié." · "Airtel Money", "Orange Money", "M-Pesa" · "Navigation": Accueil, Comment ça marche, Tarifs, FAQ, Contact · "Rencontre": Kinshasa, Lubumbashi, Goma, Matadi, Kisangani · "Légal": Règlement, Confidentialité, Mentions légales, CGV · "Contact": contact@yeoyo.cd / Kinshasa, RDC · "© 2025 YeOyo. Tous droits réservés." · "Conçu avec ❤️ à Kinshasa"

## Fabricated-photo flags
- **Hero image panel** — `<Image ar="3:4" prompt="Elegant modern Congolese couple in Kinshasa, warm and genuine, city backdrop, soft natural lighting, stylish casual clothing, authentic smile" className="w-full" />`. This is a Banani generative-image placeholder that explicitly implies a photorealistic stock photo of real people ("Elegant modern Congolese couple... authentic smile"). Per the standing no-fake-photos policy, **must be replaced** with an honest gradient/pattern block (same treatment as the current `page.tsx` hero's decorative gradient panel) — not a generated or invented photo, even a licensed-looking stock one.
- **Testimonial avatars** — already compliant. The source renders `t_.initials` ("EK"/"RM"/"PN") inside a plain secondary-bg circle, no `<Image prompt>` used here. No change needed; matches the project's existing `SuccessStoryCard`/`UserAvatar` initials pattern.
- No other `<Image prompt=...>` calls appear anywhere else in this screen (verified — only one `Image` import usage in the whole 25k-char source, in the hero).

## Implementation checklist
- [ ] Decide + confirm theme scope (landing-only vs sitewide default) — see open question
- [ ] Add terracotta/cream/PT-Serif tokens to `globals.css` (new `@theme` block or new `[data-theme]` variant depending on the scope decision) + register in `ThemeContext.THEMES`
- [ ] Extend `Icon.tsx` `ICONS` map: `user-plus`, `shield`, `user-check`, `tag`, `arrow-right`, `gift`
- [ ] Modify `YeOyoNav.tsx` link set + single-CTA header variant (or add a landing-specific nav)
- [ ] Modify `StatChip.tsx` to accept optional `icon`
- [ ] Modify `SuccessStoryCard.tsx` for `city` + star-rating row (or add a variant)
- [ ] New `PricingCard.tsx` (free/premium variants, locked-feature list support)
- [ ] Replace hero `<Image prompt>` with honest gradient/pattern block
- [ ] Decide anchor targets for Comment ça marche / FAQ / Contact nav items (add ids or ship inert, matching prior precedent)
- [ ] Decide routing for pricing CTAs (free vs premium onboarding branch) and footer city/legal links
- [ ] `page.tsx` full section rebuild, mobile-first
- [ ] 375 / 768 / 1024 / 1280 review pass
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

## Open questions for user
- **Theme scope (the big one)**: this is the app's **second** from-scratch landing redesign delivered via Banani. The first (terracotta... no — the first was light-blue, from `alMLvZczLcpt/screens/YeOyoLandingDesktopAlt.jsx`) already became the sitewide default theme on 2026-08-13, with the prior dark-gold theme demoted to an opt-in `[data-theme]` alternate. Should this **new** terracotta/cream/PT-Serif theme now fully replace light-blue as the sitewide default (with light-blue demoted to opt-in, following the exact same precedent), or should it stay scoped to the landing page only while the rest of the app keeps light-blue? Needs an explicit decision before touching `globals.css`/`ThemeContext` — this consolidates with whatever the other in-flight screen plans (`accueil-nouveau-theme.md`, `decouverte-profils-v2.md`) decide, since a sitewide swap has to be consistent across all of them.
- Hero secondary CTA "Télécharger l'app" — no store link/asset exists; scroll to an install prompt, or drop the CTA?
- Header/footer nav items with no matching in-page section (Comment ça marche/FAQ/Contact) and footer city/legal links with no existing routes — add real targets or ship as inert labels (prior precedent leans inert, but this screen has 4 such items vs the prior screen's 1)?
- Premium pricing CTA — does `/onboarding` already branch by plan, or does this need a new query param / paywall step?
