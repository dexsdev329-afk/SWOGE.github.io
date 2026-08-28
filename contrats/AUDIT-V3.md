# Audit de SwogeFunV3 — VERDICT : NON DEPLOYABLE

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
