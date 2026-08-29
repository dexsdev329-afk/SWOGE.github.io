# Bruitages PROVISOIRES

Huit sons pour que le jeu puisse etre construit et essaye. **Ce ne sont pas les
bons.** Lis la section « ce qui ne va pas » avant de t'y attacher.

## Origine et licence

Tous viennent de **Kenney** (kenney.nl), publies en **CC0 / domaine public** :
usage commercial libre, aucune attribution requise, aucune condition. C'est le
seul point sur lequel il n'y a rien a verifier — et il compte, parce que le
site prend de l'argent reel et qu'un bruitage « gratuit a telecharger » n'est
pas forcement libre d'usage commercial.

| fichier | source Kenney | duree |
|---|---|---|
| `spin_debut.mp3` | Interface Sounds · switch_002 | 0,16 s |
| `symbole_pose.mp3` | Interface Sounds · drop_002 | 0,21 s |
| `gain.mp3` | Interface Sounds · confirmation_001 | 0,31 s |
| `cascade.mp3` | Interface Sounds · pluck_001 | 0,10 s |
| `scatter.mp3` | Interface Sounds · glass_001 | 0,26 s |
| `tours_gratuits.mp3` | Music Jingles · STEEL01 (steel drum) | 1,41 s |
| `bombe.mp3` | Impact Sounds · impactBell_heavy_000 | 1,10 s |
| `gros_gain.mp3` | Music Jingles · PIZZI07 (pizzicato) | 1,36 s |

Tous ramenes en mono 96 kb/s, silences des deux bords coupes, et **-3 dB de
marge** : sans ca l'encodage MP3 faisait taper quatre d'entre eux a 0,0 dB,
c'est-a-dire au plafond. Le lot entier tient en 84 Ko.

## Ce qui ne va pas

**Le style ne correspond pas.** Le catalogue CC0 de Kenney est surtout du
retro 8-bit et de l'interface neutre ; l'univers de Bonanza est sucre, ample,
orchestral. Les jingles NES et les sons d'arcade ont ete ecartes d'office. Ce
qui reste — un steel drum, un pizzicato, un verre, une cloche — est
*acceptable* mais ne ressemble pas au jeu qu'on copie.

**Et je ne les ai pas entendus.** Je n'ai aucun moyen d'ecouter dans mon
environnement. Le choix s'est fait sur le nom, la duree et le niveau, pas a
l'oreille. `gain.mp3` dure 0,31 s parce qu'un son de combinaison se rejoue a
chaque etage de cascade et doit rester court — ca, c'est verifiable. Qu'il
sonne juste, non.

**Ecoute-les avant de les garder.** Surtout `gain.mp3` et `cascade.mp3` : ce
sont les deux qu'on entendra des centaines de fois par partie.

## Pour de vrais sons

Freesound a ete essaye : son vivier reellement CC0 sur « slot machine » est
minuscule — une seule reponse — et les apercus publics sont en basse qualite,
le fichier complet demandant un compte. Ce n'est pas une source praticable ici.

Les deux voies qui marchent :

1. **Les faire generer**, comme la musique de fond et le son de tour perdant.
   C'est ce qui a donne les meilleurs resultats jusqu'ici, et ca garantit un
   lot coherent entre lui.
2. **Un lot payant** de bruitages de casino. Quelques dizaines d'euros, et le
   style colle du premier coup.

Quand le lot definitif sera la, les niveaux seront equilibres **en une seule
fois sur l'ensemble** — pas fichier par fichier, sinon chacun est bon tout seul
et le lot est bancal.
