// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./BaseV5.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";

interface IERC20Meta {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/* ============================================================
   BANC SUR FORK LOCAL DE ROBINHOOD CHAIN (chaine 4663) — 18/10/2026

   Lance contre le VRAI PoolManager v4 de la chaine, dans un fork LOCAL :

     anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
     forge test --fork-url http://127.0.0.1:8545 --match-contract ForkV5

   Rien n'est signe ni envoye sur la chaine : anvil rejoue l'etat en local,
   forge execute en memoire. Sans fork (chainid ≠ 4663), l'essai est saute.

   Parcours : deploiement complet (deployeur CREATE3, sel du hook mine),
   lancement en ETH avec achat du createur, achats et ventes dans les quatre
   formes, distribution, retraits du createur et du tresor, rachat-burn ;
   puis lancements en USDG (6 decimales, dans les DEUX ordres de devises),
   $SWOGE, SPCX et NVDA, avec retrait du createur dans chaque cotation.
   ============================================================ */
contract ForkV5Test is BaseV5 {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    // adresses relues sur la chaine le 18/10/2026 (eth_getCode, symbol(), decimals()) : voir README
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant SWOGE = 0x8a166Fb41Cd659a0a43396272FF73973Ce29F817;
    address constant SPCX = 0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;

    // prix de depart : 1 ETH de FDV dans chaque cotation, prix DexScreener du 18/10/2026 11:18 UTC
    // (ETH 2 415,87 $ ; $SWOGE 7,88e-9 ETH ; SPCX 144,59 $ ; NVDA 213,70 $), arrondis a 200 ticks
    int24 constant F_ETH = -207_200;
    int24 constant F_USDG = -405_600;
    int24 constant F_SWOGE = -20_600;
    int24 constant F_SPCX = -179_000;
    int24 constant F_NVDA = -183_000;

    bool live;

    function setUp() public {
        live = block.chainid == 4663 && PM.code.length > 0;
        if (!live) return;
        address[] memory qs = new address[](5);
        int24[] memory ts = new int24[](5);
        (qs[0], qs[1], qs[2], qs[3], qs[4]) = (address(0), USDG, SWOGE, SPCX, NVDA);
        (ts[0], ts[1], ts[2], ts[3], ts[4]) = (F_ETH, F_USDG, F_SWOGE, F_SPCX, F_NVDA);
        _deployAll(IPoolManager(PM), qs, ts);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_fork_addresses_onchain() public {
        if (!live) return vm.skip(true);
        assertGt(PM.code.length, 0, "PoolManager");
        assertEq(IERC20Meta(USDG).symbol(), "USDG");
        assertEq(IERC20Meta(USDG).decimals(), 6);
        assertEq(IERC20Meta(SWOGE).symbol(), "SWOGE");
        assertEq(IERC20Meta(SWOGE).decimals(), 18);
        assertEq(IERC20Meta(SPCX).symbol(), "SPCX");
        assertEq(IERC20Meta(SPCX).decimals(), 18);
        assertEq(IERC20Meta(NVDA).symbol(), "NVDA");
        assertEq(IERC20Meta(NVDA).decimals(), 18);
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, FLAGS);
        emit log_named_uint("taille du noyau (octets)", address(core).code.length);
        emit log_named_uint("taille du hook (octets)", address(hook).code.length);
        emit log_named_uint("taille de Holders (octets)", address(holders).code.length);
        emit log_named_uint("taille de Alloc (octets)", address(allocM).code.length);
    }

    function test_fork_full_eth_launch_buys_sells_claims() public {
        if (!live) return vm.skip(true);
        LaunchParams memory p = params(0);
        p.creatorTaxBps = 200;
        p.snipe = Snipe(5_000, 30);
        p.split = Split(7_000, 1_000, 1_000, 1_000);
        p.initialBuy = 0.01 ether;
        p.minTokensOut = 1;
        uint256 g0 = gasleft();
        address t = launch(p);
        emit log_named_uint("gaz du lancement (ETH, achat initial)", g0 - gasleft());
        assertGt(SwogeTokenV5(t).balanceOf(creator), 0, "achat du createur dans la meme transaction");
        uint256 start = block.timestamp;

        // achat au premier instant : surtaxe pleine, au seau LP
        BalanceDelta d = buy(alice, t, -0.2 ether);
        assertEq(qd(t, d), -0.2 ether);
        assertEq(pending(t).lp, 0.2 ether * 5_000 / 10_000);

        vm.warp(start + 31);
        d = buy(bob, t, 1_000_000 ether); // sortie exacte
        assertEq(td(t, d), 1_000_000 ether);
        d = sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2)); // entree exacte
        assertGt(qd(t, d), 0);
        d = sell(bob, t, 0.001 ether); // sortie exacte
        assertEq(qd(t, d), 0.001 ether);

