# SWOGE V5 — launchpad sur Uniswap v4, sans propriétaire

Sources Solidity, essais Foundry et scripts de SWOGE V5, d'après le cahier des charges du
rapport V5 du 16/10/2026 (§4) et les décisions du propriétaire du 18/10/2026.

**État : écrit et testé en local, ni audité ni déployé.** Aucune transaction n'a été signée ni
envoyée sur une chaîne réelle. Le banc sur fork a tourné contre un fork anvil **local** de
Robinhood Chain.

## Architecture : un noyau et trois modules figés

| Contrat | Rôle | Runtime (octets) | Marge EIP-170 |
|---|---|---|---|
| `SwogeLaunchpadV5` (noyau) | bornes, jeton CREATE2, `unlock` : initialize + liquidité d'un seul côté + achat du créateur ; registre, métadonnées, cliquets, destinataire en deux étapes, vues, compatibilité V4 ; liste des 198 monnaies en stockage | 23 168 | 1 408 |
| `SwogeHookV5` (hook unique) | frais de base, taxe créateur, anti-snipe dégressif, plafonds d'achat, garde du pool (LP verrouillée), comptabilité des seaux | 9 019 | 15 557 |
| `SwogeHoldersV5` | distribution en *pull* : crédits créateur / trésor, staking, mur LP, rachat-burn, retraits | 10 786 | 13 790 |
| `SwogeAllocV5` | vesting du créateur et airdrop Merkle (reliquat brûlé) | 3 327 | 21 249 |
| `SwogeTokenV5` | ERC-20 nu, créé par le noyau à chaque lancement | 1 646 | 22 930 |
| `SwogeDeployerV5` | outil de déploiement CREATE3, sans état ni propriétaire (pas une partie de V5) | 1 011 | 23 565 |

Solc 0.8.26, `evm_version = cancun`, optimiseur 200 runs, `via_ir = true`. Chaque contrat tient
sous 24 576 octets. Le noyau embarque le code d'init du jeton, d'où sa taille.

Comment l'argent circule :

1. **Pendant un échange**, le hook prend son frais côté cotation par les deltas de retour v4
   (`beforeSwapReturnDelta` / `afterSwapReturnDelta`). Il le convertit aussitôt en créances
   ERC-6909 du PoolManager au nom de `SwogeHoldersV5` (`poolManager.mint`). Puis il remplit trois
   seaux : trésor, créateur, LP. Le hook ne fait aucun transfert de jeton et n'appelle aucun autre
   contrat que le PoolManager.
2. **Plus tard**, n'importe qui appelle `distribute(token)`. Holders vide les seaux du hook et
   répartit l'argent :
   - il crédite le trésor et le destinataire des frais ;
   - il crédite les stakers ;
   - il pose le seau LP en liquidité d'un seul côté.
3. **Chacun retire** ce qui lui est dû avec `withdraw(devise)`. Un destinataire qui refuse l'ETH
   ne bloque que lui-même.

Le marché ne dépend jamais de la distribution (§4.1, principe 4).

**Pourquoi CREATE3.** Les modules se connaissent par des adresses `immutable`. Avec CREATE2,
l'adresse d'un module dépend de son code d'init, donc des adresses des autres modules : c'est un
cercle. `SwogeDeployerV5` le casse : l'adresse ne dépend que du déployeur, de l'appelant et du sel.
Le sel du hook est miné pour que l'adresse porte les drapeaux `0x2ACC` (`script/MineHookSalt.s.sol`).

**LP verrouillée par construction.** La liquidité est une position du PoolManager au nom du
noyau, et non un NFT. Le noyau n'a aucune fonction de retrait, et le hook refuse
`beforeRemoveLiquidity` à tout le monde. Un tiers ne peut pas non plus ajouter de liquidité ni
initialiser un pool avec ce hook.

## Les deux constantes décidées par le propriétaire (18/10/2026)

| Constante | Valeur | Où |
|---|---|---|
| `CREATOR_SHARE_BPS` | **7 500 : 75 % du frais de base au créateur, 25 % à SWOGE** (trésor `immutable`) | `src/SwogeTypesV5.sol` |
| `MAX_CREATOR_TAX_BPS` | **500 : la taxe créateur est plafonnée à 5 %.** C'est une **décision finale** du propriétaire. La taxe s'ajoute au frais de base, à l'achat comme à la vente, et elle ne peut que baisser. | `src/SwogeTypesV5.sol` |

Ces deux valeurs sont des `constant`. Les changer après le déploiement est impossible : il
faudrait déployer un V5.1.

## Paramètres de lancement (bornes dures, `constant`)

