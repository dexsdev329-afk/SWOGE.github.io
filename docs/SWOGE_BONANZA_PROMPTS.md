# SWOGE BONANZA — tous les prompts pour l'habillage

> Ce que j'ai fait pour ecrire ce document : extrait 34 images de ta video et
> regarde le jeu. Ce qui suit decrit ce que J'AI VU, pas ce que je crois savoir.

---

## 1. Ce que le jeu est, vu de la video

| | |
|---|---|
| Grille | **6 colonnes x 5 rangees** (30 cases) |
| Gain | **« pay anywhere »** : on compte les symboles IDENTIQUES n'importe ou sur la grille, il n'y a AUCUNE ligne de paiement. A partir de 8 exemplaires, ca paie. |
| Chute | **tumble** : les symboles gagnants disparaissent, ceux du dessus tombent, de nouveaux arrivent par le haut, et on recompte. Ca s'enchaine tant qu'il y a un gain. |
| Scatter | la **sucette** (lollipop). Elle paie ou qu'elle soit et declenche les tours gratuits. |
| Tours gratuits | des **bombes multiplicateurs** tombent (x2 a x100) et s'ajoutent au gain total du tour. |
| Affichage | mise en bas a gauche, credit et gain en bas au centre, « GAGNEZ PLUS DE 21 100x MISE » en banniere. |

**9 symboles payants + 1 scatter.** Du plus faible au plus fort :

1. Banane
2. Raisin
3. Pasteque
4. Prune
5. Pomme
6. Bonbon bleu (carre)
7. Bonbon vert (ovale)
8. Bonbon violet (carre)
9. Coeur rouge (le plus fort)
10. **Sucette** = scatter

Tu as demande « avec des fruits comme eux » : on garde donc exactement cette
famille — cinq fruits en bas, quatre bonbons en haut — et on la passe aux
couleurs SWOGE.

---

## 2. LE BLOC DE STYLE — a coller AVANT chaque prompt

C'est **le seul truc qui compte** pour que les dix symboles aillent ensemble.
Un symbole genere sans ce bloc ne ressemblera jamais aux autres, et ca se voit
immediatement sur une grille.

```
STYLE: glossy 3D casino slot symbol, mobile game art, thick soft rounded forms,
candy-gloss finish with a single bright specular highlight top-left, smooth
subsurface glow, saturated colors, clean dark outline, subtle warm rim light,
centered single object, front view, no perspective distortion, no shadow on the
ground, isolated on fully transparent background, square composition with even
padding, crisp edges, high detail, 512x512, PNG with alpha
NEGATIVE: text, letters, numbers, watermark, logo, drop shadow, ground plane,
background scenery, multiple objects, cropped edges, blurry, photorealistic,
dull colors, flat vector, gradient banding
```

> **Reglages :** meme modele, meme « seed » de depart si ton generateur le
> permet, et genere les dix a la suite dans la MEME session. Changer de session
> entre deux symboles est la premiere cause d'une grille qui jure.

---

## 3. Les dix symboles

Colle le bloc de style, puis la ligne ci-dessous.

### Les cinq fruits (symboles faibles)

**1. Banane**
```
SUBJECT: a single ripe banana, bright golden yellow (#FFC53D), gentle curve,
plump and glossy like a candy sculpture, small green stem tip
```

**2. Raisin**
```
SUBJECT: a small tight bunch of round purple grapes, deep violet with glossy
highlights, one tiny green leaf on top
```

**3. Pasteque**
```
SUBJECT: a single triangular watermelon slice, bright red flesh, black seeds,
thick green striped rind, glossy candy finish
```

**4. Prune**
```
SUBJECT: a single round plum, deep indigo purple with a soft blue bloom, one
small green leaf, glossy
```

**5. Pomme**
```
SUBJECT: a single round apple, vivid candy red, short brown stem, one glossy
green leaf, plump rounded shape
```

### Les quatre bonbons (symboles forts)

**6. Bonbon bleu**
```
SUBJECT: a rounded square jelly candy cube, translucent electric blue, sugar
crystals on the surface, glossy gel interior
```

**7. Bonbon vert**
```
SUBJECT: a smooth oval jelly bean candy, translucent lime green, glossy wet
surface, slightly elongated
```

**8. Bonbon violet**
```
SUBJECT: a rounded square jelly candy cube, translucent deep purple, sugar
crystals on the surface, rich glossy gel
```

**9. Coeur rouge (le plus fort)**
```
SUBJECT: a plump glossy heart-shaped candy, vivid red, thick rounded volume,
strong glass-like highlight, slight golden inner glow
```

### 10. Le scatter — c'est LUI qui doit etre SWOGE

Le scatter est le symbole qu'on cherche des yeux. C'est donc le seul endroit ou
la marque doit etre evidente.

```
SUBJECT: a big round swirl lollipop on a white stick, spiral of gold (#FFC53D)
and deep navy (#0B1220), a cute happy shiba inu dog face embossed in the center
of the spiral, thick glossy candy shell, magical golden sparkles around it
```

