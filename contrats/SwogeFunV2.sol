// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/* ============================================================
   $SWOGE FUN V2 — dual-mode launchpad

   Mode 0  "Fair Curve"        : bonding curve (pump.fun style).
             1% SWOGE + creator fee 0..20% (dev wallet OR holder reflection),
             graduates to a Uniswap v3 pool (LP burned).

   Mode 1  "Instant DexScreener": a real Uniswap v3 pool is created at launch.
             100% of supply is placed single-sided (0 ETH from anyone). The LP
             NFT is locked in this contract forever (liquidity can never be
             pulled) but its 1% pool trading fee is collectable and split
             70% creator / 30% SWOGE.

   NOTE: holds/locks liquidity. Fork-tested, but audit before scaling.
   ============================================================ */

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
}
interface ISwogeFun { function onMove(address from, address to, uint256 value) external; }
interface INonfungiblePositionManager {
    struct MintParams {
        address token0; address token1; uint24 fee;
        int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired;
        uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline;
    }
    struct CollectParams {
        uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max;
    }
    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external payable returns (address pool);
    function mint(MintParams calldata params)
        external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata params)
        external payable returns (uint256 amount0, uint256 amount1);
}

/* ---------- curve token: fixed supply + launchpad move-hook (for reflection) ---------- */
contract SwogeCurveToken {
    string public name; string public symbol;
    uint8  public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable fun;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name; symbol = _symbol; totalSupply = _supply; fun = msg.sender;
        balanceOf[msg.sender] = _supply; emit Transfer(address(0), msg.sender, _supply);
    }
    function transfer(address to, uint256 v) external returns (bool) { _t(msg.sender, to, v); return true; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s]=v; emit Approval(msg.sender,s,v); return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender]; require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _t(f, to, v); return true;
    }
    function _t(address f, address to, uint256 v) internal {
        require(to != address(0), "zero");
        uint256 b = balanceOf[f]; require(b >= v, "balance");
        unchecked { balanceOf[f]=b-v; balanceOf[to]+=v; }
        emit Transfer(f, to, v);
        ISwogeFun(fun).onMove(f, to, v);
    }
}

/* ---------- plain ERC-20 for Instant mode (no hook — trades on Uniswap) ----------
   Anti-snipe (pons-style): during the first SNIPE_BLOCKS blocks after launch, no
   wallet may hold more than SNIPE_MAX_BPS of supply (pool + launchpad exempt). */
contract SwogePlainToken {
    string public name; string public symbol;
    uint8  public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable fun;          // the launchpad
    address public pool;                   // set once by the launchpad at launch
    uint256 public immutable launchBlock;
    uint256 public constant SNIPE_BLOCKS  = 2;    // protected window
    uint16  public constant SNIPE_MAX_BPS = 500;  // 5% of supply per wallet
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name; symbol = _symbol; totalSupply = _supply;
        fun = msg.sender; launchBlock = block.number;
        balanceOf[msg.sender] = _supply; emit Transfer(address(0), msg.sender, _supply);
    }
    function setPool(address p) external {
        require(msg.sender == fun && pool == address(0), "pool set");
        pool = p;
    }
    function transfer(address to, uint256 v) external returns (bool) { _t(msg.sender, to, v); return true; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s]=v; emit Approval(msg.sender,s,v); return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender]; require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _t(f, to, v); return true;
    }
    function _t(address f, address to, uint256 v) internal {
        require(to != address(0), "zero");
        uint256 b = balanceOf[f]; require(b >= v, "balance");
        unchecked { balanceOf[f]=b-v; balanceOf[to]+=v; }
        // anti-snipe: cap non-exempt wallets during the launch window
        if (block.number < launchBlock + SNIPE_BLOCKS && to != pool && to != fun) {
            require(balanceOf[to] <= totalSupply * SNIPE_MAX_BPS / 10000, "anti-snipe: max 5% at launch");
        }
        emit Transfer(f, to, v);
    }
}

/* ---------- Uniswap v3 TickMath.getSqrtRatioAtTick (audited, verbatim) ---------- */
library TickMath {
    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        unchecked {
            uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            require(absTick <= 887272, "T");
            uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
            if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
            if (tick > 0) ratio = type(uint256).max / ratio;
            sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
        }
    }
}

