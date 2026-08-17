# Intégration Chariow — Documentation A → Z

> Dans cette doc, vous saurez **concrètement comment intégrer Chariow de A à Z** :
> créer un checkout (téléphone/pays compris), encaisser, créditer l'accès de façon
> fiable (webhook + réconciliation), gérer prix, devises et remises, configurer le
> tout, et déboguer chaque incident connu.

**Chariow** est un checkout **hébergé** pour le Mobile Money africain (Orange Money, Wave,
MTN, Moov…) qui encaisse aussi la **carte bancaire**. On ne parle jamais aux opérateurs :
on crée une vente via l'API, on redirige l'acheteur vers la page Chariow, puis on lit le
résultat (webhook **et/ou** réconciliation pull).

---

## 1. Vue d'ensemble

```
Membre               Backend (app)               Chariow                Backend (retour)
  │  POST /payments/checkout │                     │                        │
  │─────────────────────────>│ POST /v1/checkout   │                        │
  │                          │────────────────────>│                        │
  │                          │  { purchase, payment.checkout_url }          │
  │   302 → checkout_url     │<────────────────────│                        │
  │──────────── paie sur la page hébergée ────────>│                        │
  │                          │                     │── webhook « Pulse » ──>│  (instantané, optionnel)
  │   redirect_url (/checkout/success)             │                        │
  │───────────────────────────────────────────────────────────────────────>│  verify-checkout (poll)
  │                          │                     │<─ GET /v1/sales/{id} ──│  réconciliation (source de vérité)
```

- **Per-créateur** : chaque communauté a SON compte Chariow (clé API + productId +
  secret webhook) chiffré en base (`MobileMoneyAccount`, provider `CHARIOW`). Jamais de
  clé globale plateforme.

  > 💡 **Adaptez ce modèle de compte à votre projet.** Per-créateur vaut pour un
  > marketplace (chaque vendeur encaisse sur SON compte Chariow). Un SaaS qui vend
  > ses propres produits/crédits utilise au contraire **un compte plateforme unique**
  > (clé chiffrée au niveau app). Tout le reste de la doc — checkout, statuts,
  > réconciliation, webhook — s'applique à l'identique dans les deux cas.
- **Trois chemins de crédit**, tous idempotents, tous convergent vers `reconcile.ts` :
  1. retour utilisateur (`/checkout/success` → `POST /payments/mobile-money/verify-checkout`, poll 3 s) ;
  2. webhook « Pulse » (`POST /payments/webhooks/mobile-money/chariow?secret=…`) ;
  3. cron de réconciliation (toutes les 5 min).

## 2. Fichiers de l'intégration

> Les chemins ci-dessous pointent vers le **projet source** de cette doc (monorepo
> `backend/` + `frontend/`). Si vous lisez une copie de ce fichier dans un autre
> repo, les liens sont morts : servez-vous du tableau comme d'une carte des rôles
> à couvrir, pas comme de liens cliquables.

