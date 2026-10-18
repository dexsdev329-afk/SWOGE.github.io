// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {V5, TokenMeta, Split, Snipe, Limits, Alloc, LaunchParams} from "./SwogeTypesV5.sol";
import {SwogeTokenV5} from "./SwogeTokenV5.sol";

interface IERC20Min {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IHookV5 {
    function register(PoolKey calldata, address, bool, uint16, Snipe calldata, Limits calldata) external;
    function open(PoolId) external;
    function lowerTax(PoolId, uint16) external;
    function lowerSnipe(PoolId, uint16, uint16) external;
    function relaxLimits(PoolId, uint16, uint16, uint32) external;
    function currentFees(PoolId) external view returns (uint16, uint16, uint32);
}

interface IAllocV5 {
    function register(address token, address beneficiary, Alloc calldata a) external;
}

/* ============================================================
   SWOGE V5 — LE NOYAU (18/10/2026)

   Verifie les parametres d'un lancement contre des bornes ecrites en dur,
   cree le jeton (CREATE2, sel mele a l'appelant), puis, dans UNE transaction
   et un seul `unlock` du PoolManager v4 :
     1. initialise le pool (frais LP 0, espacement 200, hook V5) au prix de
        depart fige pour la monnaie de cotation choisie ;
     2. y place toute l'offre restante, d'un seul cote (jeton seul) ;
     3. execute l'achat du createur s'il en a demande un (≤ 5 % de l'offre,
        frais de base et taxe payes, jetons envoyes a l'appelant seulement).
   Puis le hook ouvre le pool a tous et la fenetre anti-snipe commence.

   La liquidite est une position du PoolManager au nom de CE contrat, qui n'a
   aucune fonction pour la retirer ; le hook refuse de toute facon tout
   retrait. Il n'y a pas de NFT a garder ni a perdre.

   Aucun proprietaire. Les seules adresses sont fixees au deploiement
   (`immutable`) ; la liste des monnaies de cotation et leurs prix de depart
   sont ecrits une fois dans le constructeur, sans fonction pour y toucher.
   Le destinataire des frais d'un jeton ne peut que BAISSER ce qui lui profite.

   Compatibilite V4 (§4.8) : memes evenements Created / Meta / FeesCollected,
   meme `instant(address)` (pool = 0, lpTokenId = 0), meme `tokenCount()`.
   ============================================================ */
contract SwogeLaunchpadV5 is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    address public immutable hook;
    address public immutable holders;
    address public immutable alloc;
    address public immutable treasury;
    /// Frais de lancement, en ETH, paye au tresor (exactement : `msg.value` = frais + achat initial en ETH).
    uint256 public immutable launchFeeWei;

    /// Monnaies de cotation et prix de depart (tick « cotation par jeton », multiple de 200), figes au deploiement.
    address[] internal _quotes;
    int24[] internal _startTicks;

    struct Rec {
        address creator;
        address feeRecipient;
        address pendingRecipient;
        uint64 recipientReadyAt;
        uint64 launchedAt;
        uint8 quote;
        uint8 shape;
        bool exists;
        Split split;
    }

    mapping(address => Rec) internal _rec;
    address[] public allTokens;

    /* ---- evenements : tout ce qu'un bot doit savoir, dans la transaction de lancement ---- */
    event Created(address indexed token, address indexed creator, string name, string symbol);
    event Meta(address indexed token, string telegram, string twitter, string website, string logo);
    event LaunchedV5(
        address indexed token,
        address indexed creator,
        address indexed quote,
        bytes32 poolId,
        uint8 shape,
        int24 startTick,
        uint256 initialBuy
    );
    event LaunchConfig(address indexed token, uint16 creatorTaxBps, Split split, Snipe snipe, Limits limits, Alloc alloc);
    event MetadataUpdated(
        address indexed token, string description, string logo, string website, string twitter, string telegram
    );
    event TaxLowered(address indexed token, uint16 fromBps, uint16 toBps);
    event SplitShifted(address indexed token, Split from, Split to);
    event SnipeLowered(address indexed token, Snipe to);
    event LimitsRelaxed(address indexed token, Limits to);
    event RecipientProposed(address indexed token, address from, address to, uint64 readyAt);
    event RecipientChanged(address indexed token, address from, address to);
    event RecipientCancelled(address indexed token, address from, address to);

