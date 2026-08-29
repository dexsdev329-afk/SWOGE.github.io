# SWOGE BONANZA — les prompts de l'HABILLAGE (boutons et bandeaux de gain)

Le premier document (`SWOGE_BONANZA_PROMPTS.md`) couvrait les dix symboles.
Celui-ci couvre le reste : les boutons, et les bandeaux « BIG WIN » qui
manquent pour que ca ressemble a un vrai jeu.

Tout ce qui suit est **dessine aujourd'hui en CSS**. Ca tient, mais ca ne
trompe personne a cote d'un Pragmatic : leurs boutons sont des IMAGES, avec
du volume, du metal, des reflets. C'est la difference qui reste.

---

## 0. LE BLOC DE STYLE — a coller AVANT chaque prompt

Le meme role que le bloc de style des symboles : sans lui, deux boutons
generes a la suite n'appartiennent pas au meme jeu. Il differe de celui des
symboles — un bouton est vu **de face**, un symbole a du volume.

```
STYLE: mobile casino game UI element, glossy candy-gloss finish, thick soft
bevel, polished gold metal rim with warm highlights, single bright specular
sweep across the top, saturated warm palette (honey gold #FFC53D, deep amber
#A67A1E, cream #FFF3CF), soft inner glow, clean crisp edges, front view, flat
on to camera, no perspective, no ground shadow, centered, isolated on fully
transparent background, even padding, high detail, PNG with alpha
NEGATIVE: text, letters, numbers, watermark, logo, drop shadow on ground,
background scenery, photo, realistic hand, blurry, flat vector, dull colors,
gradient banding, multiple objects, cropped edges
```

> **Reglages** : meme modele, meme session, meme graine pour TOUS les
> boutons a la suite. Le bandeau et le bouton peuvent etre faits en deux
> sessions ; deux boutons de la meme rangee, non.

> **Le texte, JAMAIS dans l'image.** Les generateurs ecrivent mal, et un
> bouton dont le mot est peint dedans ne peut plus etre traduit ni corrige.
> Le mot est pose par la page, par-dessus. C'est pour ca que « NEGATIVE »
> commence par `text, letters, numbers`.

---

## 1. LES BOUTONS

### 1.1 — SPIN (celui qui compte)

`img/bonanza/ui/spin.webp` — **512 x 512**, fond transparent, rond.

```
A large round casino spin button, thick polished gold ring with a beveled
outer edge and a softer inner ring, glossy honey-gold face with a bright
specular sweep across the upper third, subtle radial gradient from cream
centre to deep amber edge, tiny candy sparkles embedded in the rim, empty
smooth centre with nothing written on it, viewed perfectly face on, isolated
on transparent background
```

**Pourquoi le centre vide** : le mot « SPIN » est ecrit par la page. Un
bouton livre avec son mot dedans ne peut plus etre traduit, ni passer en
« STOP » pendant un tour, ni en « SIGN IN » quand personne n'est connecte —
et il lui faut ces trois etats.

### 1.2 — SPIN enfonce

`img/bonanza/ui/spin_bas.webp` — **512 x 512**, meme cadrage EXACTEMENT.

```
The same round gold casino spin button, pressed down state: the face sits
lower inside the ring, the specular sweep is dimmer and shifted down, the
inner shadow at the top edge is deeper, the outer bevel is thinner, viewed
perfectly face on, isolated on transparent background
```

**Meme cadrage exact** : si le bouton enfonce n'occupe pas les memes pixels,
il sautera au clic au lieu de s'enfoncer. Genere-le dans la MEME session,
juste apres le premier.

*(Facultatif : la page sait deja simuler l'enfoncement en CSS. A ne faire
que si le rendu ne te plait pas.)*

### 1.3 — MOINS et PLUS

`img/bonanza/ui/moins.webp` et `img/bonanza/ui/plus.webp` — **256 x 256**.

```
A small round casino UI button, polished gold rim, glossy cream-to-amber
face, bright specular highlight top-left, smooth empty centre with no symbol
on it, viewed face on, isolated on transparent background
```

**Un seul dessin pour les deux.** Le `-` et le `+` sont poses par la page :
deux images differentes ne se ressembleraient jamais assez, et l'oeil voit
tout de suite qu'un bouton de la paire n'est pas le frere de l'autre.

### 1.4 — La pastille MAX

`img/bonanza/ui/pastille.webp` — **512 x 192**, pilule horizontale.

```
A small horizontal pill-shaped casino UI plate, rounded capsule form,
polished gold outline, glossy cream face with a soft specular band across the
top, empty smooth centre with nothing written on it, viewed face on, isolated
on transparent background
```

Elle sert AUSSI a « PAYTABLE » et « HISTORY » : une seule image etiree,
trois boutons qui vont ensemble.

