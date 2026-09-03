# Skill — audit-securite-saas

> **Nom du skill :** `audit-securite-saas`
> **Description (frontmatter) :** Audit de sécurité d'une application SaaS ou web avant sa mise en ligne, selon 20 contrôles critiques (clés API exposées, secrets dans Git, Row Level Security, autorisation côté serveur, injections SQL, XSS, uploads, dépendances). Utilise ce skill quand l'utilisateur demande si son app est prête ou sécurisée, veut une checklist avant lancement, s'inquiète d'un piratage ou d'une fuite de données, ou partage un projet vibe-codé (Lovable, Bolt, v0, Cursor) à vérifier. Utilise-le aussi quand quelqu'un annonce qu'il lance son SaaS et travaille avec Supabase ou Firebase — même sans prononcer le mot "sécurité". Ne pas déclencher pour une question purement technique de déploiement ou d'hébergement.

Ce document rassemble l'intégralité du skill : les instructions principales (`SKILL.md`),
le script de scan (`scripts/scan.sh`) et les quatre fiches de référence (`references/`).
Pour l'utiliser dans Claude, installer le fichier `.skill` correspondant ;
ce `.md` sert à le lire, le relire et le partager.

## Structure du paquet

```
audit-securite-saas/
├── SKILL.md                    instructions principales
├── scripts/
│   └── scan.sh                 scan automatique (15 contrôles en une passe)
└── references/
    ├── checklist.md            les 20 contrôles en détail
    ├── supabase.md             requêtes RLS, buckets, Edge Functions
    ├── firebase.md             Security Rules, Storage, SDK Admin
    ├── node-express.md         middlewares, CORS, JWT, routes de debug
    └── nextjs.md               frontière client/serveur, Server Actions
```

---

# Partie 1 — Instructions principales (SKILL.md)

Une app vibe-codée qui fonctionne n'est pas une app qui peut être mise en ligne. Le code généré par IA marche vite, mais il laisse presque systématiquement les mêmes trous : clés secrètes côté client, base de données ouverte à tous, contrôles d'accès faits dans le navigateur. Ces failles ne se voient pas à l'usage — elles se voient le jour où quelqu'un vide la base ou fait exploser la facture d'API.

Ce skill sert à passer une application au crible de 20 contrôles, à classer ce qui est trouvé par gravité réelle, et à corriger dans le bon ordre.

## Principe directeur

**Ne jamais affirmer qu'un contrôle est bon sans l'avoir vérifié.** Un audit qui dit « RLS activée ✅ » sans avoir lu les policies est pire que pas d'audit : il donne une fausse confiance à quelqu'un qui va lancer. Ce qui n'a pas pu être contrôlé se classe en **NON VÉRIFIÉ**, avec la précision de ce qu'il faudrait pour trancher.

## Choisir le mode

Deux situations très différentes, deux façons de travailler. Identifier laquelle avant de commencer.

**Mode complet — le code est accessible** (repo cloné, fichiers fournis, dossier local). Aller à la section « Audit sur code ».

**Mode guidé — pas d'accès au code.** C'est le cas le plus fréquent avec les projets Lovable, Bolt ou v0 : l'utilisateur travaille dans la plateforme et n'a rien à téléverser. Ne pas refuser l'audit et ne pas produire un rapport générique : conduire l'audit par questions, en faisant faire les vérifications à l'utilisateur. Aller à la section « Audit guidé ».

---

## Audit sur code

### 1. Cadrer

Lire `package.json` ou `requirements.txt` et la structure des dossiers pour identifier la stack. Repérer ce qui est sensible dans ce produit : paiements, données personnelles, fichiers uploadés, messagerie. Le niveau d'exigence dépend de ce qui peut fuir.

### 2. Lancer le scan

```bash
bash scripts/scan.sh /chemin/du/projet
```

Le script couvre en une passe les contrôles automatisables : secrets, historique Git, clé `service_role` côté client, identité prise chez le client, autorisation faite dans le navigateur, SQL concaténé, XSS, `select('*')`, routes de debug, headers, rate limiting, validation, dépendances.

Il ne conclut rien — il produit des signaux. Le travail d'analyse commence après.

### 3. Vérifier chaque signal avant de le classer

Ouvrir le fichier, lire le contexte. Les faux positifs classiques, à écarter sans les compter comme failles :

- une clé de test (`sk_test_`, `pk_test_`) — sans valeur pour un attaquant ;
- une clé placeholder dans un `README`, un `.env.example` ou une documentation ;
- `service_role` apparaissant dans un fichier serveur (`/api`, `/server`, une Edge Function) — c'est sa place normale ;
- `select('*')` sur une table sans données sensibles, ou sur une requête déjà filtrée par RLS ;
- `dangerouslySetInnerHTML` sur du contenu constant écrit par le développeur, non fourni par un utilisateur.

À l'inverse, l'absence de signal ne prouve rien : un `grep` ne voit pas ce qui n'est pas dans le code. Cinq contrôles échappent complètement au scan et se vérifient à la main — **RLS (4), chiffrement (5), cookies (9), hachage des mots de passe (10), uploads (16)**. Les traiter systématiquement.

### 4. Compléter le scan à la lecture

Lire `references/checklist.md` : chaque contrôle y est détaillé avec le risque concret, la méthode de vérification et la correction. Lire ensuite la référence de stack qui s'applique — `supabase.md`, `firebase.md`, `node-express.md` ou `nextjs.md`. Une seule, pas toutes.

**Toujours donner la preuve.** Chaque faille signalée pointe un fichier et une ligne, avec l'extrait fautif. Sans preuve, c'est une hypothèse, et il faut l'écrire comme telle.

---

## Audit guidé

Sans accès au code, l'audit reste possible : il suffit de faire exécuter les vérifications par l'utilisateur. Procéder par petits lots — trois ou quatre demandes à la fois, jamais une liste de vingt, sous peine qu'il abandonne en route.

