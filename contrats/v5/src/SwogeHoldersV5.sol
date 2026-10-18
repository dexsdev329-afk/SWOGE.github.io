// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {V5, Split} from "./SwogeTypesV5.sol";

interface ICoreV5 {
    function poolInfo(address token)
        external
        view
        returns (PoolKey memory key, bool quoteIs0, address feeRecipient, Split memory split);
    function treasury() external view returns (address);
}

interface IHookDrain {
    function drain(PoolId id) external returns (uint256 treasury, uint256 creator, uint256 lp);
    function refPrice(PoolId id) external view returns (uint160 sqrtPriceX96, uint64 ts);
}

interface IERC20H {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/* ============================================================
   SWOGE V5 — DETENTEURS ET DISTRIBUTION DES FRAIS (18/10/2026)

   Le hook cree, a chaque echange, des creances ERC-6909 du PoolManager au nom
   de CE contrat, et tient le compte des seaux. Ici, tout se fait en *pull*,
   par des fonctions ouvertes a tous, jamais pendant un echange :

   - `distribute(token)` vide les seaux du hook et les repartit :
       tresor (25 % du frais de base)        -> credit du tresor
       part createur (75 % + taxe), selon `split` :
           creator  -> credit du destinataire des frais
           stakers  -> recompenses des stakers (en cotation)
           lp       -> seau LP
           buyback  -> seau de rachat-burn
       surtaxe anti-snipe                    -> seau LP
     puis ajoute le seau LP en liquidite d'un seul cote, juste sous le prix
     (un mur d'achat sans fonction de retrait).
   - `buybackBurn(token, maxQuoteIn)` achete le jeton avec le seau de rachat,
     par tranche bornee a MAX_IMPACT_BPS depuis le premier prix de la seconde,
     et envoie les jetons a 0x…dEaD.
   - `withdraw(currency)` paie a l'appelant ce qui lui est du (createur,
     tresor, staker). Un destinataire qui refuse l'ETH ne bloque que lui-meme.
   - staking : `stake`, `unstake` (apres 24 h), `claimReward`.

   Ni proprietaire, ni pause, ni setter. Les jetons envoyes directement a ce
   contrat ne comptent pas comme mis en jeu (`totalStaked` est tenu a part).
   ============================================================ */
contract SwogeHoldersV5 is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    address public immutable core;
    address public immutable hook;

    /// Du a un compte, par devise (id ERC-6909 = adresse de la devise), en creances detenues ici.
    mapping(address => mapping(uint256 => uint256)) public owed;

    struct Buckets {
        uint128 lp;
        uint128 buyback;
    }

    mapping(address => Buckets) public buckets;

    /* `unpaid` : recompenses creditees aux stakers et pas encore recoltees. La
       methode « acc × montant − dette » arrondit chaque compte separement et
       peut rendre 1 wei de plus que ce qui a ete credite : la recolte est donc
       plafonnee a `unpaid`, et le contrat reste solvable par construction. */
    struct StakePool {
        uint256 total;
        uint256 acc; // recompense par jeton mis en jeu, × 1e36
        uint256 unpaid;
    }

    struct Stake {
        uint256 amount;
        uint256 debt;
        uint64 since;
    }

    mapping(address => StakePool) public stakePools;
    mapping(address => mapping(address => Stake)) public stakes;

    uint256 private constant ACC = 1e36;

    event FeesCollected(address indexed token, uint256 toCreator, uint256 toTreasury, uint256 tokenBurned);
    event Distributed(address indexed token, uint256 toStakers, uint256 toLp, uint256 boughtBack, uint256 burned);
    event Staked(address indexed token, address indexed account, uint256 amount);
    event Unstaked(address indexed token, address indexed account, uint256 amount);
    event RewardClaimed(address indexed token, address indexed account, uint256 amount);
    event Withdrawn(address indexed account, address indexed currency, uint256 amount);

    bytes32 private constant LOCK_SLOT = keccak256("swoge.v5.holders.lock");

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

