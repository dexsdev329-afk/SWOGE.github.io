# SwogeFunV3 — ce qui est fait, et ce qui ne l'est pas

## Etat

**Ecrit, compile, audite deux fois. Ni deploye, ni eprouve sur une chaine.**

Verdict du second passage adversarial : **DEPLOYABLE APRES CORRECTIFS** — les
correctifs sont appliques, les deux verifications bloquantes sont levees
(voir `AUDIT-V3.md`). Toujours aucune execution reelle, aucune relecture
humaine.

Compile avec `solc 0.8.34+commit.80d5c536`, optimisation activee, 200 runs —
exactement les reglages du V2 en production. Zero erreur, zero avertissement.

    SwogeFunV3   13 475 octets   (V2 : 20 560)
    SwogeToken    3 240 octets

34 % de code en moins que le V2, parce que le mode courbe — jamais appele par
l'interface — n'y est pas.

## Les decisions prises, et par qui

| decision | valeur |
|---|---|
| modes | instantane seulement |
| paire du pool | `$SWOGE` (plus de WETH) |
| frais de lancement | `creationFee`, **brule** — non encaisse |
| partage des frais de trading | **70 % detenteurs / 30 % tresor** |
| part du createur | **aucune, et c'est voulu** — ni jeton, ni frais |
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
pratique. Le `try/catch` a depuis ete RETIRE — il masquait des mises a jour
partielles — et `onMove` a ete rendu incapable de revertir a la place.

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
    treasury         0x6229DDF7c8Ed3A194819aF2e68f5de2Dc31e7F30
    creationFee      1000 ether  (1 000 $SWOGE)

### Ce qui a ete verifie sur ces quatre adresses

Les quatre portent une somme de controle EIP-55 **valide** — verifiee par le
calcul, pas a l'oeil. Une adresse mal recopiee mais bien formee enverrait 30 %
de tous les frais dans le vide, definitivement ; la casse mixte d'une adresse
Ethereum est precisement la protection contre ca, et elle ne sert que si
quelqu'un la verifie.

Le tresor est un PORTEFEUILLE, pas un contrat (`is_contract: false` sur
l'explorateur). C'est ce qu'il faut : les jetons qui y arrivent sont
deplacables par qui detient la cle. Un contrat sans fonction de retrait les
aurait retenus pour toujours.

### Une difference a noter

Le tresor du V2 est `0xaD19cB5F485266989ED0AfE18cfAaEAc6156fc30` — une AUTRE
adresse. Les deux launchpads paieront donc a deux endroits differents. C'est
coherent avec la decision de repartir a neuf, mais il faut le savoir : les
frais des jetons deja lances continueront d'aller a l'ancienne.

### Le rappel qui va avec

C'est la seule adresse du contrat qui ne pourra JAMAIS bouger. Pas de setter,
pas de proprietaire, pas de proxy. Si cette cle est perdue ou compromise, les
30 % y partent pour toujours et personne — toi compris — ne pourra rien y
changer.
