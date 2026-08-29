# Ou trouver les huit sons qui manquent

Les huit bruitages du dossier `provisoire/` sont des CC0 de Kenney. Ils
tiennent la place, ils ne tiennent pas le style : le catalogue de Kenney est
du retro et de l'interface neutre, la ou ce jeu est sucre et ample.

## D'abord : le piege GitHub

Chercher « candy crush clone » sur GitHub trouve des depots, et la plupart
sont **inutilisables ici**. Un clone amateur embarque presque toujours les
sons ET les dessins EXTRAITS DU VRAI JEU. Le depot est public, la licence
dit MIT, et rien de tout ca ne rend les fichiers libres : la licence ne
couvre que ce que l'auteur possede, et il ne possede pas les sons de King.
Sur un site qui prend de l'argent reel, c'est le genre d'emprunt qui se
remarque.

La seule piste GitHub propre trouvee : **KenneyNL/Starter-Kit-Match-3**,
CC0 — mais c'est le meme Kenney, donc le meme style que ce qui est deja
dans `provisoire/`. Ca ne resout rien.

## Les sources vraiment libres

| source | licence | commercial | attribution | remarque |
|---|---|---|---|---|
| **pixabay.com/sound-effects** | Pixabay License | oui | non | le plus simple ; interdit de les REVENDRE tels quels |
| **freesound.org** (filtre CC0) | CC0 au choix | oui | non | le plus propre juridiquement ; qualite tres inegale, il faut ecouter |
| **opengameart.org** | melange CC0 / CC-BY / GPL | selon | selon | **verifier fichier par fichier**, la licence change d'un depot a l'autre |
| **kenney.nl** | CC0 | oui | non | deja essaye : mauvais style |
| **mixkit.co** | « Sound Effects Free License » | ? | ? | **JE N'AI PAS PU LIRE LA LICENCE** — le texte n'est pas servi a la page. A lire avant d'en prendre un seul fichier |

Deux choses a savoir sur Pixabay, parce qu'elles ne sont ecrites nulle part
en gros : la licence ne donne **aucune garantie** — si un fichier depose la
etait en fait sous droits, c'est pour la pomme de celui qui l'a utilise —
et elle interdit de redistribuer les sons **tels quels**, ce qui n'est pas
notre cas ici puisqu'ils partent noyes dans un jeu.

## Si tu veux le vrai son, il se paie

`asoundeffect.com` vend une bibliotheque de **215 bruitages de machines a
sous**, enregistres sur de vraies machines. C'est exactement le style
cherche. Ce n'est pas gratuit, et je le mets ici parce qu'un lot coherent
achete une fois coute moins de temps que huit fichiers gratuits ramasses un
par un et jamais tout a fait accordes.

## Ce qu'il faut, son par son

Les huit, avec les mots a taper dans le moteur de recherche du site. Le plus
important est le troisieme : il se rejoue a CHAQUE etage de cascade, donc a
dix reprises sur un bon tour. Court et discret, sinon il devient penible au
bout de dix tours.

| fichier | quand | a chercher |
|---|---|---|
| `spin_debut.mp3` | on lance le tour | `slot machine spin start`, `reel start` |
| `symbole_pose.mp3` | une colonne se pose | `reel stop`, `click soft`, `thud light` |
| `gain.mp3` | **un amas paie — le plus joue** | `candy pop`, `bubble pop sweet`, `chime short` |
| `cascade.mp3` | les symboles retombent | `sparkle short`, `magic tinkle`, `whoosh soft` |
| `scatter.mp3` | une sucette tombe | `magic chime`, `bell rising`, `harp glissando` |
| `tours_gratuits.mp3` | les tours gratuits s'ouvrent | `fanfare win`, `jackpot fanfare`, `celebration short` |
| `bombe.mp3` | une bombe multiplicateur | `explosion cartoon`, `pop boom` |
| `gros_gain.mp3` | vingt fois la mise ou plus | `big win`, `jackpot`, `coins falling` |

## Avant de les poser dans le dossier

**Ne regle le niveau d'aucun son tout seul.** Chacun normalise dans son coin
donne un lot desequilibre qu'il faut refaire en entier. On equilibre quand
les huit sont la, en une fois, sur l'ensemble.

Et une chose qui surprend, deja mesuree sur `spin_rien.mp3` : **l'encodage
MP3 remonte la crete d'environ 3,4 dB**. Normaliser a -1 dB avant encodage
donne un fichier qui SATURE. Viser plus bas, et verifier APRES encodage.