    error Bound(string what);
    error NotRecipient();
    error Unknown();

    // verrou de reentrance (stockage transitoire, EIP-1153 : la chaine porte deja le PoolManager v4 qui l'emploie)
    bytes32 private constant LOCK_SLOT = keccak256("swoge.v5.core.lock");

    modifier nonReentrant() {
        bytes32 s = LOCK_SLOT;
        uint256 l;
        assembly {
            l := tload(s)
        }
        require(l == 0, "reentrant");
        assembly {
            tstore(s, 1)
        }
        _;
        assembly {
            tstore(s, 0)
        }
    }

    constructor(
        IPoolManager _pm,
        address _hook,
        address _holders,
        address _alloc,
        address _treasury,
        uint256 _launchFeeWei,
        address[] memory quotes_,
        int24[] memory startTicks_
    ) {
        require(
            address(_pm) != address(0) && _hook != address(0) && _holders != address(0) && _alloc != address(0)
                && _treasury != address(0),
            "zero"
        );
        require(quotes_.length >= 1 && quotes_.length <= 16 && quotes_.length == startTicks_.length, "quotes");
        require(quotes_[0] == address(0), "quote 0 = ETH");
        for (uint256 i; i < quotes_.length; ++i) {
            int24 s = startTicks_[i];
            require(s % V5.TICK_SPACING == 0, "tick spacing");
            // la plage entiere doit tenir dans les ticks utilisables, dans les deux ordres de devises
            require(
                int256(s) - V5.RANGE_TICKS >= -int256(887_200) && int256(s) + V5.RANGE_TICKS <= int256(887_200),
                "tick range"
            );
            for (uint256 j; j < i; ++j) {
                require(quotes_[j] != quotes_[i], "duplicate");
            }
            if (i > 0) require(quotes_[i].code.length > 0, "quote code");
        }
        poolManager = _pm;
        hook = _hook;
        holders = _holders;
        alloc = _alloc;
        treasury = _treasury;
        launchFeeWei = _launchFeeWei;
        _quotes = quotes_;
        _startTicks = startTicks_;
    }

    /* ============================ lancer ============================ */

    function createToken(LaunchParams calldata p) external payable nonReentrant returns (address token) {
        _check(p);
        address q = _quotes[p.quote];

        // frais de lancement exact, au tresor ; en ETH, l'achat initial s'ajoute au frais, exactement
        uint256 ethBuy = q == address(0) ? p.initialBuy : 0;
        if (msg.value != launchFeeWei + ethBuy) revert Bound("msg.value = launchFeeWei (+ initialBuy if ETH)");
        if (launchFeeWei > 0) {
            (bool ok,) = treasury.call{value: launchFeeWei}("");
            require(ok, "treasury");
        }

        token = address(new SwogeTokenV5{salt: keccak256(abi.encode(msg.sender, p.salt))}(p.name, p.symbol, V5.TOTAL_SUPPLY));

        (PoolKey memory key, bool quoteIs0) = _key(token, q);
        PoolId id = key.toId();
        IHookV5(hook).register(key, token, quoteIs0, p.creatorTaxBps, p.snipe, p.limits);

        // allocations hors pool, prises avant l'amorce
        uint256 offPool = V5.TOTAL_SUPPLY * (uint256(p.alloc.creatorVestBps) + p.alloc.airdropBps) / 10_000;
        if (offPool > 0) {
            require(IERC20Min(token).transfer(alloc, offPool), "alloc");
            IAllocV5(alloc).register(token, msg.sender, p.alloc);
        }

        int24 start = _startTicks[p.quote];
        poolManager.unlock(
            abi.encode(key, quoteIs0, start, p.shape, V5.TOTAL_SUPPLY - offPool, p.initialBuy, p.minTokensOut, msg.sender)
        );

        IHookV5(hook).open(id);

        // l'arrondi d'Uniswap laisse quelques wei ici : rien n'est garde sans raison, le reste est brule
        uint256 rest = IERC20Min(token).balanceOf(address(this));
        if (rest > 0) require(IERC20Min(token).transfer(V5.DEAD, rest), "burn");

        Rec storage r = _rec[token];
        r.creator = msg.sender;
        r.feeRecipient = p.feeRecipient;
        r.launchedAt = uint64(block.timestamp);
        r.quote = p.quote;
        r.shape = p.shape;
        r.exists = true;
        r.split = p.split;
        allTokens.push(token);

        emit Created(token, msg.sender, p.name, p.symbol);
        emit Meta(token, p.meta.telegram, p.meta.twitter, p.meta.website, p.meta.logo);
        emit MetadataUpdated(token, p.meta.description, p.meta.logo, p.meta.website, p.meta.twitter, p.meta.telegram);
        emit LaunchedV5(token, msg.sender, q, PoolId.unwrap(id), p.shape, start, p.initialBuy);
        emit LaunchConfig(token, p.creatorTaxBps, p.split, p.snipe, p.limits, p.alloc);
    }

