# Sons de SWOGE BONANZA

## Ce qu'il y a

| fichier | quand | duree |
|---|---|---|
| `spin_rien.mp3` | fin d'un tour **sans aucune combinaison** | 0,78 s |

## Ce qui a ete fait a l'original, et ce qui ne l'a PAS ete

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
