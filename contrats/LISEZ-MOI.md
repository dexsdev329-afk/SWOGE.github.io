# Les contrats

## Pourquoi ce dossier existe

Il n'existait pas. La source du contrat qui detient la liquidite de CHAQUE
jeton lance — pour toujours, sans fonction de retrait — ne vivait nulle part
dans les depots : uniquement sur l'explorateur, en tant que source verifiee.

Un explorateur peut perdre une verification, changer d'hote, ou fermer. Le
jour ou il faut lire ce contrat pour comprendre ce qui se passe, ou s'en
servir de base pour le suivant, il faut l'avoir.

## `SwogeFunV2.sol`

Le launchpad en production. 482 lignes, verifie sur Blockscout, recupere le
28 aout 2026. `SwogeFunV2.json` porte l'adresse, le compilateur exact et les
reglages d'optimisation — ce qu'il faut pour reproduire l'octet identique.

Il n'est PAS compile ni deploye depuis ce depot : c'est une archive de ce qui
tourne, pas une source de verite. La verite est sur la chaine.

## `SwogeFunV3.sol`

Le launchpad V3, `0xc16388e95dbbD37A679A7d507C174C7e34C5856E`, verifie sur
Blockscout. Il contient aussi `contract SwogeToken` — le jeton que chaque
lancement deploie, et donc le code de `$SWOGEBET`.

`AUDIT-V3.md` est sa relecture ligne a ligne ; `DEPLOIEMENT.md` la fiche de
deploiement, avec les reglages exacts du compilateur.

## `preuve_jeton.js` et `VERIFIER-SWOGEBET.md`

L'audit automatique de Quick Intel, celui que Dexscreener affiche, annonce sur
`$SWOGEBET` des fonctions suspectes, un jeton frappable et une propriete de
statut inconnu. « C'est faux » n'est pas un argument :

    node contrats/preuve_jeton.js

lit le bytecode sur le RPC public et en SORT la liste exacte des fonctions
publiques — une fonction cachee ne peut pas y echapper, le repartiteur de
Solidity contient forcement le selecteur de tout ce qu'on peut appeler.

`VERIFIER-SWOGEBET.md` explique ce que le scanner voit vraiment, comment
publier la source sur Blockscout (c'est le seul vrai levier), et dit
franchement quelle alerte restera peut-etre allumee, et pourquoi la faire
tomber couterait plus cher qu'elle ne vaut.
