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
