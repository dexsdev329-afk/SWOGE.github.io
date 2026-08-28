# Audit de SwogeFunV3 — PREMIER PASSAGE : NON DEPLOYABLE (corrige depuis, voir plus bas)

> **Suite donnee.** Les defauts 1, 2 et 3 sont corriges ; le 4 est un choix
> economique qui reste a trancher. Voir la section « Ce qui a ete corrige »
> en fin de document. Le contrat corrige n'a PAS ete re-audite.

Audit adversarial, 28 aout 2026. Huit lentilles independantes sur le contrat,
puis trois sceptiques par trouvaille dont le travail etait de REFUTER.
44 trouvailles brutes, 20 confirmees avant que la session n'atteigne sa limite.
Les quatre defauts ci-dessous ont ete reverifies a la main, dans le code.

**Ce contrat ne doit pas etre deploye.** Trois de ses quatre defauts majeurs
viennent de decisions prises en l'ecrivant, et l'un d'eux a ete CREE par la
simplification que j'avais moi-meme recommandee.

---

## 1. BLOQUANT — le launchpad se brique definitivement pour le prix du gaz

Trouve independamment par cinq des huit lentilles.

L'adresse du prochain jeton est un CREATE deterministe :
`keccak(rlp(launchpad, nonce))`. Elle est donc publiquement calculable.

Un attaquant cree et INITIALISE lui-meme le pool Uniswap
`(jeton_predit, $SWOGE, 1 %)` a un prix de son choix, avant tout lancement.
`createAndInitializePoolIfNecessary` ne reinitialise PAS un pool deja
initialise : il rend celui de l'attaquant. Le `mint` mono-face qui suit
calcule alors une liquidite nulle et revert. **Le revert annule toute la
transaction, donc aussi l'increment du nonce.** Le `createToken` suivant vise
la MEME adresse, retombe sur le MEME pool empoisonne, et revert a nouveau.

Sans owner, sans setter, sans proxy : plus jamais un seul jeton ne peut etre
lance.

**C'est ma simplification qui a cree ce defaut.** Le V2 avait DEUX chemins de
`new` — ligne 262 (`SwogeCurveToken`) et ligne 274 (`SwogePlainToken`). Un
lancement en mode courbe faisait avancer le nonce sans toucher a Uniswap, et
depassait donc l'adresse empoisonnee. En supprimant le mode courbe pour
« reduire la surface d'attaque », j'ai supprime la seule sortie de secours.

Le V3 n'a qu'un seul `new`, ligne 264. Verifie.

---

## 2. BLOQUANT — `shares()` est controle par l'attaquant, et mon calcul de
   marge etait faux

J'avais affirme : « le depassement de `magPerShare * value` est inatteignable,
marge de 1,7e16 apres dix mille recoltes sur l'offre entiere ».

**C'est faux, et la lentille chargee de demonter mes affirmations l'a montre.**
Mon calcul supposait `shares = offre entiere`. Or `shares()` est une lecture
LIVE des soldes (l. 334-340) : n'importe qui la ramene a quelques wei en
envoyant ses jetons directement a l'adresse du pool, qui est soustraite.

Une seule distribution avec `shares = 1 wei` rend `magPerShare` astronomique.
Ensuite :

- `pendingRewards` (l. 373) fait `magPerShare * balanceOf` en arithmetique
  VERIFIEE, hors de tout try/catch : elle revert definitivement pour tout
  detenteur reel. Plus personne ne peut reclamer, ni maintenant ni jamais.
- Dans `onMove`, `mps * value` revert, le try/catch l'avale, et la correction
  n'est PAS posee — ce qui FABRIQUE une creance au lieu d'en perdre une.
- `int256(uint256)` n'est PAS verifie en Solidity 0.8 : entre 2^255 et 2^256,
  la correction change de signe **sans meme revertir**, donc sans passer par
  le try/catch.

Et comme le solde $SWOGE du contrat n'est cantonne par aucun jeton, une
creance fabriquee sur un jeton jetable se paie sur les recompenses des
detenteurs de TOUS les autres.

Mon commentaire ligne 126-132 — « on perd la mise a jour d'une recompense ;
on ne perd pas le jeton » — est faux. On ne perd pas une recompense : on en
cree une.

---

## 3. GRAVE — `DEAD` compte dans le diviseur mais ne peut jamais reclamer

`shares()` (l. 338) soustrait le pool et le contrat. `_exclu` (l. 366-368)
exclut le pool, le contrat, `address(0)` ET `DEAD`.

