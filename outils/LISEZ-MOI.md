# Les fabricants de pages

Quatre pages du site ne sont **pas écrites à la main** : elles sont fabriquées
à partir d'une autre page, qui porte déjà toute la plomberie commune —
connexion du portefeuille, session, dépôts, retraits, quêtes, menu, profil.

| Page fabriquée | Script | Source |
|---|---|---|
| `connect4.html` | `assemble.py` | `plinko.html` + `css.txt` `dom.txt` `js.txt` `handlers.txt` |
| `morpion.html`, `dames.html` | `duels.py` | `connect4.html` |
| les trois rubriques de `games.html` | `rubriques.py` | `games.html` (une seule fois) |
| les cartes des duels dans `games.html` | `duels_catalogue.py` | `games.html` |

**Ne pas éditer ces pages à la main.** La modification serait perdue au
prochain rendu, et surtout les trois pages de duel divergeraient l'une de
l'autre — c'est précisément ce que ces scripts empêchent.

Chaque découpe se fait sur un **repère** (une chaîne de caractères reconnue
dans la source), jamais sur un numéro de ligne : si la source bouge, le script
s'arrête bruyamment au lieu d'écrire n'importe où.

## Pour retoucher une page de duel

1. modifier `duels.py` (le plateau, son CSS, le coup envoyé, les étiquettes) ;
2. `python3 outils/duels.py` ;
3. relancer le test à deux navigateurs avant de pousser.

`rubriques.py` n'est **pas** rejouable : il consomme les commentaires
`<!-- LIVE: … -->` de `games.html`, qu'il ne réécrit pas. Il est gardé pour
mémoire de la façon dont les rubriques ont été posées.
