# SWOGE V5 — launchpad sur Uniswap v4, sans propriétaire

Sources Solidity, essais Foundry et scripts de SWOGE V5, d'après le cahier des charges du
rapport V5 du 16/10/2026 (§4) et les décisions du propriétaire du 18/10/2026.

**État : écrit et testé en local, ni audité ni déployé.** Aucune transaction n'a été signée ni
envoyée sur une chaîne réelle. Le banc sur fork a tourné contre un fork anvil **local** de
Robinhood Chain.

## Architecture : un noyau et trois modules figés

| Contrat | Rôle | Runtime (octets) | Marge EIP-170 |
|---|---|---|---|
| `SwogeLaunchpadV5` (noyau) | bornes, jeton CREATE2, `unlock` : initialize + liquidité d'un seul côté + achat du créateur ; registre, métadonnées, cliquets, destinataire en deux étapes, vues, compatibilité V4 | 22 906 | 1 670 |
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
| `quote` | indice dans la liste figée au déploiement | figé |
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

Chaque adresse a été relue sur Robinhood Chain (4663) le 18/10/2026 au bloc ≈ 91 710 000 :
`eth_getCode`, `symbol()` et `decimals()`. Le RPC était `rpc.mainnet.chain.robinhood.com`, en
lecture seule. Les mêmes vérifications sont rejouées dans `test/ForkV5.t.sol`.

| Indice | Monnaie | Adresse | Vérification | Tick de départ (FDV ≈ 1 ETH) |
|---|---|---|---|---|
| 0 | ETH natif | `address(0)` | — | −207 200 (le départ de V4) |
| 1 | USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | code 170 octets (proxy ERC-1967) ; `USDG` ; **6 décimales** ; rapport V5 §1 | −405 600 |
| 2 | $SWOGE | `0x8a166Fb41Cd659a0a43396272FF73973Ce29F817` | code 12 226 octets ; `SWOGE` ; 18 ; même adresse que `compile_v4.js` | −20 600 |
| 3 | SPCX | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | registre officiel `api.robinhood.com/rhj/assets` (chainId 4663, `ASSET_STATUS_ACTIVE`) ; code 283 octets (proxy *beacon* `0xe10b6f6b…1b00`) ; `SPCX` ; 18 | −179 000 |
| 4 | NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | même registre, même beacon ; `NVDA` ; 18 | −183 000 |

- Le tick est celui du prix « cotation par jeton » en unités brutes, arrondi à 200. Il est calculé
  avec les prix DexScreener du 18/10/2026 à 11:18 UTC : ETH 2 415,87 $, $SWOGE 7,88e-9 ETH,
  SPCX 144,59 $, NVDA 213,70 $.
- **Il faut le recalculer le jour du déploiement.** Formule :
  `tick = round(ln(FDV_cotation / 10⁹ × 10^(déc_cotation − 18)) / ln(1,0001) / 200) × 200`.
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
[fuzz]
runs = 512
```

```bash
forge test                                   # 44 essais locaux (unitaires, fuzz, GoPlus), fork sauté
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545    # fork LOCAL, aucune signature
forge test --fork-url http://127.0.0.1:8545 --match-contract ForkV5     # 4 essais contre le vrai PoolManager
```

Résultats du 18/10/2026 :

- **Local :** 44 réussis, 0 échec, code de sortie 0, avec `FOUNDRY_FUZZ_RUNS=2000`.
- **Fork :** 4 réussis, 0 échec, code de sortie 0. Le fork part du bloc 91 728 420. Le lancement
  en ETH avec achat initial coûte 1 170 797 de gaz L2.
- **Script de déploiement :** il a tourné sur le même fork **local**, avec un compte impersonné
  (`--unlocked`, aucune clé). Le relevé du RPC public montre 0 octet de code à ces adresses.

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
  à l'arrondi près, offre fixe.

## Ce qui n'est PAS fait

- **Aucun audit externe.** Il est obligatoire et bloquant (§4.7), de préférence deux équipes qui
  ont déjà audité des hooks v4.
- **Aucun déploiement**, ni sur le réseau principal ni sur un réseau de test.
- **Aucune page de déploiement** : elle viendra plus tard.
- Rien n'est modifié dans `lance_v4.js`, `launchpad.html` ni le serveur (§4.8).
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

1. **Recalculer les ticks de départ** avec les prix du jour (formule ci-dessus) et les écrire
   dans `script/DeployV5.s.sol` (`quoteList()`).
2. **Relire chaque adresse** de `quoteList()` et `POOL_MANAGER` sur la chaîne : code, `symbol()`,
   `decimals()`. Pour les actions, vérifier aussi leur présence dans le registre Robinhood. Relancer
   `forge test` puis le banc sur fork local : tous les essais doivent être verts.
3. **Répétition sur fork local**, avec le compte du propriétaire impersonné :

   ```bash
   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
   cast rpc anvil_impersonateAccount <PROPRIETAIRE> --rpc-url http://127.0.0.1:8545
   V5_OWNER=<PROPRIETAIRE> V5_TREASURY=<TRESOR> V5_LAUNCH_FEE_WEI=500000000000000 \
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
6. **Faire un premier lancement de contrôle.** Ensuite seulement, ajouter V5 dans `LAUNCHPADS`
   (`lance_v4.js`), recalculer le marqueur de cache (`node cache_marqueur.test.js`) et l'écrire
   dans la page **et** dans `version.json`.

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
5. **Monnaies de cotation à administrateur.**
   - USDG est un proxy ERC-1967.
   - SPCX et NVDA sont des proxys *beacon*. Leur implémentation (`0xb35490d6…5ae2`, lue le 18/10) a
     `pause`, `isBlocked` (registre d'accès), `adminBurn`, `mint` et `updateMultiplier` (un
     multiplicateur d'affichage : `balanceOf` reste brut, `balanceOfUI` applique le multiplicateur).
   - Conséquence : l'émetteur peut geler ou brûler la cotation détenue par le PoolManager, ou
     bloquer Holders, et donc les pools V5 de cette cotation. La liste étant figée, retirer une
     action demande un V5.1. **C'est au propriétaire de décider s'il garde SPCX et NVDA.**
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
   - la FDV d'ouverture d'environ 1 ETH dans chaque monnaie ;
   - les défauts anti-snipe.

   Tous seront figés au déploiement.
10. **Le vesting est versé au créateur d'origine**, même après une reprise par la communauté.
    C'est un choix à confirmer.
11. **Dividendes aux détenteurs** (seau stakers) : la qualification réglementaire n'a pas été
    validée (§4.7).
12. **Le déployeur CREATE3 est maison** (le motif Solady / 0xSequence). Son calcul d'adresse est
    vérifié par les essais (adresse prédite = adresse obtenue), mais il n'est pas audité.
    CreateX existe sur la chaîne (`0xba5Ed099…ba5Ed`, 11 838 octets) et peut le remplacer.