    constructor(IPoolManager _pm, address _core, address _hook) {
        require(address(_pm) != address(0) && _core != address(0) && _hook != address(0), "zero");
        poolManager = _pm;
        core = _core;
        hook = _hook;
    }

    /* ============================ distribution ============================ */

    function distribute(address token) external nonReentrant {
        (PoolKey memory key, bool quoteIs0, address recipient, Split memory sp) = ICoreV5(core).poolInfo(token);
        Currency quote = quoteIs0 ? key.currency0 : key.currency1;
        uint256 qid = quote.toId();
        (uint256 tre, uint256 cre, uint256 snipe) = IHookDrain(hook).drain(key.toId());

        uint256 toCreator = cre * sp.creator / 10_000;
        uint256 toStakers = cre * sp.stakers / 10_000;
        uint256 toLp = cre * sp.lp / 10_000;
        uint256 toBuyback = cre - toCreator - toStakers - toLp; // l'arrondi va au rachat-burn

        owed[recipient][qid] += toCreator;
        owed[ICoreV5(core).treasury()][qid] += tre;

        // stakers : sans mise en jeu, ou pour la poussiere d'arrondi, la part va au rachat-burn
        uint256 credited;
        StakePool storage spool = stakePools[token];
        if (toStakers > 0 && spool.total > 0) {
            uint256 inc = toStakers * ACC / spool.total;
            spool.acc += inc;
            credited = inc * spool.total / ACC;
            spool.unpaid += credited;
        }
        toBuyback += toStakers - credited;

        Buckets storage b = buckets[token];
        b.buyback += uint128(toBuyback);
        uint256 lpTotal = uint256(b.lp) + toLp + snipe;

        uint256 used;
        if (lpTotal > 0 && _calm(key.toId())) {
            used = abi.decode(poolManager.unlock(abi.encode(uint8(1), key, quoteIs0, lpTotal)), (uint256));
        }
        b.lp = uint128(lpTotal - used);

        emit FeesCollected(token, toCreator, tre, 0);
        emit Distributed(token, credited, used, 0, 0);
    }

    /* Le mur LP n'est pose que si le prix courant est a moins de MAX_IMPACT_BPS
       du premier prix de la seconde : un attaquant qui gonfle le prix puis
       appelle `distribute` dans la meme seconde ne fait que reporter l'ajout
       (le seau reste plein, rien n'est perdu). Entre deux secondes, voir les
       risques ouverts du README. */
    function _calm(PoolId id) internal view returns (bool) {
        (uint160 ref,) = IHookDrain(hook).refPrice(id);
        if (ref == 0) return true;
        (uint160 cur,,,) = poolManager.getSlot0(id);
        return uint256(cur) >= uint256(ref) * 984_885_781 / 1e9 && uint256(cur) <= uint256(ref) * 1_014_889_156 / 1e9;
    }

    /* Rachat-burn : tranche bornee. Le plafond de prix est pris depuis le
       PREMIER prix vu par le hook dans la seconde courante (ou le prix courant
       si personne n'a echange dans la seconde) : un sandwich qui pousse le prix
       avant ce rachat ne fait que reduire la tranche. */
    function buybackBurn(address token, uint256 maxQuoteIn) external nonReentrant returns (uint256 spent, uint256 burned) {
        (PoolKey memory key, bool quoteIs0,,) = ICoreV5(core).poolInfo(token);
        Buckets storage b = buckets[token];
        uint256 amount = b.buyback < maxQuoteIn ? b.buyback : maxQuoteIn;
        if (amount == 0) return (0, 0);

        PoolId id = key.toId();
        (uint160 cur,,,) = poolManager.getSlot0(id);
        (uint160 ref,) = IHookDrain(hook).refPrice(id);
        if (ref == 0) ref = cur;
        // un achat fait baisser le prix si la cotation est currency0, le monte sinon
        // facteurs, arrondis vers l'interieur : sqrt(1 - 3 %) = 0,984885780… ; sqrt(1 + 3 %) = 1,014889156…
        // (MAX_IMPACT_BPS = 300 ; un test verifie que ces facteurs correspondent bien a la constante)
        uint160 limit = quoteIs0 ? uint160(uint256(ref) * 984_885_781 / 1e9) : uint160(uint256(ref) * 1_014_889_156 / 1e9);
        if (quoteIs0 ? cur <= limit : cur >= limit) return (0, 0);

        (spent, burned) = abi.decode(poolManager.unlock(abi.encode(uint8(2), key, quoteIs0, amount, limit)), (uint256, uint256));
        b.buyback -= uint128(spent);
        emit Distributed(token, 0, 0, spent, burned);
    }

