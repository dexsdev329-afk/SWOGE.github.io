// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./BaseV5.sol";

interface IStockToken {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function uiMultiplier() external view returns (uint256);
    function balanceOfUI(address) external view returns (uint256);
    function totalSupplyUI() external view returns (uint256);
    function updateMultiplier(uint256) external;
    function updateMultiplier(uint256, uint256) external;
    function paused() external view returns (bool);
    function tokenPaused() external view returns (bool);
    function ACCESS_CONTROLLED_REGISTRY() external view returns (address);
}

interface IStockRegistry {
    function hasRole(bytes32, address) external view returns (bool);
    function implementation() external view returns (address);
    function isBlocked(address) external view returns (bool);
}

/* ============================================================
   LA LISTE REELLE DES 198 MONNAIES SUR FORK LOCAL DE ROBINHOOD CHAIN — 18/10/2026

     anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
     V5_COTATIONS=<chemin de cotations_v5.json> \
       forge test --fork-url http://127.0.0.1:8545 --match-contract ForkCotationsV5

   Rien n'est signe ni envoye sur la chaine. Les seules « signatures » sont des
   `vm.prank` dans le fork LOCAL (le compte qui detient MULTIPLIER_UPDATER_ROLE,
   lu sur la chaine), pour rejouer ce que Robinhood peut faire.

   La liste vient de script/genere_cotations.js (lecture seule) ; l'essai la
   rejoue contre la chaine : code, symbol(), decimals(), beacon, implementation.
   ============================================================ */