**Lot 1 — la base de données**, là où se trouvent les failles les plus graves. Lui faire ouvrir le SQL Editor de Supabase et coller le résultat des requêtes de `references/supabase.md`. Ces trois requêtes suffisent à trancher les contrôles 4, 7 et 16.

**Lot 2 — les clés.** Lui faire chercher `service_role` dans son projet (Ctrl+F, tous fichiers) et dire où ça apparaît. Lui faire lister ses variables d'environnement commençant par `NEXT_PUBLIC_` ou `VITE_`.

**Lot 3 — le test de la clé anon.** Le plus parlant, et il le fait lui-même : récupérer l'URL du projet et la clé anon dans le code, puis, sans être connecté, tenter de lire une table sensible (commande `curl` fournie dans `supabase.md`). Si des données remontent, la base est publique — c'est un 🔴 démontré, pas une supposition.

**Lot 4 — le test des deux comptes.** Créer deux comptes, se connecter avec le premier, tenter d'ouvrir une ressource du second en changeant l'identifiant dans l'URL.

Ces quatre lots couvrent l'essentiel du risque réel. Pour le reste, demander des extraits ciblés : le fichier qui crée le client Supabase, une route d'API représentative. Le rapport se rend ensuite normalement, avec une part de NON VÉRIFIÉ plus large — et c'est honnête de le dire.

---

## Classer par gravité réelle

Ne pas rendre une liste plate de 20 points. Trois niveaux, le critère étant l'impact, pas la difficulté de correction :

| Niveau | Signification |
|---|---|
| 🔴 **BLOQUANT** | Ne pas mettre en ligne avant correction. Exploitable aujourd'hui, sans compétence particulière : clé secrète publiée, base sans RLS, mot de passe en clair. |
| 🟠 **IMPORTANT** | Le lancement peut se faire, la correction suit dans la semaine. Exploitable, mais demande un effort ou un enchaînement. |
| 🟡 **À FAIRE** | Durcissement. Réduit la surface d'attaque sans faille exploitable aujourd'hui. |