    /* ============================ retraits ============================ */

    function withdraw(Currency currency) external nonReentrant returns (uint256 amount) {
        uint256 id = currency.toId();
        amount = owed[msg.sender][id];
        if (amount == 0) return 0;
        owed[msg.sender][id] = 0;
        poolManager.unlock(abi.encode(uint8(3), currency, msg.sender, amount));
        emit Withdrawn(msg.sender, Currency.unwrap(currency), amount);
    }

    /* ============================ staking ============================ */

    function stake(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        (PoolKey memory key, bool quoteIs0,,) = ICoreV5(core).poolInfo(token); // revert si jeton inconnu
        _harvest(token, msg.sender, quoteIs0 ? key.currency0 : key.currency1);
        require(IERC20H(token).transferFrom(msg.sender, address(this), amount), "transfer");
        Stake storage s = stakes[token][msg.sender];
        StakePool storage p = stakePools[token];
        s.amount += amount;
        s.since = uint64(block.timestamp);
        p.total += amount;
        s.debt = s.amount * p.acc / ACC;
        emit Staked(token, msg.sender, amount);
    }

    function unstake(address token, uint256 amount) external nonReentrant {
        Stake storage s = stakes[token][msg.sender];
        require(amount > 0 && amount <= s.amount, "amount");
        require(block.timestamp >= uint256(s.since) + V5.STAKE_MIN_SECONDS, "stake: 24h minimum");
        (PoolKey memory key, bool quoteIs0,,) = ICoreV5(core).poolInfo(token);
        _harvest(token, msg.sender, quoteIs0 ? key.currency0 : key.currency1);
        StakePool storage p = stakePools[token];
        s.amount -= amount;
        p.total -= amount;
        s.debt = s.amount * p.acc / ACC;
        require(IERC20H(token).transfer(msg.sender, amount), "transfer");
        emit Unstaked(token, msg.sender, amount);
    }

    /// Credite la recompense acquise ; elle se retire ensuite avec `withdraw(cotation)`.
    function claimReward(address token) external nonReentrant returns (uint256 r) {
        (PoolKey memory key, bool quoteIs0,,) = ICoreV5(core).poolInfo(token);
        r = _harvest(token, msg.sender, quoteIs0 ? key.currency0 : key.currency1);
    }

    function pendingReward(address token, address account) external view returns (uint256) {
        Stake storage s = stakes[token][account];
        return s.amount * stakePools[token].acc / ACC - s.debt;
    }

    function _harvest(address token, address account, Currency quote) internal returns (uint256 r) {
        Stake storage s = stakes[token][account];
        StakePool storage p = stakePools[token];
        uint256 accrued = s.amount * p.acc / ACC;
        r = accrued - s.debt;
        s.debt = accrued;
        if (r > p.unpaid) r = p.unpaid;
        if (r > 0) {
            p.unpaid -= r;
            owed[account][quote.toId()] += r;
            emit RewardClaimed(token, account, r);
        }
    }

