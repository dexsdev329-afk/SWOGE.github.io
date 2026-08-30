# $SWOGEBET — répondre à l'audit automatique de Dexscreener

Dexscreener affiche l'audit de **Quick Intel**. Sur `$SWOGEBET` il annonce
deux alertes rouges et trois « Unknown » :

| Ce qu'il affiche | Ce qui est vrai |
|---|---|
| Has suspicious functions · **Yes** | Le contrat a **15 fonctions publiques**, toutes nommées ci-dessous. Aucune n'est cachée. |
| Mintable · **Yes** | **Faux.** Il n'existe aucune fonction `mint`. L'offre est fixée dans le constructeur et rien ne peut l'écrire ensuite. |
| Ownership renounced · **Unknown** | Il n'y a **jamais eu de propriétaire**. Ni `owner()`, ni `onlyOwner`, ni `renounceOwnership()`. |
| Buy tax / Sell tax · **Unknown** | Il n'y a **aucune taxe**. `_t` déplace le montant exact, et ça se mesure sur la chaîne. |

Rien de tout ça ne se règle en le disant. Ce fichier dit comment le
**montrer**, et ce qui peut ne pas passer au vert malgré tout.

---

## 1. La preuve, reproductible par n'importe qui

    node contrats/preuve_jeton.js

Le script ne demande rien à personne : il lit le bytecode sur le RPC public,
en **sort la liste exacte des fonctions publiques** et vérifie que chacune est
connue. Une fonction cachée ne peut pas y échapper — le répartiteur de
Solidity contient forcément le sélecteur de chaque fonction appelable. Ce qui
n'y est pas n'existe pas.

Les quinze, en entier :

    name  symbol  decimals  totalSupply  balanceOf  allowance
    transfer  approve  transferFrom
    fun()  pool()  setPool(address)
    launchBlock()  SNIPE_BLOCKS()  SNIPE_MAX_BPS()

Les neuf premières sont l'ERC-20 standard. Les six autres :

- `fun()` — l'adresse du launchpad. Lecture seule.
- `pool()` — l'adresse de la piscine Uniswap v3. Lecture seule.
- `setPool(address)` — posée **une seule fois**, au lancement. Elle exige
  `msg.sender == fun && pool == address(0)` ; `pool` est déjà posée, donc elle
  revertit pour tout le monde, pour toujours.
- `launchBlock()`, `SNIPE_BLOCKS()`, `SNIPE_MAX_BPS()` — trois valeurs en
  lecture seule, dont deux sont des **constantes du code**. Elles décrivent une
  protection anti-sniper qui plafonnait un portefeuille à 5 % de l'offre
  **pendant les deux premiers blocs**. Cette fenêtre s'est refermée deux blocs
  après le lancement, soit plus de 24 millions de blocs avant aujourd'hui, et
  elle ne peut pas revenir : `launchBlock` est `immutable`, `SNIPE_BLOCKS` est
  `constant`.

Aucune des **33 fonctions** qu'un scanner cherche n'est présente : ni `owner`,
ni `mint`, ni `pause`, ni liste noire, ni réglage de frais, ni proxy.

---

## 2. Ce qui déclenche vraiment « suspicious functions »

Il faut le dire clairement plutôt que de crier à l'erreur : le jeton **appelle
un autre contrat à chaque transfert**.

    ISwogeFun(fun).onMove(f, to, v);

C'est la dernière ligne de `_t`. Un transfert qui appelle un contrat tiers,
c'est **exactement la forme d'un honeypot**, et un analyseur de bytecode ne
peut pas faire la différence entre cette forme-là et un piège. L'alerte n'est
pas absurde ; elle est prudente.

Ce que cet appel fait, et ce qu'il ne peut pas faire :

- il **ne déplace aucun jeton**. Il met à jour la comptabilité des récompenses
  du launchpad, rien d'autre — voir `onMove` dans `SwogeFunV3.sol` ;
- il **ne peut pas faire échouer un transfert**. La démonstration est écrite
  dans le contrat : `magPerShare` est plafonné à `MPS_MAX = 5e49`, `value` ne
  peut pas dépasser l'offre (`1e27`), donc le produit vaut au plus `5e76`, sous
  les `5,79e76` d'`int256`. La multiplication ne déborde pas et la conversion
  signée ne peut pas changer de signe. Les deux seules branches qui restent
  sont des `return` immédiats ;
- il **ne peut pas être redirigé** : `fun` est `immutable`.

Le contrat est déployé et **immuable**. Cet appel ne peut pas être retiré. La
seule réponse honnête est de l'expliquer, pas de le cacher.

---

## 3. Vérifier le contrat sur Blockscout — le seul vrai levier