Le solde de `DEAD` gonfle donc le denominateur sans qu'aucune adresse ne
puisse reclamer la part correspondante. Ce $SWOGE reste bloque dans un
contrat sans fonction de retrait, pour toujours.

Et le mecanisme s'auto-alimente : `collectFees` (l. 322) brule vers `DEAD` la
part en jeton a CHAQUE recolte. Le solde de `DEAD` ne fait que croitre, donc
la fuite s'aggrave a chaque distribution.

Mon commentaire ligne 353-355 affirme que les exclusions sont « exactement
comme dans `shares` ». Elles ne le sont pas. Verifie.

---

## 4. GRAVE — le createur ne recoit rien, et l'economie ne tient pas

`Inst.creator` est ecrit ligne 293 et emis dans deux evenements. **Il n'est
relu nulle part.** Verifie par recherche : aucune autre occurrence.

L'offre entiere part dans le pool au lancement. Le createur ne recoit donc
aucun jeton : il doit racheter le sien au marche, en payant 1 % de frais
comme tout le monde.

Mon en-tete, lignes 26-29, affirme qu'il « touche sa part comme detenteur,
proportionnelle a ce qu'il GARDE ». Il ne garde rien. **L'argument de vente
du launchpad repose sur une phrase fausse**, et personne n'a de raison
economique de lancer ici.

C'est une erreur de raisonnement de ma part, pas un defaut de code : le V2
donnait 70 % des frais au createur, et j'ai retire cette incitation en
croyant qu'une autre la remplacait.

---

## Autres defauts confirmes, non detailles ici

- Les 70 % « detenteurs » sont captables atomiquement par un bot MEV :
  `collectFees` est ouvert a tous et repartit sur une photo instantanee.
  Acheter le flottant, recolter, reclamer, revendre tient dans une
  transaction.
- La branche `shares()==0` verse 100 % au tresor, et n'importe qui peut la
  declencher au bon moment.
- `I_TICK_START` fige le prix de lancement en $SWOGE aussi surement que
  `creationFee` — et mon en-tete ne defend que le second.
- Un transfert emis avec un budget de gaz calibre fait echouer `onMove` par
  la regle EIP-150 des 63/64 sans faire echouer le transfert. Aucun
  `magPerShare` anormal n'est requis : ca marche en fonctionnement normal.

---

## Ce qui reste sain

- Le jeton emis n'a ni owner, ni mint, ni pause, ni liste noire.
- Le contrat ne peut pas retirer la liquidite : son interface Uniswap
  declaree ne contient ni `decreaseLiquidity`, ni `safeTransferFrom`, ni
  `burn`.
- L'anti-snipe et le `setPool` unique sont corrects.
- Les quatre adresses de deploiement portent une somme de controle valide.
- Le contrat compile proprement aux reglages de production.

Aucune de ces proprietes ne compense les quatre defauts ci-dessus.

---

## Ce que cet audit dit du reste

Deux lecons, ecrites pour la prochaine fois :

**Retirer du code n'est pas gratuit.** J'ai supprime le mode courbe en
affirmant que « chaque ligne qu'on ne deploie pas est une ligne qui ne peut
pas casser ». C'etait vrai pour les lignes, faux pour les CHEMINS : le second
`new` etait une sortie de secours que personne n'avait documentee comme
telle.

**Une verification qui repose sur une hypothese doit verifier l'hypothese.**
Mon calcul de marge etait juste ; son hypothese — que `shares` vaut l'offre
entiere — ne l'etait pas, et c'est la seule chose qui comptait.


---

# Ce qui a ete corrige

## 1. Le brique definitif — CORRIGE

`CREATE` devient `CREATE2`, avec un sel qui melange l'appelant et une valeur
que le lanceur choisit (`LaunchParams.salt`). L'adresse du jeton depend donc du
sel : **un lancement bloque se relance ailleurs**. Il n'y a plus d'adresse
unique qu'un attaquant puisse empoisonner une fois pour toutes.

Et pour que l'echec soit lisible plutot que cryptique, le contrat verifie
lui-meme que le pool a bien ete amorce au prix demande :

    (uint160 prixReel,,,,,,) = IUniswapV3Pool(pool).slot0();
    require(prixReel == sqrtP, "pool deja amorce a un autre prix: relancez avec un autre salt");

Sans cette ligne, un pool devance par un tiers faisait reverter le mint avec un
message d'Uniswap incomprehensible.

## 2. Le vol du pot commun — CORRIGE, en trois endroits

