// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {V5, Snipe, Limits} from "./SwogeTypesV5.sol";

/* ============================================================
   SWOGE V5 — LE HOOK UNIQUE, PARTAGE PAR TOUS LES POOLS V5 (18/10/2026)

   Ce qu'il fait, et seulement cela :
   1. FRAIS PRIS COTE COTATION, a chaque echange : frais de base 1 %
      (75 % createur / 25 % tresor), taxe createur (≤ 5 %, achat et vente),
      surtaxe anti-snipe degressive (achats seulement, jamais au createur ni a
      la plateforme : elle part au seau LP). Le frais est preleve par les
      deltas de retour v4, puis converti en creances ERC-6909 au nom du module
      Holders (`poolManager.mint`). Aucun transfert de jeton, aucun appel a un
      autre contrat que le PoolManager pendant un echange.
   2. PLAFONDS D'ACHAT par echange et par seconde, pendant la fenetre choisie.
   3. GARDE DU POOL : seul le noyau initialise ; seuls le noyau et Holders
      ajoutent de la liquidite ; PERSONNE ne retire de liquidite. La LP est
      donc verrouillee par construction, pas par promesse.
   4. COMPTABILITE DES SEAUX (tresor, createur, LP), videe en *pull* par
      Holders. Un bug de distribution ne peut pas geler le marche : l'echange
      n'attend jamais la distribution.

   AUCUNE liste d'exemption, aucun proprietaire, aucun setter de frais. Les
   seuls gestes possibles apres le lancement sont des CLIQUETS qui baissent
   ce qui profite au createur (taxe, surtaxe) ou relachent les limites, passes
   par le noyau et reverifies ici.

   L'achat du createur dans la transaction de lancement est le seul cas
   particulier, et il est public : il a lieu AVANT l'ouverture du pool, il
   paie le frais de base et la taxe, il est plafonne a 5 % de l'offre par le
   noyau, et la fenetre anti-snipe s'ouvre juste apres lui.
   ============================================================ */
