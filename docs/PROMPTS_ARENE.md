# Prompts — The Storm Arena

Chaque bloc se copie TEL QUEL dans le générateur d'images. Ils sont écrits en
anglais parce que les modèles d'image y répondent mieux ; les notes autour sont
pour toi.

Trois règles qui reviennent dans tous les blocs, et pourquoi :

- **La grille d'abord, le sujet ensuite.** Le Storm Herald est sorti en portrait
  unique 1024×1536 parce que la description venait avant la consigne de grille :
  le modèle a dessiné ce qu'il a lu en premier. Toutes les consignes de format
  sont donc en tête de prompt, en majuscules.
- **Carré obligatoire pour un atlas.** Le jeu lit la case comme
  `largeur / 4`. Une planche 1536×1024 fait donc des cases de 384 de large et
  1024 de haut : les lignes 3 et 4 sont lues hors de l'image. C'est ce qui a
  rendu la planche du sorcier inutilisable.
- **Pas de jambes.** Choix assumé pour tout le bestiaire de l'arène : un corps
  qui flotte n'a pas de cycle de marche à faire tenir en 4 images, donc pas de
  démarche cassée. C'est ce qui fait « plus pro ».

---

## 1 — MONSTRE : atlas 4×4 (gabarit)

Remplace `[[CREATURE]]` par la description, garde tout le reste mot pour mot.

```
A 4x4 SPRITE SHEET GRID. SQUARE 1:1 IMAGE, 1024x1024.
16 cells, exactly 4 columns and 4 rows, each cell exactly 256x256 pixels.
This is NOT a portrait, NOT a single illustration, NOT a character sheet with
poses of different sizes. It is a game sprite atlas: the same creature drawn
16 times, once per cell, always the same size, always centered in its cell.

ROW 1 (top): the creature seen from BEHIND, back turned to the viewer.
ROW 2: the creature seen from the FRONT, facing the viewer.
ROW 3: the creature seen from its LEFT side, in full profile facing left.
ROW 4 (bottom): the creature seen from its RIGHT side, in full profile facing right.
The 4 cells within a row are 4 frames of one short looping idle animation:
the body bobbing up and down, cloth and energy trailing. Frame to frame the
change is SMALL. The creature never turns: the direction is fixed per row.

THE CREATURE: [[CREATURE]]
It has NO LEGS and NO FEET. Its body ends in torn floating drapery, trailing
smoke and hanging chain, hovering above the ground.

STYLE: 2D game sprite art, painted, crisp readable silhouette, strong rim
light, high contrast, clean edges, no blur.
BACKGROUND: fully TRANSPARENT. No ground, no shadow, no floor, no scenery.
NO grid lines, NO borders, NO frames around cells, NO text, NO numbers,
NO watermark, NO signature. Nothing between the cells but transparency.
```

### 1a — `veilleur` (le gardien qui ouvre l'arène) — **manquant, il emprunte la planche du champion**

`[[CREATURE]]` =

```
a tall armored storm sentinel, obsidian and dark steel plate, a heavy horned
helm with a single burning blue-white slit for eyes, a wide ragged cloak of
storm cloud, arcs of blue lightning crawling across the shoulders and forearms,
one gauntlet holding a floating spike of raw plasma
```

### 1b — invoqué « éclat » (remplacerait `drone`, tire du plasma)

```
a small fast floating storm wisp, the size of a head, a core of white-blue
plasma held inside a cage of three broken metal rings that spin around it,
thin lightning threads whipping outward, no face
```

### 1c — invoqué « clou » (remplacerait `bobine`, paralyse)

```
a hovering iron obelisk covered in copper coils, a single unblinking amber eye
set in its face, thick static discharge crackling between the coils, heavy and
slow, tilting as it drifts
```

### 1d — invoqué « rafale » (remplacerait `cendreux`, court plus vite que le joueur)

```
a lean elongated storm hound made of compressed cloud and ember, no legs, its
lower body dissolving into a streak of ash and sparks, jaw open, eyes two white
arcs, the whole shape stretched forward as if already moving
```

---

## 2 — ÉQUIPEMENT : ligne de 4 (gabarit)

C'est le format qui a marché pour le lot violet. Un seul prompt, quatre objets
côte à côte, je découpe ensuite en quatre icônes 128×128.

```
A SINGLE HORIZONTAL ROW OF EXACTLY 4 GAME ITEM ICONS. 4:1 aspect ratio image.
Four separate objects, side by side, evenly spaced, each one centered in its
own quarter of the image. Equal size, equal lighting, equal style. They must
NOT touch and must NOT overlap — leave clear empty space between them.

FROM LEFT TO RIGHT:
1. [[OBJET 1]]
2. [[OBJET 2]]
3. [[OBJET 3]]
4. [[OBJET 4]]

STYLE: 2D painted game inventory icons, three-quarter view, thick readable
silhouette, strong rim light, glowing accents, high contrast.
BACKGROUND: fully TRANSPARENT. No ground, no shadow, no pedestal, no cards,
no panels, no slot frames behind the objects.
NO text, NO labels, NO numbers, NO borders, NO watermark.
```

### 2a — le lot de la manche 2 (déjà généré, découpé, en attente)

Les quatre icônes violettes sont découpées et rangées ; elles s'installent le
jour où la manche 2 existe.

### 2b — si tu veux refaire le lot de la manche 1 (bleu)

```
1. a pair of crossed curved daggers, dark steel blades veined with blue
   lightning, wrapped grips, arcs of electricity jumping between the two blades
2. a horned helm of black iron, a crown of jagged storm-glass shards, blue-white
   light pouring from the empty eye slits
3. a heavy chest plate of dark plate armor, a cracked rift across the chest
   glowing blue-white from inside, storm cloud leaking from the crack
4. a thick ring of braided black metal holding a floating blue-white spark in
   its opening, thin lightning arcs orbiting it
```