**Le try/catch est retire.** C'etait la source. Quand `onMove` echouait, la
correction n'etait pas neutre : elle etait OMISE, ce qui FABRIQUE une creance.
L'invariant du V2 est restaure — soit la correction est ecrite, soit le
transfert echoue.

**Et `onMove` est rendu incapable de revertir**, ce qui est la seule facon
honnete d'avoir les deux. Deux bornes le garantissent :

- `MIN_FLOTTANT_BPS = 100` : sous 1 % de l'offre en circulation, on ne
  distribue pas — la part va au tresor. Le diviseur n'est donc plus choisi par
  l'attaquant.
- `MPS_MAX = 5e49` : plafond de `magPerShare`. Verifie par le calcul —
  `5e49 x 1e27 = 5,0e76`, sous les `5,79e76` d'`int256`. La multiplication ne
  deborde pas et la conversion signee, qui n'est PAS verifiee par Solidity, ne
  peut pas changer de signe. Il faudrait distribuer 1,47e18 jetons $SWOGE pour
  atteindre ce plafond.

**Chaque jeton a sa propre caisse** (`reserve[token]`). `claimRewards` ne peut
plus payer que sur ce que CE jeton a apporte. C'est ce qui empeche un defaut
local de devenir un vol global — et c'est une defense qui tient meme si une
autre borne cede un jour.

**`pendingRewards` ne revert plus jamais.** Deux gardes redondantes avec
`MPS_MAX`, et c'est voulu : une fonction dont l'echec serait irreparable ne doit
pas dependre d'un invariant pose ailleurs dans le fichier.

## 3. DEAD compte deux fois — CORRIGE

`shares()` soustrait desormais `DEAD`, comme `_exclu` l'excluait deja. Verifie :
les deux fonctions excluent maintenant le meme ensemble.

## 4. Le createur ne recoit rien — TRANCHE : c'est le produit

La phrase fausse a ete retiree de l'en-tete. Le code n'a pas change et ne
changera pas : l'offre entiere part dans le pool, `Inst.creator` sert a
l'attribution et n'est relu par aucune fonction.

Decision : **le createur ne recoit rien**, deliberement. Un launchpad ou le
lanceur part avec un sac gratuit est un launchpad ou l'acheteur est la sortie
de quelqu'un d'autre. L'en-tete du contrat porte maintenant ce choix et
avertit qu'il n'existe aucun setter pour revenir dessus.

---

# SECOND AUDIT ADVERSARIAL — VERDICT : DEPLOYABLE APRES CORRECTIFS

49 agents, 0 erreur, 51 constats bruts. Les 13 constats bloquant/grave ont ete
soumis a refutation : 8 confirmes. Les 38 constats moyens et en dessous sont
rapportes **non verifies** — ils n'ont pas ete refutes faute de budget, et ne
doivent pas etre lus comme valides.

## Les trois correctifs du premier audit tiennent

