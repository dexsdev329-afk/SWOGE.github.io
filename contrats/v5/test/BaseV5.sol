// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";

import {V5, TokenMeta, Split, Snipe, Limits, Alloc, LaunchParams} from "../src/SwogeTypesV5.sol";
import {SwogeTokenV5} from "../src/SwogeTokenV5.sol";
import {SwogeHookV5} from "../src/SwogeHookV5.sol";
import {SwogeLaunchpadV5} from "../src/SwogeLaunchpadV5.sol";
import {SwogeHoldersV5} from "../src/SwogeHoldersV5.sol";
import {SwogeAllocV5} from "../src/SwogeAllocV5.sol";
import {SwogeDeployerV5} from "../src/SwogeDeployerV5.sol";

/// ERC-20 de test (cotation), decimales au choix.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferFrom(address f, address to, uint256 v) public virtual returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
        return true;
    }
}

/// Routeur d'essai : un echange, dans les quatre formes, ETH natif ou ERC-20.
contract Router is IUnlockCallback {
    IPoolManager public immutable pm;

    constructor(IPoolManager _pm) {
        pm = _pm;
    }

    struct Job {
        address payer;
        PoolKey key;
        bool zeroForOne;
        int256 amount;
        uint160 limit;
    }

    function swap(PoolKey memory key, bool zeroForOne, int256 amount) external payable returns (BalanceDelta) {
        return swapLimit(key, zeroForOne, amount, zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1);
    }

    function swapLimit(PoolKey memory key, bool zeroForOne, int256 amount, uint160 limit)
        public
        payable
        returns (BalanceDelta d)
    {
        d = abi.decode(pm.unlock(abi.encode(Job(msg.sender, key, zeroForOne, amount, limit))), (BalanceDelta));
        if (address(this).balance > 0) {
            (bool ok,) = msg.sender.call{value: address(this).balance}("");
            require(ok, "refund");
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        Job memory j = abi.decode(data, (Job));
        BalanceDelta d = pm.swap(j.key, IPoolManager.SwapParams(j.zeroForOne, j.amount, j.limit), "");
        _settle(j.key.currency0, j.payer, d.amount0());
        _settle(j.key.currency1, j.payer, d.amount1());
        return abi.encode(d);
    }

    function _settle(Currency c, address payer, int128 v) internal {
        if (v < 0) {
            uint256 a = uint256(uint128(-v));
            if (c.isAddressZero()) {
                pm.settle{value: a}();
            } else {
                pm.sync(c);
                MockERC20(Currency.unwrap(c)).transferFrom(payer, address(pm), a);
                pm.settle();
            }
        } else if (v > 0) {
            pm.take(c, payer, uint256(uint128(v)));
        }
    }

    receive() external payable {}
}

/// Tiers qui tente d'ajouter ou de retirer de la liquidite.
contract LiquidityProbe is IUnlockCallback {
    IPoolManager public immutable pm;

    constructor(IPoolManager _pm) {
        pm = _pm;
    }

    function modify(PoolKey memory key, int24 tl, int24 tu, int256 liq) external {
        pm.unlock(abi.encode(key, tl, tu, liq));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, int24 tl, int24 tu, int256 liq) = abi.decode(data, (PoolKey, int24, int24, int256));
        pm.modifyLiquidity(key, IPoolManager.ModifyLiquidityParams(tl, tu, liq, 0), "");
        return "";
    }
}

