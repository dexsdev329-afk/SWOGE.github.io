// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/* ============================================================
   SWOGE V5 — TYPES PARTAGES ET CONSTANTES (18/10/2026)

   Tout ce qui borne un lancement vit ici, en `constant` : une valeur hors
   bornes fait echouer le lancement, et le message dit la borne. Aucune de
   ces valeurs ne peut changer apres le deploiement — il n'y a ni proprietaire
   ni setter dans V5. Changer une borne = un nouveau deploiement complet (V5.1).

   Chaque constante porte la mesure qui l'a decidee (rapport V5 du 16/10,
   §4.3 et §4.9) ou la decision du proprietaire avec sa date.
   ============================================================ */

/// Description du jeton, modifiable par le destinataire des frais (evenement MetadataUpdated).
struct TokenMeta {
    string description;
    string logo;
    string website;
    string twitter;
    string telegram;
}

/* La part CREATEUR des revenus (75 % du frais de base + toute la taxe createur)
   se repartit en quatre seaux. Le rapport (§4.4) en listait cinq : createur,
   burn, stakers, LP, rachat-burn. Les frais etant pris cote COTATION (ETH,
   USDG...), « burn » et « rachat-burn » sont le meme geste : acheter le jeton
   avec la cotation et le bruler. Bruler de l'ETH n'aurait aucun effet pour les
   detenteurs. Les deux seaux sont donc fusionnes dans `buyback`. Somme = 10 000. */
struct Split {
    uint16 creator;
    uint16 stakers;
    uint16 lp;
    uint16 buyback;
}

/// Surtaxe anti-snipe sur les ACHATS : startBps au lancement, puis lineaire jusqu'a 0 en `secs` secondes.
struct Snipe {
    uint16 startBps;
    uint16 secs;
}

/* Plafonds d'achat pendant `secs` secondes apres l'ouverture. 0 = desactive.
   Un « bloc » se compte en `block.timestamp` (une seconde) : sur Robinhood
   Chain (Arbitrum Orbit), `block.number` est le numero de bloc L1, partage par
   des dizaines de blocs L2 (0,10086 s par bloc mesure le 16/10). */
struct Limits {
    uint16 maxBuyPerSwapBps;
    uint16 maxBuyPerBlockBps;
    uint32 secs;
}

/// Allocations hors pool, prises sur l'offre avant l'amorce du pool.
struct Alloc {
    uint16 creatorVestBps;  // vesting du createur
    uint32 cliff;           // secondes
    uint32 duration;        // secondes
    uint16 airdropBps;      // airdrop Merkle
    bytes32 merkleRoot;
    uint32 claimSecs;       // duree de reclamation ; ensuite le reliquat est BRULE
}

struct LaunchParams {
    string name;
    string symbol;
    bytes32 salt;
    TokenMeta meta;
    uint8 quote;            // indice dans la liste figee au deploiement (0 = ETH natif)
    uint8 shape;            // 0 = SINGLE, 1 = LADDER3
    int24 startShift;       // decalage du prix de depart, en ticks, depuis la reference de la cotation (0 = reference)
    uint16 creatorTaxBps;
    Split split;
    Snipe snipe;
    Limits limits;
    Alloc alloc;
    address feeRecipient;
    uint256 initialBuy;     // montant de cotation de l'achat du createur (0 = aucun)
    uint256 minTokensOut;   // obligatoire si initialBuy > 0
}