contract ForkCotationsV5Test is BaseV5 {
    using PoolIdLibrary for PoolKey;

    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    // beacon des actions = leur registre d'acces (ACCESS_CONTROLLED_REGISTRY), lu le 18/10/2026
    address constant BEACON = 0xe10b6f6B275de231345c20D14Ab812db62151b00;
    // implementation verifiee sur Sourcify (exact_match) : Stock.sol + ERC20ScaledUIUpgradeable.sol
    address constant IMPL = 0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2;
    // detenteur de MULTIPLIER_UPDATER_ROLE : l'expediteur de la mise a jour de CRM au bloc 65 383 603
    address constant MULT_UPDATER = 0x92905e8d0e2301BA143215B8D86D63fFD4188143;
    bytes32 constant SLOT_BEACON = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
    // erc7201:robinhood.storage.Stock = { bytes32 uid ; bool paused } : `paused` est a l'emplacement + 1
    bytes32 constant SLOT_STOCK = 0x8d25ea8ee309999a79f0af498fbab0e424669497170669bd9e93b81a62babc00;

    bool live;
    string js;
    address[] qs;
    int24[] ts;
    string[] syms;

    function setUp() public {
        live = block.chainid == 4663 && PM.code.length > 0;
        if (!live) return;
        string memory path =
            vm.envOr("V5_COTATIONS", string.concat(vm.projectRoot(), "/contrats/v5/script/cotations_v5.json"));
        js = vm.readFile(path);
        address[] memory a = vm.parseJsonAddressArray(js, ".addresses");
        int256[] memory t = vm.parseJsonIntArray(js, ".startTicks");
        string[] memory s = vm.parseJsonStringArray(js, ".symbols");
        require(a.length == t.length && a.length == s.length, "json");
        int24[] memory t24 = new int24[](t.length);
        for (uint256 i; i < a.length; ++i) {
            qs.push(a[i]);
            t24[i] = int24(t[i]);
            ts.push(int24(t[i]));
            syms.push(s[i]);
        }
        _deployAll(IPoolManager(PM), a, t24);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _idx(string memory sym) internal view returns (uint8) {
        for (uint256 i; i < syms.length; ++i) {
            if (keccak256(bytes(syms[i])) == keccak256(bytes(sym))) return uint8(i);
        }
        revert(string.concat("absent : ", sym));
    }

    function test_fork_real_list_matches_chain() public {
        if (!live) return vm.skip(true);
        assertEq(qs.length, 198, "ETH + USDG + $SWOGE + 195 actions");
        assertEq(qs[0], address(0));
        assertEq(IStockRegistry(BEACON).implementation(), IMPL, "implementation du beacon = celle qui a ete lue");
        assertFalse(IStockRegistry(BEACON).isBlocked(PM), "PoolManager non bloque");
        uint256 stocks;
        for (uint256 i = 1; i < qs.length; ++i) {
            IStockToken q = IStockToken(qs[i]);
            assertGt(qs[i].code.length, 0, syms[i]);
            assertEq(q.symbol(), syms[i], "symbol()");
            uint256 d = vm.parseJsonUint(js, string.concat(".liste[", vm.toString(i), "].decimales"));
            assertEq(uint256(q.decimals()), d, "decimals()");
            if (i >= 3) {
                ++stocks;
                assertEq(address(uint160(uint256(vm.load(qs[i], SLOT_BEACON)))), BEACON, "beacon commun");
                assertEq(q.ACCESS_CONTROLLED_REGISTRY(), BEACON, "registre d'acces commun");
                assertEq(d, 18, "toutes les actions ont 18 decimales");
                assertGt(q.uiMultiplier(), 0);
                assertFalse(q.paused(), "aucune action en pause au bloc du fork");
            }
        }
        assertEq(stocks, 195);
        assertEq(core.quotes().length, 198);
    }

    function test_fork_core_deploy_gas_with_real_list() public {
        if (!live) return vm.skip(true);
        uint256 g = gasleft();
        new SwogeLaunchpadV5(IPoolManager(PM), address(hook), address(holders), address(allocM), treasury, 0, qs, ts);
        emit log_named_uint("gaz du constructeur du noyau, 198 monnaies reelles", g - gasleft());
        emit log_named_uint("taille du noyau (octets)", address(core).code.length);
    }

    function _fundStock(address q, uint256 a) internal {
        deal(q, alice, a);
        deal(q, bob, a);
        deal(q, creator, a);
        vm.prank(alice);
        IStockToken(q).approve(address(router), type(uint256).max);
        vm.prank(bob);
        IStockToken(q).approve(address(router), type(uint256).max);
        vm.prank(creator);
        IStockToken(q).approve(address(core), type(uint256).max);
    }

    function _withdrawAll(address t, address q) internal {
        assertEq(uint256(pending(t).treasury) + pending(t).creator + pending(t).lp, hook.feesTaken(idOf(t)));
        holders.distribute(t);
        uint256 b0 = IStockToken(q).balanceOf(creator);
        vm.prank(creator);
        uint256 w = holders.withdraw(Currency.wrap(q));
        assertGt(w, 0);
        assertEq(IStockToken(q).balanceOf(creator) - b0, w, "le createur recoit l'action");
        vm.prank(treasury);
        holders.withdraw(Currency.wrap(q));
    }

    /// Trois actions aux extremes de la liste : CRWD (multiplicateur 4), TE (la moins chere), ASML (la plus chere).
    /// Aucune action n'a de decimales inhabituelles (toutes a 18, verifie ci-dessus) ; USDG (6) est couvert par ForkV5.
    function test_fork_three_stocks_launch_trade_withdraw() public {
        if (!live) return vm.skip(true);
        string[3] memory pick = ["CRWD", "TE", "ASML"];
        int24[3] memory shift = [int24(0), int24(23_000), int24(-11_600)];
        for (uint256 i; i < 3; ++i) {
            uint8 qi = _idx(pick[i]);
            address q = qs[qi];
            // ≈ 25 $ par achat : CRWD 905 $ le jeton brut (226,40 $ × 4), TE 2,61 $, ASML 1 640 $ (generateur du 18/10)
            uint256 amt = i == 0 ? 0.03e18 : i == 1 ? 10e18 : 0.015e18;
            _fundStock(q, amt * 100);
            LaunchParams memory p = params(qi);
            p.salt = bytes32(uint256(900 + i));
            p.creatorTaxBps = 250;
            p.startShift = shift[i];
            p.initialBuy = amt;
            p.minTokensOut = 1;
            address t = launch(p);
            assertEq(Currency.unwrap(quoteOf(t)), q);
            BalanceDelta d = buy(alice, t, -int256(amt));
            assertEq(qd(t, d), -int256(amt));
            buy(bob, t, 1_000_000 ether); // sortie exacte
            sell(alice, t, -int256(SwogeTokenV5(t).balanceOf(alice) / 2));
            sell(bob, t, int256(amt / 100)); // sortie exacte en action
            _withdrawAll(t, q);
            emit log_named_string("action", pick[i]);
            emit log_named_int("tick de depart", int256(ts[qi]) + shift[i]);
        }
    }

    /* ---------------- le multiplicateur : ce que Robinhood peut changer ---------------- */

    function _launchNvda() internal returns (address t, address q) {
        q = qs[_idx("NVDA")];
        _fundStock(q, 10e18);
        LaunchParams memory p = params(_idx("NVDA"));
        p.salt = bytes32(uint256(4242));
        p.creatorTaxBps = 300;
        p.split = Split(7_000, 1_000, 1_000, 1_000);
        t = launch(p);
        buy(alice, t, -0.5e18);
        buy(bob, t, -0.3e18);
    }

    function test_fork_multiplier_update_keeps_v5_pool_solvent() public {
        if (!live) return vm.skip(true);
        IStockToken q = IStockToken(qs[_idx("NVDA")]);
        assertTrue(
            IStockRegistry(BEACON).hasRole(keccak256("MULTIPLIER_UPDATER_ROLE"), MULT_UPDATER),
            "le compte impersonne detient bien le role sur la chaine"
        );
        uint256 pmBefore = q.balanceOf(PM); // l'action deja tenue par le PoolManager pour d'autres pools
        (address t,) = _launchNvda();

        uint256 pmRaw = q.balanceOf(PM);
        uint256 pmUi = q.balanceOfUI(PM);
        uint256 supply = q.totalSupply();
        uint256 aliceRaw = q.balanceOf(alice);
        uint256 cl = claims(quoteOf(t));
        uint256 sellAmt = SwogeTokenV5(t).balanceOf(alice);
        uint256 m0 = q.uiMultiplier();

        // monde A : aucune mise a jour, alice vend tout
        uint256 snap = vm.snapshotState();
        BalanceDelta dA = sell(alice, t, -int256(sellAmt));
        vm.revertToState(snap);

        // monde B : Robinhood double le multiplicateur (un fractionnement 2 pour 1), puis la meme vente
        vm.prank(MULT_UPDATER);
        q.updateMultiplier(2 * m0);
        assertEq(q.uiMultiplier(), 2 * m0);
        assertEq(q.balanceOf(PM), pmRaw, "balanceOf du PoolManager : inchange");
        assertEq(q.totalSupply(), supply, "totalSupply : inchange");
        assertEq(q.balanceOf(alice), aliceRaw, "balanceOf d'un detenteur : inchange");
        assertApproxEqAbs(q.balanceOfUI(PM), pmUi * 2, 2, "seule la vue UI double");
        assertEq(claims(quoteOf(t)), cl, "creances ERC-6909 de Holders : inchangees");
        BalanceDelta dB = sell(alice, t, -int256(sellAmt));
        assertEq(BalanceDelta.unwrap(dA), BalanceDelta.unwrap(dB), "meme echange, au wei pres, avec ou sans mise a jour");

        // une mise a jour PROGRAMMEE (effectiveAt dans 1 h) puis le passage de l'heure : rien ne bouge non plus
        vm.prank(MULT_UPDATER);
        q.updateMultiplier(3 * m0, block.timestamp + 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);
        assertEq(q.uiMultiplier(), 3 * m0);
        assertEq(q.balanceOf(PM), pmRaw - _paidOut(dB, t), "seule la vente a fait sortir de l'action du PoolManager");

        // tout le monde sort : chaque retrait passe, et le PoolManager garde au moins ce qu'il avait avant
        sell(bob, t, -int256(SwogeTokenV5(t).balanceOf(bob)));
        _withdrawAll(t, address(q));
        assertGe(q.balanceOf(PM), pmBefore, "les fonds des autres pools du PoolManager sont intacts");
    }

    /// Ce que la vente de B a fait sortir du PoolManager, en action brute.
    function _paidOut(BalanceDelta d, address t) internal view returns (uint256) {
        int128 v = qd(t, d);
        return v > 0 ? uint256(uint128(v)) : 0;
    }

    function test_fork_pause_freezes_pool_and_claims_survive() public {
        if (!live) return vm.skip(true);
        IStockToken q = IStockToken(qs[_idx("NVDA")]);
        (address t,) = _launchNvda();
        holders.distribute(t);
        uint256 cl = claims(quoteOf(t));
        // simule pause() de Robinhood sur le fork (TOKEN_PAUSER_ROLE) : on ecrit le drapeau de l'implementation
        bytes32 slot = bytes32(uint256(SLOT_STOCK) + 1);
        vm.store(address(q), slot, bytes32(uint256(1)));
        assertTrue(q.tokenPaused());
        // (les vues sont lues AVANT expectRevert : il vise l'appel suivant, quel qu'il soit)
        (PoolKey memory k, bool q0) = keyOf(t);
        uint256 sellAmt = SwogeTokenV5(t).balanceOf(alice) / 2;
        vm.prank(alice);
        SwogeTokenV5(t).approve(address(router), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert();
        router.swap(k, q0, -0.1e18); // l'acheteur ne peut pas payer en action
        vm.prank(alice);
        vm.expectRevert();
        router.swap(k, !q0, -int256(sellAmt)); // le vendeur ne peut pas recevoir d'action
        vm.prank(creator);
        vm.expectRevert();
        holders.withdraw(Currency.wrap(address(q))); // le createur ne peut pas retirer
        assertEq(claims(quoteOf(t)), cl, "les creances restent comptees");
        // Robinhood leve la pause : tout repart, rien n'a ete perdu
        vm.store(address(q), slot, bytes32(0));
        sell(alice, t, -int256(sellAmt));
        vm.prank(creator);
        assertGt(holders.withdraw(Currency.wrap(address(q))), 0);
    }
}