Un contrôle sans objet pour ce projet (pas d'upload, donc le 16) se marque **NON APPLICABLE** avec un mot d'explication. Ne pas l'inventer pour remplir le tableau.

## Rendre le rapport

```markdown
# Audit de sécurité — [nom du projet]

**Verdict : [PRÊT À LANCER / À CORRIGER AVANT LANCEMENT]**
[Une ou deux phrases : ce qui bloque, ou ce qui est sain.]

| | Nombre |
|---|---|
| 🔴 Bloquant | X |
| 🟠 Important | X |
| 🟡 À faire | X |
| ⚪️ Non vérifié | X |

## 🔴 À corriger avant la mise en ligne

### 1. [Titre de la faille] — contrôle n°[X]
**Où :** `chemin/du/fichier.js:42`
**Le problème :** [ce qu'un attaquant peut faire concrètement, en une ou deux phrases]
**La correction :**
[code ou étapes]

## 🟠 À corriger dans la semaine
[même format]

## 🟡 Durcissement
[une ligne par point]

## ⚪️ Non vérifié
[Ce qui n'a pas pu être contrôlé, et ce qu'il faudrait pour le faire.]

## Les 20 contrôles
[Tableau récapitulatif : contrôle | statut | note courte]
```

Sur un petit projet avec deux ou trois constats, cette structure est trop lourde : garder le verdict, les failles avec leur preuve et le tableau récapitulatif, supprimer les sections vides. La structure sert la lisibilité, elle ne doit pas la gêner.

## Proposer la suite

Terminer en proposant de corriger les points bloquants, dans l'ordre. Ne pas modifier le code sans accord : l'audit et la correction sont deux étapes, et l'utilisateur doit d'abord comprendre ce qui ne va pas — sinon il reproduira les mêmes erreurs au projet suivant.

Une fois la correction lancée, avancer faille par faille avec une vérification après chaque correctif, plutôt que de tout réécrire d'un coup.

Quand des clés ont été exposées, insister sur un point souvent négligé : **retirer la clé du code ne suffit pas, il faut la révoquer et la régénérer.** Une clé publiée un jour est compromise pour toujours.

## Ton

L'utilisateur est souvent un fondateur, pas un ingénieur sécurité. Deux réflexes :

- **Expliquer le risque en scénario, pas en jargon.** Pas « absence de RLS sur la table `users` » mais « n'importe qui peut ouvrir la console de son navigateur et télécharger la liste complète de vos utilisateurs avec leurs emails ».
- **Ne pas dramatiser ce qui ne l'est pas.** Tout signaler en rouge pousse à tout ignorer. Si un projet est propre, le dire : un verdict « prêt à lancer » est un résultat valable.

## Les quatre failles à chercher en premier

Sur un projet vibe-codé, ces quatre-là expliquent à elles seules la majorité des bases vidées. Les traiter avant tout le reste :

1. Clé `service_role` utilisée côté client (contrôle 3)
2. RLS jamais activée, la base étant restée en mode prototypage (contrôle 4)
3. Contrôle d'accès fait en React sans équivalent serveur (contrôle 6)
4. Fichier `.env` commité au premier push (contrôle 2)

---

# Partie 2 — Script de scan (`scripts/scan.sh`)

À enregistrer sous `scripts/scan.sh`, puis lancer avec `bash scripts/scan.sh /chemin/du/projet`.

```bash
#!/usr/bin/env bash
# scan.sh — premier passage automatique d'un audit de sécurité.
# Usage : bash scripts/scan.sh [chemin_du_projet]
#
# Ce script ne conclut rien : il rassemble en une passe les signaux bruts
# des contrôles 1, 2, 3, 6, 8, 13, 15, 17, 20. Chaque résultat doit ensuite
# être ouvert et confirmé — voir la section « faux positifs » de checklist.md.

set -uo pipefail
CIBLE="${1:-.}"
cd "$CIBLE" || { echo "Chemin introuvable : $CIBLE"; exit 1; }

EXCLURE=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
         --exclude-dir=build --exclude-dir=.next --exclude-dir=vendor
         --exclude-dir=.venv --exclude-dir=coverage)
CODE=(--include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
      --include="*.vue" --include="*.svelte" --include="*.html" --include="*.py")

titre() { printf '\n=== %s ===\n' "$1"; }
rien()  { echo "  (rien trouvé)"; }
lancer() { local sortie; sortie=$(eval "$1" 2>/dev/null | head -25); [ -n "$sortie" ] && echo "$sortie" || rien; }

echo "AUDIT — scan automatique de : $(pwd)"
echo "Date : $(date '+%Y-%m-%d %H:%M')"

titre "Contexte du projet"
for f in package.json requirements.txt composer.json next.config.js next.config.mjs vercel.json netlify.toml Dockerfile; do
  [ -f "$f" ] && echo "  présent : $f"
done
[ -f package.json ] && echo "  dépendances :" && node -e "
const p=require('./package.json');
console.log('   ', Object.keys({...p.dependencies||{}, ...p.devDependencies||{}}).join(', ').slice(0,400));
" 2>/dev/null

titre "1. Secrets et clés API en clair"
lancer "grep -rEn \"sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{10,}|rk_live_|AIza[0-9A-Za-z_-]{30,}|xoxb-[0-9]|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----\" ${CODE[*]} --include='*.json' --include='*.yml' ${EXCLURE[*]} ."

titre "1b. Variables exposées au navigateur (préfixes publics)"
lancer "grep -rEn \"NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_\" --include='.env*' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' ${EXCLURE[*]} . | grep -viE 'PUBLIC_(SUPABASE_URL|SUPABASE_ANON|API_URL|SITE_URL|APP_URL|POSTHOG|GA_|GTM|SENTRY_DSN)'"

titre "2. Secrets dans Git"
if [ -d .git ]; then
  echo "  fichiers sensibles dans l'historique :"
  git log --all --full-history --name-only --pretty=format: 2>/dev/null \
    | sort -u | grep -Ei "^\.env($|\.)|credential|secret|\.pem$|\.key$|serviceaccount" | head -15 || rien
  echo "  .env ignoré par git :"
  grep -qE "^\.?env" .gitignore 2>/dev/null && echo "    oui" || echo "    NON — .gitignore ne couvre pas .env"
  echo "  .env actuellement suivi par git :"
  git ls-files 2>/dev/null | grep -E "^\.env" | head -5 || echo "    non"
else
  echo "  (pas de dépôt git ici)"
fi

titre "3. Clé service_role / admin côté client"
lancer "grep -rn \"service_role\|SERVICE_ROLE\|serviceAccountKey\|firebase-admin\|SUPABASE_SERVICE\" ${CODE[*]} ${EXCLURE[*]} ."
echo "  --- appels createClient (vérifier la clé passée dans chacun) ---"
lancer "grep -rn \"createClient(\" ${CODE[*]} ${EXCLURE[*]} ."

titre "6/7. Identité prise chez le client au lieu de la session"
lancer "grep -rEn \"req\\.body\\.(userId|user_id)|req\\.query\\.(userId|user_id)|body\\.(userId|user_id)\" ${CODE[*]} ${EXCLURE[*]} ."

titre "6b. Contrôle d'accès fait dans le navigateur (décoratif)"
lancer "grep -rEn \"(role|isAdmin|is_admin|isPremium|is_premium|plan) *===? *['\\\"]?(admin|premium|pro)|user\\.(isAdmin|is_admin|role) *&&\" --include='*.jsx' --include='*.tsx' --include='*.vue' --include='*.svelte' ${EXCLURE[*]} ."

titre "8. Mise à jour en masse du corps de requête"
lancer "grep -rEn \"update\\(req\\.body\\)|update\\(body\\)|update\\(\\{ *\\.\\.\\.req\\.body|\\.set\\(req\\.body\\)\" ${CODE[*]} ${EXCLURE[*]} ."

titre "13. SQL construit par concaténation"
lancer "grep -rEn \"query\\(.*\\+ *[a-zA-Z_]|query\\(\\\`[^\\\`]*\\\\\\\$\\{|execute\\(.*%s\" ${CODE[*]} ${EXCLURE[*]} ."

titre "15. Injection de HTML brut (XSS)"
lancer "grep -rn \"dangerouslySetInnerHTML\|innerHTML *=\|v-html\|{@html\" ${CODE[*]} ${EXCLURE[*]} ."

titre "17. Sélections larges dans les requêtes"
lancer "grep -rn \"select('\\*')\|select(\\\"\\*\\\")\|SELECT \\* FROM\" ${CODE[*]} ${EXCLURE[*]} ."

titre "Routes de debug / administration oubliées"
lancer "grep -rEni \"(app|router)\\.(get|post|put|delete)\\([^)]*(test|debug|seed|reset|migrate|admin)\" ${CODE[*]} ${EXCLURE[*]} ."

titre "18/19. Headers et HTTPS"
lancer "grep -rn \"helmet\|Strict-Transport-Security\|X-Frame-Options\|Content-Security-Policy\" ${CODE[*]} --include='*.json' --include='*.toml' ${EXCLURE[*]} ."

titre "11. Rate limiting"
lancer "grep -rn \"rate-limit\|rateLimit\|Ratelimit\|slowDown\" ${CODE[*]} --include='*.json' ${EXCLURE[*]} ."

titre "14. Validation d'entrées"
lancer "grep -rln \"from 'zod'\|from \\\"zod\\\"\|require('joi')\|from 'yup'\|superstruct\|valibot\" ${CODE[*]} ${EXCLURE[*]} ."

titre "20. Dépendances"
if [ -f package-lock.json ] || [ -f yarn.lock ] || [ -f pnpm-lock.yaml ]; then
  npm audit --omit=dev 2>/dev/null | tail -12 || echo "  (npm audit indisponible)"
else
  echo "  (pas de lockfile — npm audit impossible)"
fi

printf '\n=== FIN DU SCAN ===\n'
echo "Rappel : chaque ligne ci-dessus est un signal, pas une conclusion."
echo "Ouvrir les fichiers concernés avant de classer quoi que ce soit en 🔴."
echo "La RLS, le hachage des mots de passe, les cookies, les uploads et le chiffrement"
echo "ne sont PAS couverts par ce scan — ils se vérifient dans le dashboard et à la lecture."
```


---

# Partie 3 — Les 20 contrôles (`references/checklist.md`)

Sommaire :

- **Secrets et configuration** : 1. Clés API cachées · 2. Secrets purgés de Git · 3. Bonne clé de base côté client
- **Accès aux données** : 4. Row Level Security · 5. Chiffrement des données sensibles · 6. Autorisation côté serveur · 7. Verrouillage par enregistrement · 8. Champs non modifiables
- **Comptes et sessions** : 9. Cookies de session sécurisés · 10. Mots de passe hachés · 11. Rate limiting sur l'authentification · 12. Protection anti-bot
- **Entrées utilisateur** : 13. Requêtes paramétrées · 14. Validation des entrées · 15. Échappement du contenu · 16. Uploads restreints
- **Transport et surface** : 17. Réponses API épurées · 18. Headers de sécurité · 19. HTTPS forcé · 20. Dépendances scannées

---

## Secrets et configuration

### 1. Cacher les clés API

**Risque.** Une clé OpenAI, Anthropic, Stripe ou Resend présente dans le code du frontend est lisible par n'importe quel visiteur (onglet Sources du navigateur, ou `view-source`). Des robots scannent en permanence les sites publics à la recherche de ces clés. Le scénario habituel : facture d'API à plusieurs centaines de milliers de francs en une nuit.

**Vérifier.**
```bash
grep -rEn "sk-[A-Za-z0-9_-]{16,}|sk_live_|pk_live_|AIza[0-9A-Za-z_-]{20,}|xoxb-|ghp_|AKIA[0-9A-Z]{16}" \
  --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.vue" --include="*.svelte" --include="*.html" --include="*.py" --include="*.json" --include="*.yml" . \
  --exclude-dir={node_modules,.git,dist,build}
```
Vérifier aussi les variables exposées au navigateur : dans Next.js tout ce qui commence par `NEXT_PUBLIC_`, dans Vite `VITE_`, dans Create React App `REACT_APP_`. Une clé secrète derrière un de ces préfixes est publique, quel que soit le nom du fichier.

**Corriger.** Tout appel à une API payante ou privilégiée passe par une route serveur (`/api/...`, une Edge Function, un backend Express). Le frontend appelle cette route ; la clé ne quitte jamais le serveur. Après correction, **révoquer et régénérer** toute clé qui a été exposée : elle doit être considérée comme compromise, même si rien d'anormal n'a été constaté.

### 2. Purger les secrets de l'historique Git

**Risque.** Supprimer un fichier `.env` puis commiter ne l'efface pas : il reste dans l'historique, consultable par quiconque clone le dépôt. Sur un repo public, l'exposition est totale.

**Vérifier.**
```bash
git log --all --full-history --name-only --pretty=format: | sort -u | grep -E "\.env|credentials|secret|\.pem|\.key|serviceAccount"
grep -c "^\.env" .gitignore
```

**Corriger.** Régénérer d'abord toutes les clés concernées — c'est l'étape qui compte réellement, la purge de l'historique n'est que du nettoyage. Puis réécrire l'historique avec `git filter-repo` (ou BFG Repo-Cleaner) et forcer le push. Ajouter `.env*` au `.gitignore` et fournir un `.env.example` sans valeurs.

### 3. Utiliser la clé publique de base de données côté client

**Risque.** Supabase et Firebase distribuent deux clés. La clé publique (`anon` / apiKey web) est conçue pour être visible et n'ouvre que ce que les règles autorisent. La clé `service_role` contourne toutes les règles de sécurité. Placée dans le frontend, elle donne à n'importe quel visiteur un accès administrateur complet à la base : lecture, modification, suppression de toutes les tables.

**Vérifier.**
```bash
grep -rn "service_role\|SUPABASE_SERVICE\|serviceAccountKey\|createClient(" \
  --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" src/ app/ components/ 2>/dev/null
```
Un JWT Supabase se décode : si le champ `role` vaut `service_role`, la clé est administrateur. Vérifier chaque `createClient()` appelé depuis un fichier du frontend.

**Corriger.** Côté client, uniquement la clé `anon`. La `service_role` reste dans les variables d'environnement serveur, sans préfixe public. Si elle a fuité, la régénérer depuis le dashboard.

---

## Accès aux données

### 4. Activer la Row Level Security

**Risque.** Sans RLS, la clé publique suffit à lire n'importe quelle table. Le scénario : ouvrir la console du navigateur, récupérer l'URL du projet et la clé anon dans le code, exécuter une requête, récupérer la table complète des utilisateurs. C'est la première chose que fait un curieux sur un projet vibe-codé.

**Vérifier.** Dans le SQL Editor :
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public';
```
Toute table avec `rowsecurity = false` est ouverte. Une table avec RLS activée mais **aucune** policy est fermée à tous (bug fonctionnel, pas faille). Une policy dont la condition est `true` équivaut à pas de RLS.

**Corriger.**
```sql
alter table public.projets enable row level security;

create policy "lecture de ses propres projets"
  on public.projets for select
  using (auth.uid() = user_id);

create policy "création de ses propres projets"
  on public.projets for insert
  with check (auth.uid() = user_id);
```
Une policy par opération (`select`, `insert`, `update`, `delete`). Tester ensuite avec deux comptes différents : le compte A ne doit rien voir des données du compte B.

### 5. Chiffrer les données sensibles

**Risque.** Numéros de téléphone, pièces d'identité, tokens d'API de clients, coordonnées bancaires stockés en clair : une seule fuite de base expose tout, définitivement.

**Vérifier.** Parcourir le schéma à la recherche de colonnes sensibles stockées en `text` brut. Vérifier aussi les logs applicatifs — les données sensibles y atterrissent souvent via des `console.log` de débogage laissés en place.

**Corriger.** Chiffrer au niveau applicatif avant insertion (AES-GCM avec une clé en variable d'environnement), ou utiliser `pgcrypto`. Meilleure option quand elle est possible : ne pas stocker. Pour les cartes bancaires, ne jamais stocker — déléguer à Stripe, PayDunya ou Wave et ne conserver que l'identifiant de transaction.

### 6. Imposer l'authentification côté serveur

**Risque.** `if (user.role === 'admin')` dans un composant React masque un bouton, mais n'empêche rien : l'attaquant appelle directement l'API. Toute vérification faite uniquement dans le navigateur est décorative — le code du frontend est sous le contrôle total du visiteur.

**Vérifier.** Lister chaque route API et confirmer qu'elle commence par une vérification de session côté serveur. Chercher les routes qui font confiance à un `userId` reçu dans le corps de la requête plutôt que de le lire depuis la session :
```bash
grep -rn "req.body.userId\|req.query.userId\|body.user_id" --include="*.js" --include="*.ts" .
```

**Corriger.** L'identité vient de la session vérifiée côté serveur, jamais du client :
```js
const { data: { user } } = await supabase.auth.getUser();
if (!user) return res.status(401).json({ error: 'Non authentifié' });
// utiliser user.id — jamais req.body.userId
```

### 7. Verrouiller l'accès par enregistrement

**Risque.** L'utilisateur est bien authentifié, mais rien ne vérifie qu'il est propriétaire de la ressource demandée. Changer `/facture/1042` en `/facture/1043` affiche la facture d'un autre client. C'est la faille la plus répandue et la plus simple à exploiter — aucun outil nécessaire, juste la barre d'adresse.

**Vérifier.** Pour chaque route qui prend un identifiant en paramètre, confirmer que la requête filtre aussi sur le propriétaire. Test manuel : se connecter avec le compte A, demander une ressource du compte B, vérifier qu'on obtient bien une erreur.

**Corriger.**
```js
const { data } = await supabase
  .from('factures')
  .select('*')
  .eq('id', factureId)
  .eq('user_id', user.id)   // le filtre qui change tout
  .single();
```

### 8. Bloquer la modification de champs sensibles

**Risque.** Une route de mise à jour de profil qui accepte l'objet entier envoyé par le client permet d'y glisser `{"role": "admin"}` ou `{"credits": 999999}`. L'utilisateur se promeut lui-même.

**Vérifier.** Chercher les mises à jour qui passent le corps de requête tel quel :
```bash
grep -rn "update(req.body)\|update({ ...req.body\|\.update(body)" --include="*.js" --include="*.ts" .
```

**Corriger.** N'extraire que les champs autorisés, explicitement :
```js
const { nom, avatar_url } = req.body;   // liste blanche
await supabase.from('profils').update({ nom, avatar_url }).eq('id', user.id);
```
Côté base, une policy `with check` peut empêcher la modification du rôle. Les champs comme `role`, `credits`, `is_premium` ne se modifient que par du code serveur privilégié.

---

## Comptes et sessions

### 9. Sécuriser les cookies de session

**Risque.** Un token stocké dans `localStorage` est lisible par tout script JavaScript s'exécutant sur la page — une seule faille XSS suffit à voler la session. Un cookie sans `Secure` circule en clair sur une connexion HTTP.

**Vérifier.** Chercher `localStorage.setItem` avec un token, et contrôler les options des cookies posés côté serveur.

**Corriger.** Cookies `httpOnly: true`, `secure: true`, `sameSite: 'lax'` (ou `'strict'`), avec une durée d'expiration explicite. Prévoir l'invalidation à la déconnexion et une rotation du token à la connexion.

### 10. Hacher les mots de passe

**Risque.** Mots de passe stockés en clair ou en MD5/SHA1 : au premier accès à la base, tous les comptes tombent — et comme les mots de passe sont réutilisés, les comptes email des utilisateurs avec.

**Vérifier.** Si l'authentification est déléguée (Supabase Auth, Clerk, Auth0), c'est géré : marquer conforme après avoir confirmé qu'aucune table maison ne stocke de mot de passe. Sinon, chercher `md5`, `sha1`, `createHash` sur un mot de passe.

**Corriger.** `bcrypt` (coût ≥ 12) ou `argon2`. Jamais de chiffrement réversible, jamais de hachage sans sel. Le plus simple reste de ne pas gérer les mots de passe soi-même.

### 11. Limiter les tentatives de connexion

**Risque.** Sans limite, un script teste des milliers de mots de passe par minute. Sur un formulaire d'inscription, il crée des milliers de comptes. Sur un envoi d'email ou de SMS, il fait exploser la facture.

**Vérifier.** Chercher un middleware de rate limiting sur les routes `/login`, `/signup`, `/reset-password`, `/otp`.

**Corriger.** `express-rate-limit`, `upstash/ratelimit` ou l'équivalent : environ 5 tentatives par 15 minutes et par IP sur la connexion, avec verrouillage progressif du compte. Renvoyer un message identique en cas d'email inexistant ou de mot de passe faux, pour ne pas révéler quels comptes existent.

### 12. Ajouter une protection anti-bot

**Risque.** Formulaires publics submergés de spam, comptes créés en masse pour épuiser un quota d'essai gratuit, scraping de contenu.

**Vérifier.** Présence d'un CAPTCHA ou équivalent sur les formulaires ouverts.

**Corriger.** Cloudflare Turnstile ou hCaptcha sur l'inscription et les formulaires publics — vérification faite côté serveur, jamais seulement dans le navigateur. Un champ honeypot invisible arrête déjà une partie des robots simples.

---

## Entrées utilisateur

### 13. Paramétrer les requêtes SQL

**Risque.** Une requête construite par concaténation permet l'injection SQL : un champ de recherche devient un outil pour lire ou supprimer n'importe quelle table.

**Vérifier.**
```bash
grep -rnE "query\(.*\+|query\(\`.*\\\$\{|execute\(.*%s.*%" --include="*.js" --include="*.ts" --include="*.py" .
```
Les clients Supabase et les ORM (Prisma, Drizzle) paramètrent par défaut ; le risque se concentre dans le SQL écrit à la main et dans les fonctions Postgres personnalisées.

**Corriger.** Requêtes préparées avec placeholders (`$1`, `?`), jamais de concaténation. Dans les fonctions Postgres, `execute ... using` plutôt que la construction de chaîne.

### 14. Valider toutes les entrées

**Risque.** Le serveur qui fait confiance à ce qu'il reçoit se retrouve avec des données corrompues, des erreurs 500 exploitables, ou un fichier de 2 Go en base. La validation faite dans le formulaire est contournable en une requête `curl`.

**Vérifier.** Chaque route API valide-t-elle le type, la longueur et le format de ce qu'elle reçoit ?

**Corriger.** Un schéma par route avec Zod, Yup ou Joi, appliqué côté serveur en plus du formulaire. Valider aussi les paramètres d'URL et de pagination (une limite non bornée permet de tout aspirer en une requête).

### 15. Échapper le contenu utilisateur

**Risque.** XSS : un utilisateur poste `<script>` dans un commentaire, le code s'exécute chez tous les visiteurs et vole leurs sessions.

**Vérifier.**
```bash
grep -rn "dangerouslySetInnerHTML\|innerHTML\s*=\|v-html" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.vue" .
```

**Corriger.** React échappe automatiquement — le danger vient précisément des contournements ci-dessus. Si du HTML riche doit être affiché, le nettoyer avec DOMPurify avant rendu. Assainir à l'affichage plutôt qu'au stockage, pour conserver la donnée d'origine.

### 16. Restreindre les uploads de fichiers

**Risque.** Upload sans contrôle : hébergement de contenus illégaux sur le domaine, saturation du stockage, ou fichier exécutable servi aux visiteurs.

**Vérifier.** Y a-t-il une limite de taille, une liste blanche d'extensions, une vérification du type réel du fichier ? Les policies du bucket de stockage sont-elles configurées ?

**Corriger.** Liste blanche d'extensions **et** vérification des octets d'en-tête (le `Content-Type` envoyé par le client se falsifie). Limite de taille explicite. Renommer les fichiers avec un UUID à l'arrivée. Servir depuis un domaine ou un bucket séparé, avec des policies de stockage restreignant l'écriture au propriétaire.

---

## Transport et surface

### 17. Épurer les réponses d'API

**Risque.** Un `select('*')` sur une table utilisateurs renvoie aussi les emails, les hachages, les rôles et les notes internes — même si l'interface n'en affiche qu'une partie. Il suffit d'ouvrir l'onglet Réseau pour tout lire.

**Vérifier.** Chercher les `select('*')` et les objets renvoyés en bloc sur les routes publiques.

**Corriger.** Sélectionner explicitement les colonnes nécessaires. Prévoir des vues publiques distinctes pour les données affichables par des tiers.

### 18. Ajouter les headers de sécurité

**Risque.** Sans headers, l'application est vulnérable au clickjacking (mise en iframe), au sniffing de type MIME et aux fuites de referrer.

**Vérifier.** `curl -sI https://mon-app.com | grep -iE "content-security-policy|x-frame|strict-transport|x-content-type"`

**Corriger.** `helmet` sur Express, ou les headers dans `next.config.js` / `netlify.toml` / `vercel.json` : `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`.

### 19. Forcer HTTPS

**Risque.** En HTTP, les identifiants et les cookies transitent en clair — interceptables sur un wifi partagé.

**Vérifier.** Une requête sur `http://` doit répondre par une redirection 301 vers `https://`.

**Corriger.** Redirection permanente au niveau de l'hébergeur, plus HSTS. Vérifier qu'aucune ressource n'est chargée en `http://` dans les pages (contenu mixte).

### 20. Scanner les dépendances

**Risque.** Une faille dans un paquet installé est une faille dans l'application. Les projets vibe-codés accumulent des dépendances jamais mises à jour.

**Vérifier.**
```bash
npm audit --omit=dev
npx depcheck        # repérer les paquets installés puis oubliés
```

**Corriger.** Traiter les vulnérabilités `high` et `critical` avant la mise en ligne. Supprimer les dépendances inutilisées : chacune est une surface d'attaque. Activer Dependabot sur le dépôt pour la suite.

---

## Test final avant mise en ligne

Une fois les corrections faites, ces quatre tests manuels valent tous les scans automatiques :

1. **Test des deux comptes.** Créer A et B, se connecter avec A, essayer d'atteindre les données de B en modifiant les identifiants dans l'URL et dans les appels API.
2. **Test de la console.** Ouvrir l'onglet Réseau sur les pages principales et lire les réponses : y a-t-il des champs qui ne devraient pas sortir du serveur ?
3. **Test de la clé anon.** Récupérer l'URL du projet et la clé publique depuis le code, tenter une requête sur chaque table sensible depuis un terminal, sans être connecté. Tout doit être refusé.
4. **Test du client déloyal.** Appeler les routes d'API sans passer par l'interface, avec des valeurs inattendues : identifiant d'un autre utilisateur, champ `role` ajouté, chaîne de 10 000 caractères.

---

# Partie 4 — Supabase (`references/supabase.md`)

C'est la stack la plus courante des SaaS vibe-codés, et celle où les erreurs coûtent le plus cher : la base est directement joignable depuis Internet, sans backend pour la protéger. Tout repose donc sur la configuration.

## Requêtes de diagnostic à passer en premier

Dans le SQL Editor du dashboard :

```sql
-- Tables sans RLS : chacune est ouverte à quiconque a la clé anon
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;

-- Policies existantes : lire la colonne qual, une condition "true" ne protège rien
select tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename;

-- Tables avec RLS mais sans aucune policy : inaccessibles (bug fonctionnel)
select t.tablename from pg_tables t
left join pg_policies p on p.tablename = t.tablename
where t.schemaname = 'public' and t.rowsecurity = true and p.policyname is null;

-- Fonctions en SECURITY DEFINER : elles s'exécutent avec les droits du créateur
-- et contournent la RLS. Chacune doit être justifiée et vérifier l'appelant.
select proname, prosecdef from pg_proc
where pronamespace = 'public'::regnamespace and prosecdef = true;
```

## Les erreurs récurrentes

**La clé `service_role` côté client.** Elle contourne toute la RLS. Vérifier chaque `createClient()` du frontend, et décoder le JWT en cas de doute : si `role` vaut `service_role`, c'est une clé administrateur. Elle ne doit exister que dans les variables d'environnement serveur, jamais derrière `NEXT_PUBLIC_` ou `VITE_`.

**La policy fourre-tout.** `using (true)` ou `to public` sur un `select` rend la table entièrement lisible : RLS activée, mais sans effet. À lire ligne par ligne, l'activation seule ne prouve rien.

**L'oubli des opérations d'écriture.** Une policy `select` bien écrite ne protège ni l'`insert`, ni l'`update`, ni le `delete`. Vérifier les quatre pour chaque table.

**Le schéma `storage` non couvert.** Les buckets ont leurs propres policies, dans la table `storage.objects`. Un bucket public laisse lire tous les fichiers par URL directe — vérifier si des documents personnels y sont stockés.

```sql
select id, name, public from storage.buckets;
select policyname, cmd, qual from pg_policies where schemaname = 'storage';
```

**Les Edge Functions sans vérification.** Une Edge Function déployée est une URL publique. Elle doit valider le JWT reçu et ne pas se contenter d'un identifiant passé dans le corps de la requête :

```ts
const authHeader = req.headers.get('Authorization');
const { data: { user }, error } = await supabase.auth.getUser(
  authHeader?.replace('Bearer ', '')
);
if (error || !user) return new Response('Non authentifié', { status: 401 });
```

**Les colonnes sensibles dans une table exposée.** Même avec une bonne policy, un `select('*')` renvoie toutes les colonnes de la ligne autorisée. Les données internes (notes d'administration, score de risque, flag `is_banned`) se rangent dans une table séparée, non couverte par la policy de lecture publique.

## Test de validation

Récupérer l'URL du projet et la clé anon depuis le code du frontend, puis, sans être connecté :

```bash
curl "https://<projet>.supabase.co/rest/v1/utilisateurs?select=*" \
  -H "apikey: <cle_anon>"
```

La réponse attendue est un tableau vide ou une erreur de permission. Si des données remontent, la table est publique. Refaire le test sur chaque table sensible.

---

# Partie 5 — Firebase (`references/firebase.md`)

Comme Supabase, Firebase expose la base directement au navigateur. La `apiKey` visible dans le code n'est pas un secret — c'est un identifiant de projet, et la voir dans le bundle n'est pas une faille. **Toute la sécurité repose sur les Security Rules.** C'est là qu'il faut regarder, et nulle part ailleurs.

## Firestore Rules

Le mode test, proposé par défaut à la création, ouvre tout :

```
// CATASTROPHIQUE — n'importe qui lit et écrit toute la base
allow read, write: if true;

// À peine mieux — tout utilisateur connecté accède aux données de tous les autres
allow read, write: if request.auth != null;
```

La règle correcte vérifie la propriété de chaque document :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /profils/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId
                   && !request.resource.data.diff(resource.data)
                        .affectedKeys().hasAny(['role', 'credits']);
    }

    match /projets/{projetId} {
      allow read, delete: if request.auth != null
                          && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid;
    }

    match /{document=**} {
      allow read, write: if false;   // tout ce qui n'est pas listé est fermé
    }
  }
}
```

Trois points à contrôler dans les règles existantes :

- **La date d'expiration du mode test.** Une règle contenant `request.time < timestamp.date(...)` est une règle de prototypage. Passée la date, l'app cesse de fonctionner ; avant, tout est ouvert.
- **La distinction `resource` / `request.resource`.** `resource.data` est le document existant, `request.resource.data` celui qu'on veut écrire. Les confondre laisse passer des écritures qu'on croyait bloquées.
- **Le verrouillage des champs sensibles.** Sans le `diff().affectedKeys()`, un utilisateur qui a le droit d'écrire son profil peut y ajouter `role: "admin"` (contrôle 8).

Les règles se testent dans le simulateur de la console Firebase, ou en local avec `firebase emulators:start`. Un audit sérieux exécute au moins un test de lecture croisée entre deux uid.

## Storage Rules

Séparées des règles Firestore, et fréquemment oubliées :

```
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{userId}/{fichier} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