contract SwogeHookV5 is IHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    address public immutable core;
    address public immutable holders;

    /// Configuration d'echange d'un pool. `token == 0` : pool inconnu.
    struct Cfg {
        address token;
        bool quoteIs0;
        bool open;
        uint16 taxBps;
        uint16 snipeBps;
        uint16 snipeSecs;
        uint16 maxSwapBps;
        uint16 maxBlockBps;
        uint32 limitSecs;
        uint64 launchedAt;
    }

    /// Seaux en attente, en unites de la cotation. Les creances correspondantes sont deja au nom de Holders.
    struct Pending {
        uint128 treasury;
        uint128 creator;
        uint128 lp;
    }

    /// Fenetre d'une seconde : cumul des achats, et prix de reference (le premier vu dans la seconde).
    struct Window {
        uint64 ts;
        uint96 bought;
    }

    mapping(PoolId => Cfg) internal _cfg;
    mapping(PoolId => Pending) internal _pending;
    mapping(PoolId => Window) internal _win;
    mapping(PoolId => uint160) internal _refSqrt;
    /// Cumul des frais pris par pool, pour l'invariant « somme des seaux = frais pris ».
    mapping(PoolId => uint256) public feesTaken;

    event FeeTaken(bytes32 indexed poolId, bool isBuy, uint256 baseFee, uint256 tax, uint256 snipeSurcharge);

    error NotPoolManager();
    error NotCore();
    error NotHolders();
    error UnknownPool();
    error NotOpen();
    error LiquidityLocked();
    error NotAllowed();
    error NotLower();
    error MaxBuyPerSwap(uint256 bought, uint256 max);
    error MaxBuyPerBlock(uint256 bought, uint256 max);
    error HookNotImplemented();

    constructor(IPoolManager _pm, address _core, address _holders) {
        require(address(_pm) != address(0) && _core != address(0) && _holders != address(0), "zero");
        poolManager = _pm;
        core = _core;
        holders = _holders;
        /* L'adresse du hook DOIT porter exactement ces drapeaux dans ses 14 bits
           de poids faible (sel mine, voir script/MineHookSalt.s.sol). Sinon le
           deploiement echoue ici, et non au premier lancement. */
        Hooks.validateHookPermissions(IHooks(address(this)), permissions());
    }

    function permissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeAddLiquidity = true;
        p.beforeRemoveLiquidity = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeSwapReturnDelta = true;
        p.afterSwapReturnDelta = true;
    }

    modifier onlyPM() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyCore() {
        if (msg.sender != core) revert NotCore();
        _;
    }

    /* ======================= gestes du noyau ======================= */

    function register(PoolKey calldata key, address token, bool quoteIs0, uint16 taxBps, Snipe calldata s, Limits calldata l)
        external
        onlyCore
    {
        PoolId id = key.toId();
        require(_cfg[id].token == address(0), "registered");
        require(address(key.hooks) == address(this), "hook");
        _cfg[id] = Cfg({
            token: token,
            quoteIs0: quoteIs0,
            open: false,
            taxBps: taxBps,
            snipeBps: s.startBps,
            snipeSecs: s.secs,
            maxSwapBps: l.maxBuyPerSwapBps,
            maxBlockBps: l.maxBuyPerBlockBps,
            limitSecs: l.secs,
            launchedAt: 0
        });
    }

    /// Ouvre le pool a tous, juste apres l'achat initial : la fenetre anti-snipe commence ici.
    function open(PoolId id) external onlyCore {
        Cfg storage c = _cfg[id];
        if (c.token == address(0)) revert UnknownPool();
        require(!c.open, "open");
        c.open = true;
        c.launchedAt = uint64(block.timestamp);
    }

    /* ---- cliquets : reverifies ici, quoi que dise le noyau ---- */

    function lowerTax(PoolId id, uint16 newBps) external onlyCore {
        Cfg storage c = _cfg[id];
        if (newBps >= c.taxBps) revert NotLower();
        c.taxBps = newBps;
    }

    /* Baisser la surtaxe de depart OU raccourcir la fenetre. La surtaxe
       courante vaut start × (fin − t) / duree, croissante en duree a fin fixe
       depuis le lancement : raccourcir ne peut que la baisser. */
    function lowerSnipe(PoolId id, uint16 startBps, uint16 secs) external onlyCore {
        Cfg storage c = _cfg[id];
        if (startBps > c.snipeBps || secs > c.snipeSecs || (startBps == c.snipeBps && secs == c.snipeSecs)) {
            revert NotLower();
        }
        c.snipeBps = startBps;
        c.snipeSecs = secs;
    }

    /* Les limites ne peuvent que se RELACHER : plafond plus haut ou supprime
       (0), duree plus courte. Les durcir apres le lancement permettrait au
       createur d'empecher les achats : c'est le sens interdit. */
    function relaxLimits(PoolId id, uint16 swapBps, uint16 blockBps, uint32 secs) external onlyCore {
        Cfg storage c = _cfg[id];
        if (!_looser(c.maxSwapBps, swapBps) || !_looser(c.maxBlockBps, blockBps) || secs > c.limitSecs) revert NotLower();
        if (swapBps == c.maxSwapBps && blockBps == c.maxBlockBps && secs == c.limitSecs) revert NotLower();
        c.maxSwapBps = swapBps;
        c.maxBlockBps = blockBps;
        c.limitSecs = secs;
    }

    function _looser(uint16 cur, uint16 nxt) internal pure returns (bool) {
        if (nxt == 0) return true; // supprime
        return cur != 0 && nxt >= cur;
    }

    /* ======================= vidange des seaux (Holders) ======================= */

    function drain(PoolId id) external returns (uint256 treasury, uint256 creator, uint256 lp) {
        if (msg.sender != holders) revert NotHolders();
        Pending memory p = _pending[id];
        delete _pending[id];
        return (p.treasury, p.creator, p.lp);
    }

    /* ======================= vues ======================= */

    function getCfg(PoolId id) external view returns (Cfg memory) {
        return _cfg[id];
    }

    function getPending(PoolId id) external view returns (Pending memory) {
        return _pending[id];
    }

    /// Prix de reference de la seconde courante (0 si aucun echange dans cette seconde).
    function refPrice(PoolId id) external view returns (uint160 sqrtPriceX96, uint64 ts) {
        Window memory w = _win[id];
        if (w.ts != uint64(block.timestamp)) return (0, w.ts);
        return (_refSqrt[id], w.ts);
    }

    /// Frais totaux en points de base a cet instant, pour les routeurs et les bots (§4.7 point 6).
    function currentFees(PoolId id) external view returns (uint16 buyBps, uint16 sellBps, uint32 snipeEndsAt) {
        Cfg memory c = _cfg[id];
        if (c.token == address(0)) return (0, 0, 0);
        sellBps = V5.BASE_FEE_BPS + c.taxBps;
        buyBps = sellBps + uint16(_snipe(c));
        snipeEndsAt = c.open ? uint32(c.launchedAt + c.snipeSecs) : 0;
    }

    function _snipe(Cfg memory c) internal view returns (uint256) {
        if (!c.open || c.snipeSecs == 0 || c.snipeBps == 0) return 0;
        uint256 end = uint256(c.launchedAt) + c.snipeSecs;
        if (block.timestamp >= end) return 0;
        // lineaire : startBps a l'ouverture, 0 a la fin (arrondi vers le bas)
        return uint256(c.snipeBps) * (end - block.timestamp) / c.snipeSecs;
    }

    /* ======================= crochets v4 ======================= */

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external view onlyPM returns (bytes4) {
        Cfg storage c = _cfg[key.toId()];
        if (sender != core || c.token == address(0) || c.open) revert NotAllowed();
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPM
        returns (bytes4)
    {
        // liquidite de tiers bloquee : seuls l'amorce (noyau) et le mur du seau LP (Holders)
        if (sender != core && sender != holders) revert NotAllowed();
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPM
        returns (bytes4)
    {
        revert LiquidityLocked();
    }

    function beforeSwap(address sender, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        onlyPM
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        Cfg memory c = _cfg[id];
        if (c.token == address(0)) revert UnknownPool();
        if (!c.open && sender != core) revert NotOpen();

        // prix de reference : le premier prix vu dans la seconde, avant tout echange de la seconde
        Window storage w = _win[id];
        if (w.ts != uint64(block.timestamp)) {
            w.ts = uint64(block.timestamp);
            w.bought = 0;
            (uint160 sp,,,) = poolManager.getSlot0(id);
            _refSqrt[id] = sp;
        }

        bool exactIn = params.amountSpecified < 0;
        bool quoteSpecified = ((exactIn == params.zeroForOne) == c.quoteIs0);
        if (!quoteSpecified) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        bool isBuy = params.zeroForOne == c.quoteIs0;
        uint256 amt = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        // achat en entree exacte : frais sur le brut paye ; vente en sortie exacte : frais sur le brut sorti du pool
        uint256 fee = _charge(id, key, c, isBuy, amt, exactIn);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(_i128(fee), 0), 0);
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPM returns (bytes4, int128) {
        PoolId id = key.toId();
        Cfg memory c = _cfg[id];
        bool exactIn = params.amountSpecified < 0;
        bool isBuy = params.zeroForOne == c.quoteIs0;
        bool quoteSpecified = ((exactIn == params.zeroForOne) == c.quoteIs0);
        int128 q = c.quoteIs0 ? delta.amount0() : delta.amount1();
        int128 t = c.quoteIs0 ? delta.amount1() : delta.amount0();

        uint256 fee;
        if (!quoteSpecified) {
            // vente en entree exacte : q > 0 sort du pool (brut) ; achat en sortie exacte : q < 0 entre (net)
            uint256 amt = q >= 0 ? uint256(uint128(q)) : uint256(uint128(-q));
            fee = _charge(id, key, c, isBuy, amt, exactIn);
        }

        if (isBuy && c.open && c.limitSecs != 0 && block.timestamp < uint256(c.launchedAt) + c.limitSecs && t > 0) {
            uint256 out = uint256(uint128(t));
            if (c.maxSwapBps != 0) {
                uint256 m = V5.TOTAL_SUPPLY * c.maxSwapBps / 10_000;
                if (out > m) revert MaxBuyPerSwap(out, m);
            }
            if (c.maxBlockBps != 0) {
                Window storage w = _win[id];
                uint256 b = uint256(w.bought) + out;
                uint256 m = V5.TOTAL_SUPPLY * c.maxBlockBps / 10_000;
                if (b > m) revert MaxBuyPerBlock(b, m);
                w.bought = uint96(b);
            }
        }
        return (IHooks.afterSwap.selector, _i128(fee));
    }

    /* Calcule le frais, cree les creances au nom de Holders, remplit les seaux.
       `gross` : `amt` contient deja le frais (frais = amt × bps / 10 000) ;
       sinon `amt` est net (frais = amt × bps / (10 000 − bps)). Dans les deux
       cas le taux effectif est `bps` du montant brut de cotation. */
    function _charge(PoolId id, PoolKey calldata key, Cfg memory c, bool isBuy, uint256 amt, bool gross)
        internal
        returns (uint256 fee)
    {
        uint256 snipe = isBuy ? _snipe(c) : 0;
        uint256 bps = V5.BASE_FEE_BPS + c.taxBps + snipe; // ≤ 100 + 500 + 9 000 < 10 000
        fee = gross ? amt * bps / 10_000 : amt * bps / (10_000 - bps);
        if (fee == 0) return 0;

        uint256 baseAmt = fee * V5.BASE_FEE_BPS / bps;
        uint256 taxAmt = fee * c.taxBps / bps;
        uint256 snipeAmt = fee - baseAmt - taxAmt;
        uint256 creatorBase = baseAmt * V5.CREATOR_SHARE_BPS / 10_000;

        Pending storage p = _pending[id];
        p.treasury += uint128(baseAmt - creatorBase);
        p.creator += uint128(creatorBase + taxAmt);
        p.lp += uint128(snipeAmt);
        feesTaken[id] += fee;

        Currency quote = c.quoteIs0 ? key.currency0 : key.currency1;
        poolManager.mint(holders, quote.toId(), fee);
        emit FeeTaken(PoolId.unwrap(id), isBuy, baseAmt, taxAmt, snipeAmt);
    }

    function _i128(uint256 x) internal pure returns (int128) {
        require(x <= uint128(type(int128).max), "overflow");
        return int128(int256(x));
    }

    /* ======================= crochets non declares ======================= */

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
