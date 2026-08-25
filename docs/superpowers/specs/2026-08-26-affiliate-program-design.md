# Programme d'affiliation YeOyo — Design

**Date**: 2026-08-26
**Statut**: Approuvé par l'utilisateur en chat (design par sections) — en attente de relecture de ce document avant plan d'implémentation.

## 1. Objectif

Ajouter un programme d'affiliation à YeOyo : des comptes "Affilié" (rôle séparé, sans accès au reste de l'app) génèrent un code unique, touchent une prime quand un profil qu'ils ont amené est vérifié par un admin, et une commission de 15% sur les achats de crédits des hommes qu'ils ont amenés, dans les 30 jours suivant l'inscription. Un admin peut suivre les montants dus par affilié et marquer un versement comme effectué manuellement (pas de virement automatique en V1).

**Principe non négociable, redit par l'utilisateur** : un gain n'est jamais comptabilisé sur une promesse — uniquement sur un événement confirmé en base (profil réellement passé à VERIFIED par un admin ; paiement réellement confirmé PAID par Chariow). Aucune commission n'est "estimée" ou "en attente de confirmation" dans les compteurs de gains.

## 2. Modèle de données

### 2.1 `User` — 3 champs ajoutés, pas de nouvelle table pour l'identité affilié

```prisma
model User {
  // ... champs existants inchangés ...

  // Rôle affilié — un compte AFFILIATE est un compte séparé, créé par un
  // SUPERADMIN, jamais un utilisateur classique de l'app de rencontre en
  // parallèle (décision explicite : "compte séparé, accès uniquement à
  // l'espace affilié"). `role` reste un simple String — ajouter "AFFILIATE"
  // comme 5e valeur ne nécessite aucune migration d'enum.
  // role String @default("USER") // USER | MODERATOR | ADMIN | SUPERADMIN | AFFILIATE

  // Code unique de l'affilié — posé uniquement quand role="AFFILIATE",
  // généré à la création du compte (voir §4), jamais régénéré ensuite (un
  // lien déjà partagé doit rester valide).
  affiliateCode          String?   @unique

  // Filleul → parrain. Posé UNE SEULE FOIS, à l'inscription (voir §5),
  // jamais modifié après — "référence permanente" (demande explicite).
  referredByAffiliateId  String?
  referredByAffiliate    User?     @relation("AffiliateReferrals", fields: [referredByAffiliateId], references: [id], onDelete: SetNull)
  referredUsers          User[]    @relation("AffiliateReferrals")

  affiliateEarnings      AffiliateEarning[] @relation("AffiliateEarnings")
  earningsGenerated      AffiliateEarning[] @relation("ReferredUserEarnings")

  @@index([affiliateCode])
  @@index([referredByAffiliateId])
}
```