Sans contrainte de taille ni de type, le bucket sert d'hébergement gratuit à n'importe qui (contrôle 16).

## Le SDK Admin

`firebase-admin` contourne toutes les règles. Il n'a sa place que dans une Cloud Function ou un backend. Chercher :

```bash
grep -rn "firebase-admin\|serviceAccountKey\|admin.initializeApp" --include="*.js" --include="*.ts" --include="*.json" .
```

Un fichier `serviceAccountKey.json` dans le dépôt est un 🔴 immédiat : il donne un accès administrateur complet au projet. Le régénérer depuis la console Google Cloud après l'avoir retiré de l'historique Git.

## Cloud Functions

Une fonction `onRequest` est une URL publique sans authentification. Elle doit vérifier le jeton elle-même :

```js
const token = req.headers.authorization?.split('Bearer ')[1];
const decoded = await admin.auth().verifyIdToken(token);   // lève si invalide
```

Les fonctions `onCall` reçoivent `context.auth` renseigné automatiquement, mais il faut quand même tester sa présence — l'appel reste possible sans être connecté.

## App Check

Sans App Check, n'importe qui peut appeler la base et les fonctions depuis un script, en dehors de l'application. Ce n'est pas un remplacement des règles de sécurité, mais c'est la protection anti-bot native (contrôle 12) et elle est rapide à activer.

