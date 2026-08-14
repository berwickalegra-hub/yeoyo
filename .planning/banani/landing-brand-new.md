# Landing — Brand New (blue/light) — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `alMLvZczLcpt/screens/YeOyoLandingDesktopAlt.jsx`
- Screen name: "YeOyo — Landing Desktop (Brand New)"
- Fetched: 2026-08-13
- Desktop-only export (no companion mobile screen this round, unlike the original Landing Mobile+Desktop pair).

## Decision: new default theme (explicit user ask)
User asked to make this new design "mon thème par défaut" (my default theme). The Banani source hardcodes
its own inline colors (`#277eff` primary blue, `#fafaf9`/`#ffffff` light backgrounds, `#0d0d0d` foreground,
`#e8e8e8` borders, `#f5f3ff` lavender accent section) rather than reusing the existing dark-gold `@theme`
tokens — this is a deliberate different template, not a variant of the current default.

- The base `@theme` block in `globals.css` (currently the dark-gold values, unscoped = default) becomes the
  new **light-blue** palette. This makes it the app-wide default theme for every page, not just landing.
- The previous default (dark-gold) is preserved as a selectable alternate under `[data-theme='dark-gold']`
  so existing users who prefer dark mode don't lose it — it moves from implicit-default to opt-in.
- `ThemeContext.THEMES` gets a new entry `light-blue` (label "Clair & Bleu", default), `dark-gold` stays
  in the list (now non-default), plus the existing `light` (amber), `dark-rose`, `dark-emerald` remain
  untouched selectable options.
- `DEFAULT_THEME` constant flips from `'dark-gold'` to `'light-blue'`.

## Token mapping (Banani inline styles → project tokens)
| Banani inline value | Project token |
|---|---|
| `#277eff` (primary, buttons, links, icons) | `--color-primary` |
| `#fff` (button text on primary) | `--color-primary-foreground` |
| `#fafaf9` (page bg) | `--color-background` |
| `#ffffff` (card/section bg) | `--color-surface` |
| `#0d0d0d` (headings) | `--color-foreground` |
| `#666` / `#333` (body text) | `--color-muted-foreground` (darkened vs old amber value for AA contrast on white) |
| `#999` (small/meta text) | kept as a slightly lighter step of muted-foreground via opacity, not a new token |
| `#e8e8e8` (borders) | `--color-border` |
| `#e8f0ff` (icon chip bg) | `--color-secondary` |
| `#f5f3ff` (success-stories section bg) | `--color-accent`-derived surface, applied as a one-off section class (not a global token — only one section uses lavender) |
| `linear-gradient(135deg,#277eff,#1e5fb8)` | kept as an literal gradient utility (`bg-gradient-to-br from-primary to-[#1e5fb8]`) since Tailwind v4 tokens don't model gradients; documented as the one intentional non-token color |

