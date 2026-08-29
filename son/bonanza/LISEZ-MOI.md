# Sons de SWOGE BONANZA

## Les huit bruitages sont SYNTHETISES, et voici pourquoi

Ils venaient d'un montage envoye par le proprietaire du jeu : neuf pistes,
decoupees sur les silences et attribuees a un creneau chacune selon leur
profil mesure. Ca tenait debout sur le papier et ca ne tenait pas a
l'oreille — « les sons, c'est le seul truc qui ne donne pas envie de
jouer ». La raison est simple et ne se voyait dans aucune mesure prise une
piste a la fois : **chaque son etait dans sa propre tonalite**. Superposes —
et ils se superposent tout le temps, une colonne se pose pendant qu'un amas
paie — ils frottaient.

Les huit sont donc reecrits par `synth.py`, dans **une seule gamme** : do
majeur pentatonique (do re mi sol la), la meme que la montee des cascades du
bus audio. Une gamme sans demi-ton n'a aucun intervalle qui frotte : deux
sons quelconques du lot, joues ensemble, sonnent juste. C'est ca l'harmonie
ici — pas un effet, une contrainte d'ecriture.

Le timbre est de la meme famille partout : attaque instantanee, decroissance
exponentielle, partiels de bois ou de metal inharmonique (un glockenspiel,
pas une sinusoide). Ca supporte la transposition, ce qui compte parce que le
bus monte `pose`, `gain` et `cascade` jusqu'a une octave.

`synth.py` et `synth_rien.py` sont dans ce dossier : les sons se
regenerent a l'identique, et se modifient en changeant une note plutot qu'en
cherchant un autre fichier.

| fichier | quand | duree |
|---|---|---|
| `spin_debut.mp3` | a chaque SPIN | 0,34 s |
| `symbole_pose.mp3` | une colonne se pose (**6x par tour**) | 0,15 s |
| `gain.mp3` | un amas paie | 0,42 s |
| `cascade.mp3` | les etages suivants | 0,32 s |
| `scatter.mp3` | une sucette tombe / l'attente | 0,80 s |
| `tours_gratuits.mp3` | le bonus s'ouvre (1 tour sur 201) | 1,92 s |
| `bombe.mp3` | une bombe multiplicateur | 0,85 s |
| `gros_gain.mp3` | 20x la mise et plus | 1,90 s |
| `spin_rien.mp3` | fin d'un tour **sans aucune combinaison** | 0,50 s |
| `musique.ogg` | fond sonore, en boucle — **a utiliser en premier** | 2 min 16 |
| `musique.mp3` | le meme, en secours pour les navigateurs sans Vorbis | 2 min 16 |

Ce que la mesure dit du changement : les nouveaux sont **5 a 20 fois plus
tonaux** (planitude spectrale 0,005 contre 0,03 a 0,12) et bien moins
agressifs (centroide autour de 1 100 Hz contre 1 265 a 6 978 Hz). L'ancien
`gain` portait l'essentiel de son energie au-dessus de 5 kHz — le « tsss »
qui fatigue au bout de dix tours.

Ce qu'elle ne dit pas : si c'est agreable. `ecouter.html` met les paires
avant/apres cote a cote pour que quelqu'un tranche a l'oreille.

## Ce qui dort a cote

- `echantillons/` — le lot precedent, tire du montage envoye. Garde pour
  comparer, plus joue par la page.
- `provisoire/` — les bouche-trous Kenney CC0 d'avant lui.
- `lot/` — les neuf pistes du montage d'origine, **jamais ecoutees**. La
  piste 2 est une VOIX qui dit « welcome » : elle a passe toutes mes mesures
  et s'est jouee six fois par tour en production. Voir `ecouter.html` et le
  controle positif de `sons_bonanza.test.js`.
- `variantes/` — trois candidats pour le son du tour perdu (`rien.html`).

## Ce qui a ete fait a la musique d'origine, et ce qui ne l'a PAS ete