`onDelete: SetNull` sur `referredByAffiliate` : si un compte affilié est un jour supprimé (hors scope V1 — pas de suppression de compte affilié prévue dans l'UI), les filleuls ne sont pas cascadés, seule la référence est vidée.

### 2.2 Nouveau modèle `AffiliateEarning`

Une ligne = un gain réel, jamais modifiée après création sauf `paidAt`.

```prisma
model AffiliateEarning {
  id             String    @id @default(cuid())
  affiliateId    String
  affiliate      User      @relation("AffiliateEarnings", fields: [affiliateId], references: [id], onDelete: Cascade)
  referredUserId String
  referredUser   User      @relation("ReferredUserEarnings", fields: [referredUserId], references: [id], onDelete: Cascade)
  type           String    // VERIFICATION_BONUS | CREDIT_COMMISSION
  amount         Int       // FCFA, toujours positif
  // Set uniquement pour type=CREDIT_COMMISSION — référence informative
  // vers l'Order qui a déclenché la commission (même convention que
  // CreditTransaction.relatedOrderId : pas de FK stricte, ne doit jamais
  // faire échouer l'insertion).
  relatedOrderId String?
  // null = en attente de versement ; horodatage = versé (voir §9, marquage
  // en masse par l'admin).
  paidAt         DateTime?
  createdAt      DateTime  @default(now())

  @@index([affiliateId, paidAt])
  @@index([referredUserId, type])
}
```

**Garde-fou "une seule prime de vérification par compte, jamais deux"** (demande explicite de l'utilisateur, confirmée) :
- Vérification applicative : avant d'insérer une ligne `VERIFICATION_BONUS`, la transaction vérifie qu'aucune ligne `VERIFICATION_BONUS` n'existe déjà pour ce `referredUserId` — si oui, no-op silencieux (le profil est quand même approuvé normalement, juste sans nouvelle prime).
- Garde-fou en base, en plus (au cas où deux requêtes concurrentes passeraient la vérification applicative en même temps) : un **index unique partiel Postgres**, ajouté via SQL brut dans la migration (Prisma ne supporte pas les index uniques partiels nativement dans le schema) :
  ```sql
  CREATE UNIQUE INDEX "AffiliateEarning_one_verification_bonus_per_user"
    ON "AffiliateEarning" ("referredUserId")
    WHERE "type" = 'VERIFICATION_BONUS';
  ```
  Cet index n'affecte pas `CREDIT_COMMISSION`, qui doit au contraire pouvoir avoir plusieurs lignes par filleul (un achat = une commission, potentiellement plusieurs achats dans la fenêtre de 30 jours).
- Ce garde-fou reste valable même si `Profile.verificationStatus` repasse par PENDING plusieurs fois (aujourd'hui, aucun flux de resoumission n'existe dans le code — un profil REJECTED ou VERIFIED ne repasse pas automatiquement à PENDING) : si un tel flux est ajouté plus tard, la prime ne sera quand même jamais payée deux fois grâce à ce garde-fou, sans changement nécessaire.

## 3. Contrôle d'accès

### 3.1 Nouveau fichier `frontend/src/lib/server/middleware/require-affiliate.ts`

Ne touche à aucun fichier protégé — même esprit que `require-admin.ts` (rôle + rang), mais AFFILIATE est un rôle isolé, pas un échelon de la hiérarchie USER<MODERATOR<ADMIN<SUPERADMIN.

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/server/auth'; // lecture seule, fichier protégé mais son export public est utilisable
import { prisma } from '@/lib/server/prisma';
import { cookies } from 'next/headers';

export interface AffiliateContext {
  affiliate: { id: string; email: string; affiliateCode: string };
}

export async function requireAffiliate(): Promise<AffiliateContext | NextResponse> {
  // Même mécanique de lecture de cookie/JWT que requireAdmin (voir
  // middleware/index.ts) — un compte AFFILIATE utilise EXACTEMENT le même
  // système d'auth (cookies, refresh, CSRF) que tout autre compte, seul le
  // rôle change ce à quoi il a accès. Pas de nouveau système d'auth.
  // ... résolution identique à requireAdmin, mais vérifie role === 'AFFILIATE' ...
}
```

*(Le plan d'implémentation détaillera l'implémentation exacte en réutilisant les helpers déjà exportés par `middleware/index.ts` — la vraie logique de vérification JWT reste dans les fichiers protégés existants, ce nouveau fichier ne fait qu'ajouter le gate de rôle, comme `require-admin.ts` le fait pour ADMIN/SUPERADMIN.)*

### 3.2 Isolation stricte

- `requireAffiliate` rejette (403) toute autre valeur de `role`.
- Aucune route `/api/affilie/*` n'est accessible à un ADMIN/USER/MODERATOR/SUPERADMIN sans le rôle AFFILIATE — même un SUPERADMIN n'a pas d'accès direct à l'espace affilié via son propre compte (il gère les affiliés depuis le back-office, §9, pas en se connectant "en tant qu'affilié").
- Un compte AFFILIATE tentant d'accéder à `/app/*` (l'app de rencontre) ou `/admin/*` est redirigé/rejeté — un compte affilié n'a pas de `Profile` et ne doit jamais pouvoir en créer un dans ce rôle.

## 4. Création d'un compte affilié (admin uniquement)

Nouvelle route `POST /api/admin/affiliates` (SUPERADMIN uniquement — génère un accès qui produit de l'argent, même niveau de restriction que la gestion des rôles admin) :
- Body : `{ email, name }`.
- Réutilise **exactement** le flux déjà en place pour `AdminInvite` (email avec lien de définition de mot de passe, token à durée limitée haché en base) plutôt que d'inventer un second mécanisme — aucun mot de passe en clair n'est généré côté serveur ni envoyé par email. Concrètement : soit `AdminInvite.role` est élargi pour accepter `'AFFILIATE'` en plus de `MODERATOR|ADMIN|SUPERADMIN` (réutilise la table telle quelle), soit un modèle jumeau minimal est créé si le plan révèle un couplage trop fort avec la sémantique "admin" — décision technique fine laissée au plan, le comportement utilisateur (lien par email, définition du mot de passe, expiration) est lui non négociable et fixé ici.
- Génère `affiliateCode` : format court, lisible, unique — ex. 8 caractères alphanumériques majuscules (évite les caractères ambigus 0/O, 1/I), avec retry sur collision (extrêmement rare mais géré).
- Crée le `User` avec `role: 'AFFILIATE'` au moment où l'invitation est acceptée (même timing que la création de compte admin actuelle — pas de `User` orphelin créé avant acceptation).
- `logAdminAction` : `action: 'affiliate.create'`.

Pas d'auto-inscription publique pour ce rôle en V1.

## 5. Capture du code à l'inscription

`frontend/src/app/api/auth/signup/route.ts` (fichier non protégé, modifiable) :
- `Body` gagne `promoCode: z.string().trim().optional()`.
- Avant la transaction de création, si `promoCode` est fourni : `prisma.user.findUnique({ where: { affiliateCode: promoCode.toUpperCase() } })` — si trouvé ET `role === 'AFFILIATE'`, son `id` devient `referredByAffiliateId` sur le nouveau `User`, **dans la même transaction** que la création du compte (déjà une transaction existante, un seul champ ajouté à `tx.user.create`).
- Code invalide/inconnu : signup continue normalement, `referredByAffiliateId` reste `null` — jamais d'erreur bloquante sur un mauvais code (l'inscription ne doit jamais échouer à cause d'un code promo cassé).
- Toujours enumeration-resistant : la branche "email déjà existant" ne traite jamais de code promo (comportement inchangé).

Le champ "code promo" apparaît sur le formulaire d'inscription public (`frontend/src/app/onboarding/page.tsx` ou la page de signup dédiée si distincte) comme un champ texte optionnel, pré-rempli automatiquement si l'URL contient `?promo=CODE` (le lien donné à l'affilié en §7 pointe vers `https://yeoyo.net/onboarding?promo=CODE`) — l'utilisateur peut aussi le taper manuellement si on lui a donné le code sans le lien complet.

## 6. Déclenchement des gains

### 6.1 Prime de vérification

Dans `POST /api/admin/verification-queue/[id]/process` (déjà modifié la session précédente pour accepter un `reason` optionnel) :
- Après la mise à jour de `Profile.verificationStatus → VERIFIED` (branche APPROVE uniquement — REJECT ne déclenche jamais de prime) :
  - Si `profile.user.referredByAffiliateId` est posé :
    - Vérifier l'absence de ligne `VERIFICATION_BONUS` existante pour ce `referredUserId` (§2.2).
    - Montant : `profile.gender === 'FEMME' ? 1500 : 300` (FCFA).
    - Insérer la ligne `AffiliateEarning` **dans la même transaction** que la mise à jour du profil (actuellement `prisma.profile.update` seul — devient un `prisma.$transaction` englobant les deux écritures, garantissant qu'un profil ne peut jamais être marqué VERIFIED sans que la prime associée soit soit créée soit délibérément absente pour une raison connue — jamais un état incohérent entre les deux).

### 6.2 Commission sur achat de crédits

Dans `reconcileChariowOrder` (`frontend/src/lib/server/credits/reconcile.ts`) — **le seul endroit du code où un paiement Chariow est confirmé PAID**, déjà dans une transaction Serializable avec CAS anti-double-traitement :
- Juste après `grantCredits`, avant le `enqueueOutbox` :
  - Charger `Profile.gender` + `User.referredByAffiliateId` + `User.createdAt` pour `order.userId` (une requête, dans la même transaction).
  - Si `gender === 'HOMME'` ET `referredByAffiliateId` posé ET `paidAt <= referredUser.createdAt + 30 jours` :
    - `netAmount = Math.round(order.amount * (1 - CHARIOW_PROVIDER_FEE_PCT / 100))`
    - `commission = Math.round(netAmount * 0.15)`
    - Insérer une ligne `AffiliateEarning` (`type: CREDIT_COMMISSION`, `relatedOrderId: order.id`).
  - Aucune commission pour `gender === 'FEMME'` (les femmes n'achètent pas de crédits pour la messagerie — gratuite pour elles, donc ce cas n'arrivera de toute façon jamais en pratique, mais la condition est explicite plutôt qu'implicite).
  - Idempotence : héritée gratuitement du CAS déjà en place sur `Order.status` — cette fonction entière ne s'exécute qu'une fois par Order (webhook, cron et poll utilisateur ne peuvent jamais tous les trois créditer/commissionner deux fois le même Order), donc pas besoin d'un garde-fou séparé ici (contrairement à la prime de vérification qui peut en théorie être retraitée si un futur flux réinitialise `verificationStatus`).

## 7. Espace Affilié — `/affilie`

Nouvelles pages (client components, même style que le reste du projet — Tailwind v4, tokens existants, pas de nouvelle lib UI) :

- `frontend/src/app/affilie/login/page.tsx` — connexion dédiée (réutilise `POST /api/auth/login` existant tel quel, aucune route d'auth séparée — seul le rôle du compte détermine où il atterrit après connexion).
- `frontend/src/app/affilie/(dashboard)/layout.tsx` — gate via `requireAffiliate` (appel à une route `/api/affiliate/me`), redirige vers `/affilie/login` sinon.
- `frontend/src/app/affilie/(dashboard)/page.tsx` — le tableau de bord unique :
  - Code + lien complet (`https://yeoyo.net/onboarding?promo=CODE`), bouton copier (Clipboard API, déjà utilisé ailleurs dans le projet si applicable, sinon `navigator.clipboard.writeText`).
  - Compteurs : inscriptions totales, profils vérifiés hommes, profils vérifiés femmes (3 requêtes `count`, gender via jointure Profile).
  - Total gagné : somme `AffiliateEarning.amount` groupée par `type` (primes vs commissions) + total général, + sous-total "en attente de versement" vs "déjà versé".
  - Liste des filleuls : `firstName` du profil (pas l'email — anonymisation minimale demandée), statut de vérification, gain total généré par ce filleul (somme de ses lignes `AffiliateEarning`).
  - Date du dernier versement (`MAX(paidAt)` sur les lignes de cet affilié).

Nouvelle route `GET /api/affiliate/me` (protégée par `requireAffiliate`) — agrège tout ce qui précède en une seule réponse JSON.

## 8. Côté admin — nouvel onglet "Affiliés"

- `frontend/src/app/admin/(dashboard)/affilies/page.tsx` — accessible SUPERADMIN uniquement (gestion d'argent réel) :
  - Table : email, code, total dû (non versé), date du dernier versement, bouton "Marquer comme payé".
- `GET /api/admin/affiliates` — liste + total dû par affilié (agrégation `AffiliateEarning` groupée par `affiliateId` où `paidAt IS NULL`).
- `POST /api/admin/affiliates/[id]/mark-paid` — marque **toutes** les lignes `paidAt IS NULL` de cet affilié comme payées maintenant (`paidAt: new Date()`), en une seule opération `updateMany` — pas de montant partiel en V1 (correspond à la demande : "marquer manuellement un montant comme payé" = solder le dû). `logAdminAction` : `action: 'affiliate.mark_paid'`, metadata avec le montant total et le nombre de lignes soldées.
- Lien ajouté dans `AdminSidebar.tsx` (groupe "Finance", visible seulement si `role === 'SUPERADMIN'` — même pattern que les items déjà conditionnés par rôle dans ce fichier).
- Ajout de `POST /api/admin/affiliates` (création, §4) dans le même groupe de routes.

## 9. Variables d'environnement

Une seule nouvelle variable, ajoutée à `.env.example` :

```
# Taux de commission prélevé par Chariow sur chaque paiement (%). Utilisé
# uniquement pour calculer le montant NET servant de base aux commissions
# d'affiliation (§6.2) — Chariow ne renvoie pas ce chiffre lui-même, donc
# c'est une estimation basée sur le taux contractuel connu, pas une donnée
# réellement rapportée par leur API à chaque transaction.
CHARIOW_PROVIDER_FEE_PCT=15
```

## 10. Hors scope V1 (explicitement non construit, pas silencieusement oublié)

- Virement automatique aux affiliés (mobile money, etc.) — marquage manuel uniquement.
- Auto-inscription publique en tant qu'affilié.
- Paiement partiel du solde dû (le marquage "payé" solde tout le dû d'un coup).
- Suppression/désactivation d'un compte affilié depuis l'UI (peut être fait via la gestion des rôles admin existante en repassant `role` à `USER`, mais aucune UI dédiée).
- Historique des versements (seule la date du DERNIER versement est gardée, pas une liste de tous les versements passés).
- Multi-niveaux d'affiliation (parrainage d'affiliés par d'autres affiliés).

## 11. Plan de tests (à détailler dans le plan d'implémentation)

- Prime de vérification : jamais deux fois pour le même filleul (test direct de l'index unique partiel + de la vérification applicative).
- Commission crédits : jamais pour une femme ; jamais après 30 jours ; jamais si pas de parrain ; montant calculé correctement (brut → net → 15%).
- Signup avec code invalide : compte créé normalement, `referredByAffiliateId` null, pas d'erreur.
- `requireAffiliate` : rejette USER/ADMIN/MODERATOR/SUPERADMIN ; accepte uniquement AFFILIATE.
- `mark-paid` : solde exactement les lignes `paidAt IS NULL` au moment de l'appel, aucune ligne future n'est affectée rétroactivement.