    function _check(LaunchParams calldata p) internal view {
        uint256 n = bytes(p.name).length;
        uint256 s = bytes(p.symbol).length;
        if (n == 0 || n > V5.MAX_NAME) revert Bound("name: 1..32 bytes");
        if (s == 0 || s > V5.MAX_SYMBOL) revert Bound("symbol: 1..10 bytes");
        _checkMeta(p.meta);
        if (p.quote >= _quotes.length) revert Bound("quote: index in getConfig().quotes");
        if (p.shape > V5.SHAPE_LADDER3) revert Bound("shape: 0 SINGLE, 1 LADDER3");
        if (p.creatorTaxBps > V5.MAX_CREATOR_TAX_BPS) revert Bound("creatorTaxBps <= 500");
        Split calldata sp = p.split;
        if (uint256(sp.creator) + sp.stakers + sp.lp + sp.buyback != 10_000) revert Bound("split: sum = 10000");
        if (p.snipe.startBps > V5.MAX_SNIPE_START_BPS) revert Bound("snipe.startBps <= 9000");
        if (p.snipe.secs > V5.MAX_SNIPE_SECONDS) revert Bound("snipe.secs <= 120");
        Limits calldata l = p.limits;
        if (l.maxBuyPerSwapBps != 0 && (l.maxBuyPerSwapBps < V5.MIN_LIMIT_BPS || l.maxBuyPerSwapBps > 10_000)) {
            revert Bound("maxBuyPerSwapBps: 0 or 50..10000");
        }
        if (l.maxBuyPerBlockBps != 0 && (l.maxBuyPerBlockBps < V5.MIN_LIMIT_BPS || l.maxBuyPerBlockBps > 10_000)) {
            revert Bound("maxBuyPerBlockBps: 0 or 50..10000");
        }
        if (l.secs > V5.MAX_LIMIT_SECONDS) revert Bound("limits.secs <= 3600");
        Alloc calldata a = p.alloc;
        if (a.creatorVestBps > V5.MAX_VEST_BPS) revert Bound("creatorVestBps <= 500");
        if (a.creatorVestBps > 0) {
            if (a.cliff < V5.MIN_CLIFF) revert Bound("cliff >= 30 days");
            if (a.duration < V5.MIN_VEST_DURATION || a.duration > V5.MAX_VEST_DURATION) {
                revert Bound("duration: 90..730 days");
            }
            if (a.cliff >= a.duration) revert Bound("cliff < duration");
        }
        if (a.airdropBps > V5.MAX_AIRDROP_BPS) revert Bound("airdropBps <= 500");
        if (a.airdropBps > 0) {
            if (a.merkleRoot == bytes32(0)) revert Bound("merkleRoot required");
            if (a.claimSecs < V5.MIN_CLAIM_SECONDS || a.claimSecs > V5.MAX_CLAIM_SECONDS) {
                revert Bound("claimSecs: 7..180 days");
            }
        }
        if (uint256(a.creatorVestBps) + a.airdropBps > V5.MAX_OFFPOOL_BPS) revert Bound("vest + airdrop <= 1000");
        if (p.feeRecipient == address(0)) revert Bound("feeRecipient != 0");
        if (p.initialBuy > 0 && p.minTokensOut == 0) revert Bound("minTokensOut required");
    }

    function _checkMeta(TokenMeta calldata m) internal pure {
        if (
            bytes(m.description).length > V5.MAX_META_FIELD || bytes(m.logo).length > V5.MAX_META_FIELD
                || bytes(m.website).length > V5.MAX_META_FIELD || bytes(m.twitter).length > V5.MAX_META_FIELD
                || bytes(m.telegram).length > V5.MAX_META_FIELD
        ) revert Bound("meta field <= 256 bytes");
    }

