# SWOGE — site

Pages HTML servies par GitHub Pages depuis `main`. JavaScript nu dans les
pages, aucun bundler, aucun framework. Le serveur est dans l'autre dépôt
(`swoge-pusher-server.github.io`), déployé sur Railway depuis `main`.

## Approche

- Lire les fichiers avant d'écrire. Ne pas relire ce qui n'a pas changé.
- Raisonnement complet, sortie concise. Pas d'ouverture flatteuse ni de
  conclusion décorative.
- Ne jamais deviner une API, une version, un drapeau, un SHA de commit ou un
  nom de paquet. Vérifier en lisant le code ou la documentation avant
  d'affirmer.
- `swoge_ai.html` fait plusieurs milliers de lignes : lire la section utile
  (`grep -n` puis `sed -n`), pas le fichier entier.

## Le marqueur de cache — l'erreur qui coûte le plus cher ici

Un travail poussé, correct, et **invisible** : c'est arrivé trois fois de
suite. Les scripts versionnés et les pages qui se versionnent elles-mêmes
(`swoge_ai.html`, `swoge_wallet.html`, `nexus.html`) portent une empreinte. Si
elle ne change pas, les navigateurs ne redemandent jamais le fichier.

```bash
node cache_marqueur.test.js
```

L'essai **échoue et donne la valeur exacte à écrire** — dans la page ET dans
`version.json`. Le lancer après toute modification d'un de ces fichiers, avant
de pousser.

## Les essais

Une centaine de fichiers `*.test.js`, Playwright pour les pages. Ceux qui
comptent pour le panneau de la colonie :

```bash
NODE_PATH=<scratchpad>/pw/node_modules:/home/user/swoge-pusher-server.github.io/node_modules \
  node ai_colonie.test.js
node cache_marqueur.test.js
```

**Aucun commit sans code de sortie vert.** Un essai qui clignote a une cause :
la chercher, ne jamais l'affaiblir pour le faire passer. Quand un essai
existant contredit un changement voulu, le réécrire sur son **intention**
(souvent écrite dans sa propre phrase), pas le supprimer.

## Ce que la page a le droit de faire

La page **montre** ; elle ne décide pas. Toute autorisation est revérifiée
côté serveur à chaque geste — `AI_OWNER`, propriété du miroir, adresse de la
session. Cacher un bouton n'est pas un contrôle d'accès.

- La clé privée d'un portefeuille généré est montrée **une seule fois**, jamais
  dans `localStorage`.
- Un geste n'agit que sur l'adresse de la session, jamais sur une adresse prise
  dans un message reçu.

## Écrire dans le panneau

- Le texte montré aux joueurs est en **anglais** ; les commentaires du code en
  français.
- Une carte qui affiche un chiffre doit dire **sur combien d'observations** il
  porte, et refuser de conclure en dessous. Un écart sur une poignée de jetons
  est de la chance, pas un résultat (voir `BANCS_ASSEZ`, `REEL_ASSEZ`).
- Les phrases vivent dans la table `ph(...)`, en deux langues, jamais en dur
  dans le peintre.

## Publier

```bash
git push -u origin claude/<branche>
git push origin HEAD:main          # autorisé par le propriétaire
```

GitHub Pages sert `main`. Un travail resté sur la branche n'est visible par
personne. Message de commit : ce qui a été mesuré et pourquoi, pas ce qui a été
édité. Aucun identifiant de modèle nulle part dans le dépôt.