## Structure map
1. **Nav** — sticky, white bg, logo + "Comment ça marche"/"À propos" anchor links (desktop only) + "S'inscrire" pill button. Reuses `YeOyoNav` restyled with new tokens (no structural change needed — same slots: logo, desktop links, login+join CTAs). Anchor links point to new in-page `#comment-ca-marche`/`#a-propos`... Banani doesn't define an About section — link `À propos` stays a no-op label matching the mockup's own non-functional nav (kept as plain text like Banani, not a broken href).
2. **Hero** — asymmetric 2-col (text left, image right) at desktop; mobile stacks text above image. Eyebrow label, big headline, paragraph, 2 CTAs (primary "Commencer maintenant" + secondary outline "Regarder une démo" — no demo exists, relabel as scroll-to-features per project honesty precedent), stat row (12K+/94%/3 min).
3. **Why YeOyo** — 6 feature cards, icon chip + title + desc. 3-col desktop → 1-col mobile → 2-col tablet.
4. **Success stories** — 2 testimonial cards on lavender section bg, quote + avatar-placeholder + name/role/status badge. 1-col mobile → 2-col desktop. Per existing project precedent (landing page header comment), no fabricated stock photos — avatar stays an initials/placeholder circle like the current `TestimonialCard`, not a fake photo.
5. **How it works** — 4 numbered steps in a row with connecting line (desktop); stacks vertically on mobile (line dropped, matches existing landing's own `HOW_IT_WORKS` mobile treatment).
6. **CTA band** — full-bleed gradient section, headline + paragraph + white pill button.
7. **Footer** — 4-column grouped (App/Légal/Contact) + bottom bar, matches existing footer's desktop structure; mobile collapses to the existing flat-link pattern already built for the current footer (reused, not rebuilt).

## Component breakdown
- **REUSE (restyle only, no structural change)**: `YeOyoNav`, footer markup (copy existing footer block from current `page.tsx`, values unchanged — token-driven so the new theme colors apply automatically).
- **REUSE**: `Icon` (needs `zap` added).
- **NEW** `HeroImage` — not a component, inline `next/image`-less decorative gradient block (no real photo asset available; Banani's `<Image prompt=…>` is a generative placeholder, not a real asset — ship an honest gradient/pattern block instead of inventing a stock photo, consistent with the project's stated no-fabricated-photos precedent).
- **NEW** `WhyFeatureCard.tsx` — icon chip + title + desc, used 6×.
- **NEW** `SuccessStoryCard.tsx` — quote + name/role/status, used 2×.
- **NEW** `StepItem.tsx` — numbered circle + title + desc + optional connecting line (desktop only), used 4×.
- Existing `FeatureRow`, `TestimonialCard`, `StatChip`, `ProfileCardSmall`, `VerifiedBadge` become unused by the landing page after this replace — left in place (may still be reused elsewhere later, not deleted speculatively). `StatChip` IS reused for the hero stat row (same 3-stat shape).

## Responsive plan (mandatory — Banani gave desktop only)
- **Base (375px)**: nav shows logo + "S'inscrire" only (desktop links hidden, matches existing `YeOyoNav`'s already-built `lg:flex` pattern). Hero stacks: eyebrow → h1 (text-3xl) → paragraph → both CTAs full-width stacked → stat row 3-col small chips → gradient block below, full width, fixed aspect ratio (not h-96 fixed px). Feature cards 1-col. Success stories 1-col. Steps stack vertically, no connecting line. CTA band padding shrinks, button full-width. Footer flat-link mobile version (reused as-is).
- **sm (640px)**: feature cards 2-col begins.
- **md (768px)**: hero becomes 2-col row (text/image side by side, image height caps). Steps 2-col grid (no line). Success stories stay 1-col until lg (2 cards need width to breathe).
- **lg (1024px)**: full Banani fidelity — hero 2-col with h-96 image, feature cards 3-col, success stories 2-col, steps in a row with connecting line, footer grouped 4-col.
- **xl (1280px)**: max-width containers centered (`max-w-6xl`/`max-w-5xl` per section, mirroring existing landing's own container widths).

## Interactions / state
- Nav "S'inscrire" and hero CTAs → `/onboarding` (existing route). Secondary hero CTA "Découvrir les fonctionnalités" scrolls to `#pourquoi` (anchor) instead of Banani's non-existent "démo".
- Hover: buttons `hover:opacity-90`/`hover:bg-*`, cards `hover:shadow-md` — matches existing landing's interaction level (opacity/scale, no new pattern).
- Touch targets ≥48px: nav buttons, hero CTAs, footer links all sized per existing landing's own already-verified spacing.

## Copy / i18n
All strings are already French in the Banani source (`t('...')` wrapper is a Banani-editor artifact, not real i18n — stripped, plain French strings used directly, matching how the current `page.tsx` already handles it).

## PWA install (separate from the Banani screen, explicit user ask)
Not part of the Banani export — new infra:
- `frontend/src/app/manifest.ts` — Next.js Metadata Route (`MetadataRoute.Manifest`): name/short_name "YeOyo", `start_url: '/'`, `display: 'standalone'`, `background_color`/`theme_color` = new light-blue tokens, icons 192/512 (any + maskable) served from generated routes.
- `frontend/src/app/icon.tsx` + `apple-icon.tsx` — Next's ImageResponse icon convention (favicon + apple-touch-icon), brand "Y" mark on the new blue gradient.
- `frontend/src/app/pwa/icon/[size]/route.tsx` — Node runtime Route Handler (`export const runtime='nodejs'`, per this repo's invariant), renders the 192/512 PNGs via `next/og`'s `ImageResponse` — no external image asset needed.
- `frontend/public/sw.js` — minimal service worker (install/activate + pass-through fetch) so Chrome's installability heuristic (registered SW + valid manifest) is met.
- `frontend/src/components/yeoyo/InstallPwaPrompt.tsx` (client) — registers the SW on mount; listens for `beforeinstallprompt` (Chrome/Edge/Android), shows a dismissible bottom banner "Installer YeOyo sur votre téléphone" with an Install button calling `.prompt()`; iOS Safari (no `beforeinstallprompt` support) gets a manual-instructions variant ("Partager → Sur l'écran d'accueil") shown once per session if not already in standalone mode. Dismissal persisted in `localStorage` so it doesn't re-nag every visit.
- Mounted once in `app/layout.tsx` (global — installability isn't landing-page-specific, and the user's ask reads as "the app should be installable", not "only on `/`").

## Implementation checklist
- [ ] Extract `zap` icon
- [ ] New default theme tokens in globals.css + dark-gold moved to `[data-theme='dark-gold']`
- [ ] `ThemeContext` THEMES + DEFAULT_THEME update
- [ ] `WhyFeatureCard`, `SuccessStoryCard`, `StepItem` components
- [ ] `page.tsx` full replace, mobile-first
- [ ] `manifest.ts`, `icon.tsx`, `apple-icon.tsx`, `pwa/icon/[size]/route.tsx`, `public/sw.js`, `InstallPwaPrompt.tsx`
- [ ] 375 / 768 / 1280 review (no headless browser available in this environment — same disclosed gap as every prior phase; compiled-CSS + dev-server HTTP 200 checks used instead)
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

## Open questions for user
- None blocking — proceeding on the assumptions above (new theme = app-wide default, dark-gold kept as opt-in alternate, gradient placeholder instead of a fabricated stock photo, PWA prompt mounted globally). Flagged in the chat summary for veto.