## Test de validation

Depuis un terminal, sans être connecté, avec l'`apiKey` et l'`projectId` récupérés dans le code :

```bash
curl "https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/utilisateurs?key=<apiKey>"
```

La réponse attendue est une erreur de permission. Si des documents remontent, la collection est publique.

---

# Partie 6 — Node / Express (`references/node-express.md`)

## Ordre des middlewares

L'ordre détermine l'efficacité. Un middleware d'authentification déclaré après les routes ne protège rien.

```js
app.use(helmet());                       // headers de sécurité, en premier
app.use(cors({ origin: ORIGINE_AUTORISEE, credentials: true }));
app.use(express.json({ limit: '1mb' })); // borne la taille du corps
app.use('/api/auth', limiteurConnexion); // rate limiting sur l'authentification
app.use('/api', verifierSession);        // authentification AVANT les routes protégées
app.use('/api', routes);
```

## À vérifier systématiquement

**CORS en mode ouvert.** `app.use(cors())` sans option autorise toutes les origines. Combiné à des cookies de session, cela permet à n'importe quel site d'appeler l'API au nom d'un utilisateur connecté. Lister explicitement les origines autorisées.

**Corps de requête non borné.** Sans `limit`, un envoi de 500 Mo fait tomber le serveur. Fixer une limite basse et l'augmenter seulement là où c'est nécessaire.