**Passe en mono.** Les deux canaux etaient rigoureusement identiques — meme
crete, meme RMS au centieme de decibel pres. C'etait donc du faux stereo :
passer en mono ne perd rien et divise le poids. 18,2 Ko -> 9,8 Ko.

**Queue de silence coupee** (0,10 s a la fin). Il n'y a PAS de silence en tete,
verifie : le son demarre immediatement, donc aucun retard percu entre la fin du
tour et le bruitage. C'est ce qui compte pour un son d'interface.

**Le niveau n'a PAS ete touche**, deliberement. Crete a -3,5 dB, moyenne a
-15,0 dB.

> Regler le niveau d'un son SEUL, avant que les autres existent, garantit un
> lot desequilibre : chacun serait normalise dans son coin et il faudrait tout
> refaire ensemble. L'equilibrage se fait quand le lot est complet, en une
> fois, sur l'ensemble.
>
> A noter au passage, parce que ca surprend : **l'encodage MP3 remonte la crete
> d'environ 3,4 dB** sur ce fichier (-6,6 dB en WAV, -3,2 dB une fois encode
> sans le moindre gain). Normaliser a -1 dB avant encodage donne donc un
> fichier qui SATURE. Il faut viser plus bas et verifier APRES encodage.

## La musique de fond : deux defauts corriges, un a savoir

**Un trou de 4,1 secondes a chaque tour de boucle.** L'original portait 0,40 s
de silence en tete et **3,74 s en fin**. Joue en boucle, la musique s'arretait
donc pendant quatre secondes toutes les deux minutes vingt, puis repartait. Les
deux bords ont ete coupes au seuil de -45 dB.

**3,4 Mo pour un fond sonore**, sur un jeu qu'on ouvre au telephone. Reencode
en 128 kb/s — largement suffisant pour une musique de fond qui sera de toute
facon jouee bas sous les bruitages — il tient en **2,1 Mo**.

**ET POURQUOI IL Y A UN `.ogg` A COTE DU `.mp3`.** Le format MP3 ne sait pas
boucler sans trou : l'encodeur inscrit un remplissage dans le fichier, et ce
silence revient a CHAQUE tour de boucle. Mesure sur ce morceau meme :

    audio reel     2:16,54
    musique.ogg    2:16,54     <- identique
    musique.mp3    2:16,59     <- 50 ms de plus, ajoutees par l'encodeur

Cinquante millisecondes de blanc toutes les deux minutes, c'est audible et ca
s'entend comme un hoquet. **Charge le `.ogg` en premier**, et garde le `.mp3`
en secours pour les rares navigateurs sans Vorbis :

```html
<audio id="fond" loop>
  <source src="son/bonanza/musique.ogg" type="audio/ogg">
  <source src="son/bonanza/musique.mp3" type="audio/mpeg">
</audio>
```

Pour une boucle vraiment sans couture, meme en `.ogg`, le plus sur reste
l'API Web Audio : on charge le morceau dans un buffer et on le rejoue avec
`loop = true`, ce qui ne depend d'aucun conteneur.

**BRANCHEE DEPUIS.** `swoge_bonanza.html` la joue en premiere piste, choisie
par `canPlayType('audio/ogg; codecs="vorbis"')` : `.ogg` quand le navigateur
sait le lire, `.mp3` sinon. Les deux pistes du site restent derriere, on peut
toujours en changer par le bouton du menu.

Elle etait restee sur l'etagere pendant deux commits : le fichier existait,
ce document expliquait comment le brancher, et la page continuait de jouer la
musique generique du site. Personne ne l'aurait vu dans un essai — il a fallu
qu'un joueur ecoute. `anim_bonanza.test.js` verifie desormais que la premiere
piste de `BGM` est bien celle du dossier, et qu'elle se telecharge.