library V5 {
    /* ---- offre ----
       10^9, non parametrable. Runitup : 316 lancements sur 321 a 10^9 (rapport
       Runitup) ; une offre variable n'apporte rien de mesure et piege les bots. */
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000 ether;

    /* ---- frais de base : 1 % de la cotation echangee, pris par le hook ----
       Pons, Runitup, Fabrique X et Realm a 1 % (rapport V5 §4.9, 16/10). Le
       pool lui-meme a un frais LP de 0 : tout passe par le hook, a decouvert. */
    uint16 internal constant BASE_FEE_BPS = 100;

    /* ---- part du createur dans le frais de base : 75 % createur / 25 % SWOGE ----
       Decision du proprietaire, 18/10/2026. Reperes : Pons 70 %, Runitup 75 %
       (108 lancements sur 7 j), hood.fun 80 % (rapport V5 §4.9). Le reste du
       frais de base (25 %) va au tresor SWOGE, adresse immutable. */
    uint16 internal constant CREATOR_SHARE_BPS = 7_500;

    /* ---- plafond de la taxe createur : 5 % ----
       DECISION FINALE du proprietaire, 18/10/2026 : 5 % au maximum. Reperes :
       Runitup, 73 jetons taxes sur 108, reglage le plus courant 2 % / 2 % ;
       plafonds observes ailleurs 9 % (Runitup) et 10 % (Pons, Fabrique X).
       La taxe s'ajoute au frais de base, a l'achat comme a la vente, et ne peut
       que BAISSER apres le lancement (`lowerTax`). */
    uint16 internal constant MAX_CREATOR_TAX_BPS = 500;

    /* ---- anti-snipe ----
       ≤ 90 %, ≤ 120 s. Runitup : 6 vraies fenetres sur 321 (15 a 60 s) ; Pons :
       99 % sur 3 s ; Clanker : ≤ 120 s. A mesurer avant de figer (§4.9) : la part
       de l'offre achetee au premier bloc sur les V4 de SWOGE. AUCUNE exemption :
       c'est la liste d'exemptions de Pons qui a permis ≥ 18,4 M$ d'extraction. */
    uint16 internal constant MAX_SNIPE_START_BPS = 9_000;
    uint16 internal constant MAX_SNIPE_SECONDS = 120;

    /* ---- plafonds d'achat ---- de 0,5 % a 100 % de l'offre, pendant ≤ 1 h. */
    uint16 internal constant MIN_LIMIT_BPS = 50;
    uint32 internal constant MAX_LIMIT_SECONDS = 3_600;

    /* ---- achat initial du createur ---- ≤ 5 % de l'offre. Runitup : 74 lancements
       sur 108 avec achat initial. Distribution en % de l'offre : non mesuree (§4.9). */
    uint16 internal constant MAX_INITIAL_BUY_BPS = 500;

    /* ---- allocations hors pool ---- ≤ 5 % vesting, ≤ 5 % airdrop, ≤ 10 % au total (§4.3, §4.7). */
    uint16 internal constant MAX_VEST_BPS = 500;
    uint16 internal constant MAX_AIRDROP_BPS = 500;
    uint16 internal constant MAX_OFFPOOL_BPS = 1_000;
    uint32 internal constant MIN_CLIFF = 30 days;
    uint32 internal constant MIN_VEST_DURATION = 90 days;
    uint32 internal constant MAX_VEST_DURATION = 730 days;
    uint32 internal constant MIN_CLAIM_SECONDS = 7 days;
    uint32 internal constant MAX_CLAIM_SECONDS = 180 days;

    /* ---- transfert du destinataire : deux etapes + 72 h, annulable ---- */
    uint32 internal constant RECIPIENT_DELAY = 72 hours;

    /* ---- staking ---- 24 h minimum avant de retirer (staking eclair, §4.7 point 4). */
    uint32 internal constant STAKE_MIN_SECONDS = 24 hours;

    /* ---- rachat-burn ---- tranche bornee a 3 % de mouvement de prix par
       seconde, mesure depuis le PREMIER prix vu par le hook dans la seconde
       (Pons : 300 pb). Un sandwich ne peut pas pousser le rachat au-dela. */
    uint16 internal constant MAX_IMPACT_BPS = 300;

    /* ---- metadonnees ---- nom ≤ 32 octets, symbole ≤ 10 (comme Pons), champs ≤ 256. */
    uint256 internal constant MAX_NAME = 32;
    uint256 internal constant MAX_SYMBOL = 10;
    uint256 internal constant MAX_META_FIELD = 256;

    /* ---- pool ---- frais LP 0, espacement 200 (le palier 1 % de V3, celui de V4). */
    uint24 internal constant POOL_FEE = 0;
    int24 internal constant TICK_SPACING = 200;

    /* ---- forme de la liquidite ----
       SINGLE : une plage de 161 200 ticks au-dessus du prix de depart, la meme
       amplitude que V4 (prix de sortie de plage ≈ 10^7 fois le depart).
       LADDER3 : la meme amplitude en trois tranches 30 % / 30 % / 40 % de
       l'offre du pool, sur [0, 40 000), [40 000, 100 000), [100 000, 161 200].
       Ce decoupage n'a PAS de mesure derriere lui : a mesurer avant de figer. */
    int24 internal constant RANGE_TICKS = 161_200;
    uint8 internal constant SHAPE_SINGLE = 0;
    uint8 internal constant SHAPE_LADDER3 = 1;

    /* ---- seau LP ---- la cotation du seau est ajoutee en liquidite d'un seul
       cote, juste sous le prix courant, sur 20 000 ticks (prix / 7,4). Position
       du module Holders, sans fonction de retrait : un mur d'achat permanent. */
    int24 internal constant FLOOR_WIDTH_TICKS = 20_000;

    /* ---- liste des monnaies de cotation ----
       Decision du proprietaire, 18/10/2026 : ETH, USDG, $SWOGE et TOUTES les
       actions tokenisees de Robinhood, liste figee au deploiement. Le registre
       officiel en comptait 195 ce jour-la (194 retenues, voir README). Le
       plafond est celui de l'indice `uint8` : 255 entrees, indices 0 a 254. */
    uint256 internal constant MAX_QUOTES = 255;

    /* ---- prix de depart choisi par le lanceur ----
       Chaque cotation a un tick de REFERENCE fige au deploiement (FDV
       d'ouverture ≈ 1 ETH aux prix du jour du deploiement). Le lanceur peut
       s'en ecarter de ±23 000 ticks au plus, soit un facteur 1,0001^23 000 ≈ 9,97
       dans chaque sens : FDV d'ouverture entre ≈ 0,1 et ≈ 10 ETH d'equivalent.
       Ce facteur 10 n'a PAS de mesure derriere lui. Il couvre deux choses sans
       administrateur : la derive des prix apres le deploiement (une action ou
       l'ETH qui fait ×5 deplace la reference d'autant) et une reference fausse
       (un multiplicateur mal lu, un cours perime). Il borne la vanite : pas de
       pool ouvert a 1 000 ETH de FDV pour afficher une grosse capitalisation. */
    int24 internal constant MAX_START_SHIFT_TICKS = 23_000;

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
}
