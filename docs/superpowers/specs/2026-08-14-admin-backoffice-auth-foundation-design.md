# Back-office admin YeOyo — Fondation auth/rôles/2FA (sous-projet 1/8)

Date: 2026-08-14
Statut: approuvé (design), en attente de plan d'implémentation

## Contexte

Le brief initial demandait un back-office administrateur complet (dashboard,
utilisateurs, abonnements, modération, support, contenu/notifications,
statistiques, gestion des rôles) construit sur Supabase.

Investigation du dépôt : ce projet n'utilise **pas** Supabase. C'est un
starter Next.js 16 sur **Prisma 5 + Neon Postgres**, avec une auth JWT/cookie
maison (`frontend/src/lib/server/auth.ts`, fichier protégé — voir
`CLAUDE.md`). Un back-office admin existe **déjà** partiellement :
`frontend/src/app/admin/*` (dashboard, membres, signalements, vérification)
et `frontend/src/app/api/admin/*` (users, reports, verification-queue,
withdrawals, audit-log, stats/overview, email-queue, rate-limits, `/me`),
avec rôles `USER < ADMIN < SUPERADMIN` sur le modèle `User` et un audit log
(`AdminAction`) déjà en place. Thème actuel : sombre/or (pas la palette
terracotta/vert forêt claire demandée).

Décision utilisateur : **étendre l'existant** (pas de migration Supabase),
et **ne pas dévier vers d'autres technologies** — Neon/Prisma reste la base
partout où le brief entre en conflit avec l'architecture existante.

