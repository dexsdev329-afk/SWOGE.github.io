# Habillage SWOGE BONANZA

Quatorze illustrations, generees a partir des prompts de
`docs/SWOGE_BONANZA_PROMPTS.md`.

## Ce qui a ete fait aux originaux

**Detourage du bonbon violet.** Il arrivait sur fond BLANC opaque, sans canal
alpha — les treize autres etaient deja detourees. Sur la grille, ca donnait un
carre blanc au milieu des symboles : le defaut le plus visible du lot.

Un `colorkey` sur le blanc aurait aussi efface les cristaux de sucre et les
reflets, c'est-a-dire tout ce qui fait le bonbon. On n'a donc supprime que le
blanc RELIE AU BORD, par diffusion depuis les quatre cotes : le blanc enferme
a l'interieur de l'objet n'est jamais atteint. Les pixels du contour, melanges
au blanc par le generateur, ont recu un alpha proportionnel a leur eloignement
du blanc — sans ca, un lisere clair serait reste tout autour, et il se voit
immediatement sur un fond sombre. Verifie ensuite sur fond sombre ET sur fond
clair : aucun lisere dans un sens ni dans l'autre.

**Conversion en WebP.** Les originaux pesaient de 1,3 a 2,4 Mo piece, soit
~23 Mo pour le jeu complet — injouable sur telephone. Les symboles sont ramenes
a 256 px (une case fait 90 px a l'ecran, donc large pour un ecran retine) et le
tout tient en **578 Ko**. L'alpha est preserve, verifie coin par coin apres
conversion.

## Le lot

| fichier | role | rang |
|---|---|---|
| `banane` | fruit | 1 (le plus faible) |
| `raisin` | fruit | 2 |
| `pasteque` | fruit | 3 |
| `prune` | fruit | 4 |
| `pomme` | fruit | 5 |
| `bonbon_bleu` | bonbon | 6 |
| `bonbon_vert` | bonbon | 7 |
| `bonbon_violet` | bonbon | 8 |
| `coeur` | bonbon | 9 (le plus fort) |
| `sucette` | **scatter** | — |
| `bombe` | multiplicateur | — |
| `fond` | decor | — |
| `cadre` | cadre de grille | — |
| `logo` | titre | — |

## Deux remarques d'usage

- **La bombe n'a pas de chiffre**, c'est voulu : le nombre se pose en CSS sur
  la plaque doree. Un generateur d'images ecrit mal les chiffres, et il en
  aurait fallu une par multiplicateur.
- **Le raisin et la prune sont les deux plus proches a l'oeil** — deux violets
  a la meme place dans l'echelle. Ils restent distinguables (le raisin montre
  ses grains, la prune est lisse), mais c'est la paire a surveiller si des
  joueurs se plaignent de mal lire la grille.