| Fichier | Rôle |
|---|---|
| [backend/src/modules/payments/mobilemoney/chariow.ts](../../backend/src/modules/payments/mobilemoney/chariow.ts) | Adapter Chariow : createCheckout, getPaymentStatus, parse webhook, listProducts/Discounts, téléphone |
| [backend/src/modules/payments/mobilemoney/checkout.ts](../../backend/src/modules/payments/mobilemoney/checkout.ts) | Orchestration checkout Mobile Money (agnostique provider) → `Payment` PENDING |
| [backend/src/modules/payments/mobilemoney/reconcile.ts](../../backend/src/modules/payments/mobilemoney/reconcile.ts) | **Cœur du fulfilment** : pull statut, anti-fraude, crédit idempotent |
| [backend/src/modules/payments/mobilemoney/chariow.webhook.ts](../../backend/src/modules/payments/mobilemoney/chariow.webhook.ts) | Route webhook « Pulse » (raw body, secret dans l'URL) |
| [backend/src/modules/payments/mobilemoney/cancelPending.ts](../../backend/src/modules/payments/mobilemoney/cancelPending.ts) | Expiration des PENDING (2 h), anti-doublons, annulation manuelle |
| [backend/src/scripts/reconcile_mobilemoney_cron.ts](../../backend/src/scripts/reconcile_mobilemoney_cron.ts) | Cron 5 min : réconcilie PENDING + **FAILED ≤ 14 j** |
| [backend/src/modules/payments/mobilemoney/registry.ts](../../backend/src/modules/payments/mobilemoney/registry.ts) | Résolution de l'adapter (`MAKETOU` \| `CHARIOW`) |
| [backend/src/modules/payments/shared/offer.service.ts](../../backend/src/modules/payments/shared/offer.service.ts) | Offres à durée limitée (remise réelle / prix d'ancrage), `providerDiscountCode` |
| [frontend/src/components/wizard/monetization/steps.tsx](../../frontend/src/components/wizard/monetization/steps.tsx) | Config admin : clé API, produit, webhook (secret auto + URL copiable) |
| [frontend/src/components/payments/CheckoutSuccessView.tsx](../../frontend/src/components/payments/CheckoutSuccessView.tsx) | Page de retour : poll verify-checkout, états activé/lent/échoué |

## 3. Contrat HTTP Chariow (formes réelles)

Base : `CHARIOW_API_URL` (défaut `https://api.chariow.com/v1`), auth `Bearer <clé du créateur>`.

### 3.1 — Créer une vente : `POST /checkout`

```jsonc
{
  "product_id": "prod_…",              // produit de la boutique Chariow du créateur
  "email": "acheteur@mail.com",
  "first_name": "Ruth", "last_name": "THIALA",   // les DEUX requis
  "phone": { "number": "763627155", "country_code": "FR" },  // LOCAL + ISO2, PAS d'E.164
  "discount_code": "MERCYMIGNON5K",    // optionnel — SEUL moyen de réduire le prix
  "redirect_url": "https://…/checkout/success?provider=mobile-money&slug=<slug>",
  "custom_metadata": { "communityId": "…", "userId": "…", "membershipId": "…", … }
}
```

Réponse (enveloppe `data`) : `data.purchase.id` (= id de vente, stocké en
`providerPaymentId`), `data.purchase.amount { value, currency }` (**prix réellement
débité**, devise de la boutique — peut être USD/EUR, pas seulement XOF),
`data.payment.checkout_url` (page de paiement).

> ⚠️ **Chariow débite le prix DU PRODUIT configuré dans SA boutique** — aucun montant
> custom via l'API. Le créateur doit aligner le prix de sa communauté dans l'application sur celui du
> produit Chariow ; une remise passe par `discount_code` (cf. §6).

### 3.2 — Lire une vente : `GET /sales/{id}`

Renvoie `status`, `amount { value, currency }` et des dates (`settled_at` / `paid_at` /
`completed_at` selon la version). C'est la **source de vérité** de la réconciliation.

### 3.3 — Statuts Chariow → statuts normalisés (`mapChariowStatus`)

| Statut Chariow (regex) | Normalisé | Note |
|---|---|---|
| `settle`, `complete`, `paid`, `success` | `succeeded` | **« settled » (Réglé, fonds encaissés) = PAYÉ** — l'oublier a déjà coûté une vente jamais créditée |
| `failed`, `error` | `failed` | |
| `cancel`, `abandon`, `refund` | `abandoned` | |
| autre | `pending` | |

> ⚠️ **L'ordre des tests compte.** Traitez `unpaid` → `pending` en tout premier,
> puis les échecs/annulations, et seulement ensuite les succès : « unpaid »
> contient « paid » — une implémentation qui teste `paid` d'abord créditerait
> une vente non payée.

### 3.4 — Lecture boutique (config admin)

- `GET /discounts?status=active` → codes de réduction actifs (proposés dans l'admin Offres) ;
- `GET /products` → produits publiés + prix (choix du `productId` dans le wizard Monétisation).

## 3bis. Téléphone & pays — LE point critique pour lancer un checkout

> Section à lire **en entier** avant d'implémenter un formulaire de paiement (humain ou
> agent IA) : la quasi-totalité des échecs de création de checkout Chariow (400
> « Invalid phone number ») viennent d'un téléphone mal transmis.

### Ce que Chariow attend (non négociable)

```jsonc
"phone": { "number": "763627155", "country_code": "FR" }
```

- `number` : numéro **NATIONAL** — sans indicatif (`+33`/`00228`), **sans le 0 national**
  (FR : `0763627155` → `763627155`).
- `country_code` : pays **ISO2** (`FR`, `SN`, `BJ`, `CI`…) — PAS l'indicatif (`33`, `221`).
- Un E.164 brut (`+33763627155`) dans `number`, ou un `country_code` vide sur un numéro
  non africain → **400 Invalid phone number**.

### Ce que le FRONT doit collecter et envoyer

Le formulaire de paiement doit utiliser un **sélecteur de pays + champ numéro local**
(ici : `components/ui/CountryPhoneInput`), puis envoyer **les trois champs** au backend
(`POST /communities/:slug/payments/mobile-money/checkout`) :

```jsonc
{
  "phone": "+33763627155",     // E.164 complet (requis — sert aussi de repli de parsing)
  "phoneCountry": "FR",        // ISO2 du sélecteur de pays
  "phoneLocal": "763627155",   // numéro NATIONAL validé (libphonenumber .nationalNumber)
  "firstName": "Ruth", "lastName": "THIALA",   // optionnels (repli: fullName/email)
  "provider": "CHARIOW",       // optionnel si un seul compte Mobile Money actif
  "promoCode": "…"             // optionnel
}
```

Règles front :
1. Valider avec **libphonenumber** (`parsePhoneNumberFromString(local, iso2)`), et envoyer
   `parsed.number` (E.164) + `parsed.nationalNumber` (local) + l'ISO2 du sélecteur.
2. **Toujours** envoyer `phoneCountry` quand on le connaît : le repli serveur ne sait
   déduire le pays QUE des indicatifs **africains** — un `+33` sans `phoneCountry`
   partirait sans pays et serait rejeté par Chariow.
3. Ne jamais pré-nettoyer soi-même (retrait du 0, de l'indicatif…) : envoyer les trois
   champs et laisser le serveur normaliser.

### Ce que fait le BACKEND (`resolveChariowPhone`, [chariow.ts](../../backend/src/modules/payments/mobilemoney/chariow.ts))

Quatre tentatives, dans l'ordre, la première qui valide gagne :

| # | Entrée | Méthode | Exemple |
|---|---|---|---|
| 1 | `phoneCountry` + `phoneLocal` | libphonenumber (retire le 0 national, valide) | `FR` + `0763627155` → `{ 763627155, FR }` |
| 2 | `phone` (E.164) | libphonenumber (déduit pays + national) | `+221771234567` → `{ 771234567, SN }` |
| 3 | `phoneCountry` + chiffres bruts | repli sans validation stricte | `BJ` + `97000000` → `{ 97000000, BJ }` |
| 4 | indicatifs **africains** en dur (`splitChariowPhone`) | dernier recours | `0022890000000` → `{ 90000000, TG }` |

> Conséquence : un numéro **africain** passe même sans `phoneCountry` (étape 4) ; un
> numéro **européen/US** a BESOIN de `phoneCountry` ou d'un E.164 valide (étapes 1–2).

### Checklist agent IA (implémenter un checkout qui marche du premier coup)

- [ ] UI : sélecteur de pays (ISO2) + champ numéro local, validation libphonenumber.
- [ ] Payload : `phone` (E.164) **ET** `phoneCountry` **ET** `phoneLocal`.
- [ ] `firstName`/`lastName` si collectés (Chariow exige les deux — le serveur a un repli).
- [ ] Sur réponse `{ checkoutUrl }` → redirection navigateur immédiate (pas d'iframe).
- [ ] Au retour (`/checkout/success?provider=mobile-money&slug=…`) → poll
      `verify-checkout` (cf. §8) — ne JAMAIS conclure depuis les seuls params d'URL.

## 4. Checkout côté application (`checkout.ts` + adapter)

1. Vérifs : provider disponible, membre non banni, prix/plancher (« prix libre »).
2. **Téléphone** : `resolveChariowPhone()` — libphonenumber d'abord (ISO2 + local, puis
   E.164), repli indicatifs africains. Chariow exige `{ number local, country_code ISO2 }` ;
   un `+33…` brut provoque un 400 « Invalid phone number ».
3. **Offre active** : `resolveOfferForCheckout` → si l'offre a un `providerDiscountCode`,
   il part en `discount_code` (c'est Chariow qui applique la remise sur SON prix produit).
4. `POST /checkout` → on persiste un `Payment` **PENDING** avec :
   - `providerPaymentId = providerSaleId = purchase.id` ;
   - `localAmount = purchase.amount.value` et **`localCurrency = purchase.amount.currency`**
     (⚠️ ne JAMAIS figer « XOF » : les boutiques Chariow peuvent être en USD — bug historique) ;
   - `metadata.mobileMoneyProvider = "CHARIOW"` (une commu peut avoir Maketou ET Chariow) ;
   - environnement tagué sandbox si `PRODENV !== "PROD"`.
5. `supersedeOlderPending()` : toute nouvelle tentative **clôt** les anciens PENDING du même
   user×commu (après une dernière réconciliation chacun) — pas d'empilement de lignes.
6. Redirect 302 vers `checkout_url`. **Jamais** de redirect en dur si la réponse est incomplète.

## 5. Fulfilment — `reconcile.ts` (source de vérité)

Appelée par le retour user, le webhook ET le cron. Pour chaque `Payment` du user
(**PENDING**, plus **FAILED ≤ 14 j** — un règlement tardif ou refusé à tort est rattrapé) :

1. `GET /sales/{providerPaymentId}` chez Chariow → si pas `succeeded`, on passe.
2. **Idempotence double** : `ProcessedPayment.saleId` unique (catch P2002 sur course
   cron↔verify) + flip `Payment` → `SUCCEEDED` avec `@@unique([provider, providerSaleId])`.
3. **Date de succès** : `succeededAt = settled_at/paid_at` du provider, sinon `createdAt`
   du Payment — **jamais `new Date()`** (sinon un crédit rattrapé apparaît « aujourd'hui »
   dans le dashboard au lieu du jour du paiement).
4. **Anti-fraude montants** (tolérance 5 %) :
   - **juge principal** : montant LOCAL — `remote.amount` vs `payment.localAmount`
     (même unité provider, l'étiquette de devise ne bloque jamais, écart signalé en warn) ;
   - **repli** : comparaison EUR — conversions explicites XOF (peg 656), USD
     (`USD_TO_EUR_RATE`, défaut 0.92), EUR ; devise inconnue → pas de faux positif ;
   - anomalie → log `[MobileMoney] ANOMALIE montant — NON crédité` (jamais au détriment
     de l'acheteur quand le montant local colle).
5. Transaction : `ProcessedPayment` + `Payment SUCCEEDED` + `activateMembership`
   (Membership ACTIVE) + redemptions promo/offre.
6. Post-crédit (best-effort) : DM de bienvenue, email d'accès **brandé commu** (logo,
   accent, lien), email « nouvelle vente » au créateur.

### Expiration & annulation (`cancelPending.ts`)

- Cron : PENDING > `MOBILE_MONEY_EXPIRE_HOURS` (défaut **2 h**) → dernière réconciliation
  puis `FAILED` (`cancelledReason: expired_pending`).
- Le cron de réconciliation re-vérifie ensuite ces FAILED pendant **14 jours** → un
  paiement réglé après coup est quand même crédité (cas réel : vente « settled » à 20:04
  expirée chez nous puis rattrapée).
- Annulation manuelle admin (bouton « Annuler » sur une transaction PENDING) : même
  garde-fou (réconcilie d'abord, n'annule jamais un paiement abouti).

## 6. Prix, devises & offres — règles d'or

- **Pas d'override de prix** : Chariow débite le prix de SON produit. Alignement manuel
  requis entre prix commu et prix produit Chariow.
- **Remises** : uniquement via `Offer.providerDiscountCode` → `discount_code` (code créé
  dans la boutique Chariow, sélectionnable dans l'admin Offres). Code invalide/expiré →
  Chariow répond 422, remonté en erreur propre.
- **Devise de la boutique** : XOF, USD ou EUR — toujours lue depuis `purchase.amount.currency`
  et re-vérifiée à la réconciliation. L'affichage admin (Recettes) formate `localAmount`
  dans `localCurrency` (« 9 $US », pas « 9 F CFA »).
- Mode **ANCHOR** (« prix barré » gonflé) : rien ne change côté Chariow — le prix débité
  est le vrai prix ; seul l'affichage public montre l'ancrage.

## 7. Webhook « Pulse » (optionnel mais recommandé)

- **URL par communauté** (affichée toute prête dans Admin → Monétisation → Chariow → Webhook) :
  ```
  https://api.votre-domaine.com/payments/webhooks/mobile-money/chariow?secret=<SECRET>
  ```
  Le secret est **auto-généré** à l'ouverture si absent, et l'URL complète est renvoyée par
  le backend (`webhookUrl` sur `GET /monetization`, construit depuis `PUBLIC_API_URL`) —
  à coller telle quelle dans le dashboard Chariow.
- **Sécurité** : Chariow n'a pas de signature → secret **dans l'URL**, comparé en temps
  constant au secret stocké par commu. Identification de la commu via
  `custom_metadata.communityId`, sinon lookup du `sale_id` sur nos Payments.
- **Zéro confiance dans le corps** : le webhook ne crédite jamais directement — il
  déclenche `reconcileMobileMoneyForUser()` (pull + anti-fraude + idempotence).
- Événements succès reconnus : `successful.sale`, `settled.sale`, `completed.sale`.
- Monté en **raw body** (`app.ts`, avant `express.json`). Réponse 200 même si inconnu
  (évite les retries), 401 si secret invalide.

## 8. Retour utilisateur (`/checkout/success`)

`CheckoutSuccessView` poll `POST /payments/mobile-money/verify-checkout` toutes les 3 s
(≈ 42 s, garde-fou dur 60 s) : réconcilié → invalidation caches + redirect
`/c/<slug>/welcome?joined=1` ; sinon état « lent » (le cron finalisera) ou « échoué »
(indice `?status=` de l'URL — jamais une source de vérité). Le `slug` de la commu voyage
dans `redirect_url` pour rediriger même sans réconciliation immédiate.

## 9. Configuration

### Admin (créateur) — Admin → Monétisation → Chariow
1. **Clé API** (dashboard Chariow → API) — validée par un GET authentifié à l'enregistrement.
2. **Produit** : choisi dans la liste (`GET /products`) ou id collé à la main ; son prix
   doit correspondre au prix de la commu.
3. **Webhook** (onglet dédié) : secret auto-généré + URL complète à copier dans Chariow.
4. Options : « encaisse aussi la carte » (`handlesCards`), « carte uniquement » (`cardOnly`).

### Environnement (backend)
| Variable | Rôle |
|---|---|
| `CHARIOW_API_URL` | Base API (défaut `https://api.chariow.com/v1`) |
| `PUBLIC_API_URL` | Base de l'URL webhook renvoyée à l'admin (ex. `https://api.votre-domaine.com`) |
| `PRODENV` | **Doit valoir `PROD` en prod** — sinon toutes les transactions sont taguées sandbox et masquées des Recettes |
| `MOBILE_MONEY_EXPIRE_HOURS` | Expiration des PENDING (défaut 2) |
| `USD_TO_EUR_RATE` | Taux anti-fraude USD→EUR (défaut 0.92) |
| `MOBILE_MONEY_CRON_*` | Fenêtres/batch du cron de réconciliation |

## 10. Debug / incidents connus

| Symptôme | Cause | Où regarder |
|---|---|---|
| Vente « Réglé » chez Chariow mais Échoué chez nous | statut `settled` non mappé (corrigé) OU anti-fraude devise (corrigé) — le cron rattrape les FAILED ≤ 14 j | logs `[MobileMoney]`, `mapChariowStatus` |
| Montant local absurde (« 9 F CFA ») | `localCurrency` figée XOF alors que boutique USD (corrigé ; historique réparable en relisant `GET /sales/{id}`) | `Payment.localAmount/localCurrency` |
| Vente créditée datée « aujourd'hui » | `succeededAt = new Date()` au rattrapage (corrigé : date provider sinon `createdAt`) | `reconcile.ts` |
| 400 « Invalid phone number » | téléphone envoyé en E.164 au lieu de `{ local, ISO2 }` | `resolveChariowPhone` |
| 422 au checkout | `discount_code` invalide/expiré côté Chariow | admin Offres |
| Webhook 401 | `?secret=` ≠ secret stocké de la commu | Admin → Monétisation → Webhook |
| Rien ne se crédite jamais | clé API retirée par le créateur (`apiKeyEnc` absent) → la réconciliation saute la commu | `MobileMoneyAccount` |
| Transactions invisibles des Recettes | `PRODENV` ≠ `PROD` → tag sandbox | env prod |

## 11. Pièges à ne jamais réintroduire

1. **`settled` = payé.** Tout mapping de statut doit matcher `settle`.
2. **Ne jamais figer la devise locale** — toujours `purchase.amount.currency`.
3. **Ne jamais dater `succeededAt` à « maintenant »** lors d'un rattrapage.
4. **Ne jamais créditer sur la foi du webhook** — toujours re-puller le statut.
5. **Ne jamais laisser un FAILED définitif sans re-vérification** (fenêtre 14 j).
6. **Jamais de redirect en dur** si la réponse checkout est incomplète.
7. **Jamais de montant custom** : le prix vit dans la boutique Chariow, la remise dans
   `discount_code`.
8. **saleId ≠ cart id** : idempotence sur `ProcessedPayment.saleId` + unique
   `(provider, providerSaleId)`.

---

<sub>Doc alignée sur le code (backend `modules/payments/mobilemoney/*`). Toute évolution du code doit être répercutée ici. Voir aussi `docs/PAYMENTS.md` §4.</sub>
