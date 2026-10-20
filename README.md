# MPG – Ligues de test auto

Extension Chrome (MV3). Un clic dans le popup :

1. Crée une ligue par championnat actif (`GET /championships/active`) : `Test NN - L1`, `Test NN - PL`, `Test NN - Liga`, `Test NN - L2`, `Test NN - Serie A`, `Test NN - LDC`, `Test NN - LS`, plus `Test NN - L1 Express` (`PATCH /league/:id {gameSettings.isOneWay: true}`).
2. Invite les joueurs (`frank-01` à `frank-05` par défaut) : `PATCH /league/:id/invite-users-to-join`.
3. Accepte les invitations compte par compte avec le header `view-as` (le même mécanisme que « Custom user » / page `/debug`) : `GET /user-notifications` puis `PATCH /user-notification/:id/action/accept`.
4. Lance chaque ligue depuis le compte principal : `PATCH /league/:id/validate-mono-division` (mercato au prochain créneau de 30 min (hh:00 ou hh:30) ; si l API le refuse, créneau suivant, fermeture auto activée).

Joueurs invités : le **compte connecté** (ou le custom user) est toujours affiché en premier, marqué « toi », et ne peut pas être retiré (c'est lui qui crée et lance les ligues) ; le saisir parmi les invités est refusé. Pour les autres, saisis un **pseudo**, un **email** ou un **userId** (Entrée, virgule ou espace pour valider). Chaque saisie est résolue tout de suite via l'onglet MPG — pseudo : `GET /user/:username` ; email / userId / shortId : `GET /debug/user/ids?identifier=` puis `GET /user/:id` pour le pseudo — et la puce affiche le pseudo (survol : pseudo, userId, saisie). Un joueur introuvable est retiré avec un message ; sans onglet MPG connecté, la puce reste « non vérifiée » et est résolue au lancement. Les anciens userId enregistrés récupèrent leur pseudo à l'ouverture du popup.

Dans le popup, clique sur le logo d'un championnat pour l'activer / le griser, et sur « ⚡ Express » pour créer aussi sa version express (indépendant : on peut ne créer que l'express). La sélection est mémorisée ; la liste vient de `/championships/active` (via l'onglet MPG ouvert).

Le numéro avance tout seul après chaque exécution (modifiable dans le popup). La progression s'affiche dans un panneau en bas à droite de l'onglet MPG.

## Logos des ligues

Une ligue sur trois (compteur mémorisé d'une création à l'autre) reçoit un logo généré par IA ; les autres prennent au hasard un des 15 logos proposés par le site (`leagueLogoList`).

- Génération : Cloudflare Workers AI, modèle `@cf/black-forest-labs/flux-1-schnell` (4 étapes, ~60 Neurons/image ; gratuit jusqu'à 10 000 Neurons/jour sur le plan Workers Free, puis erreur jusqu'à 00:00 UTC). Prompt aléatoire : écusson / mascotte de club de foot imaginaire, sans texte.
- L'appel Cloudflare est fait par le service worker (`src/background.js`) ; le token y est stocké en dur, masqué (XOR + base64), jamais transmis à la page ni affiché dans le popup. L'Account ID est renseigné en dur (`ACCOUNT_ID`).
- L'image est envoyée à MPG comme un logo personnalisé (`POST /upload-temp`, multipart `file` → `{ url }`) puis utilisée en `imageUrl` à la création.
- Si l'IA échoue, un logo proposé est utilisé et le panneau l'indique. Si c'est le quota du jour (crédits épuisés), l'extension n'appelle plus Cloudflare jusqu'à 00:00 UTC et prend directement un logo proposé.

## Onglet Mercato

Liste les ligues du compte principal en mercato (`GET /dashboard`, `divisionStatus = 3`) avec le tour et le nombre d'équipes ayant validé. On coche une ou plusieurs ligues (filtre texte + « Cocher visibles »), puis « Faire le mercato ». Pour chaque ligue et chaque compte de la division (`view-as`, + ton compte si l'option est cochée) :

1. Crée l'équipe si elle n'existe pas (`POST /team/division/:divisionId`, maillot du vestiaire du compte).
2. Ignore le compte s'il a déjà validé le tour (`mercatoState.teamsStatuses[teamId] = 2`).
3. Complète les minimums par poste (`/rules` → 2 G, 6 D, 6 M, 4 A) en tenant compte de l'effectif déjà acquis et du budget restant. Choix façon « J'ai de la chance » : au hasard parmi les cotes > 14, puis 11-14, puis le reste ; enchère = cote ; on évite de viser les mêmes joueurs que les autres comptes de la ligue.
4. Envoie les enchères : `POST /team/:teamId/mercato-bids { turn, bids }`.

Les ligues dont le mercato n'est pas encore ouvert sont grisées.

