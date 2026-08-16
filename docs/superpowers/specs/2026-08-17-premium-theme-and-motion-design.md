# Thème doré Premium + système d'animations transversal

Date: 2026-08-17
Statut: proposé

## Contexte

Deux améliorations transversales demandées, applicables à tous les écrans déjà créés (Accueil, Découvrir, Demandes, Favoris, Visiteurs, Messages, Premium, Profil, Paramètres, Landing, back-office admin) :

1. Un thème visuel "Premium" qui s'active automatiquement selon l'abonnement de l'utilisateur connecté, sans changer la structure de l'UI — uniquement des accents dorés en complément de la palette Standard (terracotta/vert forêt) existante.
2. Des transitions, squelettes de chargement, micro-interactions et animations d'apparition cohérentes sur toute l'app, courtes (200-400ms) et jamais bloquantes.

**Ce qui existe déjà et doit être réutilisé, pas réinventé :**
- `frontend/src/app/globals.css` a déjà un système d'entrée (`fade-in`, `fade-in-up`, `fade-in-down`, `scale-in`), un `heart-pop`, un `.btn-success-flash`, tous respectueux de `prefers-reduced-motion` (issus de la spec `2026-08-12-interaction-animations-design.md`, déjà implémentée).
- `--color-gold` / `--color-gold-foreground` existent déjà dans `@theme`, explicitement réservés aux badges Premium (déjà utilisés par `PricingCard` et l'onglet Premium de `TopNav`).
- `ThemeContext` pose déjà `data-theme="…"` sur `<html>` pour swapper la palette Standard choisie par l'utilisateur (9 variantes) — mécanisme séparé et orthogonal au statut Premium, à ne pas toucher.
- `frontend/src/lib/server/profile/card.ts` a déjà un champ `verified: boolean` sur `ProfileCard`, calculé par les 11 routes qui appellent `toProfileCard()` — c'est le patron à suivre pour `isPremium`.
- `useLikePop` est le patron pour les nouveaux hooks d'animation transitoire (state local + `setTimeout` de nettoyage, pas de dépendance).

## Portée

**Inclus :**
1. Statut Premium exposé globalement côté client (nouveau contexte), avec bascule immédiate après paiement réussi.
2. Accents dorés aux 4 points de contact prioritaires listés par l'utilisateur : bordure de photo de profil (soi-même), badge à côté du prénom (visible par tous, sur les cartes/listes), en-tête de Paramètres > Abonnement, pastille dans la nav.
3. `isPremium` exposé publiquement sur `ProfileCard` (comme `verified`) et répercuté sur les 11 endpoints qui construisent des cartes de profil.
4. Squelettes de chargement façonnés (remplaçant spinners/blancs) sur les listes de profils, messages, et tableaux admin.
5. Stagger léger sur les grilles de profils, animation de sortie sur swipe/dismiss, transition douce entre onglets (Demandes, Favoris/Qui m'aime), micro-interaction de clic cohérente sur les boutons d'action clés.

**Exclus (hors scope) :**
- Aucune nouvelle dépendance npm — CSS/Tailwind + hooks React seulement (décision utilisateur).
- Pas de champ dénormalisé `User.isPremium` mis à jour par les webhooks — le statut est recalculé à la demande depuis `Subscription` (évite de toucher `webhook/handler.ts`, protégé, et tout risque de désynchronisation).
- Pas de re-design structurel des écrans — uniquement accents de couleur + animations, la mise en page ne change pas.
- Landing page (`frontend/src/app/page.tsx`) : retourne `null` aujourd'hui (page non écrite) — hors scope tant qu'elle n'existe pas ; les classes/hooks ajoutés seront disponibles quand elle sera construite.

## Conception

### 1. Statut Premium global — `PremiumContext`

Nouveau `frontend/src/contexts/PremiumContext.tsx` :
- `PremiumProvider` imbriqué **dans** `AuthProvider` (dans `frontend/src/app/layout.tsx`), car il a besoin de savoir si un utilisateur est connecté.
- Au montage (et quand `user` passe de `null` à défini), `GET /api/subscriptions/me` ; `isPremium = subscription?.status === 'ACTIVE'` (même champ que `/api/subscriptions/me` expose déjà, pas de nouvelle logique serveur).
- Pose `document.documentElement.dataset.premium = 'true' | undefined` (même mécanique que `ThemeContext`/`data-theme`), pour que le CSS attrape l'état sans prop-drilling.
- Expose `usePremium(): { isPremium: boolean; loading: boolean; refresh: () => Promise<void> }`.
- `frontend/src/app/app/premium/pending/page.tsx` : dans le `useEffect` qui gère `status?.orderStatus === 'PAID'`, appeler `refreshPremium()` avant/avec le toast — bascule le thème sans reload.

### 2. CSS — accents dorés (extension, pas remplacement)

Dans `globals.css`, sous les blocs `[data-theme=...]` existants, ajouter (une seule fois, pas par thème car `--color-gold` est déjà global) :
```css
[data-premium='true'] .avatar-ring {
  border-color: var(--color-gold);
}
[data-premium='true'] .premium-header-gradient {
  background-image: linear-gradient(135deg, var(--color-primary) 0%, var(--color-gold) 100%);
}
```
`.avatar-ring` est une nouvelle classe utilitaire appliquée à l'avatar de l'utilisateur connecté (bordure neutre par défaut, dorée seulement sous `data-premium`). `.premium-header-gradient` par défaut n'a pas de `background-image` (dégradé actif seulement quand Premium) — le fond reste la couleur unie existante en Standard.

### 3. `isPremium` sur `ProfileCard` (visible par tous — choix confirmé)

`frontend/src/lib/server/profile/card.ts` : ajouter `isPremium: boolean` à l'interface `ProfileCard`. `toProfileCard()` reste une fonction pure (pas d'accès DB) — elle initialise `isPremium: false` par défaut, comme aujourd'hui `verified` dérive de `p.verifiedAt` déjà présent sur la ligne. Comme le statut Premium vit dans une table séparée (`Subscription`), impossible de le dériver depuis la ligne `Profile` seule.

Nouveau `frontend/src/lib/server/subscriptions/premium-status.ts` :
```ts
export async function getPremiumUserIds(prisma: PrismaClient, userIds: string[]): Promise<Set<string>>
```
Un seul `prisma.subscription.findMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, select: { userId: true } })` — même patron anti-N+1 que le `Like.findMany` batché déjà utilisé pour `liked`/`favorited` (cf. spec du 12/08).

Les 11 routes qui appellent `toProfileCard` (`profile`, `profiles/explorer`, `profiles/[userId]`, `profile/visitors`, `profile/favorited-by`, `favorites`, `conversations`, `profiles/discover`, `contact-requests`, `users/blocked`, `likes/received`) : après avoir construit leurs cartes, batcher `getPremiumUserIds(prisma, cards.map(c => c.userId))` une fois par requête, puis `{ ...card, isPremium: premiumIds.has(card.userId) }`. Champ additif — aucun contrat existant cassé.

### 4. `PremiumBadge` — nouveau composant

`frontend/src/components/yeoyo/PremiumBadge.tsx`, calqué sur `VerifiedBadge.tsx` (même structure `inline-flex` + pastille + label), couleurs `bg-gold`/`text-gold-foreground` au lieu de `bg-verified`. Rendu conditionnellement (`profile.isPremium &&`) partout où `verified` l'est déjà : `ProfileGridCard`, `SwipeCard`, `RecommendedProfileCard`, `ContactRequestCard`, `ProfileInfoSections`, `profils/[userId]/page.tsx`.

### 5. Avatar doré de soi-même

L'avatar du profil connecté (dans `TopNav.tsx` et `frontend/src/app/app/profil/page.tsx`) reçoit la classe `.avatar-ring` et lit `usePremium()` directement (c'est la photo du viewer, pas une carte d'un autre utilisateur reçue par API) — pas besoin du champ `isPremium` de `ProfileCard` ici.

### 6. Nav & Paramètres

- `nav-items.ts` / `TopNav.tsx` / `MobileTabBar.tsx` : l'onglet `PREMIUM_ITEM` (icône `crown`, déjà dorée) affiche une petite pastille dorée additionnelle (`●`) quand `usePremium().isPremium`, pour distinguer "j'ai accès à Premium" de "je suis déjà Premium".
- `frontend/src/app/app/parametres/paiement/page.tsx` : le conteneur d'en-tête reçoit `premium-header-gradient` (classe toujours présente, effet actif seulement si `data-premium`).

### 7. Squelettes de chargement

Nouveau primitif `frontend/src/components/ui/Skeleton.tsx` (`div` avec classe `.skeleton-shimmer`, `rounded`/`w-full` par défaut, props `className` pour la forme). Nouveau keyframe dans `globals.css` :
```css
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(90deg, var(--color-muted) 25%, var(--color-border) 37%, var(--color-muted) 63%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
```
(ajouté à la liste `prefers-reduced-motion: reduce` existante → `animation: none`).

Composants façonnés construits sur `Skeleton` : `ProfileCardSkeleton.tsx` (reprend les proportions de `ProfileGridCard`/`SwipeCard` : rectangle photo + 2 lignes de texte), `MessageListSkeleton.tsx` (avatar rond + 2 lignes), `AdminTableSkeleton.tsx` (lignes de tableau). Remplacent les `animate-spin`/blancs actuels dans : `explorer/page.tsx`, `decouvrir/page.tsx`, `profils/[userId]/page.tsx`, `messages/page.tsx`, `messages/[id]/page.tsx`, `likes/page.tsx`, `favoris/page.tsx`, `visiteurs/page.tsx`, `demandes/page.tsx`, et les pages admin sous `frontend/src/app/admin/(dashboard)/*`.

### 8. Stagger, sortie de carte, transitions d'onglet, clic

- **Stagger** : sur les grilles (`ProfileGridCard` mappé dans `explorer/page.tsx`, `decouvrir/page.tsx`), ajouter `style={{ animationDelay: \`${Math.min(i, 8) * 40}ms\` }}` aux côtés de la classe `.animate-fade-in-up` déjà existante — plafonné à 8 pour ne pas faire attendre les cartes en fin de longue liste. Pas de nouvelle classe CSS nécessaire.
- **Sortie de carte** (swipe/dismiss dans `SwipeCard`/Explorer) : nouveau hook `frontend/src/lib/yeoyo/useCardExit.ts` (même famille que `useLikePop` — état local + `setTimeout`), ajoute une classe `.animate-slide-out-{left,right}` puis appelle le callback réel de suppression après la durée de transition (250ms), pour que l'animation ait le temps de jouer avant que la carte disparaisse du DOM. Deux nouveaux keyframes dans `globals.css` (`slide-out-left`/`slide-out-right`, translateX + fade), ajoutés à la liste `prefers-reduced-motion`.
- **Transitions d'onglet** (`demandes/page.tsx` Reçues/Envoyées/Contacts, `favoris/page.tsx` Mes favoris/Qui m'aime) : le panneau actif reçoit `key={activeTab}` + `.animate-fade-in` — le remount déclenché par le changement de `key` rejoue l'animation CSS existante, aucune nouvelle classe.
- **Clic bouton d'action** : nouvelle classe utilitaire `.btn-press` (`active:scale-95 transition-transform duration-150`, cohérente avec le commentaire déjà présent dans `globals.css` disant que le tap feedback utilise les utilitaires Tailwind directement) appliquée aux boutons Favoris/Accepter/Refuser/Like qui ne l'ont pas encore ; `.btn-success-flash`/`.animate-heart-pop` déjà en place restent le mécanisme de confirmation de succès, réutilisés tel quel (pas de nouveau système de confirmation).
- **Onboarding** : `frontend/src/app/onboarding/page.tsx` — l'étape active reçoit `key={step}` + `.animate-fade-in-up` pour un slide léger entre étapes.