abstract contract BaseV5 is Test {
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    SwogeDeployerV5 deployer;
    SwogeHookV5 hook;
    SwogeLaunchpadV5 core;
    SwogeHoldersV5 holders;
    SwogeAllocV5 allocM;
    Router router;

    MockERC20 usdg;
    MockERC20 swoge;
    MockERC20 stock;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant LAUNCH_FEE = 0.0005 ether;
    uint160 constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    // ticks « cotation par jeton » : ETH 1e-9 ETH/jeton (le depart de V4) ; USDG 6 decimales, 4e-6 $/jeton
    int24 constant TICK_ETH = -207_200;
    int24 constant TICK_USDG = -390_600;
    // $SWOGE : 1 jeton ≈ 0,102 $SWOGE (1 ETH de FDV a 9,79e-9 ETH le $SWOGE) ; action : ≈ 2,2e-8 NVDA par jeton
    int24 constant TICK_SWOGE = -22_800;
    int24 constant TICK_STOCK = -176_400;
    /// Instant de depart fixe : avec via-ir, `block.timestamp` lu dans un essai peut etre relu apres vm.warp.
    uint256 constant T0 = 1_000_000;

    function _deployAll(IPoolManager _pm, address[] memory qs, int24[] memory ts) internal {
        pm = _pm;
        deployer = new SwogeDeployerV5();
        bytes32 hookSalt = mineHookSalt(address(deployer), address(this));
        address aHook = deployer.addressOf(address(this), hookSalt);
        address aCore = deployer.addressOf(address(this), keccak256("swoge.v5.core"));
        address aHolders = deployer.addressOf(address(this), keccak256("swoge.v5.holders"));
        address aAlloc = deployer.addressOf(address(this), keccak256("swoge.v5.alloc"));

        deployer.deploy(hookSalt, abi.encodePacked(type(SwogeHookV5).creationCode, abi.encode(pm, aCore, aHolders)));
        deployer.deploy(
            keccak256("swoge.v5.core"),
            abi.encodePacked(
                type(SwogeLaunchpadV5).creationCode, abi.encode(pm, aHook, aHolders, aAlloc, treasury, LAUNCH_FEE, qs, ts)
            )
        );
        deployer.deploy(
            keccak256("swoge.v5.holders"), abi.encodePacked(type(SwogeHoldersV5).creationCode, abi.encode(pm, aCore, aHook))
        );
        deployer.deploy(keccak256("swoge.v5.alloc"), abi.encodePacked(type(SwogeAllocV5).creationCode, abi.encode(aCore)));
        hook = SwogeHookV5(aHook);
        core = SwogeLaunchpadV5(payable(aCore));
        holders = SwogeHoldersV5(aHolders);
        allocM = SwogeAllocV5(aAlloc);
        router = new Router(pm);
    }

    function mineHookSalt(address dep, address by) internal pure returns (bytes32) {
        bytes32 ph = keccak256(hex"67363d3d37363d34f03d5260086018f3");
        for (uint256 i; i < 2_000_000; ++i) {
            bytes32 s = keccak256(abi.encode(by, bytes32(i)));
            address proxy = address(uint160(uint256(keccak256(abi.encodePacked(hex"ff", dep, s, ph)))));
            address a = address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", proxy, hex"01")))));
            if (uint160(a) & Hooks.ALL_HOOK_MASK == FLAGS) return bytes32(i);
        }
        revert("no salt");
    }

    function setUpLocal() internal {
        vm.warp(T0);
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        swoge = new MockERC20("Swole Doge", "SWOGE", 18);
        stock = new MockERC20("NVIDIA", "NVDA", 18);
        address[] memory qs = new address[](4);
        int24[] memory ts = new int24[](4);
        qs[0] = address(0);
        ts[0] = TICK_ETH;
        qs[1] = address(usdg);
        ts[1] = TICK_USDG;
        qs[2] = address(swoge);
        ts[2] = TICK_SWOGE;
        qs[3] = address(stock);
        ts[3] = TICK_STOCK;
        _deployAll(new PoolManager(address(this)), qs, ts);
        vm.deal(creator, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        address[3] memory who = [creator, alice, bob];
        for (uint256 i; i < 3; ++i) {
            usdg.mint(who[i], 1e15);
            swoge.mint(who[i], 1e30);
            stock.mint(who[i], 1e30);
            vm.startPrank(who[i]);
            usdg.approve(address(router), type(uint256).max);
            swoge.approve(address(router), type(uint256).max);
            stock.approve(address(router), type(uint256).max);
            usdg.approve(address(core), type(uint256).max);
            swoge.approve(address(core), type(uint256).max);
            stock.approve(address(core), type(uint256).max);
            vm.stopPrank();
        }
    }

    /* ---- parametres ---- */

    function params(uint8 quote) internal view returns (LaunchParams memory p) {
        p.name = "Test Token";
        p.symbol = "TEST";
        p.salt = bytes32(uint256(1));
        p.meta = TokenMeta("desc", "https://logo", "https://site", "https://x.com/t", "https://t.me/t");
        p.quote = quote;
        p.shape = 0;
        p.creatorTaxBps = 0;
        p.split = Split(10_000, 0, 0, 0);
        p.snipe = Snipe(0, 0);
        p.limits = Limits(0, 0, 0);
        p.feeRecipient = creator;
    }

    function launch(LaunchParams memory p) internal returns (address t) {
        uint256 v = LAUNCH_FEE + (p.quote == 0 ? p.initialBuy : 0);
        vm.prank(creator);
        t = core.createToken{value: v}(p);
    }

    function keyOf(address t) internal view returns (PoolKey memory key, bool quoteIs0) {
        (key, quoteIs0,,) = core.poolInfo(t);
    }

    function idOf(address t) internal view returns (PoolId) {
        (PoolKey memory k,) = keyOf(t);
        return k.toId();
    }

    function quoteOf(address t) internal view returns (Currency) {
        (PoolKey memory k, bool q0) = keyOf(t);
        return q0 ? k.currency0 : k.currency1;
    }

    /// Achat : cotation -> jeton. amount < 0 entree exacte (cotation), > 0 sortie exacte (jetons).
    function buy(address who, address t, int256 amount) internal returns (BalanceDelta d) {
        (PoolKey memory k, bool q0) = keyOf(t);
        uint256 v = Currency.unwrap(q0 ? k.currency0 : k.currency1) == address(0) ? 100 ether : 0;
        vm.prank(who);
        d = router.swap{value: v}(k, q0, amount);
    }

    /// Vente : jeton -> cotation.
    function sell(address who, address t, int256 amount) internal returns (BalanceDelta d) {
        (PoolKey memory k, bool q0) = keyOf(t);
        vm.prank(who);
        SwogeTokenV5(t).approve(address(router), type(uint256).max);
        vm.prank(who);
        d = router.swap(k, !q0, amount);
    }

    function qd(address t, BalanceDelta d) internal view returns (int128) {
        (, bool q0) = keyOf(t);
        return q0 ? d.amount0() : d.amount1();
    }

    function td(address t, BalanceDelta d) internal view returns (int128) {
        (, bool q0) = keyOf(t);
        return q0 ? d.amount1() : d.amount0();
    }

    function pending(address t) internal view returns (SwogeHookV5.Pending memory) {
        return hook.getPending(idOf(t));
    }

    /// Adresse CREATE2 d'un jeton avant lancement (pour choisir l'ordre des devises).
    function predictToken(address by, bytes32 salt, string memory n, string memory s) internal view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(type(SwogeTokenV5).creationCode, abi.encode(n, s, V5.TOTAL_SUPPLY)));
        bytes32 sel = keccak256(abi.encode(by, salt));
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"ff", address(core), sel, h)))));
    }

    /// Cherche un sel qui met le jeton du cote voulu de la cotation.
    function saltFor(address quote, bool tokenBelow) internal view returns (bytes32) {
        for (uint256 i = 1; i < 500; ++i) {
            address a = predictToken(creator, bytes32(i), "Test Token", "TEST");
            if ((a < quote) == tokenBelow) return bytes32(i);
        }
        revert("no salt");
    }

    /// Creances ERC-6909 de Holders dans la devise.
    function claims(Currency c) internal view returns (uint256) {
        return PoolManager(address(pm)).balanceOf(address(holders), c.toId());
    }
}
