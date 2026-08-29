# SWOGE BONANZA — prompts de l'habillage

Un bloc de style a coller devant chaque prompt, puis un prompt par element.
**Le mot est ECRIT DANS L'IMAGE** — c'est ce qui a ete demande, et c'est ce
qui donne un vrai bouton de machine plutot qu'une pastille vide.

Consequence assumee : un bouton qui porte son mot ne peut plus en changer.
Le bouton SPIN doit aussi dire STOP pendant un tour — il y a donc deux
prompts, un par mot, a generer dans la MEME session pour qu'ils soient
identiques a la lettre pres.

Les generateurs ecrivent mal. Si le mot sort tordu, relance : c'est plus
rapide que de corriger a la main, et ca finit toujours par tomber juste.

---

## LE BLOC DE STYLE — devant chaque prompt

```
STYLE: mobile casino game UI, glossy candy finish, thick soft bevel, polished
gold metal rim, bright specular sweep across the top, warm palette (honey gold
#FFC53D, deep amber #A67A1E, cream #FFF3CF), crisp edges, front view, flat on
to camera, no perspective, no ground shadow, centered, isolated on fully
transparent background, PNG with alpha
NEGATIVE: misspelled text, extra letters, watermark, ground shadow, background
scenery, photo, blurry, dull colors, multiple objects, cropped edges
```

---

## 1. SPIN — `img/bonanza/ui/spin.webp` — 512x512

```
A large round casino spin button, thick polished gold ring, glossy honey-gold
face, the word "SPIN" written across the centre in bold rounded uppercase
letters, cream white with a dark amber outline and a soft inner shadow, letters
perfectly centered and evenly spaced, tiny candy sparkles in the rim, viewed
face on, isolated on transparent background
```

## 2. STOP — `img/bonanza/ui/spin_stop.webp` — 512x512

*Meme session, juste apres le premier.*

```
The same large round casino spin button, identical gold ring and glossy face,
but the word "STOP" written across the centre in bold rounded uppercase
letters, cream white with a dark amber outline, letters perfectly centered,
viewed face on, isolated on transparent background
```

## 3. MOINS — `img/bonanza/ui/moins.webp` — 256x256

```
A small round casino UI button, polished gold rim, glossy cream-to-amber face,
a thick bold minus sign "-" centered on it, dark amber colour with a soft
bevel, viewed face on, isolated on transparent background
```

## 4. PLUS — `img/bonanza/ui/plus.webp` — 256x256

```
A small round casino UI button, polished gold rim, glossy cream-to-amber face,
a thick bold plus sign "+" centered on it, dark amber colour with a soft bevel,
viewed face on, isolated on transparent background
```

## 5. MAX — `img/bonanza/ui/max.webp` — 512x192

```
A small horizontal pill-shaped casino button, rounded capsule form, polished
gold outline, glossy cream face, the word "MAX" written across the centre in
bold uppercase letters, dark amber with a soft bevel, viewed face on, isolated
on transparent background
```

## 6. PAYTABLE — `img/bonanza/ui/paytable.webp` — 640x192

```
A horizontal pill-shaped casino button, rounded capsule form, polished gold
outline, glossy cream face, the word "PAYTABLE" written across the centre in
bold uppercase letters, dark amber with a soft bevel, viewed face on, isolated
on transparent background
```

## 7. HISTORY — `img/bonanza/ui/history.webp` — 640x192

```
A horizontal pill-shaped casino button, rounded capsule form, polished gold
outline, glossy cream face, the word "HISTORY" written across the centre in
bold uppercase letters, dark amber with a soft bevel, viewed face on, isolated
on transparent background
```

---

## LES BANDEAUX DE GAIN

Quatre paliers, MESURES sur 400 000 tours du vrai moteur :

| bandeau | a partir de | ca tombe |
|---|---|---|
| NICE WIN | 2x la mise | 1 tour sur 13 |
| BIG WIN | 10x | 1 tour sur 219 |
| MEGA WIN | 50x | 1 tour sur 418 |
| EPIC WIN | 250x | 1 tour sur 3 279 |

51 % des tours ne paient rien ; le plus gros vu sur ces 400 000 fait 877x.
Un « BIG WIN » qui sortirait un tour sur cinq ne serait plus un evenement.

## 8. NICE WIN — `img/bonanza/ui/win_nice.webp` — 1024x512

```
An ornate horizontal casino win banner, thick polished gold scrollwork frame
with swirled lollipops and glossy gumdrops in the corners, deep purple glossy
inner panel, the words "NICE WIN" written large across the centre in bold
rounded uppercase letters, cream gold with a dark outline and a soft glow,
letters centered and evenly spaced, symmetrical, viewed face on, isolated on
transparent background
```

## 9. BIG WIN — `img/bonanza/ui/win_big.webp` — 1024x512

```
An ornate horizontal casino win banner, thick polished gold scrollwork frame
with swirled lollipops and glossy gumdrops bursting from the corners, deep
magenta glossy inner panel, the words "BIG WIN" written large across the centre
in bold rounded uppercase letters, bright gold with a dark outline and a strong
warm glow, symmetrical, viewed face on, isolated on transparent background
```

## 10. MEGA WIN — `img/bonanza/ui/win_mega.webp` — 1024x512

```
An ornate horizontal casino win banner, heavy polished gold scrollwork frame
crowded with oversized lollipops, candies and sugar sparkles, deep violet
glossy inner panel, the words "MEGA WIN" written very large across the centre
in bold rounded uppercase letters, radiant gold with a dark outline and light
rays behind, symmetrical, viewed face on, isolated on transparent background
```

## 11. EPIC WIN — `img/bonanza/ui/win_epic.webp` — 1024x512

```
A spectacular ornate casino win banner, massive polished gold scrollwork frame
overflowing with lollipops, candies, gemstones and sparkles, deep royal purple
glossy inner panel, the words "EPIC WIN" written enormous across the centre in
bold rounded uppercase letters, blazing gold with a dark outline, bursting
light rays and glitter behind, symmetrical, viewed face on, isolated on
transparent background
```

## 12. FREE SPINS — `img/bonanza/ui/free_spins.webp` — 1024x640

```
A tall ornate casino bonus panel, thick gold scrollwork frame crowded with
oversized swirled lollipops bursting out of the top corners, deep magenta to
violet glossy inner panel, the words "FREE SPINS" written large across the
centre in bold rounded uppercase letters, bright gold with a dark outline and a
warm glow pouring from behind, symmetrical, viewed face on, isolated on
transparent background
```

---

## Ou les poser

Tout dans **`img/bonanza/ui/`**, en WebP ou PNG avec transparence. Pas de
JPEG : il n'a pas de couche alpha, et un bouton sur fond blanc est
inutilisable.

Envoie-les et je branche. Les quatre paliers sont deja mesures, donc le code
des bandeaux peut s'ecrire avant que les images arrivent.