Deux boutons :
- **Jouer 1 tour** : uniquement le tour en cours (une équipe déjà complète valide le tour sans enchère).
- **Terminer le mercato** : enchaîne les tours (attend la résolution de chaque tour via `GET /division/:id`) ; dès qu'une équipe a son effectif minimum, elle clôture son mercato (`PATCH /team/:teamId/end-mercato`, = « Clôturer mes enchères »). Le mercato se ferme quand toutes les équipes ont clôturé (division `status 4`, `mercatoClosed`). Si ton compte n'est pas inclus et n'a pas clôturé, l'enchaînement s'arrête (il attendrait ton tour).

## Onglet Ligues (organiser Mon MPG)

Remplace « Réorganiser » du site. Liste toutes tes ligues et tournois (`GET /user/leagues`, `GET /user/tournaments`) dans l'ordre actuel de Mon MPG (`GET /dashboard`, `orderedTiles`) :
- vues **Affichées / Masquées / Toutes**, recherche, filtres cumulables (Ligues, Tournois, En préparation, Mercato, En cours, Terminées) ;
- **glisser-déposer** via la poignée ⋮⋮ (ou flèches ↑ ↓ au clavier) dans la vue Affichées sans filtre ; les compétitions épinglées par MPG restent en tête ;
- **Trier** : par statut, plus récentes, nom, championnat, ligues puis tournois ;
- l'œil masque / ré-affiche ; **Masquer (n)** / **Afficher (n)** s'appliquent à la liste filtrée ;
- tout reste en brouillon (point bleu sur les lignes modifiées) jusqu'à **Enregistrer** : un seul `PATCH /user-contests/organize { orderedContestsIds, hiddenContestsIds }`, puis Mon MPG se recharge. **Annuler** revient à l'état du serveur.

## Bouton sur Mon MPG

Sur la page Mon MPG (`/`), un bouton « Tools » est ajouté à côté de « Filtrer » / « Réorganiser » (clone du bouton du site, avec une bordure arc-en-ciel animée). Au clic, la popup de l'extension s'ouvre juste sous le bouton (iframe ancrée ; au-dessus ou à côté s'il manque de place ; Échap ou clic à côté pour fermer). Sa hauteur est celle de l'onglet Créer sans défilement ; sur Mercato et Ligues, la liste occupe l'espace restant.

## Prod et dev

L'extension tourne sur **mpg.football** et **dev.mpg.football**. L'environnement suit l'onglet :

| Site | API | Token (`localStorage`) |
|---|---|---|
| `mpg.football` | `https://api.mpg.football` | `com.monpetitgazon.monpetitgazonapp.secureStorage\accessToken` |
| `dev.mpg.football` | `https://dev.api.mpg.football` | `com.monpetitgazon.monpetitgazondev.secureStorage\accessToken` |

Si une API URL custom est définie (extension « API URL » ou page `/debug`, store `mmkv.default\debug` de l'app), elle est utilisée à la place, relue à chaque appel et normalisée comme le fait l'app (`https://` ajouté si absent), avec le header `ngrok-skip-browser-warning: true` (comme l'app). Le popup l'affiche dans sa ligne de connexion (« API custom … ») et le panneau de progression aussi. Une réponse HTML (page ngrok, mauvaise URL) donne une erreur explicite.

De même, si un **custom user** est appliqué (extension « Custom user » ou page `/debug`, `state.data.identifiers.mpgId`), tous les appels partent avec `view-as: <mpgId>` comme dans l'app : le « compte principal » (création, lancement, mercato « mon compte », onglet Ligues) est alors ce custom user. Les comptes invités gardent leur propre `view-as` ; `/debug/user/ids` part sans `view-as`. Le popup affiche « en tant que … ».

Les joueurs invités, le numéro de ligue et le cache des championnats sont mémorisés **séparément** pour la dev (clés `*_dev`). Joueurs par défaut en dev : `user_12345001` à `user_12345005`. Le popup affiche un badge **DEV** sur dev.mpg.football.

## Installation

`chrome://extensions` → Mode développeur → « Charger l'extension non empaquetée » → ce dossier. Recharge ensuite l'onglet mpg.football.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/api.js` | Appels `api.mpg.football` avec le token de la session (`localStorage`), header `view-as` optionnel |
| `src/runner.js` | Orchestration (création, mercato) + panneau de progression |
| `src/squad.js` | Choix des joueurs / enchères d'un tour de mercato (logique pure) |
| `src/version-capture.js` | (monde MAIN) récupère le header `client-version` de l'app |
| `src/background.js` | Service worker : génération des logos IA (Cloudflare) |
| `src/home-button.js` | Bouton « Tools » sur la page Mon MPG |
| `popup/` | Popup (onglets Créer / Mercato / Ligues) : `popup.html`, `popup.css`, `popup.js` |
