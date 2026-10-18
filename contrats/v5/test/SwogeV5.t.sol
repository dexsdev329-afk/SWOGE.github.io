// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./BaseV5.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {Position} from "v4-core/src/libraries/Position.sol";
import {CustomRevert} from "v4-core/src/libraries/CustomRevert.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

/* Essais unitaires et de fuzz de SWOGE V5, sur un PoolManager v4 local
   (v4-core, etiquette v4.0.0). Le banc sur fork de Robinhood Chain est dans
   ForkV5.t.sol. */
contract SwogeV5Test is BaseV5 {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function setUp() public {
        setUpLocal();
    }

    /* ============================ deploiement ============================ */

    function test_deploy_wiring_and_constants() public view {
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, FLAGS, "drapeaux du hook");
        assertEq(hook.core(), address(core));
        assertEq(hook.holders(), address(holders));
        assertEq(core.hook(), address(hook));
        assertEq(holders.core(), address(core));
        assertEq(allocM.core(), address(core));
        SwogeLaunchpadV5.Config memory c = core.getConfig();
        assertEq(c.BASE_FEE_BPS, 100);
        assertEq(c.CREATOR_SHARE_BPS, 7_500, "75 % createur / 25 % SWOGE");
        assertEq(c.MAX_CREATOR_TAX_BPS, 500, "taxe createur <= 5 %");
        assertEq(c.MAX_SNIPE_START_BPS, 9_000);
        assertEq(c.MAX_SNIPE_SECONDS, 120);
        assertEq(c.MAX_INITIAL_BUY_BPS, 500);
        assertEq(c.RECIPIENT_DELAY, 72 hours);
        assertEq(c.quotes.length, 4);
        assertEq(c.quotes[0], address(0));
        assertEq(c.treasury, treasury);
    }

    function test_deployer_salt_is_bound_to_caller() public {
        bytes32 s = keccak256("x");
        assertTrue(deployer.addressOf(alice, s) != deployer.addressOf(bob, s));
        vm.prank(alice);
        address a = deployer.deploy(s, abi.encodePacked(type(MockERC20).creationCode, abi.encode("a", "a", uint8(18))));
        assertEq(a, deployer.addressOf(alice, s));
        vm.prank(alice);
        vm.expectRevert(bytes("proxy"));
        deployer.deploy(s, abi.encodePacked(type(MockERC20).creationCode, abi.encode("a", "a", uint8(18))));
    }

    function test_core_rejects_bad_quote_list() public {
        address[] memory qs = new address[](2);
        int24[] memory ts = new int24[](2);
        qs[0] = address(usdg); // l'indice 0 doit etre l'ETH natif
        ts[0] = TICK_ETH;
        qs[1] = address(0);
        ts[1] = TICK_ETH;
        vm.expectRevert(bytes("quote 0 = ETH"));
        new SwogeLaunchpadV5(pm, address(hook), address(holders), address(allocM), treasury, 0, qs, ts);
        qs[0] = address(0);
        qs[1] = address(0xBEEF); // sans code
        vm.expectRevert(bytes("quote code"));
        new SwogeLaunchpadV5(pm, address(hook), address(holders), address(allocM), treasury, 0, qs, ts);
        qs[1] = address(usdg);
        ts[1] = -207_201; // pas multiple de 200
        vm.expectRevert(bytes("tick spacing"));
        new SwogeLaunchpadV5(pm, address(hook), address(holders), address(allocM), treasury, 0, qs, ts);
    }

    /* ============================ lancement ============================ */

    function test_launch_eth_places_supply_and_locks_lp() public {
        uint256 tBefore = treasury.balance;
        address t = launch(params(0));
        assertEq(treasury.balance - tBefore, LAUNCH_FEE, "frais de lancement au tresor");
        assertEq(SwogeTokenV5(t).totalSupply(), V5.TOTAL_SUPPLY);
        // tout est dans le pool, sauf l'arrondi brule
        uint256 inPm = SwogeTokenV5(t).balanceOf(address(pm));
        uint256 dead = SwogeTokenV5(t).balanceOf(V5.DEAD);
        assertEq(inPm + dead, V5.TOTAL_SUPPLY);
        assertLt(dead, 1e9, "poussiere seulement");
        assertEq(SwogeTokenV5(t).balanceOf(address(core)), 0, "le noyau ne garde rien");
        assertEq(address(core).balance, 0);
        // la position est au nom du noyau
        (PoolKey memory k, bool q0) = keyOf(t);
        assertTrue(q0, "ETH natif = currency0");
        bytes32 pos = Position.calculatePositionKey(address(core), -(TICK_ETH + V5.RANGE_TICKS), -TICK_ETH, 0);
        assertGt(pm.getPositionLiquidity(k.toId(), pos), 0);
        (bool ex) = _exists(t);
        assertTrue(ex);
        assertEq(core.tokenCount(), 1);
    }

    function _exists(address t) internal view returns (bool e) {
        (address tok, address cr, address pool, uint256 lp, bool exists) = core.instant(t);
        assertEq(tok, t);
        assertEq(cr, creator);
        assertEq(pool, address(0), "compat V4 : pool = 0");
        assertEq(lp, 0, "compat V4 : lpTokenId = 0");
        return exists;
    }

    function test_launch_fee_must_be_exact() public {
        LaunchParams memory p = params(0);
        vm.prank(creator);
        vm.expectRevert();
        core.createToken{value: LAUNCH_FEE - 1}(p);
        vm.prank(creator);
        vm.expectRevert();
        core.createToken{value: LAUNCH_FEE + 1}(p);
    }

    function test_same_salt_twice_reverts_other_salt_passes() public {
        LaunchParams memory p = params(0);
        launch(p);
        vm.prank(creator);
        vm.expectRevert();
        core.createToken{value: LAUNCH_FEE}(p);
        p.salt = bytes32(uint256(2));
        launch(p);
        assertEq(core.tokenCount(), 2);
    }

    function test_bounds_rejected_with_message() public {
        LaunchParams memory p = params(0);
        p.creatorTaxBps = 501;
        _expectBound(p, "creatorTaxBps <= 500");
        p = params(0);
        p.split = Split(9_999, 0, 0, 0);
        _expectBound(p, "split: sum = 10000");
        p = params(0);
        p.snipe = Snipe(9_001, 30);
        _expectBound(p, "snipe.startBps <= 9000");
        p = params(0);
        p.snipe = Snipe(5_000, 121);
        _expectBound(p, "snipe.secs <= 120");
        p = params(0);
        p.limits = Limits(49, 0, 60);
        _expectBound(p, "maxBuyPerSwapBps: 0 or 50..10000");
        p = params(0);
        p.limits = Limits(0, 0, 3_601);
        _expectBound(p, "limits.secs <= 3600");
        p = params(0);
        p.name = "123456789012345678901234567890123";
        _expectBound(p, "name: 1..32 bytes");
        p = params(0);
        p.symbol = "12345678901";
        _expectBound(p, "symbol: 1..10 bytes");
        p = params(0);
        p.quote = 4;
        _expectBound(p, "quote: index in getConfig().quotes");
        p = params(0);
        p.alloc = Alloc(501, 30 days, 90 days, 0, 0, 0);
        _expectBound(p, "creatorVestBps <= 500");
        p = params(0);
        p.alloc = Alloc(500, 29 days, 90 days, 0, 0, 0);
        _expectBound(p, "cliff >= 30 days");
        p = params(0);
        p.alloc = Alloc(500, 30 days, 90 days, 501, bytes32(uint256(1)), 7 days);
        _expectBound(p, "airdropBps <= 500");
        p = params(0);
        p.feeRecipient = address(0);
        _expectBound(p, "feeRecipient != 0");
        p = params(0);
        p.initialBuy = 1 ether;
        _expectBound(p, "minTokensOut required");
        // a la borne exacte, ca passe
        p = params(0);
        p.creatorTaxBps = 500;
        p.snipe = Snipe(9_000, 120);
        p.limits = Limits(50, 50, 3_600);
        p.alloc = Alloc(500, 30 days, 730 days, 500, bytes32(uint256(1)), 180 days);
        launch(p);
    }

    function _expectBound(LaunchParams memory p, string memory m) internal {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, m));
        core.createToken{value: LAUNCH_FEE + (p.quote == 0 ? p.initialBuy : 0)}(p);
    }

    /* ======================= achat du createur, meme transaction ======================= */

    function test_initial_buy_same_tx_eth() public {
        LaunchParams memory p = params(0);
        p.initialBuy = 0.01 ether;
        p.minTokensOut = 1;
        p.snipe = Snipe(9_000, 120); // la surtaxe ne s'applique pas a l'achat initial : le pool n'est pas encore ouvert
        p.creatorTaxBps = 300;
        uint256 balBefore = creator.balance;
        address t = launch(p);
        uint256 got = SwogeTokenV5(t).balanceOf(creator);
        assertGt(got, 0, "jetons au createur");
        assertEq(balBefore - creator.balance, LAUNCH_FEE + 0.01 ether);
        SwogeHookV5.Pending memory pe = pending(t);
        // frais = 1 % + 3 % de 0,01 ETH, sans surtaxe
        uint256 fee = 0.01 ether * 400 / 10_000;
        assertEq(uint256(pe.treasury) + pe.creator + pe.lp, fee);
        assertEq(pe.lp, 0, "pas de surtaxe sur l'achat initial");
        assertEq(hook.feesTaken(idOf(t)), fee);
        assertLe(got, V5.TOTAL_SUPPLY * 500 / 10_000);
        // juste apres, la fenetre est ouverte : un acheteur paie la surtaxe pleine
        (uint16 b,,) = core.currentFees(t);
        assertEq(b, 100 + 300 + 9_000);
    }

    function test_initial_buy_over_5pct_reverts() public {
        LaunchParams memory p = params(0);
        p.initialBuy = 20 ether; // ~1 ETH de FDV au depart : 20 ETH achetent bien plus de 5 %
        p.minTokensOut = 1;
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "initial buy <= 5% of supply"));
        core.createToken{value: LAUNCH_FEE + 20 ether}(p);
    }

    function test_initial_buy_minTokensOut() public {
        LaunchParams memory p = params(0);
        p.initialBuy = 0.01 ether;
        p.minTokensOut = V5.TOTAL_SUPPLY;
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "minTokensOut"));
        core.createToken{value: LAUNCH_FEE + 0.01 ether}(p);
    }

    function test_initial_buy_erc20_quote() public {
        LaunchParams memory p = params(1);
        p.initialBuy = 100e6; // 100 USDG
        p.minTokensOut = 1;
        uint256 u = usdg.balanceOf(creator);
        address t = launch(p);
        assertEq(u - usdg.balanceOf(creator), 100e6);
        assertGt(SwogeTokenV5(t).balanceOf(creator), 0);
    }

    function test_nobody_can_swap_before_open() public {
        // entre `register` et `open`, seul le noyau echange (l'achat initial) : on rejoue cet etat
        address t = launch(params(0));
        (PoolKey memory k,) = keyOf(t);
        k.tickSpacing = 60; // un pool enregistre mais pas encore ouvert
        vm.prank(address(core));
        hook.register(k, t, true, 0, Snipe(0, 0), Limits(0, 0, 0));
        IPoolManager.SwapParams memory sp = IPoolManager.SwapParams(true, -1 ether, TickMath.MIN_SQRT_PRICE + 1);
        vm.prank(address(pm));
        vm.expectRevert(SwogeHookV5.NotOpen.selector);
        hook.beforeSwap(alice, k, sp, "");
        // et personne d'autre que le PoolManager n'appelle les crochets
        vm.prank(alice);
        vm.expectRevert(SwogeHookV5.NotPoolManager.selector);
        hook.beforeSwap(alice, k, sp, "");
    }

    /* ============================ frais : les huit formes ============================ */

    function test_fees_eth_four_swap_forms() public {
        LaunchParams memory p = params(0);
        p.creatorTaxBps = 200;
        address t = launch(p);
        uint256 bps = 300;

        // achat, entree exacte : l'acheteur paie exactement X, frais = X × 3 %
        BalanceDelta d = buy(alice, t, -1 ether);
        assertEq(qd(t, d), -1 ether);
        assertEq(hook.feesTaken(idOf(t)), 1 ether * bps / 10_000);

        // achat, sortie exacte : l'acheteur recoit exactement Y jetons
        uint256 f0 = hook.feesTaken(idOf(t));
        d = buy(alice, t, 1_000_000 ether);
        assertEq(td(t, d), 1_000_000 ether);
        uint256 paid = uint256(uint128(-qd(t, d)));
        uint256 fee = hook.feesTaken(idOf(t)) - f0;
        assertApproxEqAbs(fee, paid * bps / 10_000, 1, "3 % du brut paye");

        // vente, entree exacte
        f0 = hook.feesTaken(idOf(t));
        d = sell(alice, t, -1_000_000 ether);
        uint256 recv = uint256(uint128(qd(t, d)));
        fee = hook.feesTaken(idOf(t)) - f0;
        assertApproxEqAbs(fee, (recv + fee) * bps / 10_000, 1, "3 % du brut sorti du pool");

        // vente, sortie exacte : le vendeur recoit exactement Y en ETH
        f0 = hook.feesTaken(idOf(t));
        d = sell(alice, t, 0.1 ether);
        assertEq(qd(t, d), 0.1 ether);
        fee = hook.feesTaken(idOf(t)) - f0;
        assertApproxEqAbs(fee, (0.1 ether + fee) * bps / 10_000, 1);
        _checkBuckets(t);
        assertEq(claims(quoteOf(t)), hook.feesTaken(idOf(t)), "creances de Holders = frais pris, exactement");
    }

    function test_fees_both_token_orders_erc20() public {
        for (uint256 side; side < 2; ++side) {
            LaunchParams memory p = params(2); // $SWOGE
            p.salt = saltFor(address(swoge), side == 0);
            p.creatorTaxBps = 500;
            address t = launch(p);
            (, bool q0) = keyOf(t);
            assertEq(q0, side == 1, "ordre des devises force par le sel");
            BalanceDelta d = buy(alice, t, -1e25);
            assertEq(qd(t, d), -1e25);
            assertEq(hook.feesTaken(idOf(t)), 1e25 * 600 / 10_000);
            d = buy(bob, t, 1e24);
            assertEq(td(t, d), 1e24);
            d = sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
            assertGt(qd(t, d), 0);
            d = sell(bob, t, 1e20);
            assertEq(qd(t, d), 1e20);
            _checkBuckets(t);
        }
    }

    function _checkBuckets(address t) internal view {
        SwogeHookV5.Pending memory pe = pending(t);
        assertEq(uint256(pe.treasury) + pe.creator + pe.lp, hook.feesTaken(idOf(t)), "somme des seaux = frais pris");
        // plusieurs jetons peuvent partager une cotation : les creances couvrent au moins ce jeton
        assertGe(claims(quoteOf(t)), hook.feesTaken(idOf(t)), "creances de Holders >= frais pris");
    }

    /// 75 / 25 exact, a l'unite pres, pour tout montant et toute taxe.
    function testFuzz_split_75_25_exact(uint96 amount, uint16 tax) public {
        tax = uint16(bound(tax, 0, 500));
        amount = uint96(bound(amount, 1e6, 50 ether));
        LaunchParams memory p = params(0);
        p.creatorTaxBps = tax;
        address t = launch(p);
        buy(alice, t, -int256(uint256(amount)));
        SwogeHookV5.Pending memory pe = pending(t);
        uint256 fee = uint256(amount) * (100 + tax) / 10_000;
        assertEq(hook.feesTaken(idOf(t)), fee);
        uint256 base = fee * 100 / (100 + tax);
        uint256 taxAmt = fee * tax / (100 + tax);
        uint256 creatorBase = base * 7_500 / 10_000;
        assertEq(pe.treasury, base - creatorBase, "25 % au tresor");
        assertEq(pe.creator, creatorBase + taxAmt, "75 % + taxe au createur");
        assertEq(uint256(pe.treasury) + pe.creator + pe.lp, fee);
        // 75/25 a un wei pres sur le frais de base
        assertApproxEqAbs(creatorBase * 10_000, base * 7_500, 10_000);
        assertLe(taxAmt * 10_000, uint256(amount) * 500, "taxe <= 5 %");
    }

    function testFuzz_tax_never_above_5pct(uint16 tax) public {
        LaunchParams memory p = params(0);
        p.creatorTaxBps = tax;
        vm.prank(creator);
        if (tax > 500) {
            vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "creatorTaxBps <= 500"));
            core.createToken{value: LAUNCH_FEE}(p);
        } else {
            address t = core.createToken{value: LAUNCH_FEE}(p);
            (, uint16 s,) = core.currentFees(t);
            assertEq(s, 100 + tax);
        }
    }

    function test_dust_swaps_no_fee_no_revert() public {
        address t = launch(params(0));
        buy(alice, t, -99); // 99 wei × 1 % = 0
        assertEq(hook.feesTaken(idOf(t)), 0);
        buy(alice, t, -100);
        assertEq(hook.feesTaken(idOf(t)), 1);
        _checkBuckets(t);
    }

    /* ============================ anti-snipe ============================ */

    function test_snipe_decays_linearly_no_exemption() public {
        LaunchParams memory p = params(0);
        p.snipe = Snipe(5_000, 100);
        p.creatorTaxBps = 100;
        address t = launch(p);
        uint256 t0 = T0;
        (uint16 b, uint16 s, uint32 end) = core.currentFees(t);
        assertEq(b, 100 + 100 + 5_000);
        assertEq(s, 200, "pas de surtaxe a la vente");
        assertEq(end, t0 + 100);
        vm.warp(t0 + 50);
        (b,,) = core.currentFees(t);
        assertEq(b, 200 + 2_500);
        vm.warp(t0 + 99);
        (b,,) = core.currentFees(t);
        assertEq(b, 200 + 50);
        vm.warp(t0 + 100);
        (b,,) = core.currentFees(t);
        assertEq(b, 200);

        // aucune exemption : le createur et le destinataire paient la surtaxe comme tout le monde
        LaunchParams memory p2 = params(0);
        p2.salt = bytes32(uint256(9));
        p2.snipe = Snipe(9_000, 120);
        address t2 = launch(p2);
        BalanceDelta d = buy(creator, t2, -1 ether);
        assertEq(qd(t2, d), -1 ether);
        assertEq(hook.feesTaken(idOf(t2)), 1 ether * 9_100 / 10_000);
        SwogeHookV5.Pending memory pe = pending(t2);
        assertEq(pe.lp, 1 ether * 9_000 / 10_000, "la surtaxe va au seau LP, jamais au createur");
    }

    function testFuzz_snipe_monotonic(uint16 start, uint16 secs, uint32 dt1, uint32 dt2) public {
        start = uint16(bound(start, 0, 9_000));
        secs = uint16(bound(secs, 0, 120));
        dt1 = uint32(bound(dt1, 0, 200));
        dt2 = uint32(bound(dt2, dt1, 400));
        LaunchParams memory p = params(0);
        p.snipe = Snipe(start, secs);
        address t = launch(p);
        uint256 t0 = T0;
        vm.warp(t0 + dt1);
        (uint16 b1,,) = core.currentFees(t);
        vm.warp(t0 + dt2);
        (uint16 b2,,) = core.currentFees(t);
        assertLe(b2, b1, "la surtaxe ne remonte jamais");
        assertLe(b1, 100 + start);
        if (dt2 >= secs) assertEq(b2, 100);
    }

    /* ============================ limites ============================ */

    function test_limits_per_swap_and_per_block() public {
        LaunchParams memory p = params(0);
        p.limits = Limits(100, 150, 600); // 1 % par echange, 1,5 % par seconde, 10 min
        address t = launch(p);
        (PoolKey memory k,) = keyOf(t);
        uint256 m = V5.TOTAL_SUPPLY * 100 / 10_000;
        vm.prank(alice);
        vm.expectRevert(_wrapped(abi.encodeWithSelector(SwogeHookV5.MaxBuyPerSwap.selector, m + m / 100, m)));
        router.swap{value: 100 ether}(k, true, int256(m + m / 100));
        buy(alice, t, int256(m));
        vm.prank(bob);
        vm.expectRevert(_wrapped(abi.encodeWithSelector(SwogeHookV5.MaxBuyPerBlock.selector, m + m * 51 / 100, m * 150 / 100)));
        router.swap{value: 100 ether}(k, true, int256(m * 51 / 100)); // cumul de la seconde > 1,5 %
        vm.warp(T0 + 1);
        buy(bob, t, int256(V5.TOTAL_SUPPLY * 100 / 10_000)); // seconde suivante
        vm.warp(T0 + 600);
        buy(bob, t, int256(V5.TOTAL_SUPPLY * 300 / 10_000)); // fenetre finie
        // les ventes ne sont jamais limitees
        sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice)));
    }

    /// Le PoolManager enveloppe l'erreur d'un hook : WrappedError(hook, selecteur, erreur, HookCallFailed).
    function _wrapped(bytes memory inner) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector, address(hook), IHooks.afterSwap.selector, inner, abi.encodePacked(Hooks.HookCallFailed.selector)
        );
    }

    /* ============================ LP verrouillee ============================ */

    function test_lp_locked_no_third_party_liquidity() public {
        address t = launch(params(0));
        (PoolKey memory k,) = keyOf(t);
        LiquidityProbe probe = new LiquidityProbe(pm);
        vm.expectRevert();
        probe.modify(k, -(TICK_ETH + V5.RANGE_TICKS), -TICK_ETH, -1e18); // retrait
        vm.expectRevert();
        probe.modify(k, -(TICK_ETH + V5.RANGE_TICKS), -TICK_ETH, 1e18); // ajout par un tiers
        // le noyau n'a aucune fonction de retrait : son seul appel a modifyLiquidity est dans le rappel de
        // lancement, qui commence par `initialize` — impossible sur un pool qui existe deja
        vm.prank(address(pm));
        vm.expectRevert();
        core.unlockCallback(abi.encode(k, true, TICK_ETH, uint8(0), uint256(1), uint256(0), uint256(0), alice));
        // et le hook refuse tout retrait, meme demande par le noyau ou Holders
        vm.prank(address(pm));
        vm.expectRevert(SwogeHookV5.LiquidityLocked.selector);
        hook.beforeRemoveLiquidity(address(core), k, IPoolManager.ModifyLiquidityParams(0, 200, -1, 0), "");
        vm.prank(address(pm));
        vm.expectRevert(SwogeHookV5.LiquidityLocked.selector);
        hook.beforeRemoveLiquidity(address(holders), k, IPoolManager.ModifyLiquidityParams(0, 200, -1, 0), "");
    }

    function test_no_initialize_by_third_party_with_v5_hook() public {
        address t = launch(params(0));
        (PoolKey memory k,) = keyOf(t);
        k.tickSpacing = 60; // autre pool avec le meme hook
        vm.expectRevert();
        pm.initialize(k, TickMath.getSqrtPriceAtTick(0));
    }

    /* ============================ cliquets ============================ */

    function test_ratchets_only_down() public {
        LaunchParams memory p = params(0);
        p.creatorTaxBps = 300;
        p.snipe = Snipe(5_000, 60);
        p.limits = Limits(100, 200, 600);
        p.split = Split(8_000, 1_000, 500, 500);
        address t = launch(p);

        vm.startPrank(creator);
        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.lowerTax(t, 301);
        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.lowerTax(t, 300);
        core.lowerTax(t, 100);
        (, uint16 s,) = core.currentFees(t);
        assertEq(s, 200);
        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.lowerTax(t, 200);

        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.lowerSnipe(t, Snipe(5_001, 60));
        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.lowerSnipe(t, Snipe(5_000, 61));
        core.lowerSnipe(t, Snipe(2_000, 30));
        (uint16 b,,) = core.currentFees(t);
        assertEq(b, 200 + 2_000);

        // limites : seulement relachees
        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.relaxLimits(t, Limits(50, 200, 600)); // plus stricte
        vm.expectRevert(SwogeHookV5.NotLower.selector);
        core.relaxLimits(t, Limits(100, 200, 601)); // plus longue
        core.relaxLimits(t, Limits(0, 300, 300));

        // repartition : la part createur ne fait que baisser
        vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "split: creator share can only move to holders"));
        core.shiftCreatorSplit(t, Split(8_500, 500, 500, 500));
        vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "split: creator share can only move to holders"));
        core.shiftCreatorSplit(t, Split(8_000, 500, 1_000, 500));
        core.shiftCreatorSplit(t, Split(6_000, 2_000, 1_000, 1_000));
        vm.stopPrank();

        // personne d'autre
        vm.prank(alice);
        vm.expectRevert(SwogeLaunchpadV5.NotRecipient.selector);
        core.lowerTax(t, 0);
        PoolId pid = idOf(t);
        vm.prank(alice);
        vm.expectRevert(SwogeHookV5.NotCore.selector);
        hook.lowerTax(pid, 0);
    }

    function testFuzz_tax_ratchet(uint16 start, uint16 next) public {
        start = uint16(bound(start, 0, 500));
        LaunchParams memory p = params(0);
        p.creatorTaxBps = start;
        address t = launch(p);
        vm.prank(creator);
        if (next >= start) {
            vm.expectRevert(SwogeHookV5.NotLower.selector);
            core.lowerTax(t, next);
        } else {
            core.lowerTax(t, next);
            (, uint16 s,) = core.currentFees(t);
            assertEq(s, 100 + next);
        }
    }

    /* ======================= destinataire : deux etapes, 72 h ======================= */

    function test_recipient_two_step() public {
        address t = launch(params(0));
        vm.prank(alice);
        vm.expectRevert(SwogeLaunchpadV5.NotRecipient.selector);
        core.proposeRecipient(t, alice);

        vm.prank(creator);
        core.proposeRecipient(t, alice);
        vm.prank(alice);
        vm.expectRevert(bytes("delay"));
        core.acceptRecipient(t);
        vm.warp(T0 + 72 hours - 1);
        vm.prank(alice);
        vm.expectRevert(bytes("delay"));
        core.acceptRecipient(t);
        vm.warp(T0 + 72 hours);
        vm.prank(bob);
        vm.expectRevert(bytes("not pending"));
        core.acceptRecipient(t);
        vm.prank(alice);
        core.acceptRecipient(t);
        assertEq(core.getTokenInfo(t).feeRecipient, alice);
        // l'ancien destinataire n'a plus aucun droit
        vm.prank(creator);
        vm.expectRevert(SwogeLaunchpadV5.NotRecipient.selector);
        core.lowerTax(t, 0);
        // annulation
        vm.prank(alice);
        core.proposeRecipient(t, bob);
        vm.prank(alice);
        core.cancelRecipient(t);
        vm.warp(T0 + 200 hours);
        vm.prank(bob);
        vm.expectRevert(bytes("not pending"));
        core.acceptRecipient(t);
    }

    function test_update_meta_only_recipient() public {
        address t = launch(params(0));
        TokenMeta memory m = TokenMeta("new", "", "", "", "");
        vm.prank(alice);
        vm.expectRevert(SwogeLaunchpadV5.NotRecipient.selector);
        core.updateMeta(t, m);
        vm.prank(creator);
        core.updateMeta(t, m);
    }

    /* ============================ distribution ============================ */

    function test_distribute_withdraw_eth() public {
        LaunchParams memory p = params(0);
        p.creatorTaxBps = 200;
        p.split = Split(5_000, 0, 2_500, 2_500);
        address t = launch(p);
        buy(alice, t, -10 ether);
        sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
        SwogeHookV5.Pending memory pe = pending(t);
        uint256 cre = pe.creator;
        vm.warp(T0 + 1); // le mur LP se pose hors de la seconde des echanges (voir le test suivant)
        holders.distribute(t);
        uint256 qid = 0;
        assertEq(holders.owed(creator, qid), cre * 5_000 / 10_000);
        assertEq(holders.owed(treasury, qid), pe.treasury);
        (uint128 lpLeft, uint128 bb) = holders.buckets(t);
        assertLt(lpLeft, 1e6, "le seau LP est passe en liquidite");
        assertEq(bb, cre - cre * 5_000 / 10_000 - cre * 2_500 / 10_000);
        // le mur d'achat est une position de Holders
        assertGt(pm.getLiquidity(idOf(t)), 0);

        uint256 b0 = creator.balance;
        vm.prank(creator);
        holders.withdraw(Currency.wrap(address(0)));
        assertEq(creator.balance - b0, cre * 5_000 / 10_000);
        uint256 tr0 = treasury.balance;
        vm.prank(treasury);
        holders.withdraw(Currency.wrap(address(0)));
        assertEq(treasury.balance - tr0, pe.treasury);
        _solvent(t);
    }

    function test_buyback_burn_and_sandwich_bound() public {
        LaunchParams memory p = params(0);
        p.split = Split(0, 0, 0, 10_000);
        p.creatorTaxBps = 500;
        address t = launch(p);
        buy(alice, t, -20 ether);
        holders.distribute(t);
        (, uint128 bb) = holders.buckets(t);
        assertGt(bb, 0);

        // un attaquant ouvre une nouvelle seconde, pousse le prix, puis declenche le rachat
        vm.warp(T0 + 10);
        buy(bob, t, -0.05 ether);
        uint256 dead0 = SwogeTokenV5(t).balanceOf(V5.DEAD);
        PoolId pid = idOf(t);
        (uint160 refP,) = hook.refPrice(pid);
        (uint160 before_,,,) = pm.getSlot0(pid);
        assertLt(before_, refP, "l'attaquant a deja pousse le prix");
        (uint256 spent, uint256 burned) = holders.buybackBurn(t, type(uint256).max);
        (uint160 after_,,,) = pm.getSlot0(pid);
        // ETH = currency0 : un achat fait baisser le prix ; jamais plus de 3 % sous le PREMIER prix de la seconde
        uint256 bound_ = uint256(refP) * 984_885_781 / 1e9;
        assertGe(uint256(after_), bound_, "borne de 3 % depuis le prix de reference");
        assertGt(spent, 0);
        assertLt(spent, bb, "tranche bornee : le seau n'est pas vide d'un coup");
        assertEq(SwogeTokenV5(t).balanceOf(V5.DEAD) - dead0, burned);
        // la seconde suivante, le reste passe
        vm.warp(T0 + 11);
        holders.buybackBurn(t, type(uint256).max);
        _solvent(t);
    }

    function test_impact_factors_match_constant() public pure {
        // sqrt(1 - 0,03) et sqrt(1 + 0,03), en 1e9, arrondis vers l'interieur
        uint256 lo = 984_885_781;
        uint256 hi = 1_014_889_156;
        assertGe(lo * lo, (10_000 - uint256(V5.MAX_IMPACT_BPS)) * 1e14);
        assertLt((lo - 1) * (lo - 1), (10_000 - uint256(V5.MAX_IMPACT_BPS)) * 1e14);
        assertLe(hi * hi, (10_000 + uint256(V5.MAX_IMPACT_BPS)) * 1e14);
        assertGt((hi + 1) * (hi + 1), (10_000 + uint256(V5.MAX_IMPACT_BPS)) * 1e14);
    }

    function test_staking_rewards_24h() public {
        LaunchParams memory p = params(1); // USDG
        p.split = Split(5_000, 5_000, 0, 0);
        address t = launch(p);
        buy(alice, t, -1_000e6);
        uint256 half = SwogeTokenV5(t).balanceOf(alice) / 2;
        vm.startPrank(alice);
        SwogeTokenV5(t).approve(address(holders), type(uint256).max);
        holders.stake(t, half);
        vm.expectRevert(bytes("stake: 24h minimum"));
        holders.unstake(t, half);
        vm.stopPrank();
        buy(bob, t, -1_000e6);
        SwogeHookV5.Pending memory pe = pending(t);
        holders.distribute(t);
        uint256 r = holders.pendingReward(t, alice);
        assertApproxEqAbs(r, uint256(pe.creator) * 5_000 / 10_000, 1);
        vm.warp(T0 + 24 hours);
        vm.startPrank(alice);
        holders.unstake(t, half);
        uint256 u0 = usdg.balanceOf(alice);
        holders.withdraw(Currency.wrap(address(usdg)));
        assertApproxEqAbs(usdg.balanceOf(alice) - u0, r, 1);
        vm.stopPrank();
        _solvent(t);
    }

    function test_stakers_share_without_stakers_goes_to_buyback() public {
        LaunchParams memory p = params(0);
        p.split = Split(0, 10_000, 0, 0);
        address t = launch(p);
        buy(alice, t, -1 ether);
        uint256 cre = pending(t).creator;
        holders.distribute(t);
        (, uint128 bb) = holders.buckets(t);
        assertEq(bb, cre);
    }

    /// Solvabilite : les creances de Holders couvrent tout ce qui est du ou en attente.
    function _solvent(address t) internal view {
        Currency q = quoteOf(t);
        uint256 id = q.toId();
        SwogeHookV5.Pending memory pe = pending(t);
        (uint128 lp, uint128 bb) = holders.buckets(t);
        uint256 due = uint256(pe.treasury) + pe.creator + pe.lp + lp + bb + holders.owed(creator, id)
            + holders.owed(treasury, id) + holders.owed(alice, id) + holders.owed(bob, id)
            + _unpaid(t);
        assertGe(claims(q), due, "creances >= du");
        assertLe(claims(q) - due, 10, "aucun solde bloque au-dela de l'arrondi");
    }

    function _unpaid(address t) internal view returns (uint256 u) {
        (,, u) = holders.stakePools(t);
    }

    function test_lp_floor_skipped_when_price_pushed_in_same_second() public {
        LaunchParams memory p = params(0);
        p.split = Split(0, 0, 10_000, 0);
        address t = launch(p);
        vm.warp(T0 + 5);
        buy(alice, t, -0.01 ether); // premier echange de la seconde : prix de reference
        buy(bob, t, -5 ether); // pousse le prix bien au-dela de 3 %
        holders.distribute(t);
        (uint128 lp,) = holders.buckets(t);
        assertGt(lp, 0, "ajout reporte : le seau reste plein");
        vm.warp(T0 + 6);
        holders.distribute(t);
        (lp,) = holders.buckets(t);
        assertLt(lp, 1e6, "la seconde suivante, le mur est pose");
        _solvent(t);
    }

    function test_ladder3_both_orders() public {
        for (uint256 side; side < 2; ++side) {
            LaunchParams memory p = params(1); // USDG
            p.shape = 1;
            p.salt = saltFor(address(usdg), side == 0);
            address t = launch(p);
            uint256 inPm = SwogeTokenV5(t).balanceOf(address(pm));
            assertEq(inPm + SwogeTokenV5(t).balanceOf(V5.DEAD), V5.TOTAL_SUPPLY);
            assertLt(V5.TOTAL_SUPPLY - inPm, 1e15, "toute l'offre dans les trois tranches, a 0,001 jeton pres (arrondi brule)");
            // traverser la premiere tranche (30 % de l'offre) puis revendre
            BalanceDelta d = buy(alice, t, int256(V5.TOTAL_SUPPLY * 35 / 100));
            assertEq(td(t, d), int256(V5.TOTAL_SUPPLY * 35 / 100));
            sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice)));
            _checkBuckets(t);
            holders.distribute(t);
            _solvent(t);
        }
    }

    /* ============================ toutes les cotations ============================ */

    function test_every_quote_path() public {
        for (uint8 qi; qi < 4; ++qi) {
            LaunchParams memory p = params(qi);
            p.salt = bytes32(uint256(100 + qi));
            p.creatorTaxBps = 100;
            p.split = Split(7_000, 1_000, 1_000, 1_000);
            address t = launch(p);
            int256 amt = qi == 0 ? int256(0.5 ether) : qi == 1 ? int256(1_000e6) : qi == 2 ? int256(5e25) : int256(10e18);
            buy(alice, t, -amt);
            buy(bob, t, 1_000_000 ether);
            sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 3));
            sell(bob, t, 1);
            _checkBuckets(t);
            holders.distribute(t);
            holders.buybackBurn(t, type(uint256).max);
            Currency q = quoteOf(t);
            vm.prank(creator);
            uint256 w = holders.withdraw(q);
            assertGt(w, 0, "le createur est paye dans la cotation");
            _solvent(t);
        }
    }

    /* ============================ allocations ============================ */

    function test_vesting_and_airdrop() public {
        bytes32 leafA = keccak256(bytes.concat(keccak256(abi.encode(alice, uint256(1e24)))));
        bytes32 leafB = keccak256(bytes.concat(keccak256(abi.encode(bob, uint256(2e24)))));
        bytes32 root = leafA < leafB ? keccak256(abi.encode(leafA, leafB)) : keccak256(abi.encode(leafB, leafA));
        LaunchParams memory p = params(0);
        p.alloc = Alloc(500, 30 days, 100 days, 100, root, 7 days);
        address t = launch(p);
        uint256 t0 = T0;
        assertEq(SwogeTokenV5(t).balanceOf(address(allocM)), V5.TOTAL_SUPPLY * 600 / 10_000);
        vm.expectRevert(bytes("nothing"));
        allocM.release(t);
        vm.warp(t0 + 30 days);
        allocM.release(t);
        assertEq(SwogeTokenV5(t).balanceOf(creator), V5.TOTAL_SUPPLY * 500 / 10_000 * 30 / 100);
        vm.warp(t0 + 100 days);
        allocM.release(t);
        assertEq(SwogeTokenV5(t).balanceOf(creator), V5.TOTAL_SUPPLY * 500 / 10_000);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafB;
        vm.warp(t0 + 1 days);
        allocM.claim(t, alice, 1e24, proof);
        assertEq(SwogeTokenV5(t).balanceOf(alice), 1e24);
        vm.expectRevert(bytes("claimed"));
        allocM.claim(t, alice, 1e24, proof);
        proof[0] = leafA;
        vm.expectRevert(bytes("proof"));
        allocM.claim(t, bob, 3e24, proof);
        vm.expectRevert(bytes("not ended"));
        allocM.sweep(t);
        vm.warp(t0 + 7 days);
        vm.expectRevert(bytes("ended"));
        allocM.claim(t, bob, 2e24, proof);
        uint256 burned = allocM.sweep(t);
        assertEq(burned, V5.TOTAL_SUPPLY * 100 / 10_000 - 1e24, "reliquat brule");
    }

    /* ============================ reentrance ============================ */

    function test_reentrancy_create_via_quote_token() public {
        ReentrantQuote rq = new ReentrantQuote(core);
        address[] memory qs = new address[](2);
        int24[] memory ts = new int24[](2);
        qs[0] = address(0);
        ts[0] = TICK_ETH;
        qs[1] = address(rq);
        ts[1] = TICK_SWOGE;
        _deployAll(new PoolManager(address(this)), qs, ts);
        rq.setCore(core);
        rq.mint(creator, 1e30);
        vm.prank(creator);
        rq.approve(address(core), type(uint256).max);
        LaunchParams memory p = params(1);
        p.initialBuy = 1e18;
        p.minTokensOut = 1;
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        core.createToken{value: LAUNCH_FEE}(p); // le jeton de cotation tente createToken pendant transferFrom
        assertEq(rq.lastRevert(), keccak256(abi.encodeWithSignature("Error(string)", "reentrant")));
    }

    function test_reentrancy_withdraw_eth_receiver() public {
        LaunchParams memory p = params(0);
        Reenter r = new Reenter(holders);
        p.feeRecipient = address(r);
        address t = launch(p);
        buy(alice, t, -1 ether);
        holders.distribute(t);
        // le destinataire rappelle withdraw pendant qu'il recoit l'ETH : refuse, et rien n'est paye deux fois
        vm.expectRevert();
        r.go();
        assertGt(holders.owed(address(r), 0), 0);
    }

    /* ============================ suite aleatoire ============================ */

    function testFuzz_random_sequence_invariants(uint256 seed) public {
        LaunchParams memory p = params(1);
        p.creatorTaxBps = uint16(seed % 501);
        p.snipe = Snipe(uint16(seed % 9_001), uint16(seed % 121));
        p.split = Split(4_000, 2_000, 2_000, 2_000);
        address t = launch(p);
        vm.prank(alice);
        SwogeTokenV5(t).approve(address(holders), type(uint256).max);
        uint256 now_ = T0;
        for (uint256 i; i < 12; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint256 op = r % 6;
            address who = r & 1 == 0 ? alice : bob;
            if (op == 0) buy(who, t, -int256(1e6 + r % 2_000e6));
            else if (op == 1) buy(who, t, int256(1e18 + r % 1e24));
            else if (op == 2 && SwogeTokenV5(t).balanceOf(who) > 10) sell(who, t, -int256(SwogeTokenV5(t).balanceOf(who) / 2));
            else if (op == 3) holders.distribute(t);
            else if (op == 4) holders.buybackBurn(t, r % 1e9);
            else if (op == 5 && SwogeTokenV5(t).balanceOf(alice) > 10) {
                uint256 a = SwogeTokenV5(t).balanceOf(alice) / 4;
                vm.prank(alice);
                holders.stake(t, a);
            }
            now_ += r % 30;
            vm.warp(now_);
            (uint16 b,,) = core.currentFees(t);
            assertLe(b, 100 + p.creatorTaxBps + p.snipe.startBps);
            SwogeHookV5.Pending memory pe = pending(t);
            assertLe(uint256(pe.treasury) + pe.creator + pe.lp, hook.feesTaken(idOf(t)));
            _solvent(t);
            assertEq(SwogeTokenV5(t).totalSupply(), V5.TOTAL_SUPPLY, "offre fixe");
        }
    }
}

/// Jeton de cotation malveillant : tente de relancer createToken pendant transferFrom.
contract ReentrantQuote is MockERC20 {
    SwogeLaunchpadV5 internal c;
    bytes32 public lastRevert;

    constructor(SwogeLaunchpadV5 _c) MockERC20("Evil", "EVIL", 18) {
        c = _c;
    }

    function setCore(SwogeLaunchpadV5 _c) external {
        c = _c;
    }

    function transferFrom(address f, address to, uint256 v) public override returns (bool) {
        LaunchParams memory p;
        try c.createToken(p) {}
        catch (bytes memory e) {
            lastRevert = keccak256(e);
        }
        return super.transferFrom(f, to, v);
    }
}

/// Destinataire qui rappelle withdraw en recevant l'ETH.
contract Reenter {
    SwogeHoldersV5 internal h;

    constructor(SwogeHoldersV5 _h) {
        h = _h;
    }

    function go() external {
        h.withdraw(Currency.wrap(address(0)));
    }

    receive() external payable {
        h.withdraw(Currency.wrap(address(0)));
    }
}
