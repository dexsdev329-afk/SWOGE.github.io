# SwogeFunV3 — ce qui est fait, et ce qui ne l'est pas

## Etat

**Ecrit et compile. Ni deploye, ni eprouve sur une chaine, ni audite.**

Compile avec `solc 0.8.34+commit.80d5c536`, optimisation activee, 200 runs —
exactement les reglages du V2 en production. Zero erreur, zero avertissement.

    SwogeFunV3   11 807 octets   (V2 : 20 560)
    SwogeToken    3 236 octets

43 % de code en moins que le V2, parce que le mode courbe — jamais appele par
l'interface — n'y est pas.

## Les decisions prises, et par qui

| decision | valeur |
|---|---|
| modes | instantane seulement |
| paire du pool | `$SWOGE` (plus de WETH) |
| frais de lancement | `creationFee`, **brule** — non encaisse |
| partage des frais de trading | **70 % detenteurs / 30 % tresor** |
| part du createur | aucune en direct : il touche comme detenteur |
| proprietaire | **aucun** — pas de `owner`, pas de setter |
| tresor et frais | `immutable`, poses au deploiement |

Le montant du frais est un parametre du constructeur. **1 000 $SWOGE** a ete
retenu : 0,40 $ aujourd'hui, 4 $ si le jeton fait x10, 40 $ a x100. On vise
volontairement bas — « trop cher » tue le launchpad sans reparation possible,
« trop peu cher » ne fait qu'une liste en desordre, qui se filtre dans
l'interface. Une ligne a changer avant deploiement.

## Ce qui a ete verifie, et comment

**Par le compilateur** : compile propre aux reglages de production.

**Par le calcul** (`mps * value`, le defaut latent du V2) : apres dix mille
recoltes sur l'offre entiere, le produit vaut 3,4e60 pour un `int256` qui
monte a 5,8e76 — une marge de 1,7e16. Le depassement n'est pas atteignable en
pratique. Et s'il l'etait, le `try/catch` du jeton l'absorberait.

**Par le calcul** (plage de prix) : depart au tick -46000, soit 0,010054
$SWOGE par jeton, dix millions de $SWOGE de capitalisation a l'ouverture.
Les deux ticks sont multiples de 200, l'ecart du palier 1 %, et la troncature
Solidity de -115200 redonne bien -115200.

**Par le calcul** (equite) : un acheteur qui arrive apres une distribution a
un du de zero. Il ne recupere pas les recompenses passees.

## Ce qui N'A PAS ete verifie

- **Aucune execution.** Pas de reseau de test, pas de fork, pas un seul
  lancement reel. La logique Uniswap — creation du pool, mint a sens unique,
  `collect` — n'a jamais tourne avec `$SWOGE` en paire.
- **Aucun audit.** Ce contrat n'a pas de proprietaire, pas de proxy, et
  detient la liquidite de chaque jeton lance pour toujours. **Un defaut sera
  definitif.** Il doit etre relu par quelqu'un d'autre avant deploiement.
- **L'interface n'est pas faite.** `launchpad.html` parle encore au V2 : il lui
  faudra la nouvelle adresse, le nouvel ABI, et une etape d'`approve` avant le
  lancement — le frais se paie desormais en `$SWOGE`, pas en ETH natif.

## A poser au deploiement

    constructor(positionManager, swoge, treasury, creationFee)

    positionManager  0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3
    swoge            0x8a166Fb41Cd659a0a43396272FF73973Ce29F817
    treasury         a decider — IMMUABLE, aucun moyen d'en changer ensuite
    creationFee      1000 ether  (1 000 $SWOGE)

Le tresor merite un instant de reflexion : c'est la seule adresse du contrat
qui ne pourra jamais bouger. Si ce portefeuille est perdu, les 30 % y partent
pour toujours.