### Composants/fichiers touchés

| Fichier | Nature du changement |
|---|---|
| `frontend/src/contexts/PremiumContext.tsx` | nouveau |
| `frontend/src/app/layout.tsx` | ajoute `PremiumProvider` dans l'arbre |
| `frontend/src/app/app/premium/pending/page.tsx` | appelle `refreshPremium()` sur succès |
| `frontend/src/app/globals.css` | classes `.avatar-ring`, `.premium-header-gradient`, `.skeleton-shimmer`, `.btn-press`, keyframes `skeleton-shimmer`/`slide-out-{left,right}` |
| `frontend/src/lib/server/profile/card.ts` | `ProfileCard.isPremium: boolean` |
| `frontend/src/lib/server/subscriptions/premium-status.ts` | nouveau, `getPremiumUserIds()` batché |
| 11 routes listées en §3 | overlay `isPremium` sur les cartes retournées |
| `frontend/src/components/yeoyo/PremiumBadge.tsx` | nouveau, calqué sur `VerifiedBadge.tsx` |
| `frontend/src/components/ui/Skeleton.tsx` + `ProfileCardSkeleton.tsx`, `MessageListSkeleton.tsx`, `AdminTableSkeleton.tsx` | nouveaux |
| `frontend/src/lib/yeoyo/useCardExit.ts` | nouveau hook |
| `TopNav.tsx`, `MobileTabBar.tsx`, `nav-items.ts` | pastille Premium, avatar doré |
| `frontend/src/app/app/profil/page.tsx` | avatar doré |
| `frontend/src/app/app/parametres/paiement/page.tsx` | en-tête dégradé |
| `ProfileGridCard.tsx`, `SwipeCard.tsx`, `RecommendedProfileCard.tsx`, `ContactRequestCard.tsx`, `ProfileInfoSections.tsx`, `profils/[userId]/page.tsx` | `PremiumBadge`, stagger, sortie de carte |
| `explorer/page.tsx`, `decouvrir/page.tsx`, `demandes/page.tsx`, `favoris/page.tsx`, `visiteurs/page.tsx`, `messages/page.tsx`, `messages/[id]/page.tsx`, `likes/page.tsx` | skeleton, transitions d'onglet, `.btn-press` |
| `frontend/src/app/onboarding/page.tsx` | transition entre étapes |
| `frontend/src/app/admin/(dashboard)/*/page.tsx` (6 pages) | `AdminTableSkeleton` |