        SwogeHookV5.Pending memory pe = pending(t);
        assertEq(uint256(pe.treasury) + pe.creator + pe.lp, hook.feesTaken(idOf(t)));
        assertEq(claims(quoteOf(t)), hook.feesTaken(idOf(t)), "creances de Holders = frais pris");

        holders.distribute(t);
        uint256 c0 = creator.balance;
        vm.prank(creator);
        uint256 w = holders.withdraw(Currency.wrap(address(0)));
        assertGt(w, 0);
        assertEq(creator.balance - c0, w, "le createur recoit de l'ETH natif");
        uint256 tr0 = treasury.balance;
        vm.prank(treasury);
        holders.withdraw(Currency.wrap(address(0)));
        assertEq(treasury.balance - tr0, pe.treasury, "25 % du frais de base au tresor");

        vm.warp(start + 40);
        uint256 dead0 = SwogeTokenV5(t).balanceOf(V5.DEAD);
        (, uint256 burned) = holders.buybackBurn(t, type(uint256).max);
        assertEq(SwogeTokenV5(t).balanceOf(V5.DEAD) - dead0, burned, "rachat brule");
        assertEq(SwogeTokenV5(t).totalSupply(), V5.TOTAL_SUPPLY);

        // la LP ne sort pas
        (PoolKey memory k,) = keyOf(t);
        LiquidityProbe probe = new LiquidityProbe(pm);
        vm.expectRevert();
        probe.modify(k, -(F_ETH + V5.RANGE_TICKS), -F_ETH, -1e18);
    }

    function test_fork_usdg_both_orders() public {
        if (!live) return vm.skip(true);
        for (uint256 side; side < 2; ++side) {
            LaunchParams memory p = params(1);
            p.salt = saltFor(USDG, side == 0);
            p.creatorTaxBps = 100;
            address t = launch(p);
            (, bool q0) = keyOf(t);
            assertEq(q0, side == 1);
            _fund(USDG, 100_000e6);
            BalanceDelta d = buy(alice, t, -500e6);
            assertEq(qd(t, d), -500e6);
            buy(bob, t, 1_000_000 ether);
            sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
            sell(bob, t, 1e6);
            _distributeAndWithdraw(t, USDG);
        }
    }

    function test_fork_swoge_spcx_nvda_quotes() public {
        if (!live) return vm.skip(true);
        address[3] memory qa = [SWOGE, SPCX, NVDA];
        uint256[3] memory amt = [uint256(2e25), 0.2e18, 0.2e18];
        for (uint8 i; i < 3; ++i) {
            LaunchParams memory p = params(i + 2);
            p.salt = bytes32(uint256(500 + i));
            p.creatorTaxBps = 300;
            address t = launch(p);
            _fund(qa[i], amt[i] * 10);
            BalanceDelta d = buy(alice, t, -int256(amt[i]));
            assertEq(qd(t, d), -int256(amt[i]));
            sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
            _distributeAndWithdraw(t, qa[i]);
        }
    }

    function _fund(address token, uint256 a) internal {
        deal(token, alice, a);
        deal(token, bob, a);
        vm.prank(alice);
        IERC20Meta(token).approve(address(router), type(uint256).max);
        vm.prank(bob);
        IERC20Meta(token).approve(address(router), type(uint256).max);
    }

    function _distributeAndWithdraw(address t, address q) internal {
        assertEq(uint256(pending(t).treasury) + pending(t).creator + pending(t).lp, hook.feesTaken(idOf(t)));
        holders.distribute(t);
        uint256 b0 = IERC20Meta(q).balanceOf(creator);
        vm.prank(creator);
        uint256 w = holders.withdraw(Currency.wrap(q));
        assertGt(w, 0);
        assertEq(IERC20Meta(q).balanceOf(creator) - b0, w, "le createur recoit la cotation");
        vm.prank(treasury);
        holders.withdraw(Currency.wrap(q));
    }
}