| Correctif | Verdict | Preuve |
|---|---|---|
| 1. Brique definitif | **OUI** | Le nonce n'entre plus dans l'adresse (CREATE2). |
| 2. Vol du pot commun | **OUI** | `try/catch` absent (ne subsiste qu'en commentaire) ; `onMove` = 3 SLOAD, 0 appel externe, 0 division. |
| 3. `DEAD` compte double | **OUI** | Retire du diviseur dans `shares()`. |

Sur le correctif 2, l'audit a fourni la demonstration que je n'avais pas
ecrite : `acc = magCorrection + magPerShare x solde` est **invariant par
transfert**, donc les deux additions de `onMove` ne peuvent pas deriver.

## A — BLOQUANT (verification) : le gestionnaire de positions — **LEVE**

Le contrat exige le NFT (`mp.recipient = address(this)`) sans implementer
`onERC721Received`. Si le gestionnaire deploye utilisait `_safeMint`, **chaque
`createToken` aurait reverti, pour toujours**.

Verifie sur la source verifiee de `0x73991a25...`, ligne 156 :
`_mint(params.recipient, (tokenId = _nextId++));` — pas `_safeMint`. Le crochet
n'est pas appele. **Il a ete implemente quand meme** : trois lignes contre un
contrat mort-ne irreparable.

## B — BLOQUANT (verification) : le jeton $SWOGE — **LEVE**

Quatre chemins critiques passent par $SWOGE sur trois hypotheses jamais
ecrites. Source verifiee + etat on-chain (`eth_call`) de
`0x8a166Fb4...` :

| Hypothese | Mesure | Verdict |
|---|---|---|
| `transfer` rend un `bool` | OZ ERC20 | OK |
| Pas de pause / blacklist / proxy | Aucune, deploye par constructeur | OK |
| Pas de frais de transfert | `MAX_TAX_BPS` = **0**, et c'est un `immutable` | OK |
| Les limites ne bloquent pas | `limitsEnabled` = false, sans setter qui la remette a true | OK |
| Les transferts sont ouverts | `tradingActive` = true, drapeau a sens unique | OK |

Le point decisif : les taxes ne s'appliquent que si l'emetteur ou le
destinataire est dans `automatedMarketMakerPairs`. Cette table n'est ecrite que
dans `createPair()`, qui est `onlyOwner` — et **`owner()` vaut `address(0)`**.
Elle est donc figee sur une seule paire, qui n'est jamais ce launchpad. Aucun
transfert du launchpad ne peut etre taxe, et `MAX_TAX_BPS = 0` interdit de
toute facon au `taxWallet` d'introduire un frais. **$SWOGE se comporte comme un
ERC20 nu et immuable.**

## C — GRAVE (code) : 100 % des frais partaient au tresor — **CORRIGE**

`shares()` vaut **exactement zero au lancement** (toute l'offre est dans le
pool). Chaque jeton naissait donc sous le plancher, et 100 % de ses frais
partaient au tresor jusqu'a ~102 000 SWOGE (~41 $) d'achats nets detenus
simultanement — cent fois le frais de lancement. Pire : n'importe qui pouvait
faire **repasser** `shares` sous le plancher pour le prix du gaz (position
Uniswap mono-face hors plage) puis appeler `collectFees`, qui n'est protege par
rien. Repetable a volonte.

Correctif : **ne jamais detourner, toujours differer.** Un `mapping public
carry` retient la part non repartissable ; le prochain appel la rajoute. La
condition **temporaire** (plancher) est separee de la condition **terminale**
(MPS_MAX) : seule la seconde verse au tresor. `collectFees` appelle desormais
`_distributeToHolders` **inconditionnellement**, ce qui est le seul moyen de
vider la retenue quand le flottant remonte.

### Le correctif etait faux a sa premiere ecriture

Un modele numerique du nouveau code (`carry_model.js`, 9 points de controle) a
montre que ma premiere version **testait MPS_MAX avant le plancher**. Avec un
flottant ramene a 1 wei, `pas` valait `montant x 2**128`, le plafond sautait, et
la branche terminale expediait la recolte au tresor : **le contournement passait
par le chemin cense l'empecher.** L'ordre des deux tests a ete inverse ; `pas`
n'est plus calcule qu'avec un `s` deja superieur au plancher, ce qui le borne a
`montant x MAG / plancher` = 3,4e40 contre un plafond de 5e49.

Le modele verifie a chaque distribution la solvabilite
(`reserve - reclame + carry == detenu`), `mps <= MPS_MAX` et l'absence de
debordement. Il valide la **logique**, pas le bytecode.

## Corrections de commentaires

Trois commentaires decrivaient un contrat qui n'existe plus : l'en-tete
annoncait encore le `try/catch` retire, `onMove` disait etre appele « en
try/catch de son cote », et le bloc du sel decrivait un empoisonnement aveugle.
Ce dernier est maintenant honnete sur ce que CREATE2 corrige et ce qu'il ne
corrige pas : un attaquant qui surveille le mempool peut toujours bloquer **un**
lancement ; ce qu'il ne peut plus faire, c'est tuer le launchpad.

Dans un contrat sans proprietaire, le commentaire est la seule documentation
qui survivra. Un commentaire faux y est un defaut.

---

# BANC D'ESSAI SUR FORK — le contrat a enfin TOURNE

Jusqu'ici, rien de ce qui precede n'avait execute une seule instruction EVM.
Les bornes arithmetiques etaient demontrees, la repartition simulee, les
sources du gestionnaire de positions et du $SWOGE relues — mais toute la
partie Uniswap (creation du pool, amorcage, mint mono-face, reception du NFT,
`collect`) reposait sur de la lecture. C'est justement la partie qu'on ne peut
pas raisonner de tete : elle depend d'un gestionnaire qui est un **fork**, sur
une chaine dont on ne controle rien.

`contrats/banc_fork.js` fait tourner le vrai bytecode contre le VRAI etat de la
chaine, via un EVM local (`@ethereumjs`) branche sur le noeud par RPC : vrai
gestionnaire de positions, vrai $SWOGE, vraie usine Uniswap.

## Ce que le banc etablit

| # | Verifie | Resultat |
|---|---|---|
| 1 | Deploiement du launchpad | passe |
| 2 | `createToken` de bout en bout | passe |
| 3 | Pool cree, NFT emis et **detenu par le launchpad** | passe |
| 3 | Offre entiere dans le pool (99,99 %), **zero jeton au createur** | passe |
| 3 | Frais de 1 000 $SWOGE preleve et **brule vers DEAD** | passe |
| 4 | `shares()` vaut **exactement zero** au lancement | confirme |
| 5 | Recolte a vide : rien ne file au tresor | passe |
| 6 | Achat sous le plancher : 30 % au tresor, **70 % EN RETENUE** | passe |
| 7 | Achat au-dessus du plancher : **la retenue se deverse**, `carry` revient a 0 | passe |
| 8 | `claimRewards` verse **exactement** la creance, puis zero | passe |
| 9 | Un transfert ne fait pas echouer `onMove` et ne **cree** aucune creance | passe |
| 10 | Anti-snipe : refuse au-dela de 5 % dans la fenetre, se relache apres | passe |
| 11 | Relancer avec le MEME sel -> echec propre | passe |
| 11 | Relancer avec un AUTRE sel -> passe (jamais brique) | **PAS ENCORE OBSERVE** |

La derniere ligne n'est pas une reussite : elle n'a jamais ete vue au vert.
Lors du passage ou elle a tourne, elle a echoue sur « reentrant » — un defaut
du banc, corrige depuis (point 3 ci-dessous) ; au passage suivant, le noeud a
elague le bloc d'ancrage avant d'y arriver. **Tant qu'elle n'est pas verte, la
rejouabilite du lancement reste demontree par la lecture du code et par le
seul fait que le sel entre dans l'adresse CREATE2, pas par l'execution.**

**Le point A de l'audit est desormais prouve par l'execution, pas par la
lecture** : le NFT arrive bien au launchpad, donc le gestionnaire deploye
n'appelle pas `onERC721Received`.

**Le correctif C est valide sur le chemin reel** (sections 5 a 7) : une recolte alors que le
flottant est sous le plancher envoie 30 % au tresor et met 70 % de cote — elle
ne detourne rien — et la recolte suivante, une fois le plancher franchi,
deverse la retenue et remet `carry` a zero.

## Trois faux defauts que le banc a produits avant de dire vrai

Un banc mal regle accuse le contrat. Les trois cas, parce qu'ils se
reproduiront :

1. **Hardfork trop ancien.** Sous Shanghai, le $SWOGE deploye tombait sur
   « invalid opcode » apres avoir brule tout le gaz. Solidity 0.8.30+ vise
   Cancun et emet `MCOPY`. Rien a voir avec le contrat.
2. **Le temps ne passait pas.** Un fork ne fabrique pas de blocs : la fenetre
   anti-snipe (5 % par portefeuille, 2 blocs) ne se refermait jamais et le pool
   rendait « TF » des qu'un acheteur depassait 5 %. La garde fonctionnait ;
   c'est le banc qui etait fige.
3. **Un appel rate laissait des traces.** Apres un lancement echoue, le verrou
   de non-reentrance restait pose et le lancement SUIVANT echouait sur
   « reentrant ». Sur une vraie chaine, une transaction ratee ne modifie rien.
   Il a fallu encadrer chaque appel de premier niveau d'un point de reprise.

## Ce que le banc ne prouve toujours pas

- **Un seul bloc, un seul chemin nominal.** Pas de temps qui passe reellement,
  pas de concurrence, pas de dizaines de portefeuilles.
- **Le noeud n'est pas une archive.** Il elague l'etat pendant l'essai ; les
  lectures tardives basculent sur le bloc courant. L'essai n'est donc pas
  reproductible a l'identique, et le banc le signale quand ca arrive.
- **Ni audit humain, ni reseau de test.** Un contrat sans proprietaire merite
  les deux.

---

# Etat

Compile propre sous solc 0.8.34+commit.80d5c536, **0 avertissement**,
**13 475 octets** (55 % de la limite EIP-170). Le V2 en faisait 20 560.

# Ce qui n'a toujours PAS ete fait

**Aucun reseau de test.** Le banc sur fork ci-dessus couvre desormais
l'integration Uniswap sur l'etat reel, mais a un seul bloc et sur un chemin
nominal : pas de temps qui passe, pas de concurrence, pas de dizaines de
portefeuilles.

**Les 38 constats moyens du second audit n'ont pas ete refutes.** Ils peuvent
contenir des faux positifs comme de vrais defauts.

**Aucune relecture humaine.**

Le contrat detient la liquidite pour toujours et n'a pas de proprietaire.
**Un defaut restera definitif.**
