# Intégration Chariow — Provider de paiement pour l'abonnement Premium

Date: 2026-08-16
Statut: approuvé (design), en attente de plan d'implémentation

## Contexte

L'utilisateur a fourni `Chariow.md` (racine du repo), une doc d'intégration
Chariow écrite pour un **autre projet** (monorepo Express `backend/` +
`frontend/`, modèle **per-créateur** avec un compte Chariow par vendeur). Ce
projet (YeOyo) est un monolithe Next.js 16 (voir CLAUDE.md) où le seul flux
d'argent existant est l'**abonnement Premium** — un compte **plateforme
unique** convient donc ici (cas explicitement prévu par la doc source, §1
note "Adaptez ce modèle... un SaaS qui vend ses propres produits/crédits
utilise un compte plateforme unique").

Demande utilisateur : dès qu'un membre veut s'abonner (Premium) ou faire
n'importe quel paiement sur le site, il doit être redirigé vers Chariow pour
finaliser le paiement.

**Périmètre confirmé avec l'utilisateur :**
- Le "booster" mentionné est le boost de profil existant, déjà inclus dans
  Premium (gratuit avec cooldown 24h sinon) — **pas** un achat séparé. Aucun
  nouveau produit Chariow à créer pour ça.
- Compte Chariow déjà créé (jeffalmeida0001@gmail.com), boutique en **USD**.
- Le seul flux de paiement réel du site aujourd'hui est
  `POST /api/subscriptions/checkout`, actuellement branché sur un provider
  **stub** qui ne débite jamais rien (`lib/server/payments/stub.ts`, décision
  antérieure explicite de bâtir l'UI avant de brancher un vrai provider — ce
  ticket lève cette dette).

**État actuel constaté (repo) :**
- `Order` + `Subscription` (Prisma) déjà génériques et provider-agnostic —
  réutilisés tels quels, `provider` passe de `"stub"` à `"chariow"`.
- `PaymentProvider` interface (`lib/server/payments/provider.ts`) déjà en
  place, implémentée par `bictorys.ts` pour un flux marketplace séparé
  (`/api/orders`) — Chariow suit le même moule (nouvel adaptateur
  `chariow.ts`, sans toucher à `bictorys.ts` ni à cette interface).
- Webhook factory `lib/server/webhook/handler.ts` est **protégée**
  (CLAUDE.md) — non modifiée. Elle attend un `WebhookProvider.verifySignature
  (rawBody, headers)` ; Chariow n'a pas de signature, son secret est dans
  l'URL (`?secret=`), donc la vérification du secret se fait **dans le shim
  de route** (avant d'appeler la factory), pas dans `verifySignature`.
- `Profile` n'a pas de champ téléphone — Chariow l'exige au format `{ numéro
  national, pays ISO2 }`.
- `plans.ts` est en CDF (Franc Congolais) — Chariow facture le prix exact du
  produit configuré dans SA boutique, qui est en USD ici. Pas de conversion
  dynamique : les 4 plans passent en USD (cents), 1 produit Chariow par plan.
- Le sélecteur "M-Pesa / Airtel Money / Orange Money" sur `/app/premium`
  n'a aucun effet côté Chariow (son `POST /checkout` n'a pas de paramètre de
  méthode de paiement — le choix se fait sur SA page hébergée). Il est
  supprimé pour ne pas induire en erreur (ces opérateurs RDC ne sont pas
  forcément ceux que Chariow propose réellement).

## Portée

**Inclus :**
1. Nouvel adaptateur `lib/server/payments/chariow.ts` : création de vente
   (`POST /checkout`), lecture de statut (`GET /sales/{id}`), résolution
   téléphone (`resolveChariowPhone`), mapping de statut Chariow → normalisé.
2. Singleton lazy `lib/server/payments/chariow-singleton.ts` (miroir de
   `provider-singleton.ts`) — throw `PaymentProviderUnconfiguredError` →
   503 si `CHARIOW_*` manquant.
3. `lib/server/subscriptions/reconcile.ts` — `reconcileChariowOrder(orderId)`,
   seul point d'écriture qui crédite un Order/Subscription. Toujours un
   re-pull `GET /sales/{id}` avant de créditer (zéro confiance dans le
   webhook), vérif anti-fraude du montant (tolérance 5%), idempotent.
4. Trois déclencheurs, tous convergent vers `reconcileChariowOrder` :
   - Retour utilisateur : `POST /api/subscriptions/orders/[id]/verify-checkout`
     (remplace `simulate-payment`, supprimé).
   - Webhook : `POST /api/webhooks/chariow?secret=...` (secret vérifié dans
     le shim, timing-safe, avant la factory).
   - Cron 5 min : `frontend/src/app/api/cron/chariow-reconcile/route.ts`
     (miroir du cron `order-expiration` existant), rattrape les `Order`
     `PENDING` provider="chariow".
5. `POST /api/subscriptions/checkout` réécrit : appelle vraiment Chariow
   (au lieu du stub), collecte le téléphone, mappe `planId` → `product_id`
   Chariow via config statique.
6. Schéma : `Profile.phone` / `Profile.phoneCountry` (optionnels).
7. `plans.ts` : re-pricé en USD (cents). Valeurs de départ proposées,
   ajustables par l'utilisateur avant mise en prod (voir "Prix — valeurs de
   départ" plus bas).
8. UI `/app/premium` : sélecteur pays + numéro de téléphone (pré-rempli si
   connu), suppression du sélecteur d'opérateur Mobile Money.
9. UI `/app/premium/pending` : le bouton "Simuler la confirmation" est
   retiré ; le poll appelle `verify-checkout` en plus du GET de statut, pour
   forcer une re-vérification active pendant l'attente (pas seulement un
   poll passif — un paiement réel doit être confirmé rapidement).