    /* ============================ PoolManager ============================ */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "pm");
        uint8 op = uint8(data[31]);
        if (op == 1) {
            (, PoolKey memory key, bool quoteIs0, uint256 amount) = abi.decode(data, (uint8, PoolKey, bool, uint256));
            return abi.encode(_addFloor(key, quoteIs0, amount));
        } else if (op == 2) {
            (, PoolKey memory key, bool quoteIs0, uint256 amount, uint160 limit) =
                abi.decode(data, (uint8, PoolKey, bool, uint256, uint160));
            return _buy(key, quoteIs0, amount, limit);
        } else {
            (, Currency c, address to, uint256 amount) = abi.decode(data, (uint8, Currency, address, uint256));
            poolManager.burn(address(this), c.toId(), amount);
            poolManager.take(c, to, amount);
            return "";
        }
    }

    /* Le mur d'achat : cotation seule, sur FLOOR_WIDTH_TICKS juste du cote ou
       le prix va quand on VEND le jeton. Paye en brulant nos creances. */
    function _addFloor(PoolKey memory key, bool quoteIs0, uint256 amount) internal returns (uint256 used) {
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        int24 sp = V5.TICK_SPACING;
        int24 down = tick / sp * sp;
        if (tick < 0 && tick % sp != 0) down -= sp;
        int24 tl;
        int24 tu;
        uint128 liq;
        if (quoteIs0) {
            // cotation = currency0 : position au-dessus du prix courant
            tl = down + sp;
            tu = tl + V5.FLOOR_WIDTH_TICKS;
            if (tu > TickMath.maxUsableTick(sp)) return 0;
            uint160 sa = TickMath.getSqrtPriceAtTick(tl);
            uint160 sb = TickMath.getSqrtPriceAtTick(tu);
            liq = _u128(FullMath.mulDiv(amount, FullMath.mulDiv(sa, sb, FixedPoint96.Q96), sb - sa));
        } else {
            // cotation = currency1 : position au-dessous du prix courant
            tu = down;
            tl = tu - V5.FLOOR_WIDTH_TICKS;
            if (tl < TickMath.minUsableTick(sp)) return 0;
            uint160 sa = TickMath.getSqrtPriceAtTick(tl);
            uint160 sb = TickMath.getSqrtPriceAtTick(tu);
            liq = _u128(FullMath.mulDiv(amount, FixedPoint96.Q96, sb - sa));
        }
        if (liq == 0) return 0;
        (BalanceDelta d,) = poolManager.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({tickLower: tl, tickUpper: tu, liquidityDelta: int256(uint256(liq)), salt: 0}),
            ""
        );
        int128 dq = quoteIs0 ? d.amount0() : d.amount1();
        int128 dt = quoteIs0 ? d.amount1() : d.amount0();
        require(dt == 0 && dq <= 0, "one-sided");
        used = uint256(uint128(-dq));
        require(used <= amount, "floor");
        Currency quote = quoteIs0 ? key.currency0 : key.currency1;
        if (used > 0) poolManager.burn(address(this), quote.toId(), used);
    }

    function _buy(PoolKey memory key, bool quoteIs0, uint256 amount, uint160 limit) internal returns (bytes memory) {
        BalanceDelta d = poolManager.swap(
            key, IPoolManager.SwapParams({zeroForOne: quoteIs0, amountSpecified: -int256(amount), sqrtPriceLimitX96: limit}), ""
        );
        int128 dq = quoteIs0 ? d.amount0() : d.amount1();
        int128 dt = quoteIs0 ? d.amount1() : d.amount0();
        uint256 spent = dq < 0 ? uint256(uint128(-dq)) : 0;
        uint256 out = dt > 0 ? uint256(uint128(dt)) : 0;
        Currency quote = quoteIs0 ? key.currency0 : key.currency1;
        Currency tok = quoteIs0 ? key.currency1 : key.currency0;
        if (spent > 0) poolManager.burn(address(this), quote.toId(), spent);
        if (out > 0) poolManager.take(tok, V5.DEAD, out);
        return abi.encode(spent, out);
    }

    function _u128(uint256 x) internal pure returns (uint128) {
        require(x <= type(uint128).max, "liquidity");
        return uint128(x);
    }
}
