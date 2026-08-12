# Animations dynamiques + corrections d'état — Like / Message / Demandes

Date: 2026-08-12
Statut: proposé

## Contexte

Un audit du code frontend (`frontend/src/app/app/**`, `frontend/src/components/yeoyo/**`) a montré que sur les 5 endroits où l'utilisateur peut "liker" un profil (carte swipe, grille Explorer, grille Découvrir, page "Mes likes", fil de messages), un seul (page profil détail) fait réellement changer l'apparence du bouton après un like réussi. Les boutons Message/Accepter/Refuser n'ont aucun retour visuel autre qu'un `opacity-50` pendant l'appel réseau, et un flag `busy` partagé désactive parfois toute une grille au lieu de la seule carte cliquée. Le composant `Icon` (wrapper Lucide) ne transmet pas la prop `fill`, donc aucun cœur ne peut visuellement "se remplir".

Objectif : rendre chaque action (like, message, accepter/refuser une demande) visuellement dynamique et cohérente sur toute l'app, et corriger les bugs d'état qui empêchent ce retour visuel d'être fiable (état non persisté après reload, listes non mises à jour localement après succès).

## Portée

**Inclus :**
1. Système d'animation partagé (cœur qui se remplit avec rebond, transition de bouton, pulse de succès) — cohérent dans tous les composants d'interaction.
2. Suivi fiable de l'état "aimé" par profil, y compris dans les grilles/piles (pas seulement la page détail), persistant après rechargement.
3. Busy-state **par carte/ligne**, plus par grille entière.
4. Petit indicateur de chargement (spinner) sur les boutons asynchrones — aucun n'en a actuellement.
5. Mise à jour locale immédiate des listes après succès (accepter une demande, "aimer en retour") au lieu de compter uniquement sur la navigation/un rechargement complet.

**Exclus (hors scope, non demandé) :**
- Rafraîchissement réactif des badges globaux de navigation (Demandes/Messages) — nécessite un mécanisme plus large (polling ou websocket sur les compteurs), traité séparément si besoin.
- Fusion des handlers dupliqués swipe/grille dans `explorer/page.tsx` — dette structurelle mineure, pas de défaut visible pour l'utilisateur.
- Le fait que "Message" déclenche un Like en coulisse — comportement intentionnel documenté dans le code (mimique le pattern "message request" des apps de rencontre modernes), pas un bug.

## Conception

### 1. `Icon` — support de `fill` et `strokeWidth`

`frontend/src/components/ui/Icon.tsx` transmet actuellement seulement `size`/`className` au composant Lucide. Lucide accepte nativement `fill` et `strokeWidth` en props SVG. On étend la signature de `Icon` pour les transmettre (optionnels, défauts inchangés) — c'est le seul point de blocage empêchant un cœur "rempli".

### 2. Classes d'animation partagées (`globals.css`)

Le fichier a déjà un pattern établi (`fade-in`, `fade-in-up`, `fade-in-down`, `scale-in`, tous respectueux de `prefers-reduced-motion`). On ajoute dans le même style :

- `@keyframes heart-pop` — scale 1 → 1.3 → 1 sur ~280ms (rebond léger, cohérent avec le choix "subtil et fluide" déjà validé), déclenché en ajoutant/retirant une classe `.animate-heart-pop` au moment du clic (pas en boucle).
- Une classe utilitaire `.btn-success-flash` (transition `background-color`/`color` ~200ms) pour les boutons qui changent d'état permanent (aimé, demande acceptée) — réutilise les tokens de couleur existants (`bg-primary/20 text-primary`, déjà utilisé par la page profil détail) plutôt que d'introduire une nouvelle palette.
- Toutes respectent `@media (prefers-reduced-motion: reduce)` comme les 4 classes existantes.

### 3. Petit composant `Spinner` (nouveau, `components/ui/`)

Aucun spinner n'existe dans le projet. On ajoute un composant minimal réutilisant l'icône Lucide `RefreshCw` (déjà importée dans `Icon.tsx`) avec une classe `animate-spin` (utilitaire Tailwind natif, pas de keyframe custom nécessaire). Utilisé à la place du texte statique sur les boutons en vol (like, message, accepter/refuser, envoyer, checkout).

### 4. État "aimé" propagé aux grilles/piles

Actuellement seule `GET /api/profiles/[userId]` renvoie `liked`. Pour que `SwipeCard`, `ProfileGridCard`, `RecommendedProfileCard` sachent afficher un cœur déjà rempli après rechargement, `GET /api/profiles/explorer` et `GET /api/profiles/discover` doivent inclure `liked: boolean` par profil (un `Like.findMany` sur les ids retournés, ou un `select` joint — pattern déjà utilisé par `/api/likes/received` pour calculer `likedBack`). C'est un ajout de champ, pas un changement de contrat existant — rétrocompatible.