contract SwogeFunV2 {
    /* ---------- fees ---------- */
    uint16 public constant PROTOCOL_FEE_BPS    = 100;   // 1% → SWOGE (curve mode)
    uint16 public constant MAX_CREATOR_FEE_BPS = 2000;  // ≤20% (curve mode)
    uint16 public constant INSTANT_CREATOR_SHARE_BPS = 7000; // 70% of the pool fee → creator (instant mode)
    address public swogeTreasury = 0xaD19cB5F485266989ED0AfE18cfAaEAc6156fc30;

    address public owner;
    uint256 public creationFee;

    address public immutable positionManager;
    address public immutable weth;
    uint24  public constant POOL_FEE   = 10000;         // 1% tier
    int24   public constant TICK_LOWER = -887200;       // curve-graduation full range
    int24   public constant TICK_UPPER =  887200;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /* ---------- instant-mode range (canonical weth-per-token space, price rising) ---------- */
    // tuned so a fresh launch starts near ~1 ETH FDV with deep headroom.
    int24 public constant I_TICK_START = -207200;       // start price ≈ 1e-9 weth/token
    int24 public constant I_TICK_TOP   =  -46000;       // top of the single-sided range

    /* ---------- curve economics ---------- */
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_SUPPLY =   800_000_000 ether;
    uint256 public constant LP_SUPPLY    =   200_000_000 ether;
    uint256 public constant VTOK_INIT    = 1_000_000_000 ether;
    uint256 public constant VETH_INIT    = 1 ether;

    uint8 public constant FEE_DEV = 0;
    uint8 public constant FEE_HOLDERS = 1;
    uint8 public constant MODE_CURVE = 0;
    uint8 public constant MODE_INSTANT = 1;

    struct Curve {
        address token; address creator; address devWallet;
        uint8 feeMode; uint16 creatorFeeBps; uint16 maxWalletBps;
        uint256 vEth; uint256 tokensSold; bool graduated; bool exists;
    }
    mapping(address => Curve) public curves;

    struct Inst {
        address token; address creator; address pool; uint256 lpTokenId; bool exists;
    }
    mapping(address => Inst) public instant;
    mapping(address => uint8) public modeOf;   // 0 curve, 1 instant

    address[] public allTokens;

    /* ---------- reflection ---------- */
    uint256 internal constant MAG = 2**128;
    mapping(address => uint256) public magPerShare;
    mapping(address => mapping(address => int256)) internal magCorrection;
    mapping(address => mapping(address => uint256)) public withdrawn;

    event Created(address indexed token, address indexed creator, string name, string symbol, uint8 feeMode, address devWallet, uint16 creatorFeeBps, uint16 maxWalletBps);
    event Meta(address indexed token, string telegram, string twitter, string website, string logo);
    event Buy(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 protocolFee, uint256 creatorFee);
    event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 protocolFee, uint256 creatorFee);
    event HolderRewards(address indexed token, uint256 amount);
    event Claimed(address indexed token, address indexed holder, uint256 amount);
    event Graduated(address indexed token, uint256 ethToLp, uint256 tokensToLp, address pool);
    event LaunchedInstant(address indexed token, address indexed creator, address pool, uint256 lpTokenId);
    event FeesCollected(address indexed token, uint256 ethToCreator, uint256 ethToSwoge, uint256 tokToCreator, uint256 tokToSwoge);

    bool private _locked;
    modifier nonReentrant() { require(!_locked, "reentrant"); _locked = true; _; _locked = false; }
    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }

    constructor(address _positionManager, address _weth) {
        owner = msg.sender; positionManager = _positionManager; weth = _weth;
    }

    function setSwogeTreasury(address r) external onlyOwner { require(r != address(0), "zero"); swogeTreasury = r; }
    function setCreationFee(uint256 f) external onlyOwner { creationFee = f; }
    function transferOwnership(address n) external onlyOwner { owner = n; }
    function tokenCount() external view returns (uint256) { return allTokens.length; }

    struct LaunchParams {
        string name; string symbol;
        uint8  mode;            // 0 curve, 1 instant
        uint16 maxWalletBps; uint8 feeMode; address devWallet; uint16 creatorFeeBps;
        string telegram; string twitter; string website;
        string logo;            // optional logo image URL, shown on the site
    }

    function createToken(LaunchParams calldata p) external payable nonReentrant returns (address t) {
        require(msg.value >= creationFee, "creation fee");
        if (p.mode == MODE_INSTANT) {
            t = _launchInstant(p);
        } else {
            t = _launchCurve(p);
        }
        allTokens.push(t);
        emit Meta(t, p.telegram, p.twitter, p.website, p.logo);
        if (creationFee > 0) _send(swogeTreasury, creationFee);
        if (msg.value > creationFee) _send(msg.sender, msg.value - creationFee);
    }

    /* ---------- curve launch (unchanged economics) ---------- */
    function _launchCurve(LaunchParams calldata p) internal returns (address t) {
        require(p.feeMode == FEE_DEV || p.feeMode == FEE_HOLDERS, "bad mode");
        require(p.creatorFeeBps <= MAX_CREATOR_FEE_BPS, "creator fee too high");
        require(p.maxWalletBps == 0 || p.maxWalletBps >= 10, "maxwallet too low");
        address dev = p.feeMode == FEE_DEV ? (p.devWallet == address(0) ? msg.sender : p.devWallet) : address(0);
        t = address(new SwogeCurveToken(p.name, p.symbol, TOTAL_SUPPLY));
        curves[t] = Curve({
            token: t, creator: msg.sender, devWallet: dev,
            feeMode: p.feeMode, creatorFeeBps: p.creatorFeeBps, maxWalletBps: p.maxWalletBps,
            vEth: VETH_INIT, tokensSold: 0, graduated: false, exists: true
        });
        modeOf[t] = MODE_CURVE;
        emit Created(t, msg.sender, p.name, p.symbol, p.feeMode, dev, p.creatorFeeBps, p.maxWalletBps);
    }

    /* ---------- instant launch: single-sided Uniswap v3, locked LP ---------- */
    function _launchInstant(LaunchParams calldata p) internal returns (address t) {
        t = address(new SwogePlainToken(p.name, p.symbol, TOTAL_SUPPLY));
        require(IERC20(t).approve(positionManager, TOTAL_SUPPLY), "approve");

        // Write straight into the MintParams struct to keep the stack shallow.
        // Goal: the position holds 100% token and 0 WETH, and price rises as people buy.
        INonfungiblePositionManager.MintParams memory mp;
        mp.fee = POOL_FEE;
        mp.recipient = address(this);          // LP NFT locked here forever (fees still collectable)
        mp.deadline = block.timestamp + 1200;
        uint160 sqrtP;
        if (t < weth) {
            // token is token0. price = weth/token (rises directly). Init at the LOWER
            // boundary so the whole position is token0 (the token) only.
            mp.token0 = t; mp.token1 = weth;
            mp.tickLower = _round(I_TICK_START); mp.tickUpper = _round(I_TICK_TOP);
            mp.amount0Desired = TOTAL_SUPPLY;
            sqrtP = TickMath.getSqrtRatioAtTick(mp.tickLower);
        } else {
            // weth is token0, token is token1. pool price = token/weth (inverse), so the
            // canonical range is negated & swapped; init at the UPPER boundary → all token1.
            mp.token0 = weth; mp.token1 = t;
            mp.tickLower = _round(-I_TICK_TOP); mp.tickUpper = _round(-I_TICK_START);
            mp.amount1Desired = TOTAL_SUPPLY;
            sqrtP = TickMath.getSqrtRatioAtTick(mp.tickUpper);
        }

        address pool = INonfungiblePositionManager(positionManager)
            .createAndInitializePoolIfNecessary(mp.token0, mp.token1, POOL_FEE, sqrtP);
        SwogePlainToken(t).setPool(pool);   // exempt the pool from anti-snipe BEFORE the mint
        (uint256 tokenId,,,) = INonfungiblePositionManager(positionManager).mint(mp);

        instant[t] = Inst({ token: t, creator: msg.sender, pool: pool, lpTokenId: tokenId, exists: true });
        modeOf[t] = MODE_INSTANT;
        emit Created(t, msg.sender, p.name, p.symbol, 0, msg.sender, 0, 0);
        emit LaunchedInstant(t, msg.sender, pool, tokenId);
    }

    // collect the 1% pool trading fee and split 70% creator / 30% SWOGE.
    // permissionless: anyone can trigger it; the split is fixed.
    function collectFees(address token) external nonReentrant {
        Inst storage i = instant[token];
        require(i.exists, "not instant");
        (uint256 a0, uint256 a1) = INonfungiblePositionManager(positionManager).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: i.lpTokenId, recipient: address(this),
                amount0Max: type(uint128).max, amount1Max: type(uint128).max
            })
        );
        (uint256 wethAmt, uint256 tokAmt) = token < weth ? (a1, a0) : (a0, a1);

        uint256 ethCreator; uint256 ethSwoge; uint256 tokCreator; uint256 tokSwoge;
        if (wethAmt > 0) {
            IWETH(weth).withdraw(wethAmt);
            ethCreator = wethAmt * INSTANT_CREATOR_SHARE_BPS / 10000;
            ethSwoge   = wethAmt - ethCreator;
            if (ethCreator > 0) _send(i.creator, ethCreator);
            if (ethSwoge   > 0) _send(swogeTreasury, ethSwoge);
        }
        if (tokAmt > 0) {
            tokCreator = tokAmt * INSTANT_CREATOR_SHARE_BPS / 10000;
            tokSwoge   = tokAmt - tokCreator;
            if (tokCreator > 0) IERC20(token).transfer(i.creator, tokCreator);
            if (tokSwoge   > 0) IERC20(token).transfer(swogeTreasury, tokSwoge);
        }
        emit FeesCollected(token, ethCreator, ethSwoge, tokCreator, tokSwoge);
    }

    function _round(int24 tick) internal pure returns (int24) {
        int24 spacing = 200; // 1% fee tier
        int24 r = tick / spacing * spacing;
        return r;
    }

    /* ---------- curve quotes/buy/sell/fees/reflection (unchanged from V1) ---------- */
    function quoteBuy(address token, uint256 ethIn) public view returns (uint256 tokensOut, uint256 fee) {
        Curve storage c = curves[token];
        fee = ethIn * (PROTOCOL_FEE_BPS + c.creatorFeeBps) / 10000;
        uint256 netEth = ethIn - fee;
        uint256 vTok = VTOK_INIT - c.tokensSold;
        uint256 k = c.vEth * vTok;
        uint256 out = vTok - k / (c.vEth + netEth);
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        tokensOut = out > remaining ? remaining : out;
    }
    function quoteSell(address token, uint256 tokensIn) public view returns (uint256 ethOut, uint256 fee) {
        Curve storage c = curves[token];
        uint256 vTok = VTOK_INIT - c.tokensSold;
        uint256 k = c.vEth * vTok;
        uint256 gross = c.vEth - k / (vTok + tokensIn);
        fee = gross * (PROTOCOL_FEE_BPS + c.creatorFeeBps) / 10000;
        ethOut = gross - fee;
    }

    function buy(address token, uint256 minTokensOut) external payable nonReentrant {
        Curve storage c = curves[token];
        require(c.exists, "unknown"); require(!c.graduated, "graduated"); require(msg.value > 0, "no eth");
        uint16 totalBps = PROTOCOL_FEE_BPS + c.creatorFeeBps;
        uint256 feeBase = msg.value;
        uint256 netEth = msg.value - (msg.value * totalBps / 10000);
        uint256 vTok = VTOK_INIT - c.tokensSold;
        uint256 k = c.vEth * vTok;
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        uint256 tokensOut = vTok - k / (c.vEth + netEth);
        uint256 refund = 0;
        if (tokensOut >= remaining) {
            tokensOut = remaining;
            uint256 ethNeeded = (k / (vTok - tokensOut)) - c.vEth;
            uint256 grossNeeded = ethNeeded * 10000 / (10000 - totalBps);
            feeBase = grossNeeded;
            if (grossNeeded < msg.value) refund = msg.value - grossNeeded;
            netEth = ethNeeded;
        }
        require(tokensOut >= minTokensOut, "slippage"); require(tokensOut > 0, "zero out");
        c.vEth += netEth; c.tokensSold += tokensOut;
        require(IERC20(c.token).transfer(msg.sender, tokensOut), "xfer");
        if (c.maxWalletBps > 0) require(IERC20(c.token).balanceOf(msg.sender) <= TOTAL_SUPPLY * c.maxWalletBps / 10000, "max wallet");
        (uint256 pFee, uint256 cFee) = _payFees(c, feeBase);
        if (refund > 0) _send(msg.sender, refund);
        emit Buy(token, msg.sender, netEth, tokensOut, pFee, cFee);
        if (c.tokensSold >= CURVE_SUPPLY) _graduate(c);
    }

    function sell(address token, uint256 tokensIn, uint256 minEthOut) external nonReentrant {
        Curve storage c = curves[token];
        require(c.exists, "unknown"); require(!c.graduated, "graduated");
        require(tokensIn > 0, "no tokens"); require(tokensIn <= c.tokensSold, "too much");
        uint256 vTok = VTOK_INIT - c.tokensSold;
        uint256 k = c.vEth * vTok;
        uint256 gross = c.vEth - k / (vTok + tokensIn);
        uint256 ethOut = gross - (gross * (PROTOCOL_FEE_BPS + c.creatorFeeBps) / 10000);
        require(ethOut >= minEthOut, "slippage");
        c.vEth -= gross; c.tokensSold -= tokensIn;
        require(IERC20(c.token).transferFrom(msg.sender, address(this), tokensIn), "pull");
        (uint256 pFee, uint256 cFee) = _payFees(c, gross);
        _send(msg.sender, ethOut);
        emit Sell(token, msg.sender, tokensIn, ethOut, pFee, cFee);
    }

    function _payFees(Curve storage c, uint256 base) internal returns (uint256 protocolFee, uint256 creatorFee) {
        protocolFee = base * PROTOCOL_FEE_BPS / 10000;
        creatorFee  = base * c.creatorFeeBps / 10000;
        if (protocolFee > 0) _send(swogeTreasury, protocolFee);
        if (creatorFee > 0) {
            if (c.feeMode == FEE_DEV) _send(c.devWallet, creatorFee);
            else _distributeToHolders(c.token, creatorFee);
        }
    }
    function _distributeToHolders(address token, uint256 amount) internal {
        uint256 shares = curves[token].tokensSold;
        if (shares == 0 || amount == 0) { if (amount > 0) _send(swogeTreasury, amount); return; }
        magPerShare[token] += amount * MAG / shares;
        emit HolderRewards(token, amount);
    }
    function onMove(address from, address to, uint256 value) external {
        require(curves[msg.sender].exists, "not a token");
        uint256 mps = magPerShare[msg.sender];
        if (mps == 0) return;
        int256 delta = int256(mps * value);
        if (from != address(this) && from != address(0)) magCorrection[msg.sender][from] += delta;
        if (to   != address(this) && to   != address(0)) magCorrection[msg.sender][to]   -= delta;
    }
    function pendingRewards(address token, address holder) public view returns (uint256) {
        int256 acc = int256(magPerShare[token] * IERC20(token).balanceOf(holder)) + magCorrection[token][holder];
        uint256 total = acc < 0 ? 0 : uint256(acc) / MAG;
        uint256 w = withdrawn[token][holder];
        return total > w ? total - w : 0;
    }
    function claimRewards(address token) external nonReentrant {
        uint256 amt = pendingRewards(token, msg.sender);
        require(amt > 0, "nothing");
        withdrawn[token][msg.sender] += amt;
        _send(msg.sender, amt);
        emit Claimed(token, msg.sender, amt);
    }

    function _graduate(Curve storage c) internal {
        c.graduated = true;
        uint256 ethForLp = c.vEth - VETH_INIT;
        IWETH(weth).deposit{value: ethForLp}();
        IWETH(weth).approve(positionManager, ethForLp);
        require(IERC20(c.token).approve(positionManager, LP_SUPPLY), "approve");
        (address t0, address t1, uint256 a0, uint256 a1) = c.token < weth
            ? (c.token, weth, LP_SUPPLY, ethForLp) : (weth, c.token, ethForLp, LP_SUPPLY);
        uint160 sqrtP = _sqrtPriceX96(a0, a1);
        address pool = INonfungiblePositionManager(positionManager).createAndInitializePoolIfNecessary(t0, t1, POOL_FEE, sqrtP);
        INonfungiblePositionManager.MintParams memory p = INonfungiblePositionManager.MintParams({
            token0: t0, token1: t1, fee: POOL_FEE, tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
            amount0Desired: a0, amount1Desired: a1, amount0Min: 0, amount1Min: 0,
            recipient: DEAD, deadline: block.timestamp + 1200
        });
        INonfungiblePositionManager(positionManager).mint(p);
        emit Graduated(c.token, ethForLp, LP_SUPPLY, pool);
    }
    function _sqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        uint256 ratio = (amount1 << 96) / amount0;
        uint256 s = _sqrt(ratio) << 48;
        require(s <= type(uint160).max, "price overflow");
        return uint160(s);
    }
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2; y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }
    function _send(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}(""); require(ok, "eth send");
    }
    receive() external payable {}
}
