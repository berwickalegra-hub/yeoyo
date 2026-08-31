# Programme de parrainage à points — Design

**Statut :** en attente de relecture utilisateur
**Auteur :** Claude Code (session du 2026-08-31)

## 1. Contexte

YeOyo a déjà un programme d'affiliation : un compte avec `role = 'AFFILIATE'`
est créé uniquement par un admin (invitation par email), reçoit un
`affiliateCode` unique, et gagne de vraies commissions en FCFA
(`AffiliateEarning`, versées par virement — voir `mark-paid`). Ce système
reste **inchangé** et continue de servir des partenaires/influenceurs
curatés par l'admin.

Le site étant maintenant public, l'utilisateur veut que **chaque personne
qui s'inscrit normalement sur l'app** (pas seulement les affiliés désignés)
puisse aussi parrainer d'autres personnes et gagner une récompense — mais
pas de l'argent réel : des **points internes**, convertibles en **crédits**
utilisables dans l'app (déjà la monnaie existante pour les demandes de
contact, messages flash, boosts, etc.).

## 2. Décisions confirmées avec l'utilisateur

| Décision | Valeur |
|---|---|
| Coexistence avec le programme AFFILIATE actuel | **Coexiste** — aucun changement au système FCFA existant |
| Points gagnés par parrainage vérifié | **10 points** |
| Taux de conversion points → crédits | **100 points = 1 crédit**, conversion **automatique** dès que le seuil est atteint |
| Plafond anti-abus | **10 parrainages vérifiés bonifiés par mois et par parrain** ; au-delà, le parrainage suivant ne rapporte aucun point (silencieux, pas d'erreur) |
| Génération du code de parrainage | Automatique, sans action de l'utilisateur |

## 3. Ce qui existe déjà et sera réutilisé

- `User.affiliateCode String? @unique` — généré par
  `generateUniqueAffiliateCode()` ([frontend/src/lib/server/affiliates/code.ts](../../../src/lib/server/affiliates/code.ts)).
  Aujourd'hui assigné uniquement aux comptes AFFILIATE.
- `User.referredByAffiliateId` — lien filleul → parrain, posé une seule fois
  à l'inscription, jamais modifié ensuite.
- `POST /api/auth/signup` — accepte déjà un `promoCode` optionnel
  (`?promo=CODE` sur l'URL), résout le code vers un `User`, mais **restreint
  la résolution aux comptes `role === 'AFFILIATE'`**
  ([route.ts:145](../../../src/app/api/auth/signup/route.ts#L145)).
- `POST /api/admin/verification-queue/[id]/process` — le point d'entrée
  unique où un profil passe `PENDING → VERIFIED`. C'est ici que le bonus
  d'affiliation FCFA est versé aujourd'hui (bloc lignes 79-112), protégé par
  un index unique partiel en base contre le double-versement en cas de
  double-clic admin concurrent.
- `spendCredits` / `grantCredits`
  ([frontend/src/lib/server/credits/ledger.ts](../../../src/lib/server/credits/ledger.ts))
  — choke point unique pour toute mutation de solde de crédits. Pas un
  fichier protégé (contrairement à `auth.ts`), donc modifiable pour ajouter
  un nouveau type de transaction.

## 4. Modèle de données

### 4.1 `User` — nouveau champ

```prisma
// Solde de points de parrainage — distinct du solde de crédits.
// Incrémenté de +10 à chaque parrainage vérifié (voir ReferralBonus).
// Converti automatiquement en crédits par tranche de 100 (voir §5.3).
referralPoints Int @default(0)
```

### 4.2 Nouvelle table `ReferralBonus`

Trace chaque parrainage récompensé — sert à la fois de compteur pour le
plafond mensuel et de garde-fou contre le double-versement (contrainte
unique sur le filleul : un même compte ne peut générer le bonus qu'une
seule fois, quoi qu'il arrive).

```prisma
model ReferralBonus {
  id             String   @id @default(cuid())
  referrerId     String
  referrer       User     @relation("ReferralBonusesGiven", fields: [referrerId], references: [id], onDelete: Cascade)
  referredUserId String   @unique
  referredUser   User     @relation("ReferralBonusesReceived", fields: [referredUserId], references: [id], onDelete: Cascade)
  points         Int      // toujours 10 aujourd'hui, laissé flexible
  createdAt      DateTime @default(now())

  @@index([referrerId, createdAt])
}
```

`@@unique` sur `referredUserId` (via l'attribut `@unique` du champ) est une
contrainte pleine, pas partielle — pas besoin du contournement de migration
manuelle utilisé pour `AffiliateEarning` (qui devait cohabiter avec
d'autres `type` dans la même table). Ici la table est dédiée, donc l'unicité
est simple.

### 4.3 `CreditTransaction` — nouveau type

Le commentaire de `type` passe de
`// PURCHASE | SPEND | ADMIN_GRANT | WELCOME_GIFT`
à
`// PURCHASE | SPEND | ADMIN_GRANT | WELCOME_GIFT | REFERRAL_CONVERSION`.

`GrantInput['type']` dans `ledger.ts` gagne `'REFERRAL_CONVERSION'` dans son
union. Pas de nouvelle colonne — `action: 'referral_points_conversion'`
suffit pour l'affichage dans l'historique existant (Paramètres > Paiement).

### 4.4 Migration

Comme pour les migrations précédentes de cette session (pas de TTY
disponible pour `migrate dev` dans cet environnement), le plan
d'implémentation devra écrire un dossier de migration horodaté à la main
sous `frontend/prisma/migrations/`, puis exécuter `prisma migrate deploy`.

## 5. Logique serveur

### 5.1 Inscription — deux changements dans `POST /api/auth/signup`

1. **Retirer la restriction de rôle** ligne 145 : au lieu de
   `if (affiliate && affiliate.role === 'AFFILIATE')`, accepter n'importe
   quel `User` existant dont le `affiliateCode` correspond — `role` n'entre
   plus en compte pour la résolution de `referredByAffiliateId`. Le
   branchement selon le rôle du parrain se fait plus tard, uniquement au
   moment de verser le bonus (§5.2), pas à l'inscription.
2. **Décision à confirmer avant le plan d'implémentation** (voir §8) : la
   génération de `affiliateCode` pour un compte non-AFFILIATE. Deux options :
   - **Option A — génération paresseuse (recommandée)** : le code est
     généré la première fois que l'utilisateur consulte l'écran
     "Parrainage" (nouvel endpoint `GET /api/referral/me`, voir §5.4).
     Avantage : couvre uniformément l'inscription par email **et** par
     Google OAuth sans toucher `oauth/google/callback/route.ts`, qui est un
     fichier protégé par CLAUDE.md (comptes créés par ce flux ne passent
     jamais par `POST /api/auth/signup`).
   - **Option B — génération à la création** : ajouter la génération dans
     `tx.user.create` de `POST /api/auth/signup`, comme le fait déjà le
     flux d'acceptation d'invitation affilié. Ne couvrirait PAS les
     comptes créés via Google OAuth sans une modification explicitement
     confirmée du fichier protégé.

   Ce design retient l'**Option A** par défaut (couverture uniforme, zéro
   fichier protégé touché). L'effet pour l'utilisateur est identique : le
   code existe dès qu'il en a besoin, sans action de sa part.

### 5.2 Vérification de profil — nouvelle branche dans `verification-queue/[id]/process`

Dans la transaction existante, juste après le bloc `AFFILIATE` (lignes
79-112), ajouter :

```
sinon si approve ET profile.user.referredByAffiliateId existe
   ET le référent (User référencé par referredByAffiliateId) a role !== 'AFFILIATE' :

  1. Compter les ReferralBonus du référent créés depuis le début du mois
     calendaire en cours.
  2. Si le compte est déjà >= 10 : ne rien faire (aucun point, aucun log
     autre que l'action d'admin déjà journalisée plus bas).
  3. Sinon :
     a. tx.referralBonus.createMany({ data: [{ referrerId, referredUserId,
        points: 10 }], skipDuplicates: true })
        → skipDuplicates protège contre un double-traitement concurrent de
          la même vérification (même pattern que AffiliateEarning).
     b. Si count === 0 (la ligne existait déjà — traitement concurrent
        déjà passé) : ne rien faire de plus.
     c. Si count === 1 (vraiment inséré) :
        - Incrémenter User.referralPoints du référent de +10 dans la même
          transaction.
        - Relire le nouveau solde ; si >= 100 : calculer
          creditsAGagner = Math.floor(solde / 100), nouveauSolde = solde % 100,
          mettre à jour referralPoints à nouveauSolde, puis appeler
          grantCredits(tx, { userId: referrerId, amount: creditsAGagner,
          type: 'REFERRAL_CONVERSION', action: 'referral_points_conversion' }).
```

**Note sur la fenêtre de course résiduelle :** si le même parrain a
plusieurs filleuls vérifiés à la milliseconde près (scénario très
improbable, différents admins traitant différentes vérifications en
parallèle), le comptage du plafond mensuel (étape 1) peut légèrement
dépasser 10 dans de très rares cas — comme pour un compteur non
verrouillé. Ce n'est pas un enjeu d'argent réel (contrairement aux retraits
FCFA, qui utilisent un verrou consultatif) donc aucun verrou n'est ajouté
ici ; l'impact d'un léger dépassement occasionnel est négligeable.

### 5.3 Nouveau endpoint `GET /api/referral/me`

Auth requise (`requireAuth`). Retourne (et génère paresseusement si absent,
voir §5.1 Option A) le `affiliateCode` de l'utilisateur courant, son
`referralPoints`, et l'URL de partage complète, construite exactement comme
le fait déjà `GET /api/affiliate/me` pour les affiliés
([route.ts:115](../../../src/app/api/affiliate/me/route.ts#L115)) :
`${process.env.APP_URL ?? 'http://localhost:3000'}/onboarding?promo=${code}`
— la page `/onboarding` lit déjà ce paramètre et le prérempli dans son champ
"Code promo" (voir [onboarding/page.tsx:384](../../../src/app/onboarding/page.tsx#L384)).

## 6. Interface

Nouvelle section "Parrainage" (Paramètres, ou un onglet dédié — à trancher
dans le plan) affichant :
- Le code + un bouton copier/partager.
- Une barre de progression : `"{referralPoints}/100 points — encore
  {100 - referralPoints} points pour ton prochain crédit"`.
- Les crédits déjà gagnés par ce biais restent visibles dans l'historique
  de crédits existant (Paramètres > Paiement), grâce au nouveau type
  `REFERRAL_CONVERSION` — aucun nouvel écran d'historique à construire.

## 7. Tests

- `POST /api/auth/signup` : le retrait de la restriction de rôle doit être
  couvert par un nouveau cas — un `promoCode` pointant vers un utilisateur
  normal (non-AFFILIATE) doit maintenant poser `referredByAffiliateId`.
  Les tests existants (résolution vers un compte AFFILIATE, code inconnu,
  pas de code) doivent continuer à passer sans modification.
- `POST /api/admin/verification-queue/[id]/process` : nouveaux cas —
  parrain normal sous le plafond (points +10, pas de conversion), parrain
  qui franchit le seuil de 100 (conversion automatique, solde restant
  correct), parrain déjà à 10 bonus ce mois-ci (rien ne se passe), parrain
  AFFILIATE (chemin FCFA existant inchangé — test de non-régression).
- `GET /api/referral/me` : génération paresseuse du code au premier appel,
  code stable aux appels suivants, calcul correct de l'URL de partage.
- Pas de couverture automatisée attendue pour la nouvelle section
  d'interface "Parrainage" — vérification manuelle uniquement.

## 8. Décisions restant à confirmer avant le plan d'implémentation

1. **Génération paresseuse du code (§5.1)** — confirmer que l'Option A
   (génération au premier accès à `/api/referral/me`, plutôt qu'à
   l'inscription elle-même) convient, puisqu'elle est nécessaire pour
   éviter de toucher au fichier protégé `oauth/google/callback/route.ts`.
2. **Emplacement de l'écran "Parrainage"** — proposition par défaut :
   Paramètres, à côté de l'historique de crédits existant (Paramètres >
   Paiement) puisque les crédits gagnés par ce biais y apparaîtront de
   toute façon. À confirmer, ou préciser un autre emplacement (Profil, nouvel
   onglet dédié).

## Hors périmètre (explicitement exclu)

- Auto-parrainage : aucune détection technique n'est ajoutée pour
  empêcher un utilisateur de s'inscrire deux fois et se parrainer
  lui-même — le plafond mensuel (10/mois) limite déjà l'impact, et
  `referredByAffiliateId` ne peut de toute façon jamais pointer vers
  soi-même (on ne connaît pas son propre `id` avant que le compte existe).
- Notification poussée/email quand un point ou un crédit est gagné —
  visible uniquement dans l'écran Parrainage et l'historique de crédits.
- Migration rétroactive des utilisateurs déjà inscrits sans `affiliateCode`
  — couverte naturellement par la génération paresseuse (§5.1).
- Tout changement au programme AFFILIATE existant (cash FCFA, invitations
  admin, `/affilie/*`).

## Contraintes globales

- Montants en crédits toujours entiers (jamais de décimales).
- `spendCredits` / `grantCredits` restent l'unique point d'entrée pour
  toute mutation de solde de crédits.
- Aucun fichier de la liste protégée de CLAUDE.md n'est modifié
  (`auth.ts`, `oauth/google.ts` et ses routes, `middleware/index.ts`,
  etc.).
- Chaque Route Handler garde `export const runtime = 'nodejs'`.
- Chaque route mutante appelle `verifyCsrf(req)`.
