// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./BaseV5.sol";
import {Vm} from "forge-std/Vm.sol";

/* ============================================================
   LISTE « FACON GOPLUS », LOCALE (18/10/2026)

   GoPlus lit le jeton deploye, pas le hook. On rejoue ici, sur le bytecode
   REEL d'un jeton lance par V5, ce que ses champs « token security »
   cherchent, et on le prouve par le code ou par le comportement :

   is_mintable, owner_address, can_take_back_ownership, hidden_owner,
   selfdestruct, external_call, is_proxy, transfer_pausable, is_blacklisted,
   is_whitelisted, slippage_modifiable, personal_slippage_modifiable,
   trading_cooldown, buy_tax / sell_tax (au niveau du jeton), is_anti_whale,
   anti_whale_modifiable, cannot_buy, cannot_sell_all, owner_change_balance.

   Ce n'est PAS un verdict de GoPlus : seul leur service le rend, apres
   deploiement. C'est la preuve locale que rien, dans le jeton, ne leur
   donne de raison d'alerter. La taxe createur, elle, existe et est DECLAREE :
   elle vit dans le hook, se lit par `currentFees(token)` et s'annonce dans
   `LaunchConfig` et `FeeTaken`. Rien n'est concu pour la cacher.
   ============================================================ */
contract GoPlusV5Test is BaseV5 {
    address t;

    function setUp() public {
        setUpLocal();
        LaunchParams memory p = params(0);
        p.creatorTaxBps = 500;
        p.snipe = Snipe(9_000, 120);
        p.limits = Limits(50, 50, 3_600);
        t = launch(p);
    }

    /// Code executable seulement : les metadonnees CBOR de solc terminent le bytecode et ne s'executent pas.
    function _exec(bytes memory code) internal pure returns (uint256 end) {
        uint256 n = code.length;
        uint256 meta = (uint256(uint8(code[n - 2])) << 8) | uint256(uint8(code[n - 1]));
        end = n - 2 - meta;
    }

    function _opcodes(bytes memory code) internal pure returns (bool[256] memory seen, bytes4[] memory push4) {
        uint256 end = _exec(code);
        bytes4[] memory tmp = new bytes4[](256);
        uint256 k;
        for (uint256 i; i < end; ++i) {
            uint8 op = uint8(code[i]);
            seen[op] = true;
            if (op == 0x63 && i + 4 < end) {
                tmp[k++] = bytes4(bytes.concat(code[i + 1], code[i + 2], code[i + 3], code[i + 4]));
            }
            if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
        }
        push4 = new bytes4[](k);
        for (uint256 j; j < k; ++j) push4[j] = tmp[j];
    }

    // external_call, selfdestruct, is_proxy (pas de DELEGATECALL), trading_cooldown (pas d'horloge), anti-whale par origine
    function test_no_dangerous_opcodes() public view {
        (bool[256] memory seen,) = _opcodes(t.code);
        assertFalse(seen[0xf0], "CREATE");
        assertFalse(seen[0xf1], "CALL : external_call");
        assertFalse(seen[0xf2], "CALLCODE");
        assertFalse(seen[0xf4], "DELEGATECALL : is_proxy");
        assertFalse(seen[0xf5], "CREATE2");
        assertFalse(seen[0xfa], "STATICCALL : external_call");
        assertFalse(seen[0xff], "SELFDESTRUCT");
        assertFalse(seen[0x42], "TIMESTAMP : trading_cooldown");
        assertFalse(seen[0x43], "NUMBER : trading_cooldown");
        assertFalse(seen[0x32], "ORIGIN : limite par tx.origin");
        assertFalse(seen[0x31], "BALANCE");
        assertFalse(seen[0x3b] || seen[0x3c] || seen[0x3f], "EXTCODE* : liste par type de compte");
    }

    // is_mintable, owner_address, can_take_back_ownership, transfer_pausable, listes, taxes et plafonds modifiables
    function test_only_erc20_and_owner_selectors() public {
        (, bytes4[] memory push4) = _opcodes(t.code);
        bytes4[13] memory allowed = [
            bytes4(keccak256("name()")),
            bytes4(keccak256("symbol()")),
            bytes4(keccak256("decimals()")),
            bytes4(keccak256("totalSupply()")),
            bytes4(keccak256("owner()")),
            bytes4(keccak256("balanceOf(address)")),
            bytes4(keccak256("allowance(address,address)")),
            bytes4(keccak256("transfer(address,uint256)")),
            bytes4(keccak256("approve(address,uint256)")),
            bytes4(keccak256("transferFrom(address,address,uint256)")),
            bytes4(0x4e487b71), // Panic(uint256), emis par le compilateur
            bytes4(0x08c379a0), // Error(string)
            bytes4("zero") // le message de revert « zero » (transfert vers l'adresse 0), pas un selecteur
        ];
        uint256 dispatch;
        for (uint256 i; i < push4.length; ++i) {
            bool ok;
            for (uint256 j; j < allowed.length; ++j) {
                if (push4[i] == allowed[j]) ok = true;
            }
            // toute autre constante de 4 octets doit etre autre chose qu'un selecteur (ex. masques) : on les refuse toutes
            if (!ok) emit log_named_bytes32("constante inattendue", bytes32(push4[i]));
            assertTrue(ok, "constante de 4 octets inattendue dans le jeton");
            if (ok) ++dispatch;
        }
        assertGe(dispatch, 10, "les dix fonctions sont dispatchees");
        // et les dix repondent
        assertEq(SwogeTokenV5(t).decimals(), 18);
        assertEq(SwogeTokenV5(t).allowance(alice, bob), 0);

        string[18] memory forbidden = [
            "mint(address,uint256)",
            "burn(uint256)",
            "burn(address,uint256)",
            "pause()",
            "unpause()",
            "transferOwnership(address)",
            "renounceOwnership()",
            "setOwner(address)",
            "blacklist(address)",
            "addToBlacklist(address)",
            "setBlacklist(address,bool)",
            "setWhitelist(address,bool)",
            "excludeFromFee(address)",
            "setFee(uint256)",
            "setTaxFee(uint256)",
            "setMaxTxAmount(uint256)",
            "setMaxWallet(uint256)",
            "upgradeTo(address)"
        ];
        for (uint256 i; i < forbidden.length; ++i) {
            bytes4 sel = bytes4(keccak256(bytes(forbidden[i])));
            for (uint256 j; j < push4.length; ++j) {
                assertTrue(push4[j] != sel, forbidden[i]);
            }
            (bool ok,) = t.staticcall(abi.encodeWithSelector(sel, address(this), 1));
            assertFalse(ok, forbidden[i]);
        }
    }

    // owner_address = 0, hidden_owner : une vraie variable, a zero, annoncee a la creation (motif mesure sur V4)
    function test_owner_is_zero_variable() public {
        assertEq(SwogeTokenV5(t).owner(), address(0));
        vm.recordLogs();
        LaunchParams memory p = params(0);
        p.salt = bytes32(uint256(77));
        address t2 = launch(p);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == t2 && logs[i].topics[0] == keccak256("OwnershipTransferred(address,address)")) {
                assertEq(logs[i].topics[1], bytes32(0));
                assertEq(logs[i].topics[2], bytes32(0));
                seen = true;
            }
        }
        assertTrue(seen, "OwnershipTransferred(0, 0) a la creation");
    }

    // buy_tax / sell_tax au niveau du jeton : 0 ; cannot_sell_all : non ; owner_change_balance : aucune fonction
    function test_plain_transfers_no_tax_full_balance() public {
        buy(alice, t, -0.001 ether);
        uint256 a = SwogeTokenV5(t).balanceOf(alice);
        assertGt(a, 0);
        vm.prank(alice);
        SwogeTokenV5(t).transfer(bob, a); // tout le solde, d'un coup
        assertEq(SwogeTokenV5(t).balanceOf(bob), a, "recu = envoye : aucune taxe dans le jeton");
        assertEq(SwogeTokenV5(t).balanceOf(alice), 0);
        vm.prank(bob);
        SwogeTokenV5(t).approve(alice, a);
        vm.prank(alice);
        SwogeTokenV5(t).transferFrom(bob, alice, a);
        assertEq(SwogeTokenV5(t).balanceOf(alice), a);
        assertEq(SwogeTokenV5(t).totalSupply(), V5.TOTAL_SUPPLY);
        // vendre tout le solde dans le pool marche aussi (cannot_sell_all = 0)
        sell(alice, t, -int256(a));
        assertEq(SwogeTokenV5(t).balanceOf(alice), 0);
    }

    // la taxe est declaree, pas cachee : lisible en vue, et dans les evenements du lancement
    function test_tax_is_disclosed_by_views() public view {
        (uint16 buyBps, uint16 sellBps, uint32 end) = core.currentFees(t);
        assertEq(sellBps, 100 + 500);
        assertEq(buyBps, 100 + 500 + 9_000);
        assertEq(end, T0 + 120);
    }

    function test_token_runtime_size() public {
        emit log_named_uint("taille du jeton deploye (octets)", t.code.length);
        assertLt(t.code.length, 24_576);
    }
}