    function _key(address token, address q) internal view returns (PoolKey memory key, bool quoteIs0) {
        quoteIs0 = q < token; // ETH natif (adresse 0) est toujours currency0
        key = PoolKey({
            currency0: Currency.wrap(quoteIs0 ? q : token),
            currency1: Currency.wrap(quoteIs0 ? token : q),
            fee: V5.POOL_FEE,
            tickSpacing: V5.TICK_SPACING,
            hooks: IHooks(hook)
        });
    }

    /* ---- le rappel du PoolManager : amorce + achat initial ---- */
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "pm");
        (
            PoolKey memory key,
            bool quoteIs0,
            int24 start,
            uint8 shape,
            uint256 poolTokens,
            uint256 initialBuy,
            uint256 minOut,
            address creator
        ) = abi.decode(data, (PoolKey, bool, int24, uint8, uint256, uint256, uint256, address));

        Currency tok = quoteIs0 ? key.currency1 : key.currency0;
        Currency quo = quoteIs0 ? key.currency0 : key.currency1;

        // prix de depart : le jeton est vendu ; la position est entierement en jeton
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(quoteIs0 ? -start : start));

        uint256 owed;
        if (shape == V5.SHAPE_SINGLE) {
            owed = _band(key, quoteIs0, start, 0, V5.RANGE_TICKS, poolTokens);
        } else {
            uint256 a = poolTokens * 3_000 / 10_000;
            uint256 b = poolTokens * 3_000 / 10_000;
            owed = _band(key, quoteIs0, start, 0, 40_000, a);
            owed += _band(key, quoteIs0, start, 40_000, 100_000, b);
            owed += _band(key, quoteIs0, start, 100_000, V5.RANGE_TICKS, poolTokens - a - b);
        }
        poolManager.sync(tok);
        require(IERC20Min(Currency.unwrap(tok)).transfer(address(poolManager), owed), "settle");
        poolManager.settle();

        if (initialBuy > 0) {
            BalanceDelta d = poolManager.swap(
                key,
                IPoolManager.SwapParams({
                    zeroForOne: quoteIs0,
                    amountSpecified: -int256(initialBuy),
                    sqrtPriceLimitX96: quoteIs0 ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
            int128 dq = quoteIs0 ? d.amount0() : d.amount1();
            int128 dt = quoteIs0 ? d.amount1() : d.amount0();
            require(dq < 0 && dt > 0, "buy");
            uint256 paid = uint256(uint128(-dq));
            uint256 out = uint256(uint128(dt));
            // entree exacte, sans limite de prix utile : tout le montant est consomme
            require(paid == initialBuy, "initial buy not filled");
            if (out > V5.TOTAL_SUPPLY * V5.MAX_INITIAL_BUY_BPS / 10_000) revert Bound("initial buy <= 5% of supply");
            if (out < minOut) revert Bound("minTokensOut");
            if (quo.isAddressZero()) {
                poolManager.settle{value: paid}();
            } else {
                poolManager.sync(quo);
                require(IERC20Min(Currency.unwrap(quo)).transferFrom(creator, address(poolManager), paid), "quote");
                poolManager.settle();
            }
            // destinataire = l'appelant seulement
            poolManager.take(tok, creator, out);
        }
        return "";
    }

    /* Une tranche d'offre entre start+lo et start+hi (ticks « cotation par
       jeton »). Si le jeton est currency1, le prix du pool est l'inverse : la
       plage est niee et retournee. Rend le nombre de jetons du par le noyau. */
    function _band(PoolKey memory key, bool quoteIs0, int24 start, int24 lo, int24 hi, uint256 amount)
        internal
        returns (uint256)
    {
        int24 tl;
        int24 tu;
        uint128 liq;
        if (quoteIs0) {
            // jeton = currency1, position entierement en token1 : prix courant au-dessus de la plage
            tl = -(start + hi);
            tu = -(start + lo);
            uint160 sa = TickMath.getSqrtPriceAtTick(tl);
            uint160 sb = TickMath.getSqrtPriceAtTick(tu);
            liq = _u128(FullMath.mulDiv(amount, FixedPoint96.Q96, sb - sa));
        } else {
            // jeton = currency0, position entierement en token0 : prix courant au bas de la plage
            tl = start + lo;
            tu = start + hi;
            uint160 sa = TickMath.getSqrtPriceAtTick(tl);
            uint160 sb = TickMath.getSqrtPriceAtTick(tu);
            liq = _u128(FullMath.mulDiv(amount, FullMath.mulDiv(sa, sb, FixedPoint96.Q96), sb - sa));
        }
        (BalanceDelta d,) = poolManager.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({tickLower: tl, tickUpper: tu, liquidityDelta: int256(uint256(liq)), salt: 0}),
            ""
        );
        int128 dt = quoteIs0 ? d.amount1() : d.amount0();
        int128 dq = quoteIs0 ? d.amount0() : d.amount1();
        require(dq == 0 && dt <= 0, "one-sided");
        return uint256(uint128(-dt));
    }

    function _u128(uint256 x) internal pure returns (uint128) {
        require(x <= type(uint128).max, "liquidity");
        return uint128(x);
    }

    /* ============================ cliquets ============================ */

    modifier onlyRecipient(address token) {
        Rec storage r = _rec[token];
        if (!r.exists) revert Unknown();
        if (msg.sender != r.feeRecipient) revert NotRecipient();
        _;
    }

    function lowerTax(address token, uint16 newBps) external onlyRecipient(token) {
        (PoolKey memory key,) = _key(token, _quotes[_rec[token].quote]);
        uint16 old = _taxOf(key.toId()); // la valeur courante est lue dans le hook, qui fait foi
        IHookV5(hook).lowerTax(key.toId(), newBps);
        emit TaxLowered(token, old, newBps);
    }

    function _taxOf(PoolId id) internal view returns (uint16) {
        (, uint16 sellBps,) = IHookV5(hook).currentFees(id);
        return sellBps - V5.BASE_FEE_BPS;
    }

    /// Deplace une part du seau createur vers stakers, LP ou rachat-burn. Jamais l'inverse.
    function shiftCreatorSplit(address token, Split calldata to) external onlyRecipient(token) {
        Split memory from = _rec[token].split;
        if (uint256(to.creator) + to.stakers + to.lp + to.buyback != 10_000) revert Bound("split: sum = 10000");
        if (to.creator >= from.creator || to.stakers < from.stakers || to.lp < from.lp || to.buyback < from.buyback) {
            revert Bound("split: creator share can only move to holders");
        }
        _rec[token].split = to;
        emit SplitShifted(token, from, to);
    }

    function lowerSnipe(address token, Snipe calldata s) external onlyRecipient(token) {
        (PoolKey memory key,) = _key(token, _quotes[_rec[token].quote]);
        IHookV5(hook).lowerSnipe(key.toId(), s.startBps, s.secs);
        emit SnipeLowered(token, s);
    }

    function relaxLimits(address token, Limits calldata l) external onlyRecipient(token) {
        (PoolKey memory key,) = _key(token, _quotes[_rec[token].quote]);
        IHookV5(hook).relaxLimits(key.toId(), l.maxBuyPerSwapBps, l.maxBuyPerBlockBps, l.secs);
        emit LimitsRelaxed(token, l);
    }

    function updateMeta(address token, TokenMeta calldata m) external onlyRecipient(token) {
        _checkMeta(m);
        emit MetadataUpdated(token, m.description, m.logo, m.website, m.twitter, m.telegram);
        emit Meta(token, m.telegram, m.twitter, m.website, m.logo);
    }

    /* ---- destinataire des frais : deux etapes, 72 h, annulable, sans administrateur ---- */

    function proposeRecipient(address token, address next) external onlyRecipient(token) {
        require(next != address(0) && next != msg.sender, "next");
        Rec storage r = _rec[token];
        r.pendingRecipient = next;
        r.recipientReadyAt = uint64(block.timestamp + V5.RECIPIENT_DELAY);
        emit RecipientProposed(token, msg.sender, next, r.recipientReadyAt);
    }

    function acceptRecipient(address token) external {
        Rec storage r = _rec[token];
        if (!r.exists) revert Unknown();
        require(msg.sender == r.pendingRecipient, "not pending");
        require(block.timestamp >= r.recipientReadyAt, "delay");
        address from = r.feeRecipient;
        r.feeRecipient = msg.sender;
        r.pendingRecipient = address(0);
        r.recipientReadyAt = 0;
        emit RecipientChanged(token, from, msg.sender);
    }

    function cancelRecipient(address token) external onlyRecipient(token) {
        Rec storage r = _rec[token];
        address to = r.pendingRecipient;
        require(to != address(0), "none");
        r.pendingRecipient = address(0);
        r.recipientReadyAt = 0;
        emit RecipientCancelled(token, msg.sender, to);
    }

    /* ============================ vues ============================ */

    /// Compatibilite V4 : meme signature ; pool = 0 et lpTokenId = 0 (pas de pool V3 ni de NFT en V5).
    function instant(address token)
        external
        view
        returns (address token_, address creator, address pool, uint256 lpTokenId, bool exists)
    {
        Rec storage r = _rec[token];
        return (r.exists ? token : address(0), r.creator, address(0), 0, r.exists);
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function quotes() external view returns (address[] memory) {
        return _quotes;
    }

    function startTicks() external view returns (int24[] memory) {
        return _startTicks;
    }

    struct Info {
        address creator;
        address feeRecipient;
        address pendingRecipient;
        uint64 recipientReadyAt;
        uint64 launchedAt;
        address quote;
        uint8 shape;
        bool exists;
        Split split;
        bytes32 poolId;
    }

    function getTokenInfo(address token) external view returns (Info memory i) {
        Rec storage r = _rec[token];
        if (!r.exists) return i;
        address q = _quotes[r.quote];
        (PoolKey memory key,) = _key(token, q);
        i = Info(
            r.creator,
            r.feeRecipient,
            r.pendingRecipient,
            r.recipientReadyAt,
            r.launchedAt,
            q,
            r.shape,
            true,
            r.split,
            PoolId.unwrap(key.toId())
        );
    }

    /// Ce dont Holders a besoin pour distribuer : la cle du pool, le sens, le destinataire, la repartition.
    function poolInfo(address token)
        external
        view
        returns (PoolKey memory key, bool quoteIs0, address feeRecipient, Split memory split)
    {
        Rec storage r = _rec[token];
        if (!r.exists) revert Unknown();
        (key, quoteIs0) = _key(token, _quotes[r.quote]);
        return (key, quoteIs0, r.feeRecipient, r.split);
    }

    function currentFees(address token) external view returns (uint16 buyBps, uint16 sellBps, uint32 snipeEndsAt) {
        Rec storage r = _rec[token];
        if (!r.exists) return (0, 0, 0);
        (PoolKey memory key,) = _key(token, _quotes[r.quote]);
        return IHookV5(hook).currentFees(key.toId());
    }

    struct Config {
        uint16 BASE_FEE_BPS;
        uint16 CREATOR_SHARE_BPS;
        uint16 MAX_CREATOR_TAX_BPS;
        uint16 MAX_SNIPE_START_BPS;
        uint16 MAX_SNIPE_SECONDS;
        uint32 MAX_LIMIT_SECONDS;
        uint16 MAX_INITIAL_BUY_BPS;
        uint16 MAX_VEST_BPS;
        uint16 MAX_AIRDROP_BPS;
        uint32 RECIPIENT_DELAY;
        uint256 LAUNCH_FEE_WEI;
        address treasury;
        address hook;
        address holders;
        address alloc;
        address[] quotes;
        int24[] startTicks;
    }

    /// Toutes les bornes, lues sur la chaine par la page avant toute signature (§4.8).
    function getConfig() external view returns (Config memory) {
        return Config(
            V5.BASE_FEE_BPS,
            V5.CREATOR_SHARE_BPS,
            V5.MAX_CREATOR_TAX_BPS,
            V5.MAX_SNIPE_START_BPS,
            V5.MAX_SNIPE_SECONDS,
            V5.MAX_LIMIT_SECONDS,
            V5.MAX_INITIAL_BUY_BPS,
            V5.MAX_VEST_BPS,
            V5.MAX_AIRDROP_BPS,
            V5.RECIPIENT_DELAY,
            launchFeeWei,
            treasury,
            hook,
            holders,
            alloc,
            _quotes,
            _startTicks
        );
    }
}
