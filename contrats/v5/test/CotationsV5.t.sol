// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./BaseV5.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";

/* ============================================================
   LA LONGUE LISTE DES MONNAIES DE COTATION ET LE DEPART CHOISI — 18/10/2026

   Decision du proprietaire : ETH, USDG, $SWOGE et toutes les actions
   Robinhood (195 au registre ce jour-la), soit 198 monnaies, figees au
   constructeur. Ces essais tournent sur un PoolManager LOCAL, avec des jetons
   d'essai : la liste reelle est rejouee sur fork dans ForkCotationsV5.t.sol.

   Ce qu'ils prouvent :
     - 198 et 255 monnaies passent, 256 non ; le gaz du constructeur est releve ;
     - un doublon est refuse ou qu'il soit (indices 3 et 190), une adresse
       sans code aussi ;
     - un tick de reference trop proche du bord est refuse AU DEPLOIEMENT,
       decalage maximal compris : aucun lancement ne peut tomber hors des ticks ;
     - le lanceur decale le depart de ±23 000 ticks au plus, par pas de 200,
       et le pool s'ouvre exactement la, dans les deux ordres de devises ;
     - un lancement sur la DERNIERE monnaie de la liste s'echange et paie.
   ============================================================ */
contract CotationsV5Test is BaseV5 {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    function setUp() public {
        setUpLocal();
    }

    /// Liste d'essai : ETH puis n-1 jetons d'essai neufs, tous au tick de reference de l'action d'essai.
    function _list(uint256 n) internal returns (address[] memory qs, int24[] memory ts) {
        qs = new address[](n);
        ts = new int24[](n);
        qs[0] = address(0);
        ts[0] = TICK_ETH;
        for (uint256 i = 1; i < n; ++i) {
            qs[i] = address(new MockERC20("Stock", "STK", 18));
            ts[i] = TICK_STOCK;
        }
    }

    function _core(address[] memory qs, int24[] memory ts) internal returns (SwogeLaunchpadV5) {
        return new SwogeLaunchpadV5(pm, address(hook), address(holders), address(allocM), treasury, 0, qs, ts);
    }

    function test_list_198_quotes_deploys_and_reports_gas() public {
        (address[] memory q5, int24[] memory t5) = _list(5);
        uint256 g = gasleft();
        _core(q5, t5);
        uint256 gas5 = g - gasleft();
        (address[] memory qs, int24[] memory ts) = _list(198);
        g = gasleft();
        SwogeLaunchpadV5 c = _core(qs, ts);
        uint256 gas198 = g - gasleft();
        emit log_named_uint("gaz du constructeur du noyau, 5 monnaies", gas5);
        emit log_named_uint("gaz du constructeur du noyau, 198 monnaies", gas198);
        emit log_named_uint("gaz par monnaie ajoutee", (gas198 - gas5) / 193);
        // Robinhood Chain est une chaine Arbitrum Orbit : 32 M de gaz par bloc. Marge large exigee.
        assertLt(gas198, 16_000_000, "le noyau a 198 monnaies tient dans la moitie d'un bloc");
        assertEq(c.quotes().length, 198);
        assertEq(c.startTicks().length, 198);
        assertEq(c.quotes()[197], qs[197]);
        assertEq(c.getConfig().MAX_START_SHIFT_TICKS, 23_000);
    }

    function test_list_255_ok_256_rejected() public {
        (address[] memory qs, int24[] memory ts) = _list(256);
        vm.expectRevert(bytes("quotes"));
        _core(qs, ts);
        assembly {
            mstore(qs, 255)
            mstore(ts, 255)
        }
        SwogeLaunchpadV5 c = _core(qs, ts);
        assertEq(c.quotes().length, 255, "indices 0 a 254 : la limite de uint8");
    }

    function test_list_length_mismatch_and_empty_rejected() public {
        (address[] memory qs, int24[] memory ts) = _list(10);
        assembly {
            mstore(ts, 9)
        }
        vm.expectRevert(bytes("quotes"));
        _core(qs, ts);
        address[] memory q0 = new address[](0);
        int24[] memory t0 = new int24[](0);
        vm.expectRevert(bytes("quotes"));
        _core(q0, t0);
    }

    function test_list_duplicate_far_apart_rejected() public {
        (address[] memory qs, int24[] memory ts) = _list(198);
        qs[190] = qs[3];
        vm.expectRevert(bytes("duplicate"));
        _core(qs, ts);
        // l'ETH natif deux fois aussi
        (qs, ts) = _list(198);
        qs[197] = address(0);
        vm.expectRevert(bytes("duplicate"));
        _core(qs, ts);
    }

    function test_list_duplicate_set_does_not_leak_between_deployments() public {
        // le meme ensemble de monnaies, deux noyaux de suite dans la meme transaction d'essai : les deux passent
        (address[] memory qs, int24[] memory ts) = _list(20);
        _core(qs, ts);
        _core(qs, ts);
    }

    function test_list_address_without_code_rejected() public {
        (address[] memory qs, int24[] memory ts) = _list(198);
        qs[150] = address(0xBEEF);
        vm.expectRevert(bytes("quote code"));
        _core(qs, ts);
    }

    function test_list_tick_near_edge_rejected_including_shift() public {
        (address[] memory qs, int24[] memory ts) = _list(4);
        // 887 200 - 161 200 - 23 000 = 703 000 : le dernier tick de reference accepte, dans les deux sens
        ts[2] = 703_000;
        ts[3] = -703_000;
        _core(qs, ts);
        ts[2] = 703_200;
        vm.expectRevert(bytes("tick range"));
        _core(qs, ts);
        ts[2] = 0;
        ts[3] = -703_200;
        vm.expectRevert(bytes("tick range"));
        _core(qs, ts);
    }

    /* ---------------- le depart choisi par le lanceur ---------------- */

    function _slot0Tick(address t) internal view returns (int24 tick) {
        (,tick,,) = pm.getSlot0(idOf(t));
    }

    function test_start_shift_bounds_with_message() public {
        int24[5] memory bad = [int24(23_200), int24(-23_200), int24(100), int24(-1), int24(type(int24).max)];
        for (uint256 i; i < bad.length; ++i) {
            LaunchParams memory p = params(0);
            p.startShift = bad[i];
            vm.prank(creator);
            vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "startShift: multiple of 200, |x| <= 23000"));
            core.createToken{value: LAUNCH_FEE}(p);
        }
    }

    function test_start_shift_opens_pool_exactly_there_both_orders() public {
        int24[3] memory ok = [int24(23_000), int24(-23_000), int24(0)];
        for (uint256 i; i < 3; ++i) {
            for (uint256 side; side < 2; ++side) {
                LaunchParams memory p = params(3); // l'action d'essai
                // un sel neuf par lancement, choisi pour mettre le jeton du cote voulu de la cotation
                p.salt = _saltFor(address(stock), side == 0, i * 1000 + 1);
                p.startShift = ok[i];
                address t = launch(p);
                (, bool q0) = keyOf(t);
                assertEq(q0, side == 1, "ordre des devises");
                int24 start = TICK_STOCK + ok[i];
                assertEq(_slot0Tick(t), q0 ? -start : start, "le pool s'ouvre au depart choisi");
                // on peut acheter et revendre
                buy(alice, t, -1e18);
                sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
            }
        }
    }

    function _saltFor(address quote, bool tokenBelow, uint256 from) internal view returns (bytes32) {
        for (uint256 i = from; i < from + 500; ++i) {
            address a = predictToken(creator, bytes32(i), "Test Token", "TEST");
            if ((a < quote) == tokenBelow) return bytes32(i);
        }
        revert("no salt");
    }

    function testFuzz_start_shift_any_allowed_value_launches_and_trades(int24 raw, uint8 qi) public {
        int24 shift = int24(bound(int256(raw), -115, 115)) * 200; // -23 000 .. 23 000 par pas de 200
        uint8 quote = qi % 4;
        LaunchParams memory p = params(quote);
        p.startShift = shift;
        p.creatorTaxBps = 100;
        address t = launch(p);
        (int24 ref) = core.startTicks()[quote];
        (, bool q0) = keyOf(t);
        assertEq(_slot0Tick(t), q0 ? -(ref + shift) : ref + shift);
        int256 amt = quote == 1 ? int256(-1_000e6) : int256(-0.5e18);
        buy(alice, t, amt);
        sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice)));
        assertEq(claims(quoteOf(t)), hook.feesTaken(idOf(t)), "creances de Holders = frais pris");
        assertEq(SwogeTokenV5(t).totalSupply(), V5.TOTAL_SUPPLY);
    }

    function test_launch_on_last_of_198_quotes_trades_and_pays() public {
        // le systeme entier redeploye avec 198 monnaies ; on lance sur l'indice 197
        (address[] memory qs, int24[] memory ts) = _list(198);
        _deployAll(new PoolManager(address(this)), qs, ts);
        MockERC20 last = MockERC20(qs[197]);
        address[3] memory who = [creator, alice, bob];
        for (uint256 i; i < 3; ++i) {
            last.mint(who[i], 1e30);
            vm.startPrank(who[i]);
            last.approve(address(router), type(uint256).max);
            last.approve(address(core), type(uint256).max);
            vm.stopPrank();
        }
        LaunchParams memory p = params(197);
        p.creatorTaxBps = 200;
        p.initialBuy = 0.2e18; // ≈ 1,4 % de l'offre a ce depart (le plafond est 5 %)
        p.minTokensOut = 1;
        p.startShift = -4_000;
        address t = launch(p);
        assertEq(Currency.unwrap(quoteOf(t)), qs[197]);
        buy(alice, t, -2e18);
        sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
        holders.distribute(t);
        uint256 b0 = last.balanceOf(creator);
        vm.prank(creator);
        uint256 w = holders.withdraw(Currency.wrap(qs[197]));
        assertGt(w, 0);
        assertEq(last.balanceOf(creator) - b0, w);
        // l'indice 198 n'existe pas
        p = params(198);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SwogeLaunchpadV5.Bound.selector, "quote: index in getConfig().quotes"));
        core.createToken{value: LAUNCH_FEE}(p);
    }
}