Les 3 composants de carte reçoivent une nouvelle prop `liked?: boolean` et gèrent un état local optimiste : au clic réussi sur "like", on bascule `liked` à `true` immédiatement (avant même la réponse si on veut un feedback instantané — mais on reste sur *après succès* pour rester cohérent avec le pattern déjà validé de la page profil détail, qui ne fait pas d'optimistic update). Le cœur applique alors `fill={liked ? 'currentColor' : 'none'}` + la classe `animate-heart-pop` le temps de la transition + une couleur de fond différente (même pattern que `profils/[userId]/page.tsx:211`).

### 5. Busy-state par carte, pas par grille

`explorer/page.tsx` (`busy`) et `decouvrir/page.tsx` (`acting`) passent d'un `boolean` partagé à un `Set<string>` (ou `string | null` pour un seul id en vol) d'ids de profils en cours de traitement — même pattern déjà correct dans `demandes/page.tsx` (`respondingId`) et `likes/page.tsx` (`likingId`). Seule la carte concernée se désactive/affiche le spinner ; les autres restent interactives.

### 6. Mise à jour locale immédiate après succès

- `demandes/page.tsx` `respond()` : sur `ACCEPT`, avant la navigation, retirer immédiatement la ligne de `received` (même pattern que le chemin `DECLINE`, qui le fait déjà correctement) — évite qu'une ligne reste visuellement `PENDING` si la navigation est retardée.
- `likes/page.tsx` `likeBack()` : sur succès, basculer `likes[i].likedBack = true` localement avant la navigation (et réinitialiser `likingId` dans les deux branches, pas seulement `catch`), pour que le bouton affiche l'état "Aimé" correctement même si la navigation ne se produit pas immédiatement.
- `explorer/page.tsx` `onLikeGrid` : après succès, appliquer le nouvel état `liked` optimiste sur la carte concernée (voir §4) au lieu de ne rien changer visuellement.
- `decouvrir/page.tsx` `onLike` : idem, applique l'état `liked` sur l'entrée correspondante du tableau `recommended`.

### Composants/fichiers touchés

| Fichier | Nature du changement |
|---|---|
| `frontend/src/components/ui/Icon.tsx` | ajout props `fill`/`strokeWidth` |
| `frontend/src/components/ui/Spinner.tsx` | nouveau composant |
| `frontend/src/app/globals.css` | ajout `heart-pop` keyframe + `.btn-success-flash` |
| `frontend/src/components/yeoyo/SwipeCard.tsx` | prop `liked`, animation cœur, spinner |
| `frontend/src/components/yeoyo/ProfileGridCard.tsx` | idem |
| `frontend/src/components/yeoyo/RecommendedProfileCard.tsx` | idem |
| `frontend/src/components/yeoyo/ContactRequestCard.tsx` | spinner sur accepter/refuser, transition de couleur |
| `frontend/src/app/app/explorer/page.tsx` | busy-state par carte, état `liked` local, spinner |
| `frontend/src/app/app/decouvrir/page.tsx` | idem |
| `frontend/src/app/app/demandes/page.tsx` | retrait local immédiat sur ACCEPT, spinner |
| `frontend/src/app/app/likes/page.tsx` | bascule locale `likedBack`, spinner |
| `frontend/src/app/app/messages/[id]/page.tsx` | animation sur "Ajouter un like" (cohérence avec le reste), spinner sur envoi |
| `frontend/src/app/app/profils/[userId]/page.tsx` | réutilise le nouveau système d'animation (déjà correct fonctionnellement, aligné visuellement) |
| `frontend/src/app/api/profiles/explorer/route.ts` | ajoute `liked: boolean` par profil |
| `frontend/src/app/api/profiles/discover/route.ts` | idem |

### Tests

Les routes API modifiées (`explorer`, `discover`) ont des tests Vitest existants (`*.test.ts` à côté des routes) — étendre les fixtures pour couvrir le nouveau champ `liked`. Pas de nouveaux tests E2E (aucun harnais E2E dans le projet, cf. CLAUDE.md — vérification manuelle via `pnpm dev` en fin d'implémentation).

## Auto-review

- Pas de placeholder/TBD.
- Cohérence : le pattern d'état local optimiste choisi (après succès, pas avant) est cohérent avec l'unique implémentation existante qui fonctionne déjà bien (page profil détail) — pas de nouveau pattern inventé.
- Portée : resserrée sur les 5 points validés par l'utilisateur, exclusions explicites listées.
- Ambiguïté : le point sur "optimistic update avant vs après réponse serveur" est tranché explicitement (après succès) pour rester cohérent avec le code existant qui marche.