**Erreurs renvoyées telles quelles.** `res.status(500).json({ error: err })` expose la stack trace, les chemins du serveur et parfois la chaîne de connexion à la base. Logger le détail côté serveur, renvoyer un message générique au client.

**Variables d'environnement non validées au démarrage.** Une variable manquante fait souvent basculer le code sur une valeur par défaut permissive. Vérifier leur présence au boot et refuser de démarrer si une clé manque.

**Secret JWT faible ou codé en dur.** Chercher `jwt.sign` et `jwt.verify` : le secret doit venir de l'environnement, faire au moins 32 caractères aléatoires, et l'expiration doit être explicite. Vérifier aussi que l'algorithme est imposé (`algorithms: ['HS256']`) pour éviter l'attaque `alg: none`.

**Routes de debug oubliées.** `/test`, `/debug`, `/admin/seed`, un endpoint qui vide la base ou crée un compte administrateur : chercher ces routes avant la mise en ligne.

```bash
grep -rn "app\.\(get\|post\|put\|delete\)(" --include="*.js" --include="*.ts" . | grep -iE "test|debug|seed|reset|admin"
```

**Exécution de commandes système.** `exec`, `execSync`, `spawn` avec une valeur venant de l'utilisateur permettent l'injection de commandes. Si c'est indispensable, passer les arguments en tableau plutôt qu'en chaîne, et valider strictement.