10. Suppression : `lib/server/payments/stub.ts`,
    `/api/subscriptions/orders/[id]/simulate-payment/route.ts` (+ test).
11. Env vars documentées (`.env.example` ou équivalent) :
    `CHARIOW_API_URL` (défaut `https://api.chariow.com/v1`), `CHARIOW_API_KEY`,
    `CHARIOW_WEBHOOK_SECRET`, `CHARIOW_PRODUCT_ID_15J/1M/3M/6M`,
    réutilise `PUBLIC_URL` existant pour `redirect_url` et `PUBLIC_API_URL`
    existant pour l'URL webhook (déjà utilisés par Bictorys).
12. Dépendance ajoutée : `libphonenumber-js` (validation téléphone
    front + back, comme documenté dans `Chariow.md` §3bis).

**Exclu (hors périmètre, pas demandé) :**
- Tout flux "boost à l'unité" payant séparé.
- Remises / codes promo (`discount_code`) — aucun système de promo n'existe
  aujourd'hui côté YeOyo ; pas ajouté ici.
- Remboursements (Chariow n'expose pas d'endpoint refund documenté — comme
  Bictorys, `refund()` lèvera une erreur explicite si jamais appelé).
- Carte bancaire : déjà affichée "Bientôt disponible" dans l'UI existante,
  inchangé (Chariow encaisse aussi la carte en aval sur sa page hébergée,
  rien à faire côté YeOyo pour ça — c'est le même `checkout_url`).
- Paiements par device/marketplace multi-comptes (per-créateur) — non
  pertinent, YeOyo n'est pas un marketplace.

## Architecture

```
Membre (page /app/premium)
  │  choisit plan + saisit téléphone
  ▼
POST /api/subscriptions/checkout
  │  résout téléphone, mappe planId → CHARIOW_PRODUCT_ID_*
  │  appelle chariow.charge() → POST Chariow /checkout
  │  crée Order(PENDING, provider="chariow") + Subscription(PENDING)
  ▼
302 → checkout_url (page Chariow hébergée)
  │  le membre paie (Mobile Money ou carte, choisi sur la page Chariow)
  ▼
/app/premium/pending?orderId=...
  │  poll toutes les 4s → POST verify-checkout → reconcileChariowOrder()
  │                                                    │
Webhook Chariow ─────────────────────────────────────►│  GET /sales/{id}
(POST /api/webhooks/chariow?secret=...) ──────────────►│  (source de vérité)
                                                        │
Cron 5 min (Order PENDING provider=chariow) ──────────►│
                                                        ▼
                                   Order → PAID, Subscription → ACTIVE
                                   (transaction unique, idempotente,
                                    anti-fraude montant, outbox notif)
```

## Composants

### `lib/server/payments/chariow.ts`
- `createChariowProvider(env)` → objet avec `charge()`, pas de `payout`
  (Chariow ne fait pas de payout ici — YeOyo n'utilise pas `Withdrawal` pour
  Premium), `refund()` qui throw explicitement "not supported".
- `getSaleStatus(saleId)` — `GET /sales/{id}`, exposé séparément (pas dans
  l'interface `PaymentProvider` générique, car c'est un besoin de
  réconciliation propre à Chariow/hosted-checkout, pas un concept générique
  de `provider.ts`).
- `resolveChariowPhone({ phone, phoneCountry, phoneLocal })` — 4 tentatives
  dans l'ordre documenté en §3bis de `Chariow.md` (libphonenumber d'abord,
  repli indicatifs africains en dernier recours ; pour la RDC, ISO2 `CD`
  sera couvert par libphonenumber directement, donc les 2 premières
  tentatives suffiront dans l'immense majorité des cas).
- `mapChariowStatus(raw)` — reproduit la table §3.3, **ordre de test
  impératif** : `pending`/`unpaid` d'abord, puis échec/annulation, puis
  succès (`settle*` inclus) — piège documenté à ne pas réintroduire.

### `lib/server/payments/chariow-singleton.ts`
Miroir exact de `provider-singleton.ts` : lazy init, throw
`PaymentProviderUnconfiguredError` si `CHARIOW_API_URL` / `CHARIOW_API_KEY`
/ `CHARIOW_WEBHOOK_SECRET` manquants → la route checkout traduit en 503
`PAYMENT_PROVIDER_UNCONFIGURED`.

### `lib/server/subscriptions/reconcile.ts`
```ts
async function reconcileChariowOrder(orderId: string): Promise<{ orderStatus, subscriptionStatus }>
```
1. Charge l'`Order` (+ `subscription`) ; si déjà `PAID`/`FAILED`, retourne
   l'état actuel sans re-frapper Chariow (idempotence rapide).
2. `GET /sales/{providerChargeId}` chez Chariow.
3. Si statut normalisé ≠ `succeeded` → si `failed`/`abandoned`, marque
   `Order` `FAILED` + `Subscription` `CANCELLED` ; sinon (`pending`) ne
   touche rien.
4. Si `succeeded` : vérif anti-fraude montant (tolérance 5%, comme §5.4 de
   `Chariow.md` — juge principal = montant local, devise déjà connue car
   fixe en USD ici) ; anomalie → log `[Chariow] ANOMALIE montant — NON
   crédité`, ne crédite pas.
5. Transaction Prisma : `Order` → `PAID` (`paidAt` = date Chariow
   `settled_at`/`paid_at`, sinon `Order.createdAt` — jamais `new Date()` en
   rattrapage tardif) + `Subscription` → `ACTIVE` (`currentPeriodEnd` via
   `plan.billingDays`) + `enqueueOutbox` notif paiement reçu (même pattern
   que `webhooks/bictorys/route.ts`).
6. Idempotence : l'écriture finale utilise un `updateMany({ where: { id,
   status: 'PENDING' }, data: { status: 'PAID', ... } })` — compare-and-swap
   atomique au niveau ligne (verrou Postgres implicite sur l'`UPDATE`), pas
   une simple lecture-puis-écriture. Si `count !== 1` (une autre course —
   cron/webhook/poll utilisateur — a déjà traité cet Order), on n'active pas
   `Subscription` une deuxième fois et on retourne l'état déjà en base. Pas
   besoin d'une table `ProcessedPayment` séparée comme dans le projet
   source : ce CAS sur `Order.status` fait le même travail ici (Order 1:1
   Subscription, un seul writer gagne).

### Webhook `POST /api/webhooks/chariow`
Shim fin, même esprit que `webhooks/bictorys/route.ts` :
```ts
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') ?? '';
  if (!timingSafeEqual(secret, process.env.CHARIOW_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  return chariowHandler(req); // createWebhookHandler(...)
}
```
Le `WebhookProvider` passé à la factory a un `verifySignature` qui retourne
toujours `{ valid: true }` (le secret est déjà vérifié au-dessus, dans
l'URL — documenté en commentaire pour ne pas donner une fausse impression
de faille). `extractIds` lit seulement l'id de vente (`purchase.id` /
`sale_id`) — **zéro confiance dans le reste du payload** : `onPaid` ignore
le statut/montant du body et appelle uniquement
`reconcileChariowOrder(order.id)`, qui re-pull la vérité chez Chariow.

### Cron `app/api/cron/chariow-reconcile/route.ts`
Toutes les 5 min (`vercel.json`), `verifyCronSecret` (comme les 5 crons
existants), `batchSize` configurable, requête les `Order` `PENDING`
`provider="chariow"` non expirées, appelle `reconcileChariowOrder` pour
chacune (best-effort, erreurs individuelles loguées sans stopper le batch).

## Prix — valeurs de départ (à ajuster par l'utilisateur)

Conversion approximative depuis les prix CDF actuels, arrondie à des
valeurs USD "rondes" — **placeholders explicites**, pas une décision business
figée :

| Plan | CDF actuel | USD proposé (cents) |
|---|---|---|
| 15j | 16 000 CDF | 599 ($5.99) |
| 1m | 11 000 CDF | 399 ($3.99) |
| 3m | 24 000 CDF | 899 ($8.99) |
| 6m | 33 000 CDF | 1499 ($14.99) |

L'utilisateur crée 4 produits dans son dashboard Chariow avec ces prix (ou
d'autres de son choix), colle les 4 `product_id` dans `.env`, et ajuste
`plans.ts` en conséquence si les prix changent.

## Gestion d'erreurs

- `CHARIOW_*` manquant → 503 `PAYMENT_PROVIDER_UNCONFIGURED` (comme Bictorys).
- Téléphone invalide (toutes les résolutions échouent) → 400
  `INVALID_PHONE` avant même d'appeler Chariow (fail fast).
- Chariow répond 400 "Invalid phone number" malgré la résolution locale →
  502 `PROVIDER_ERROR`, message générique côté UI ("réessaie" + support).
- Webhook secret invalide → 401 (déjà couvert ci-dessus).
- Anomalie de montant en réconciliation → **jamais** de crédit, log niveau
  warn, l'Order reste `PENDING` (rattrapable manuellement, pas de perte
  silencieuse).
- `verify-checkout` appelé par un autre user que le propriétaire de l'Order
  → 404 (comme l'ancien `simulate-payment`, ne pas leaker l'existence).

## Tests

- `chariow.ts` : `mapChariowStatus` (ordre `unpaid` avant `paid`),
  `resolveChariowPhone` (les 4 chemins de résolution + cas RDC `CD`),
  `charge()` (mock fetch, vérifie le body envoyé).
- `reconcile.ts` : idempotence (deux appels concurrents ne créditent
  qu'une fois), anti-fraude montant (tolérance 5%, rejet au-delà),
  `succeededAt` = date provider et non `new Date()` en rattrapage.
- Route `checkout` : 503 si non configuré, 400 téléphone invalide, 409 si
  déjà `ACTIVE`.
- Route webhook : 401 secret invalide, dédup (rejouer le même événement ne
  crédite pas deux fois), zéro confiance body (payload falsifié avec un
  montant différent ne passe pas sans le re-pull réel — testable en
  mockant le fetch de `GET /sales/{id}` séparément du body webhook).
- Cron : rattrape un `Order` `PENDING` resté bloqué.
- `runtime-enforcement.test.ts` (existant) doit rester vert pour toute
  nouvelle route.

## Migration Prisma

Une migration ajoute `Profile.phone String?` et `Profile.phoneCountry
String?` — pas de backfill nécessaire (nouveaux champs optionnels).