> **Variante sans chien**, si le visage rend mal a petite taille — c'est
> frequent sous 128px :
> ```
> SUBJECT: a big round swirl lollipop on a white stick, spiral of gold
> (#FFC53D) and deep navy (#0B1220), a bold paw print embossed in the center,
> thick glossy candy shell, golden sparkles
> ```

---

## 4. La bombe multiplicateur (tours gratuits)

Elle porte un CHIFFRE, et un generateur d'images ecrit tres mal les chiffres.
**Genere-la vide et ecris le nombre par-dessus en HTML/CSS.** C'est plus net,
et ca evite de generer vingt bombes.

```
SUBJECT: a round glossy candy bomb, deep navy (#0B1220) sphere with a golden
(#FFC53D) rim and a lit fuse with a small golden spark, smooth empty circular
gold plate on the front left blank for a number, cute chunky mobile-game style
NEGATIVE: text, letters, numbers, digits, symbols on the plate
```

---

## 5. Le decor

**Le fond**
```
Candy land landscape background for a slot game, soft pink and lavender cotton
candy clouds, distant hills of whipped cream and ice cream, giant lollipops and
candy canes planted in the ground, dreamy dusk sky with soft golden light,
sparkling bokeh, deep navy (#0B1220) at the top edge fading into pink, no
characters, no text, wide 16:9, soft focus so foreground symbols stay readable
NEGATIVE: text, watermark, people, characters, harsh contrast, busy details in
the center
```

> **Le fond doit etre FLOU au centre.** C'est la seule facon que les symboles
> restent lisibles par-dessus. Un fond net est joli tout seul et illisible en
> jeu.

**Le cadre de la grille**
```
Decorative rounded rectangle frame for a 6x5 slot grid, thick candy-stick
border in gold (#FFC53D) and white twisted stripes, glossy, small candy gems at
the corners, empty transparent center, front view, isolated on transparent
background, 1200x1000, PNG with alpha
NEGATIVE: text, content inside the frame, shadow, background
```

**Le logo**
```
Game logo reading "SWOGE BONANZA", thick playful 3D candy letters, gold
(#FFC53D) with white glossy highlights and a deep navy (#0B1220) outline,
melting candy drips, a small cute shiba inu head peeking over the top of the
letters, sparkles, isolated on transparent background, wide horizontal
NEGATIVE: extra words, spelling errors, background, shadow
```

> **Le texte du logo sera probablement mal orthographie** : les generateurs
> ratent les lettres une fois sur deux. Genere-en une dizaine et garde le bon,
> ou fais un logo SANS texte et ecris « SWOGE BONANZA » en CSS par-dessus.

---

## 6. Les boutons

```
SUBJECT: a large round SPIN button for a candy slot game, glossy gold
(#FFC53D) disc with a deep navy (#0B1220) circular arrow in the center, thick
white rim, soft inner glow, chunky mobile-game style
```

```
SUBJECT: a small square glossy candy UI button, deep navy (#0B1220) with a
gold (#FFC53D) rim, empty face left blank for an icon, chunky mobile-game style
NEGATIVE: text, letters, numbers, icons
```

---

## 7. Ce qu'il te faut au total

| fichier | quoi | taille |
|---|---|---|
| `banane, raisin, pasteque, prune, pomme` | 5 fruits | 512x512 PNG alpha |
| `bonbon_bleu, bonbon_vert, bonbon_violet, coeur` | 4 bonbons | 512x512 PNG alpha |
| `sucette` | scatter | 512x512 PNG alpha |
| `bombe` | multiplicateur, sans chiffre | 512x512 PNG alpha |
| `fond` | decor | 1920x1080 |
| `cadre` | cadre de grille | 1200x1000 PNG alpha |
| `logo` | titre | ~1200x400 PNG alpha |
| `bouton_spin`, `bouton_ui` | commandes | 256x256 PNG alpha |

**14 images.** Compte large : tu en generes trois ou quatre par symbole avant
d'en garder une qui va avec les autres.

---

## 8. Trois pieges qui coutent une journee

1. **Le fond transparent.** Si ton generateur ne sait pas faire d'alpha, genere
   sur un fond VERT UNI (`#00FF00`) et detoure ensuite. Un symbole avec un
   halo blanc sur une grille sombre se voit tout de suite.
2. **L'echelle.** Les dix symboles doivent occuper la MEME proportion de leur
   carre. Une banane qui touche les bords a cote d'une pomme minuscule donne
   une grille bancale. Demande « even padding » — c'est dans le bloc de style —
   et recadre a la fin si besoin.
3. **La lisibilite a 90px.** Une case de grille fait environ 90px sur
   telephone. **Regarde chaque symbole a cette taille avant de le garder.** Un
   symbole superbe en 512 peut etre une tache illisible en 90 : c'est le cas
   le plus frequent avec les details fins et les visages.

---

## 9. Et apres

Ces prompts ne font que l'habillage. Le jeu lui-meme — grille 6x5, comptage
« pay anywhere » a partir de 8, chute en cascade, scatters, tours gratuits,
multiplicateurs — reste a ecrire, avec un serveur qui tire les resultats et un
taux de retour choisi. Dis-le-moi quand tu veux qu'on s'y mette.