**Dépendances de production.** `npm audit --omit=dev` avant chaque mise en ligne, et vérifier que les outils de développement ne sont pas en `dependencies`.

---

# Partie 7 — Next.js (`references/nextjs.md`)

## La frontière client / serveur

C'est là que se concentrent les erreurs. Un fichier sans `'use client'` s'exécute côté serveur, mais tout ce qu'il **passe en props** à un composant client se retrouve dans le HTML envoyé au navigateur — y compris ce qui devait rester privé.

À vérifier : les props transmises depuis un Server Component ne contiennent ni token, ni clé, ni champ sensible d'un enregistrement complet passé « pour plus tard ».

**Le préfixe `NEXT_PUBLIC_`.** Toute variable ainsi préfixée est inlinée dans le bundle du navigateur. Elle est publique, définitivement, quel que soit l'endroit où elle est définie.

```bash
grep -rn "NEXT_PUBLIC_" .env* next.config.* src/ app/ 2>/dev/null
```
Chaque résultat doit être une valeur qu'on accepte d'afficher publiquement : URL de projet, clé anon, identifiant d'analytics. Rien d'autre.

## Route Handlers et Server Actions

Une Server Action est un endpoint HTTP public, pas une fonction interne. Le fait qu'elle soit appelée depuis un formulaire protégé ne la protège pas : elle est appelable directement.

```ts
export async function supprimerProjet(id: string) {
  const session = await auth();                       // vérification obligatoire
  if (!session?.user) throw new Error('Non authentifié');
  await db.projet.delete({
    where: { id, userId: session.user.id },           // et vérification de propriété
  });
}
```

Même règle pour chaque fichier `route.ts` : vérifier la session en entrée, ne jamais faire confiance à un identifiant reçu dans le corps de la requête.

## Middleware

`middleware.ts` sert à rediriger, pas à sécuriser. Un `matcher` mal configuré laisse passer des routes, et le middleware ne s'exécute pas sur certains chemins. La vérification d'accès doit être répétée dans la route ou l'action elle-même — le middleware n'est qu'une première couche de confort.

## Headers

Ils se déclarent dans `next.config.js` :

```js
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ],
  }];
}
```

## Avant la mise en ligne

Construire le projet puis chercher les secrets dans le bundle généré — c'est le test le plus fiable, il montre exactement ce que le navigateur reçoit :

```bash
npm run build
grep -rE "sk-|service_role|sk_live_" .next/static/ | head
```

Aucun résultat attendu.