### Tests

- Vitest : `getPremiumUserIds()` (batching correct, pas de N+1 — un seul appel Prisma), et un test sur au moins une route (ex. `profiles/explorer`) vérifiant que `isPremium` est bien fusionné dans la réponse.
- Pas de nouveaux tests visuels/E2E (aucun harnais dans le projet, cf. CLAUDE.md) — vérification manuelle via `pnpm dev` : basculer un utilisateur de test en abonnement `ACTIVE` (Prisma Studio) et confirmer visuellement badge/bordure/en-tête/pastille sur les écrans listés, et que `premium/pending` bascule le thème sans reload après paiement.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` avant de considérer le travail terminé (gate standard du projet).

## Auto-review

- Pas de placeholder/TBD.
- Cohérence : réutilise systématiquement les mécanismes déjà validés (fade-in/heart-pop/btn-success-flash, `data-theme` pattern, `verified`-style batched flag, `useLikePop`-style hook) plutôt que d'introduire des systèmes parallèles.
- Portée : resserrée aux 4 points de contact Premium confirmés + animations sur les écrans listés ; exclusions explicites (pas de nouvelle dépendance, pas de champ dénormalisé, pas de re-design structurel, landing hors scope tant que vide).
- Ambiguïté tranchée : le badge Premium est visible par tous (choix utilisateur confirmé), calculé à la demande (pas de cache dénormalisé) pour ne pas toucher aux webhooks protégés.