| Paramètre | Bornes | Après lancement |
|---|---|---|
| `name` / `symbol` | 1 à 32 octets / 1 à 10 octets | figés |
| `meta` (description, logo, site, X, Telegram) | chaque champ ≤ 256 octets | modifiable par le destinataire (`updateMeta`, événements `MetadataUpdated` et `Meta`) |
| `quote` | indice dans la liste figée au déploiement (198 monnaies, indices 0 à 197) | figé |
| `startShift` | décalage du prix de départ depuis la référence de la cotation : multiple de 200, \|x\| ≤ 23 000 ticks (`MAX_START_SHIFT_TICKS`, facteur ≈ 10 dans chaque sens) ; 0 = la référence | figé |
| `shape` | `0` SINGLE (161 200 ticks, l'amplitude de V4) ; `1` LADDER3 (30 % / 30 % / 40 % sur [0, 40 000), [40 000, 100 000), [100 000, 161 200]) | figé |
| offre | 10⁹ × 10¹⁸, **non paramétrable** | — |
| frais de base | 1 % (`BASE_FEE_BPS` = 100), **non paramétrable** ; frais LP du pool = 0 | figé |
| `creatorTaxBps` | 0 à 500 | **baisse seulement** (`lowerTax`) |
| `split` (créateur, stakers, LP, rachat-burn) | somme = 10 000 | la part créateur ne peut que **passer aux détenteurs** (`shiftCreatorSplit`) |
| `snipe.startBps` / `snipe.secs` | 0 à 9 000 / 0 à 120 s ; linéaire jusqu'à 0, **achats seulement**, **aucune exemption** ; la surtaxe va au seau LP | **baisse seulement** (`lowerSnipe`) |
| `limits` (par échange, par seconde, durée) | 0 ou 50 à 10 000 pb ; ≤ 3 600 s | **se relâchent seulement** (`relaxLimits`) |
| achat initial | ≤ 5 % de l'offre, `minTokensOut` obligatoire, jetons à l'appelant seulement ; il paie le frais de base et la taxe ; il a lieu avant l'ouverture, donc sans surtaxe | — |
| frais de lancement | `launchFeeWei`, `immutable`, en ETH, versé au trésor ; `msg.value` = frais + achat initial si la cotation est l'ETH, exactement | — |
| `alloc` vesting | ≤ 500 pb, cliff ≥ 30 j, durée 90 à 730 j | figé |
| `alloc` airdrop | ≤ 500 pb, racine Merkle, réclamation 7 à 180 j, reliquat **brûlé** ; hors pool ≤ 1 000 pb au total | figé |
| `feeRecipient` | non nul | **deux étapes + 72 h**, proposé par le destinataire actuel seulement, annulable ; aucun administrateur |
| staking | retrait après 24 h (`STAKE_MIN_SECONDS`) | — |
| rachat-burn | tranche bornée à 3 % de mouvement depuis le premier prix vu dans la seconde (`MAX_IMPACT_BPS` = 300) | — |

Chaque borne porte en commentaire la mesure du rapport V5 (§4.9) ou la décision qui l'a fixée.
Celles qui n'ont **pas** de mesure le disent : le découpage LADDER3, le mur LP sur 20 000 ticks et
le plafond d'achat initial de 5 %.

### Écarts assumés par rapport aux pseudo-interfaces du rapport (§4.4)

- **Quatre seaux au lieu de cinq.** Les frais sont pris en cotation, et brûler de l'ETH n'a aucun
  effet pour les détenteurs. « burn » et « rachat-burn » sont donc le même geste (acheter le jeton
  et le brûler), fusionnés dans `buyback`.
- **Les limites se relâchent seulement.** Le §4.3 dit « baisse seulement », mais durcir une limite
  après le lancement permettrait au créateur d'empêcher les achats. La fonction s'appelle donc
  `relaxLimits` : plafond plus haut ou supprimé, durée plus courte.
- **Frais de lancement en ETH seulement**, sans variante $SWOGE brûlé. Il y a un seul chemin, comme
  dans le jumeau V4 WETH.
- **`initialBuy` est un champ explicite**, aussi en ERC-20. Il est prélevé par `transferFrom` dans
  la transaction de lancement, et le créateur doit avoir fait `approve` au noyau.
- **`getTokenInfo` est plus court.** Les montants en attente se lisent à leur source :
  `hook.getPending(poolId)`, `hook.feesTaken(poolId)`, `holders.buckets(token)`,
  `holders.owed(compte, devise)` et `holders.stakePools(token)`.
- **Le vesting va toujours au créateur** (l'appelant du lancement), même après un changement de
  destinataire des frais.
- **Le rachat-burn et le mur LP paient les frais du hook.** Il n'existe aucune exemption, même
  pour les modules de SWOGE.

## La liste des monnaies de cotation (figée au constructeur)

**Décision du propriétaire (18/10/2026) :** ETH, USDG, $SWOGE et **toutes** les actions tokenisées
de Robinhood (« SpaceX, Nvidia, et il y en a d'autres — propose-les toutes »). La liste est figée
au déploiement : aucune fonction ne peut ajouter ni retirer une monnaie.

**198 monnaies : ETH, USDG, $SWOGE et 195 actions sur 195. Aucune exclusion.**

- La source est le registre officiel `https://api.robinhood.com/rhj/assets`. Le 18/10/2026, il
  listait 195 actions, toutes `ASSET_STATUS_ACTIVE`, chacune avec un déploiement sur la chaîne
  4663, et toutes à 18 décimales.
- `script/genere_cotations.js` relit chaque adresse sur la chaîne, en lecture seule
  (`eth_getCode`, `eth_getStorageAt`, `eth_call`) :
  - le code est présent (283 octets, un proxy *beacon*) ;
  - le beacon est le même pour les 195 (`0xe10b6f6B…1b00`), et son implémentation est
    `0xb35490d6…5aE2`, celle qui a été lue (voir « Le multiplicateur ») ;
  - `symbol()` et `decimals()` sont égaux au registre : 195 sur 195, aucun écart ;
  - aucune action n'est en pause, et le PoolManager n'est pas bloqué par le registre d'accès.
- Le générateur écrit `script/cotations_v5.json` (bloc 91 768 851). `DeployV5.s.sol` lit ce
  fichier et relit chaque adresse avant de diffuser quoi que ce soit. `test/ForkCotationsV5.t.sol`
  rejoue les mêmes vérifications sur fork.
- **Une seule action posait problème : SATS (EchoStar).** Robinhood n'a pas de cours pour SATS
  (`missing_instruments`), car l'instrument est coté sous **ECHO**. Le jeton, lui, s'appelle
  toujours SATS. Le générateur cherche donc un instrument actif dont le nom simple est exactement
  « EchoStar », et il prend son cours. Le champ `symboleCours` de la liste le note.
- Une adresse qui échouerait à une vérification serait **exclue**, avec sa raison dans `exclues`.
  Le noyau refuse de toute façon une adresse sans code, un doublon ou une liste de plus de
  255 monnaies (la limite de l'indice `uint8`).

| Indices | Monnaies | Tick de référence (FDV d'ouverture ≈ 1 ETH) |
|---|---|---|
| 0 | ETH natif, `address(0)` | −207 200 (le départ de V4) |
| 1 | USDG `0x5fc5360D…d168`, **6 décimales** | −405 600 |
| 2 | $SWOGE `0x8a166Fb4…F817` | −20 600 |
| 3 à 197 | les 195 actions, par ordre alphabétique (AAOI … ZS) ; SPCX = 166, NVDA = 118 : lire `symbols` | de −203 400 (TE, 2,61 $) à −139 000 (ASML, 1 640 $) |

### Le prix de départ : une référence par monnaie, et un décalage borné choisi par le lanceur

Avec cinq monnaies, chaque tick de départ était écrit à la main. Avec 198, ce n'est plus possible,
et deux choses vieillissent mal : les prix bougent après le déploiement, et une référence peut
être fausse (un cours périmé, un multiplicateur mal lu). Sans administrateur, personne ne peut
corriger. La solution retenue a deux parties :

1. **Une référence par monnaie, calculée par le générateur le jour du déploiement.** C'est
   l'ouverture à environ 1 ETH de FDV, comme V4. Pour une action, le prix d'un jeton brut vaut
   `cours de l'action × uiMultiplier()`, puisqu'un jeton brut représente `uiMultiplier` actions.
   Les cours viennent de `api.robinhood.com/quotes` (dernier cours, séance étendue comprise) ;
   l'ETH, USDG et $SWOGE de DexScreener. Ce jour-là : ETH 2 413,23 $.
   Formule : `tick = round(ln(FDV_cotation / 10⁹ × 10^(déc_cotation − 18)) / ln(1,0001) / 200) × 200`.
2. **Le lanceur peut s'en écarter** de `startShift`, un multiple de 200 avec |x| ≤ 23 000 ticks
   (1,0001^23 000 ≈ 9,97). L'ouverture va donc d'environ 0,1 à environ 10 ETH de FDV. La page
   envoie 0 par défaut, et le décalage est publié dans `LaunchedV5.startTick`.
   - Le constructeur refuse toute référence dont la plage, **décalage maximal compris**, sortirait
     des ticks utilisables : |référence| + 23 000 + 161 200 ≤ 887 200. Aucun lancement ne peut
     tomber hors des ticks.

Ce que le lanceur peut en faire, et ce que ça coûte :

- **Ouvrir bas (jusqu'à ÷10).** Les premiers acheteurs paient moins cher. Le créateur aussi, mais
  son achat initial reste plafonné à 5 % de l'offre, et il paie le frais de base et la taxe. Les
  snipers profitent davantage d'une ouverture basse : l'anti-snipe du créateur est fait pour ça.
  Le protocole n'y perd rien : les frais sont un pourcentage de la cotation échangée, et la
  comptabilité des seaux ne dépend pas du prix.
- **Ouvrir haut (jusqu'à ×10).** La liquidité est d'un seul côté (le jeton seul) : une FDV
  d'ouverture élevée n'est qu'un chiffre affiché tant que personne n'a acheté. Le plafond ×10
  empêche d'afficher une capitalisation fantaisiste (1 000 ETH de FDV sans un wei dans le pool).
  **La page doit afficher la FDV d'ouverture réelle et la cotation dans laquelle elle est
  exprimée.**
- **Aucun gain de manipulation pour un tiers :** le départ est fixé dans la transaction du
  lancement, avant l'ouverture du pool, et personne d'autre que l'appelant ne le choisit.
- **Le facteur 10 n'a pas de mesure derrière lui**, comme le départ à 1 ETH. Il est figé au
  déploiement.

### Le multiplicateur des actions Robinhood : verdict « sûr, sous conditions »

La question : `balanceOf` ou `totalSupply` changent-ils quand Robinhood change le multiplicateur ?
Un jeton qui *rebase* casserait la comptabilité du PoolManager v4, qui suppose qu'un solde ne bouge
que par un transfert. Les pools deviendraient insolvables, ou quelqu'un pourrait voler la
différence.

**Réponse : non. Le multiplicateur ne sert qu'à l'affichage. Les soldes, l'offre et les transferts
sont en unités brutes, et le multiplicateur ne les touche jamais.** Les preuves, relevées le
18/10/2026 :

1. **Le code source vérifié.** L'implémentation `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2` est
   vérifiée sur Sourcify en `exact_match` (création et runtime) : `src/Stock.sol` et
   `src/ERC20ScaledUIUpgradeable.sol`, sur `ERC20Upgradeable` d'OpenZeppelin.
   - `balanceOf` et `totalSupply` ne sont **pas** surchargés : ce sont ceux d'OpenZeppelin, qui
     lisent `_balances` et `_totalSupply`.
   - `_update` appelle `super._update(from, to, value)` sans rien changer, puis émet seulement
     `TransferWithScaledUI(from, to, value, value × multiplicateur)`.
   - Le multiplicateur (`_multiplier`, `_newMultiplier`, `_effectiveAt`, à l'emplacement
     ERC-7201 `robinhood.storage.ERC20Rebase`) n'est lu que par `uiMultiplier()`,
     `balanceOfUI()` et `totalSupplyUI()`.
   - `updateMultiplier(m)` et `updateMultiplier(m, effectiveAt)` n'écrivent que ces trois
     variables. Ils exigent `MULTIPLIER_UPDATER_ROLE` et que le jeton ne soit pas en pause.
2. **La chaîne.** Pour CRM, la mise à jour du multiplicateur (1 → 1,001148…) a eu lieu au bloc
   65 383 603, alors que le jeton circulait déjà depuis le bloc 35 516 560. Pourtant
   `totalSupply()` = Σ mints − Σ burns des événements `Transfer` **au wei près**
   (121 011 499 750 000 000 000), et `totalSupplyUI / totalSupply` = 1,001148. GE donne le même
   résultat (mise à jour au bloc 80 347 805, offre = mints − burns au wei près). CRWD a un
   multiplicateur de 4, programmé avant le premier transfert.
3. **Les marchés.** SGOV, qui accumule ses dividendes dans le multiplicateur (1,007187), cote sur
   DexScreener 101,28 $. C'est le cours × multiplicateur (101,30 $), et non le cours seul
   (100,58 $). Le prix d'un jeton **brut** est donc bien `cours × uiMultiplier`, et c'est ce prix
   que le générateur utilise.
4. **Le fork local** (`test_fork_multiplier_update_keeps_v5_pool_solvent`). On lance un pool V5
   coté en NVDA, et deux comptes achètent. Puis on impersonne, **dans le fork seulement**,
   `0x92905e8d…8143`, le compte qui détient `MULTIPLIER_UPDATER_ROLE` sur la chaîne (c'est
   l'expéditeur de la mise à jour de CRM). Ce compte double le multiplicateur. Résultat :
   - `balanceOf(PoolManager)`, `totalSupply()`, le solde d'un détenteur et les créances ERC-6909
     de Holders sont **inchangés**, et seul `balanceOfUI` double ;
   - la même vente, faite avec et sans la mise à jour, donne le **même `BalanceDelta` au wei près** ;
   - une mise à jour programmée (`effectiveAt` dans 1 h), suivie du passage de l'heure, ne change
     rien non plus ;
   - tout le monde sort, chaque retrait passe, et le PoolManager garde au moins le solde NVDA qu'il
     avait avant le lancement (les autres pools v4 sont intacts).

**Les conditions, c'est-à-dire ce que Robinhood peut faire et qu'aucun code de V5 ne peut empêcher :**

- **Changer l'implémentation.** Le beacon est à Robinhood (`BEACON_UPGRADER_ROLE`). Une future
  implémentation pourrait rebaser. Le verdict vaut pour `0xb35490d6…5aE2` seulement. Le générateur
  et le script de déploiement exigent cette implémentation le jour du déploiement, mais rien ne
  l'impose ensuite.
- **Mettre en pause** un jeton (`TOKEN_PAUSER_ROLE`) ou **les 195 d'un coup** (`pause()` du
  registre d'accès, qui est aussi le beacon). Tout transfert, `approve` et `permit` échoue alors :
  les pools de cette monnaie sont gelés, sans achat, sans vente et sans retrait. L'essai
  `test_fork_pause_freezes_pool_and_claims_survive` le montre (erreur `IsPaused()`). Les créances
  restent comptées, et tout repart quand la pause est levée.
- **Bloquer une adresse** (`BLOCKER_ROLE`, registre commun aux 195 actions) : un portefeuille, le
  routeur, Holders ou **le PoolManager lui-même**. Si le PoolManager est bloqué, tous les pools v4
  de toutes les actions sont gelés sur la chaîne. Les restrictions régionales de Robinhood passent
  par ce blocage : un acheteur d'une région exclue ne pourra ni acheter ni retirer.
- **Brûler n'importe quel solde** (`adminBurn`, `ADMIN_BURNER_ROLE`, sans condition de pause ni de
  blocage), y compris celui du PoolManager. Le PoolManager tient **un seul solde par devise pour
  tous ses pools** : un `adminBurn` sur lui rendrait tous les pools de cette action insolvables.
  Les derniers à retirer perdraient la différence. C'est le même risque qu'avec USDG (proxy
  ERC-1967 à administrateur).
- **Frapper** (`mint`, `MINTER_ROLE`) : cela ne touche pas les pools.
- **Le multiplicateur reste l'affaire de la page.** Une division 2 pour 1 double
  `uiMultiplier` : le prix du jeton brut ne bouge pas, mais le cours de l'action est divisé par
  deux. La page doit afficher les montants en actions (`balanceOfUI`, ou brut × `uiMultiplier`)
  et lire `uiMultiplier()` en direct. Elle ne doit jamais comparer le prix brut du pool au cours
  de l'action sans multiplier.
- **CRWD** a un multiplicateur de 4 sans marché sur la chaîne pour le recouper : sa référence
  (905 $ le jeton brut) suit la règle `cours × multiplicateur`. Si cette lecture était fausse, le
  décalage de ±23 000 ticks (facteur 10) couvrirait l'écart de 4 (13 863 ticks).

### Autres adresses vérifiées

- **Vérifié mais non retenu :** le WETH `0x0Bd7D308…AD73` (proxy, `WETH`, 18). En v4, l'ETH natif
  le remplace. Le PositionManager v4 `0x58daec31…04fa7` (`poolManager()` = le PoolManager,
  `permit2()` = `0x0000…22D473…8BA3`) n'est pas utilisé non plus : V5 n'a pas de NFT de position.
- **Uniswap v4 :** le PoolManager est `0x8366a39CC670B4001A1121B8F6A443A643e40951` (24 009 octets,
  adresse de `miroir.js`). Le PositionManager le désigne, et le banc sur fork l'a utilisé de bout
  en bout. Le StateView et l'UniversalRouter ne sont pas appelés par les contrats. Pour la page, le
  routeur que `miroir.js` éprouve est `0x8876789976dEcBfCbBbe364623C63652db8C0904` (24 546 octets).

## Correspondance GoPlus (champs « token security »)

Le jeton est le même ERC-20 nu que V4, prouvé par `test/GoPlusV5.t.sol` sur le bytecode réel d'un
jeton lancé. Ce n'est pas un verdict de GoPlus : seul leur service le rend, après déploiement.

| Champ GoPlus | Ce qui le satisfait | Preuve dans les essais |
|---|---|---|
| `is_mintable` | offre créée une fois dans le constructeur, aucun `mint` | sélecteurs : seulement l'ERC-20 et `owner()` ; offre constante après des échanges |
| `owner_address` | `owner` est une variable à zéro | `owner() == 0` |
| `can_take_back_ownership` | aucune fonction d'ownership | `transferOwnership`, `renounceOwnership` et `setOwner` sont absents |
| `hidden_owner` | `owner` est une **variable** (`view`) annoncée par `OwnershipTransferred(0, 0)`. Mesure V4 du 30/09 : une constante `pure` donnait « hidden_owner: 1 » | événement vérifié |
| `selfdestruct` | aucun opcode `SELFDESTRUCT` | balayage des opcodes |
| `external_call` | aucun `CALL` ni `STATICCALL` | balayage des opcodes |
| `is_proxy` | aucun `DELEGATECALL`, pas de proxy | balayage des opcodes |
| `transfer_pausable` | aucun `pause` / `unpause`, aucune condition hors solde et adresse zéro | sélecteurs |
| `is_blacklisted` / `is_whitelisted` | aucune liste | sélecteurs |
| `slippage_modifiable` / `personal_slippage_modifiable` | aucune taxe dans le jeton, aucun setter | sélecteurs ; transfert reçu = envoyé |
| `trading_cooldown` | aucun `TIMESTAMP` ni `NUMBER` dans le jeton | balayage des opcodes |
| `buy_tax` / `sell_tax` (jeton) | 0 : un transfert entre portefeuilles ne prélève rien | transfert de tout le solde, reçu = envoyé |
| `is_anti_whale` / `anti_whale_modifiable` | aucun plafond dans le jeton (pas de `ORIGIN`, pas de max par portefeuille) | balayage des opcodes |
| `cannot_buy` | le jeton ne filtre rien ; les seules limites vivent dans le hook (≤ 1 h, ne peuvent que se relâcher) | — |
| `cannot_sell_all` | vendre tout le solde dans le pool passe | essai de vente totale |
| `owner_change_balance` | aucune fonction qui touche un solde tiers | sélecteurs |
| LP verrouillée | position du PoolManager au nom du noyau, sans fonction de retrait ; le hook refuse tout retrait | essais de retrait refusés. **GoPlus ne sait peut-être pas lire une LP v4 sans NFT** : à vérifier après déploiement |

**La taxe n'est pas cachée.** La taxe créateur et la surtaxe anti-snipe existent. Elles vivent dans
le hook, se lisent par `currentFees(token)` et sont annoncées dans `LaunchConfig` et `FeeTaken`.
Un scanner qui lit le pool (et non le jeton) peut afficher la taxe : c'est voulu. La page doit
montrer la taxe et la fenêtre en tête de fiche (§4.8).

## Compatibilité V4

- Les événements `Created`, `Meta` et `FeesCollected` gardent les mêmes signatures.
- `instant(address)` garde la même signature : `exists` et `creator` sont remplis, `pool = 0`,
  `lpTokenId = 0`.
- `tokenCount()` est inchangé.

## Essais

Les outils sont hors dépôt : Foundry 1.5.1-stable (`b0a9dd9c`), solc 0.8.26, v4-core
`v4.0.0` (`e50237c4`, avec son solmate `4b47a190`) et forge-std `v1.16.2` (`bf647bd6`). Le
`foundry.toml` utilisé :

```toml
[profile.default]
src = "contrats/v5/src"
test = "contrats/v5/test"
script = "contrats/v5/script"
libs = ["lib"]
solc_version = "0.8.26"
evm_version = "cancun"
optimizer = true
optimizer_runs = 200
via_ir = true
remappings = ["v4-core/=lib/v4-core/", "solmate/=lib/v4-core/lib/solmate/", "forge-std/=lib/forge-std/src/"]
fs_permissions = [{ access = "read", path = "contrats/v5/script" }]   # cotations_v5.json
[fuzz]
runs = 512
```

```bash
node contrats/v5/script/genere_cotations.js            # lecture seule : registre + chaine + cours -> cotations_v5.json
forge test                                             # 55 essais locaux (unitaires, fuzz, GoPlus, longue liste), fork sauté
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545    # fork LOCAL, aucune signature
forge test --fork-url http://127.0.0.1:8545 --match-contract "ForkV5|ForkCotationsV5"   # 9 essais contre la vraie chaine
```

Résultats du 18/10/2026 :

- **Local :** 55 réussis, 0 échec, 9 sautés (ceux du fork), code de sortie 0, avec
  `FOUNDRY_FUZZ_RUNS=2000`.
- **Fork :** 9 réussis, 0 échec, code de sortie 0. Le fork part du bloc 91 771 930. Le lancement
  en ETH avec achat initial coûte 1 171 545 de gaz L2 (+748 pour la vérification de `startShift`).
- **Script de déploiement :** il a tourné sur le même fork **local** avec les 198 monnaies, avec un
  compte impersonné (`--unlocked`, aucune clé). Le relevé du RPC public montre 0 octet de code à ces
  adresses. Gaz des cinq transactions :

  | Transaction | Gaz (5 monnaies, avant) | Gaz (198 monnaies) |
  |---|---|---|
  | déployeur CREATE3 | 271 845 | 271 845 |
  | hook | 2 053 271 | 2 053 271 |
  | **noyau** | 5 261 226 | **10 974 976** |
  | Holders | 2 363 135 | 2 429 770 |
  | Alloc | 814 346 | 814 346 |

  Le noyau coûte environ 26 000 de gaz par monnaie : une adresse en stockage, un tick, la lecture
  du code et l'ensemble transitoire anti-doublon. Avec les 198 adresses réelles, son constructeur
  seul coûte 10 837 720 de gaz. Robinhood Chain est une chaîne Arbitrum Orbit à 32 M de gaz par
  bloc : la marge est large.

Ce que couvrent les essais :

- le partage 75/25 exact (fuzz) ;
- la taxe toujours ≤ 5 % (fuzz) ;
- l'anti-snipe linéaire et sans exemption (créateur compris), monotone (fuzz) ;
- l'achat du créateur dans la même transaction (ETH et ERC-20), plafond de 5 % et `minTokensOut` ;
- les huit formes d'échange (quatre formes × deux ordres de devises) ;
- les plafonds par échange et par seconde ;
- la LP impossible à retirer et l'ajout par un tiers refusé ;
- l'initialisation par un tiers refusée ;
- chaque cliquet dans les deux sens, le sens interdit échouant ;
- le destinataire en deux étapes avec 72 h de délai et l'annulation ;
- chaque monnaie de cotation, y compris USDG à 6 décimales ;
- LADDER3 dans les deux ordres ;
- la distribution, les retraits, le staking avec 24 h de délai, le rachat-burn sous sandwich et le
  mur LP reporté sous manipulation ;
- le vesting, l'airdrop et le balayage brûlé ;
- la réentrance par un jeton de cotation et par un receveur d'ETH ;
- les échanges de poussière ;
- une suite aléatoire avec ses invariants : somme des seaux = frais pris, solvabilité des créances
  à l'arrondi près, offre fixe ;
- la longue liste (`test/CotationsV5.t.sol`) : 198 et 255 monnaies acceptées, 256 refusées ; un
  doublon refusé où qu'il soit (indices 3 et 190, ETH deux fois) ; une adresse sans code refusée
  à l'indice 150 ; un tick de référence trop près du bord refusé au déploiement, décalage maximal
  compris ; un lancement sur la **dernière** monnaie (indice 197) qui s'échange et paie ;
- le départ choisi : un décalage hors bornes refusé avec son message ; le pool ouvert exactement
  au tick demandé dans les deux ordres de devises ; fuzz sur tout décalage permis et sur chaque
  monnaie (achat, vente, créances = frais pris) ;
- sur fork (`test/ForkCotationsV5.t.sol`) : les 198 adresses réelles relues (code, `symbol()`,
  `decimals()`, beacon, implémentation, pause) ; le noyau déployé avec elles ; des lancements en
  CRWD (multiplicateur 4), TE (l'action la moins chère) et ASML (la plus chère), avec un décalage
  de 0, +23 000 et −11 600 ticks, puis échanges et retraits ; la mise à jour du multiplicateur par
  le vrai détenteur du rôle (impersonné dans le fork) ; la pause d'une action. **Aucune action
  n'a de décimales inhabituelles** : les 195 sont à 18. Les 6 décimales sont couvertes par USDG
  (`ForkV5`, dans les deux ordres de devises).

## Ce qui n'est PAS fait

- **Aucun audit externe.** Il est obligatoire et bloquant (§4.7), de préférence deux équipes qui
  ont déjà audité des hooks v4.
- **Aucun déploiement**, ni sur le réseau principal ni sur un réseau de test.
- Rien n'est modifié dans `lance_v4.js` ni le serveur (§4.8). `launchpad.html` porte une section V5
  **inerte** tant que `contrats/v5/adresses_v5.json` n'existe pas (voir « La page de déploiement »).
- Pas de vérification Sourcify, pas de bug bounty.
- Les mesures de §4.9 manquent encore :
  - la part de l'offre achetée au premier bloc sur les V4 de SWOGE ;
  - la distribution des taxes de Pons ;
  - la distribution des achats initiaux ;
  - les paires des lancements Pons.
- Le banc Node `banc_fork_v5*.js` n'est pas écrit : son rôle est tenu ici par le fork Foundry.

## Déployer — procédure du propriétaire, depuis son propre portefeuille

Le déploiement n'est fait qu'après l'audit. Le portefeuille du propriétaire signe cinq
transactions. Aucune clé ne passe par le dépôt, le serveur ou une variable d'environnement : la
signature se fait sur le matériel ou dans le portefeuille.

1. **Régénérer la liste** le jour même : `node contrats/v5/script/genere_cotations.js`. Le script
   relit le registre Robinhood, la chaîne et les cours, puis réécrit `script/cotations_v5.json`.
   Lire les lignes `EXCLUE` et le champ `exclues`. Si une action a changé d'implémentation,
   le générateur l'exclut : il faut alors relire la nouvelle implémentation avant de décider.
2. **Relancer** `forge test`, puis le banc sur fork local avec `ForkCotationsV5`. Tous les essais
   doivent être verts. `DeployV5.s.sol` relit lui-même chaque adresse (code, `symbol()`,
   `decimals()`) avant de diffuser.
3. **Répétition sur fork local**, avec le compte du propriétaire impersonné :

   ```bash
   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
   cast rpc anvil_impersonateAccount <PROPRIETAIRE> --rpc-url http://127.0.0.1:8545
   V5_OWNER=<PROPRIETAIRE> V5_TREASURY=<TRESOR> V5_LAUNCH_FEE_WEI=500000000000000 \
     V5_COTATIONS=contrats/v5/script/cotations_v5.json \
     forge script contrats/v5/script/DeployV5.s.sol:DeployV5 --rpc-url http://127.0.0.1:8545 \
     --broadcast --unlocked --sender <PROPRIETAIRE> --slow
   ```

   Le script affiche les cinq adresses et vérifie le câblage.
4. **Déploiement réel.** C'est la même commande, avec `--rpc-url https://rpc.mainnet.chain.robinhood.com`,
   sans `--unlocked`, et avec le portefeuille matériel du propriétaire (`--ledger` ou `--trezor`,
   `--sender <PROPRIETAIRE>`). Les adresses sont celles de la répétition **à condition** d'utiliser
   le même déployeur CREATE3. Si `V5_DEPLOYER` n'est pas donné, le script en crée un, dont
   l'adresse dépend du nonce du portefeuille.
5. **Vérifier chaque module sur Sourcify** (`exact_match`), avec les réglages ci-dessus.
6. **Faire un premier lancement de contrôle.** Ensuite seulement, commiter
   `contrats/v5/adresses_v5.json` : la section V5 de `launchpad.html` s'allume en le lisant.

### La page de déploiement (18/10/2026) : `v5_deploy.html`

Les étapes 3 et 4 peuvent aussi se faire **dans le navigateur**, sans Foundry : `v5_deploy.html`
(hors moteurs, hors menus) fait ce que fait `DeployV5.s.sol`, transaction par transaction, chacune
signée par le portefeuille du propriétaire. La page ne voit aucune clé.

- Elle charge `contrats/v5/build/v5_artefacts.json` (code d'init, ABI, code déployé, place des
  `immutable`, métadonnées du compilateur — rien de secret) et `script/cotations_v5.json`. Elle
  affiche la taille et la date de la liste, et **avertit au-delà de 24 h**, avec la commande.
- Elle relit les 197 jetons de la liste sur la chaîne (code, `symbol()`, `decimals()`), comme
  `DeployV5.quoteList()`, avant d'autoriser le noyau.
- Elle mine le sel du hook dans un Web Worker (`v5_mineur.js`) : le même calcul et **le même premier
  sel** que `HookMiner` (vérifié contre `forge script MineHookSalt.s.sol`).
- Avant chaque transaction : gaz estimé (`eth_estimateGas`), coût en ETH et en dollars au prix du
  gaz lu (`eth_gasPrice`). La progression (adresses, empreintes de transaction, sel) est gardée dans
  `localStorage` : on peut fermer la page et reprendre.
- Après chaque transaction, elle relit le contrat : code identique au code compilé (octet pour
  octet, `immutable` masqués), chaque `immutable`, `CREATOR_SHARE_BPS` = 7 500,
  `MAX_CREATOR_TAX_BPS` = 500, 198 monnaies égales à la liste, drapeaux `0x2ACC`.
- À la fin, elle affiche le contenu de `contrats/v5/adresses_v5.json`, à copier et commiter.

Les artefacts se régénèrent après tout changement d'une source (l'essai `v5_deploy_page.test.js`
tombe sinon, et donne la commande) :

```bash
forge build --root <racine>            # le foundry.toml ci-dessus, sources sous contrats/v5/src
node contrats/v5/script/artefacts_v5.js <racine>/out
```

Essais (fork anvil **local**, comptes neufs impersonnés, aucune clé) : `v5_deploy_page.test.js`
(les cinq transactions par la page, relues) et `launchpad_v5.test.js` (section éteinte sans le
fichier ; bornes de la page = refus du contrat, mot pour mot ; un lancement en ETH et un en CRWD,
action au multiplicateur 4, achat saisi en actions). `ANVIL=<chemin d'anvil>` si anvil n'est pas
dans le `PATH`.

**Les comptes par défaut d'anvil ne conviennent pas aux essais sur fork :** le 18/10/2026, les cinq
premiers portent sur Robinhood Chain une délégation EIP-7702 (`0xef0100…`) vers un balayeur qui
renvoie tout l'ETH reçu. Un trésor pris parmi eux ne garde pas le frais de lancement.

Le trésor doit pouvoir recevoir de l'ETH : il reçoit le frais de lancement par `call` dans
`createToken`, et il retire ses 25 % par `withdraw`.

## Risques ouverts, pour les auditeurs externes

1. **Un hook défectueux gèle tous les pools V5 pour toujours.** Sans administrateur, personne ne
   peut réparer, et la seule parade est un V5.1 vers lequel les pages basculent.
   - À vérifier : les deltas de retour dans les huit formes d'échange ;
   - l'arrondi de `_charge` ;
   - le dépassement de `uint128` dans les seaux ;
   - `Window.bought` en `uint96`.
2. **Frais pris avant l'échange sur une entrée exacte.** Si un échange s'arrête sur sa limite de
   prix (exécution partielle), le frais est payé sur la part non exécutée. C'est la même limite
   que dans tout hook qui prélève en `beforeSwap`. Le rachat-burn s'arrête souvent sur sa limite :
   une partie de son frais repart dans les seaux.
3. **Le rachat-burn et le mur LP se manipulent d'une seconde à l'autre.** Le prix de référence est
   le premier vu dans la seconde (`block.timestamp`, environ dix blocs L2). Un attaquant peut
   gonfler le prix dans une seconde et appeler le rachat ou `distribute` dans la suivante, ce qui
   l'expose à l'arbitrage entre les deux. Le gain est borné par la taille des seaux moins deux
   allers-retours de frais. Il n'y a pas de TWAP.
4. **Staking éclair.** Les récompenses sont créditées au prorata au moment de `distribute`, qui est
   ouvert à tous. Le délai de 24 h ne fait qu'exposer l'attaquant au prix. La récolte est plafonnée
   à `unpaid` : un compte peut perdre 1 wei d'arrondi, jamais le contrat.
5. **Monnaies de cotation à administrateur : 196 sur 198.**
   - USDG est un proxy ERC-1967.
   - Les 195 actions partagent un seul beacon, qui sert aussi de registre d'accès. Robinhood peut
     changer leur implémentation, les mettre en pause une par une ou toutes ensemble, bloquer
     n'importe quelle adresse (PoolManager, Holders, un acheteur d'une région exclue), et brûler
     n'importe quel solde (`adminBurn`), y compris celui du PoolManager. Le détail et les preuves
     sont dans « Le multiplicateur ».
   - La liste étant figée, retirer une action demande un V5.1. Le propriétaire a décidé de toutes
     les garder (18/10/2026).
   - **Les pools d'une action peuvent être gelés pour toujours** si Robinhood bloque le PoolManager
     ou cesse de soutenir l'action (rachat de la société, retrait de la cote). La page doit le dire
     en tête de fiche, pour chaque lancement coté en action.
   - **Les conditions d'accès de Robinhood aux actions tokenisées s'appliquent** (pays éligibles,
     `terms()` = `https://robinhood.com/stocktoken/rhj`). Un acheteur d'une région exclue peut être
     bloqué au niveau du jeton. Ce point est à faire valider juridiquement avant d'ouvrir les
     lancements cotés en action (§4.7).
6. **Collision CREATE2.** Relancer avec le même sel et le même appelant échoue en consommant tout
   le gaz (comportement de CREATE2). La page doit tirer un sel aléatoire.
7. **Gaz du premier échange de chaque seconde.** Il paie une lecture de `slot0` et deux écritures
   pour le prix de référence. À mesurer sur la chaîne.
8. **Agrégateurs et scanners.** La taxe dynamique fausse les devis : `currentFees(token)` est
   publiée pour eux. Un pool taxé peut être noté « tax token » ou « honeypot » par un scanner qui
   lit le pool. GoPlus ne sait peut-être pas lire une LP v4 sans NFT.
9. **Seuils sans mesure** (§4.9) :
   - les 5 % d'achat initial ;
   - le découpage LADDER3 ;
   - les 20 000 ticks du mur LP ;
   - la FDV d'ouverture d'environ 1 ETH dans chaque monnaie, et le décalage de ±23 000 ticks
     (facteur 10) laissé au lanceur ;
   - les défauts anti-snipe.

   Tous seront figés au déploiement.
10. **Le vesting est versé au créateur d'origine**, même après une reprise par la communauté.
    C'est un choix à confirmer.
11. **Dividendes aux détenteurs** (seau stakers) : la qualification réglementaire n'a pas été
    validée (§4.7).
12. **Le déployeur CREATE3 est maison** (le motif Solady / 0xSequence). Son calcul d'adresse est
    vérifié par les essais (adresse prédite = adresse obtenue), mais il n'est pas audité.
    CreateX existe sur la chaîne (`0xba5Ed099…ba5Ed`, 11 838 octets) et peut le remplacer.