Tant que la source n'est pas publiée, Quick Intel lit du bytecode nu et
devine. Avec la source, il nomme chaque fonction et n'a plus à deviner.

> Le **launchpad** `0xc16388e95dbbD37A679A7d507C174C7e34C5856E` est déjà
> vérifié sur Blockscout, et sa source contient `contract SwogeToken` — c'est
> le code de `$SWOGEBET`. Le jeton lui-même, créé par le launchpad, ne l'est
> pas : Blockscout ne vérifie pas automatiquement les contrats enfants.

Explorateur → `0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea` → onglet
**Contract** → **Verify & Publish** → *Solidity (Single file)* :

| Champ | Valeur |
|---|---|
| Fichier | `contrats/SwogeFunV3.sol` (le fichier entier, tel quel) |
| Contract name | `SwogeToken` |
| Compiler | `v0.8.34+commit.80d5c536` |
| Optimization | **Enabled**, **200** runs |
| EVM Version | **cancun** |

Arguments du constructeur, encodés en ABI — `("Swogebet", "Swogebet", 1e27)` :

    0000000000000000000000000000000000000000000000000000000000000060
    00000000000000000000000000000000000000000000000000000000000000a0
    0000000000000000000000000000000000000000033b2e3c9fd0803ce8000000
    0000000000000000000000000000000000000000000000000000000000000008
    53776f6765626574000000000000000000000000000000000000000000000000
    0000000000000000000000000000000000000000000000000000000000000008
    53776f6765626574000000000000000000000000000000000000000000000000

(Blockscout les remplit souvent tout seul pour un contrat créé par une
fabrique. S'il le fait, ne les recolle pas.)

La version du compilateur non plus : `pragma solidity ^0.8.26` est un
**minimum**, pas la version employée. Le launchpad a été compilé avec
`0.8.34+commit.80d5c536` — c'est cette version-là qu'il faut déclarer, et
c'est celle que `DEPLOIEMENT.md` a servi à vérifier le launchpad.

`cancun` et l'optimiseur à 200 ne sont pas des détails : recompiler avec
d'autres réglages ne reproduit pas le bytecode, et la vérification échoue sans
dire pourquoi. Même remarque que dans `DEPLOIEMENT.md`.

---

## 4. Demander la relecture à Quick Intel

Une fois la source publiée, l'audit se relit — mais il ne se relit pas tout
seul dans la minute. Leur formulaire de correction attend des faits
vérifiables ; en voici la liste courte, chacune reproductible par la commande
du §1 :

1. **Aucune fonction `mint`.** Les quinze sélecteurs du contrat sont publics
   et nommés. `totalSupply` est écrite dans le constructeur et par rien
   d'autre : les seules fonctions qui modifient l'état sont `transfer`,
   `approve`, `transferFrom` et `setPool` (morte).
2. **Aucun propriétaire, jamais.** Pas de `owner()`, donc rien à renoncer.
   « Unknown » vient de là : un scanner cherche la trace d'une renonciation, et
   un propriétaire qui n'a jamais existé n'en laisse aucune.
3. **Aucune taxe.** Le contrat n'a ni variable de frais, ni destinataire de
   frais, ni réglage de frais. Mesuré sur la chaîne : dans la transaction
   `0x5a92c6e088ab5483e6028cb59f6f7ef9620664123eef24a60ae66e766be484ce`, le
   même montant — `7 222 302,11833873415112374`, au wei près — traverse trois
   portefeuilles d'affilée. Une taxe aurait cassé la chaîne dès le premier saut.
4. **Les fonctions non standard sont trois lectures et une fonction morte**,
   décrites au §1.
5. **L'appel `onMove` est réel**, décrit au §2, et ne peut ni déplacer de
   jetons ni faire échouer un transfert.

---

## 5. Ce qui restera peut-être rouge, et pourquoi c'est acceptable

`Has suspicious functions` peut rester allumé même après la vérification :
l'appel externe dans `_t` est bel et bien là, et une heuristique prudente a le
droit de le signaler. Vouloir le passer au vert coûterait un **redéploiement**
— nouveau contrat, nouvelle piscine, nouvelle liquidité, et tous les
détenteurs actuels laissés sur l'ancien jeton. Le remède serait pire que le mal.

Ce qui est faisable, et qui vaut mieux qu'un badge vert : que la source soit
lisible, que la liste des fonctions soit publique, et que la commande du §1
soit dans les mains de qui veut vérifier. Un audit automatique se lit en
trois secondes ; une preuve qu'on peut refaire soi-même tient plus longtemps.

**Ce qu'il ne faut pas faire :** payer un « service » qui promet de passer les
alertes au vert. Aucun n'y touche autrement qu'en demandant la même correction,
et plusieurs se contentent d'encaisser.
