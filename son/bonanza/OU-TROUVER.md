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

## Les paquets tout faits, gratuits

Une premiere version de ce document mettait en avant une bibliotheque a
**300 euros**. C'etait une mauvaise reponse a la question posee : il existe
du gratuit, professionnel, et utilisable commercialement.

### Le meilleur : le paquet GDC de Sonniss

`gdc.sonniss.com` — **7,5 Go de bruitages professionnels, gratuits**,
offerts chaque annee a la GDC par une vingtaine d'editeurs (Boom Library,
Krotos, Sound Particles et d'autres). Licence lue, pas supposee :

> « Licensee may use and modify the licensed sound effects for personal and
> commercial projects **without attribution** to the original creator. »

Les jeux y sont **nommement autorises**. Deux interdictions, aucune ne nous
gene : on ne peut pas **revendre les sons tels quels** (les livrer dans un
jeu fini est explicitement permis), et on ne peut pas s'en servir pour
**entrainer une intelligence artificielle**.

Le defaut : c'est un fourre-tout de 7,5 Go, pas un paquet de casino. Il faut
fouiller. Les annees precedentes sont archivees sur la meme page — il y en a
environ 160 Go en tout.

### Le plus direct : Casinowave, sur itch.io

`azakaela.itch.io/casinowave-sounds` — **gratuit** (« name your own price »),
et c'est exactement le rayon : chutes de pieces, rouleaux de machine a sous,
jackpot, bonus, sons d'arcade gagnants.

**MAIS SA LICENCE N'EST ECRITE NULLE PART** sur la page. Je l'ai cherchee,
elle n'y est pas. Sur un site qui prend de l'argent reel, « c'etait gratuit
sur itch » n'est pas une licence : ecris a l'auteur avant d'en poser un seul
fichier. C'est deux minutes, et ca evite le seul genre d'ennui qui ne se
repare pas.

### Le pas cher qui vise juste : Gravity Sound

`gravity-sound.itch.io/casino-slot-machine-sfx` — **170 bruitages de machine
a sous pour ~10 $** : gains, pertes, rotations, leviers, chutes de pieces,
bips. Ce n'est pas gratuit, mais ce n'est pas 300 euros non plus, et c'est
le seul lot de cette liste qui couvre les huit besoins d'un coup, deja
accorde entre eux.

### Les banques a l'unite

| source | licence | commercial | attribution |
|---|---|---|---|
| `pixabay.com/sound-effects` | Pixabay License | oui | non |
| `freesound.org` (**filtre CC0**) | CC0 | oui | non |
| `opengameart.org` | melange | selon | selon |

Deux choses a savoir sur Pixabay, ecrites nulle part en gros : la licence ne
donne **aucune garantie** — si un fichier depose la etait en fait sous
droits, c'est pour la pomme de celui qui l'a utilise — et elle interdit de
redistribuer les sons **tels quels**, ce qui ne nous gene pas puisqu'ils
partent noyes dans un jeu.

Mixkit est ecarte de la liste : la page de licence ne sert pas son texte, je
n'ai donc pas pu lire ce qu'elle autorise. Ecrire « libre » sans l'avoir lu
serait exactement l'erreur que ce document existe pour eviter.

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