**Ce que je ne peux pas verifier : le raccord musical.** Je n'ai aucun moyen
d'ECOUTER ces fichiers. Je sais que les silences sont partis et que la duree
tombe juste ; je ne sais pas si la derniere mesure enchaine bien sur la
premiere. Ca, il faut l'entendre — lance-la en boucle deux fois de suite.

**A noter aussi : l'original sature deja.** Crete a -0,11 dB sur un canal et
**+0,10 dB sur l'autre**, c'est-a-dire au-dessus du plafond. Je n'y ai pas
touche — baisser le niveau ne repare pas une saturation deja gravee, et
l'equilibrage se fera sur le lot complet. Mais si tu regeneres cette musique
un jour, demande un master a -1 dB.

## Ce qui est VRAI maintenant, et d'ou ca vient

| fichier | duree | origine |
|---|---|---|
| `symbole_pose.mp3` | 0,49 s | lot fourni, piste 2 sur 9 |
| `gain.mp3` | 0,60 s | **derive** de la tete de `melodic-bonus-collect` |
| `tours_gratuits.mp3` | 1,46 s | `mixkit-melodic-bonus-collect-1938` |
| `gros_gain.mp3` | 3,58 s | `mixkit-payout-award-1934` |

Les trois derniers viennent de **Mixkit**. Queue morte coupee (0,58 s et
0,66 s), fondu de sortie de 30 ms, **stereo conserve** — l'ecart entre les
canaux vaut 0,57 et 0,81, c'est du vrai stereo et le passer en mono
perdrait la largeur. Verifie APRES encodage : zero echantillon sature.

`gain.mp3` est un DECOUPAGE, pas un fichier fourni : la montee et la crete
de `melodic-bonus-collect` tiennent en 0,6 s, ce qui fait un carillon bref.
Il fallait quelque chose de court a cet endroit — `gain` se rejoue a CHAQUE
etage de cascade, jusqu'a dix fois sur un bon tour.

### LA LICENCE MIXKIT N'A PAS PU ETRE LUE

Trois tentatives, la page ne sert pas son texte. Ce que j'ai pu etablir :

- la licence gratuite des BRUITAGES autorise l'usage commercial, sans
  attribution ;
- **une restriction nommant « CDs, DVDs, Video Games or TV & Radio
  broadcasts » existe — mais elle porte sur la MUSIQUE Mixkit**, pas sur les
  bruitages.

Notre usage est un jeu. Si cette restriction couvre aussi les bruitages, ces
trois fichiers ne vont pas. **A verifier a l'oeil sur `mixkit.co/license`,
rubrique « Sound Effects Free License »** — deux minutes, dans un navigateur
qui execute le JavaScript.

Si ca coince : le paquet GDC de Sonniss couvre les memes cases, et sa
licence, elle, a ete lue en entier (voir `OU-TROUVER.md`). Le remplacement
est une ligne.

## Les autres : provisoires, dans `provisoire/`

Huit bruitages CC0 de Kenney y sont poses pour que le jeu puisse etre construit
et essaye tout de suite. **Ils ne collent pas au style** — le catalogue CC0 de
Kenney est du retro et de l'interface neutre, la ou Bonanza est sucre et ample.
Voir `provisoire/LISEZ-MOI.md` : licence, correspondances, et ce qu'il faut
ecouter avant de garder quoi que ce soit.

## Ce qui manque encore

D'apres ce que montre la video, il faudra au minimum :

- **debut de tour** — le lancement
- **chute des symboles** — l'arrivee sur la grille
- **combinaison gagnante** — court, il se repete a chaque cascade
- **cascade** — les symboles qui tombent pour combler les trous
- **scatter qui tombe** — doit se distinguer nettement des autres
- **declenchement des tours gratuits** — le moment fort
- **bombe multiplicateur**
- **gros gain**

Le son de combinaison est celui qu'on entendra le plus : il se rejoue a chaque
etage de cascade. S'il est trop long ou trop present, il devient penible au
bout de dix tours. Court et discret.