---

## 3 — LES TIRS : bande de 4 (et comment changer leur couleur)

Le jeu lit la bande à `96 px` par image et fait défiler les 4 sur la durée de
vie du projectile. Demande donc 4 carrés en ligne (4:1) — je redimensionne.

**Une famille de tir = un effet, dans tout le jeu.** Un dessin apprend au joueur
ce qui arrive : deux projectiles identiques dont l'un ralentit et l'autre non,
et plus rien ne s'apprend. C'est vérifié par un essai. Donc une nouvelle
couleur veut dire un nouveau NOM de famille, pas un remplacement de `plasma`.

```
A SINGLE HORIZONTAL ROW OF EXACTLY 4 SQUARE FRAMES. 4:1 aspect ratio image.
This is a projectile animation strip for a 2D game, read left to right.
The 4 frames are the SAME projectile at 4 moments of its flight, always
centered in its frame, always the same size.

FRAME 1: the bolt forming, tight and bright.
FRAME 2: the bolt at full power, longest trail.
FRAME 3: the bolt starting to fray at the edges.
FRAME 4: the bolt breaking apart into sparks.

THE PROJECTILE: [[COULEUR]] bolt of lightning, a hard bright core with a
tapering trail behind it, thin forked arcs branching off the core, pointing
to the RIGHT (direction of travel).

STYLE: 2D game VFX, glowing, high contrast, crisp edges, no blur.
BACKGROUND: fully TRANSPARENT. No ground, no scenery, no glow spill onto a
background — the glow belongs to the bolt only.
NO grid lines, NO borders, NO frames, NO text, NO watermark.
```

`[[COULEUR]]` — le seul mot à changer pour repeindre les tirs :

| Ce que tu veux | À écrire |
|---|---|
| bleu électrique (celui du champion aujourd'hui) | `white-hot blue-white` |
| violet (pour la manche 2) | `deep violet and magenta` |
| vert acide | `acid green` |
| or / foudre solaire | `molten gold and white` |
| rouge / braise | `ember red and orange` |
| noir / vide | `black and deep purple with a white core` |

---

## 4 — LE CERCLE AU SOL : annonce + onde

Deux bandes de 4 images carrées, comme les tirs (4:1). Le jeu en a déjà une
paire pour les donjons (`annonce_donjon` / `onde_donjon`) ; celles-ci seraient
la paire de l'arène.

**L'annonce** — ce qui s'ouvre AVANT que ça frappe :

```
A SINGLE HORIZONTAL ROW OF EXACTLY 4 SQUARE FRAMES. 4:1 aspect ratio image.
A ground-marker animation for a 2D top-down game, read left to right: a circle
drawn flat on the floor, seen from directly above, filling its frame.

FRAME 1: a thin faint ring, barely there.
FRAME 2: the ring brighter, a second inner ring appearing.
FRAME 3: both rings bright, crackling arcs crossing the inside of the circle.
FRAME 4: the circle at full intensity, packed with lightning, about to burst.

THE CIRCLE: blue-white storm energy, an outer ring of hard light, jagged
lightning arcs inside it, the centre darker than the edge so the ring reads
first.
STYLE: 2D game VFX seen flat from above, glowing, high contrast, crisp edges.
BACKGROUND: fully TRANSPARENT inside and outside the circle. No floor, no
tiles, no scenery.
NO grid lines, NO borders, NO text, NO watermark.
```

**L'onde** — ce qui reste APRÈS le coup :

```
A SINGLE HORIZONTAL ROW OF EXACTLY 4 SQUARE FRAMES. 4:1 aspect ratio image.
A ground shockwave animation for a 2D top-down game, read left to right: a
ring seen from directly above, expanding outward.

FRAME 1: a small tight blinding ring at the centre.
FRAME 2: the ring wider, thinner, trailing sparks.
FRAME 3: wider still, breaking into arcs.
FRAME 4: a faint wide ring almost gone, a few sparks left.

THE RING: blue-white lightning, hard bright edge, nothing filling the middle.
STYLE: 2D game VFX seen flat from above, glowing, high contrast, crisp edges.
BACKGROUND: fully TRANSPARENT. No floor, no tiles, no scenery.
NO grid lines, NO borders, NO text, NO watermark.
```

---

## 5 — CE QUI TOMBE DU CIEL (la pluie de la phase 4)

**Défaut réel à corriger** : quand le champion fait tomber sa pluie de cercles,
le jeu dessine la MÉTÉORITE DE FEU du Sanctuaire — une pierre en flammes au
milieu d'un boss de foudre. Le serveur pose un drapeau `meteore: 1` qui ne dit
pas LAQUELLE. Le jour où cette image existe, je fais porter au drapeau le nom
du dessin, et chaque boss fait tomber la sienne.

Portrait, pas carré : la planche existante fait 298×597 (la pierre en bas, la
traînée au-dessus). Le jeu lit le rapport sur l'image elle-même.

```
A SINGLE VERTICAL IMAGE, PORTRAIT, about 1:2 ratio (twice as tall as wide).
ONE object only, no grid, no frames, no animation strip.

A spear of lightning falling straight down: a hard blue-white bolt head at the
very BOTTOM of the image, and above it a long tapering trail of storm cloud,
sparks and forked arcs rising to the TOP of the image. The bolt head is the
heaviest, brightest part. The trail thins and fades toward the top.

The object must touch the very bottom edge of the image — the bolt head is
what hits the ground.

STYLE: 2D game VFX, painted, glowing, high contrast, crisp edges.
BACKGROUND: fully TRANSPARENT. No ground, no impact circle, no scenery.
NO text, NO borders, NO watermark.
```