Le projet complet est découpé en 8 sous-projets séquencés (validé avec
l'utilisateur) :

1. **Fondation auth/rôles/2FA** ← ce document
2. Refonte du thème (terracotta/vert forêt, fond clair)
3. Extensions module Utilisateurs (documents de vérification, bannissement
   motivé, déconnexion forcée, reset mot de passe)
4. Abonnements & paiements (plans tarifaires, remboursements, export CSV)
5. Extensions modération (faux positifs IA, historique enrichi)
6. Support & assistance (ticketing — nouveau)
7. Contenu & notifications (envoi groupé, textes CGU/FAQ éditables — nouveau)
8. Statistiques approfondies (géo, pyramide des âges, rétention/churn)

Chaque sous-projet aura son propre cycle design → plan → implémentation.
Ce document couvre uniquement le sous-projet 1, qui est un prérequis pour
tous les autres (auth, rôles, gate d'accès).

## Portée

**Inclus :**
1. Rôle `MODERATOR` ajouté à la hiérarchie existante (`USER < MODERATOR <
   ADMIN < SUPERADMIN`), scopé modération + support uniquement.
2. Page de connexion admin dédiée `/admin/login`, séparée de la navigation
   publique, email/mot de passe uniquement (pas de Google), réutilisant les
   primitives d'auth existantes (`hashPassword`, `verifyPassword`,
   `setAuthCookies`, `setCsrfCookie`) sans modifier `auth.ts`.
3. 2FA TOTP obligatoire disponible pour SUPERADMIN (setup/enable/disable),
   avec codes de récupération à usage unique.
4. Invitation d'admin par email (lien à usage unique, Resend) avec
   attribution de rôle, et révocation.
5. Page `/admin/roles` (SUPERADMIN uniquement) : liste des admins, invitation,
   changement de rôle, révocation.
6. Bootstrap du compte SUPERADMIN initial `jeffyengo@gmail.com` (correction
   de la faute de frappe `gmai.com` → `gmail.com`, confirmée par
   l'utilisateur) avec mot de passe temporaire généré.
7. Journal d'audit pour toute mutation (invite, révocation, changement de
   rôle, activation/désactivation 2FA) via `logAdminAction` existant.

**Exclus (traité dans un sous-projet ultérieur) :**
- Refonte visuelle (thème actuel dark/or conservé pour ce sous-projet).
- RLS Postgres au sens Supabase : sans objet ici — aucun client ne parle
  directement à la base, tout passe par les routes API server-side déjà
  gardées par `requireAdmin`/`requireOrgRole`. C'est l'équivalent
  fonctionnel de RLS dans cette architecture ; pas de policies SQL
  supplémentaires à écrire.
- Modules Utilisateurs/Abonnements/Modération/Support/Contenu/Statistiques
  détaillés (sous-projets 3 à 8).

## Conception

### 1. Modèle de données (`prisma/schema.prisma`, additif)

- `User.role` : commentaire mis à jour pour documenter `MODERATOR` comme
  valeur valide (le champ reste un `String`, pas de migration requise pour
  ça).
- `User` gagne trois colonnes (migration requise) :
  - `twoFactorSecret String?` (secret TOTP, chiffré au repos si un mécanisme
    de chiffrement symétrique existe déjà dans `crypto.ts` — sinon stocké
    tel quel comme les autres secrets applicatifs, à trancher pendant le
    plan).
  - `twoFactorEnabled Boolean @default(false)`.
  - `twoFactorRecoveryCodes Json?` (tableau de hachages bcrypt, jamais le
    code en clair après génération).
- Nouveau modèle `AdminInvite` : `id`, `email`, `role` (MODERATOR|ADMIN|
  SUPERADMIN), `tokenHash` (unique), `invitedById → User`, `expiresAt`,
  `acceptedAt`, `revokedAt`, `createdAt`. Index sur `email` et `tokenHash`.
- Nouveau modèle `AdminTwoFactorChallenge` : `id`, `userId → User`,
  `expiresAt`, `attempts`, `consumedAt`, `createdAt`. Pont entre
  mot-de-passe-vérifié et TOTP-vérifié pendant le login SUPERADMIN — évite
  d'émettre les cookies d'auth avant la validation du second facteur.

### 2. Fichier protégé touché : `middleware/require-admin.ts`

Ajout de `MODERATOR` au type `AdminRole` et à `ROLE_RANK` :
`USER:0, MODERATOR:1, ADMIN:2, SUPERADMIN:3` (décale ADMIN/SUPERADMIN d'un
cran). Changement additif et mécanique, mais le fichier est sur la liste
protégée de `CLAUDE.md` — confirmation explicite demandée avant édition,
avec vérification préalable (grep) qu'aucun code n'utilise un littéral
numérique de rang au lieu de `roleRank()`.

### 3. Connexion + 2FA (nouvelles routes uniquement, `auth.ts` non modifié)

- `POST /api/admin/login` : email + mot de passe. Rejette (message
  générique "identifiants invalides", pas de fuite de rôle) si
  `roleRank(role) < roleRank('MODERATOR')`. Rate-limit par email comme le
  login utilisateur existant. Si SUPERADMIN + `twoFactorEnabled` → crée un
  `AdminTwoFactorChallenge`, répond `{ twoFactorRequired: true,
  challengeId }` sans poser de cookies. Sinon, émet les cookies immédiatement
  via les primitives existantes.
- `POST /api/admin/2fa/verify` : `{ challengeId, code }` (TOTP ou code de
  récupération) → émet les cookies au succès ; verrouille après N échecs.
- `POST /api/admin/2fa/setup` / `/enable` / `/disable` (SUPERADMIN,
  authentifié) : génère secret TOTP (lib `otpauth`, nouvelle dépendance,
  zero-dependency) + codes de récupération affichés une seule fois ;
  l'activation exige la confirmation d'un code valide ; la désactivation
  exige mot de passe + code TOTP.

### 4. Invitations admin

- `POST /api/admin/invites` (SUPERADMIN) : `{ email, role }` → crée
  l'invite, envoie l'email via `lib/server/email.ts` (pattern identique à
  password-reset, pas besoin de l'outbox — ce n'est pas déclenché par un
  webhook).
- `GET /api/admin/invites` : liste (SUPERADMIN).
- `POST /api/admin/invites/[id]/revoke` (SUPERADMIN).
- `POST /api/admin/invites/accept` (public, token en body) : définit le mot
  de passe, crée ou promeut le `User`, marque l'invite acceptée, redirige
  vers `/admin/login`.
- Chaque mutation passe par `logAdminAction`.

### 5. Pages front-end

- Restructuration de `/admin/*` : le layout actuel (`AdminLayout`) protège
  **toutes** les routes filles via un appel à `/api/admin/me`, ce qui
  boucle si `/admin/login` est dessous. Le shell authentifié passe dans un
  groupe de routes dédié ; `/admin/login`, `/admin/2fa` (étape du login) et
  `/admin/invites/accept` deviennent des pages soeurs avec leur propre
  layout minimal, hors du guard.
- `/admin/login` : formulaire email/mot de passe, puis étape code TOTP si
  `twoFactorRequired`.
- `/admin/roles` (SUPERADMIN) : branché sur l'entrée sidebar existante
  "Gestion des rôles admin" (déjà prévue dans `AdminSidebar.tsx` comme
  placeholder "Bientôt") — liste des admins, formulaire d'invitation,
  changement de rôle, révocation.
- Écran de setup 2FA pour SUPERADMIN (QR code à partir de l'URI `otpauth://`
  + affichage unique des codes de récupération).

### 6. Bootstrap du compte initial

`scripts/make-superadmin.ts` (non protégé) étendu : si l'email n'existe pas
encore, crée le `User` avec un mot de passe temporaire fort généré
aléatoirement (affiché une seule fois dans le terminal, jamais loggé côté
serveur), rôle `SUPERADMIN`, `emailVerifiedAt` posé directement (compte
créé par un humain avec accès shell, pas de vérification email nécessaire).
Exécuté pour `jeffyengo@gmail.com`.

### 7. Tests

Tests unitaires Vitest pour : le décalage de `ROLE_RANK`, les handlers
login/2fa/invites (même pattern que `audit.test.ts`/`crypto.test.ts`), et
vérification que les tripwires existants (`runtime-enforcement`,
doc-shape) restent verts.

## Risques / points à trancher pendant le plan

- Chiffrement au repos de `twoFactorSecret` : vérifier s'il existe déjà un
  mécanisme générique dans `crypto.ts` réutilisable, sinon documenter le
  choix.
- Confirmer qu'aucun code hors `require-admin.ts` ne dépend d'un rang
  numérique figé pour ADMIN/SUPERADMIN avant de décaler `ROLE_RANK`.