---

## 2. LES BANDEAUX DE GAIN — ce qui manque le plus

Aujourd'hui un gros gain fait trembler la grille et joue un son. Il n'y a
**aucun bandeau**. C'est la chose la plus visible qui separe ce jeu d'un jeu
professionnel : chez eux, un gros gain occupe l'ecran.

### Les quatre paliers, MESURES et non choisis a vue

Releve sur **400 000 tours** du vrai moteur :

| bandeau | a partir de | ca tombe |
|---|---|---|
| **NICE WIN** | 2x la mise | 1 tour sur 13 |
| **BIG WIN** | 10x | 1 tour sur 219 |
| **MEGA WIN** | 50x | 1 tour sur 418 |
| **EPIC WIN** | 250x | 1 tour sur 3 279 |

Pour situer : 51 % des tours ne paient rien, et le plus gros vu sur ces
400 000 tours est **877x**. Le plafond du jeu est a 21 100x.

Le decoupage compte. Un « BIG WIN » qui sort un tour sur cinq n'est plus un
evenement, c'est un tic — c'est exactement ce qui arrive quand on choisit
les seuils au jugement au lieu de regarder la distribution.

### 2.1 — Le cadre commun

`img/bonanza/ui/bandeau.webp` — **1024 x 512**, fond transparent.

```
An ornate horizontal casino win banner frame, thick polished gold scrollwork
border with candy details — swirled lollipops, glossy gumdrops and sugar
sparkles tucked into the corners, deep glossy purple-magenta inner panel with
a soft radial glow from the centre, empty inner area with nothing written in
it, symmetrical, viewed face on, isolated on transparent background
```

**Un seul cadre pour les quatre paliers.** Le mot change, la couleur de fond
change par-dessus en CSS, le cadre ne change pas — c'est ce qui fait qu'un
MEGA WIN se lit comme le grand frere d'un BIG WIN, et pas comme un autre
jeu.

### 2.2 — Le rayonnement derriere

`img/bonanza/ui/rayons.webp` — **1024 x 1024**.

```
A radial burst of soft light rays emanating from the centre, warm golden
white, alternating wide and narrow beams, soft edges fading to fully
transparent at the outer rim, no object in the centre, isolated on
transparent background
```

Il tourne lentement derriere le bandeau. C'est lui qui fait « ca bouge »
plutot que « une image est apparue » — et il ne coute qu'une rotation CSS.

### 2.3 — Les pieces qui tombent

`img/bonanza/ui/pluie.webp` — **512 x 512**, une planche de 12 a 16 pieces.

```
A scattered sheet of individual casino coins and candy pieces, each fully
separate with clear space around it, glossy gold coins seen at different
angles, small wrapped candies and gumdrops mixed in, arranged in a loose grid
on a fully transparent background, no overlap between pieces, no shadow
```

**Bien separees** : la page les decoupe une par une pour les faire tomber.
Si elles se touchent, il faut les redecouper a la main.

---

## 3. LE MOMENT DES TOURS GRATUITS

C'est le moment fort du jeu — quatre sucettes, dix tours gratuits — et il
n'arrive qu'un tour sur 209 (mesure). Il merite son propre ecran.

`img/bonanza/ui/tours_gratuits.webp` — **1024 x 640**.

```
A tall ornate casino bonus announcement panel, thick gold scrollwork frame
crowded with oversized swirled lollipops and glossy candies bursting out of
the top corners, deep magenta-to-violet glossy inner panel, warm light glow
pouring from the centre, empty inner area with nothing written in it,
symmetrical, viewed face on, isolated on transparent background
```

Plus charge que le bandeau de gain, et volontairement : c'est le seul ecran
du jeu qu'un joueur veut revoir.

---

## 4. OU LES POSER, ET CE QUI RESTE A BRANCHER

Tout va dans **`img/bonanza/ui/`**.

| fichier | etat |
|---|---|
| `spin.webp`, `spin_bas.webp` | la page dessine le bouton en CSS — une regle a remplacer |
| `moins.webp`, `plus.webp` | idem |
| `pastille.webp` | idem, sert a MAX / PAYTABLE / HISTORY |
| `bandeau.webp`, `rayons.webp`, `pluie.webp` | **rien n'existe encore** — les quatre paliers sont a coder |
| `tours_gratuits.webp` | un voile de texte existe ; il attend son cadre |

Envoie-les et je branche. Les paliers ci-dessus sont deja mesures, donc le
code peut etre ecrit avant que les images arrivent — il affichera du texte en
attendant, au bon moment et a la bonne frequence.

**Format** : WebP avec couche alpha, ou PNG (je convertirai). Pas de JPEG —
il n'a pas de transparence, et un bouton sur fond blanc est inutilisable.
