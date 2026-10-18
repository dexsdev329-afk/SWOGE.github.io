// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SwogeHookV5} from "../src/SwogeHookV5.sol";
import {SwogeLaunchpadV5} from "../src/SwogeLaunchpadV5.sol";
import {SwogeHoldersV5} from "../src/SwogeHoldersV5.sol";
import {SwogeAllocV5} from "../src/SwogeAllocV5.sol";
import {SwogeDeployerV5} from "../src/SwogeDeployerV5.sol";
import {HookMiner} from "./MineHookSalt.s.sol";
import {V5} from "../src/SwogeTypesV5.sol";

/* ============================================================
   DEPLOIEMENT DE SWOGE V5 — A LANCER PAR LE PROPRIETAIRE, DEPUIS SON PORTEFEUILLE

   Ce script n'a JAMAIS ete diffuse sur une chaine reelle. Il a tourne
   uniquement contre un fork anvil LOCAL, avec un compte impersonne (aucune
   cle). Procedure complete : contrats/v5/README.md, « Deployer ».

   Variables :
     V5_OWNER           adresse qui signe les cinq transactions (son portefeuille)
     V5_TREASURY        tresor SWOGE (recoit 25 % du frais de base et le frais de lancement)
     V5_LAUNCH_FEE_WEI  frais de lancement en wei (0,0005 ETH = 500000000000000)
     V5_DEPLOYER        (optionnel) un SwogeDeployerV5 deja deploye
     V5_COTATIONS       (optionnel) chemin de cotations_v5.json (defaut : contrats/v5/script/cotations_v5.json)

   Cinq transactions : le deployeur CREATE3 (sauf s'il existe), puis hook,
   noyau, Holders, Alloc. Les adresses sont calculees AVANT, chaque module
   recoit les autres en `immutable`, et le script verifie le cablage a la fin.
   ============================================================ */
interface IERC20Sym {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

contract DeployV5 is Script {
    // Uniswap v4 PoolManager de Robinhood Chain, relu le 18/10/2026 (24 009 octets ; PositionManager.poolManager() le designe)
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    /* La liste des monnaies de cotation, FIGEE au deploiement (aucune fonction pour la changer).
       Decision du proprietaire, 18/10/2026 : ETH, USDG, $SWOGE et TOUTES les actions Robinhood.
       Elle vient de `script/cotations_v5.json`, ecrit par `script/genere_cotations.js` (lecture
       seule : registre https://api.robinhood.com/rhj/assets, chaine 4663, cours du jour).
       A REGENERER le jour du deploiement : les ticks de reference suivent les prix (FDV
       d'ouverture ≈ 1 ETH), et le lanceur ne peut s'en ecarter que de ×10 (MAX_START_SHIFT_TICKS).
       Le script relit chaque adresse sur la chaine avant de diffuser quoi que ce soit. */
    function quoteList() public view returns (address[] memory qs, int24[] memory ts) {
        string memory path =
            vm.envOr("V5_COTATIONS", string.concat(vm.projectRoot(), "/contrats/v5/script/cotations_v5.json"));
        string memory js = vm.readFile(path);
        require(vm.parseJsonUint(js, ".chainId") == 4663, "cotations : mauvaise chaine");
        qs = vm.parseJsonAddressArray(js, ".addresses");
        int256[] memory t = vm.parseJsonIntArray(js, ".startTicks");
        string[] memory syms = vm.parseJsonStringArray(js, ".symbols");
        require(qs.length == t.length && qs.length == syms.length, "cotations : longueurs");
        require(qs.length >= 1 && qs.length <= V5.MAX_QUOTES && qs[0] == address(0), "cotations : liste");
        ts = new int24[](t.length);
        for (uint256 i; i < qs.length; ++i) {
            require(t[i] >= type(int24).min && t[i] <= type(int24).max, "cotations : tick");
            ts[i] = int24(t[i]);
            if (i == 0) continue;
            // relecture sur la chaine : code present, symbole et decimales egaux a ceux du generateur
            require(qs[i].code.length > 0, string.concat("cotations : sans code ", syms[i]));
            require(
                keccak256(bytes(IERC20Sym(qs[i]).symbol())) == keccak256(bytes(syms[i])),
                string.concat("cotations : symbol() ", syms[i])
            );
            uint256 d = vm.parseJsonUint(js, string.concat(".liste[", vm.toString(i), "].decimales"));
            require(IERC20Sym(qs[i]).decimals() == d, string.concat("cotations : decimals() ", syms[i]));
        }
        console2.log("monnaies de cotation :", qs.length);
        console2.log("liste generee le      :", vm.parseJsonString(js, ".genere"));
    }

    function run() external {
        address owner = vm.envAddress("V5_OWNER");
        address treasury = vm.envAddress("V5_TREASURY");
        uint256 fee = vm.envUint("V5_LAUNCH_FEE_WEI");
        address dep = vm.envOr("V5_DEPLOYER", address(0));
        require(POOL_MANAGER.code.length > 0, "PoolManager absent : mauvaise chaine ?");
        (address[] memory qs, int24[] memory ts) = quoteList();

        vm.startBroadcast(owner);
        if (dep == address(0)) dep = address(new SwogeDeployerV5());
        SwogeDeployerV5 d = SwogeDeployerV5(dep);

        (bytes32 hookSalt, address aHook) = HookMiner.mine(dep, owner, 0);
        bytes32 sCore = keccak256("swoge.v5.core");
        bytes32 sHolders = keccak256("swoge.v5.holders");
        bytes32 sAlloc = keccak256("swoge.v5.alloc");
        address aCore = d.addressOf(owner, sCore);
        address aHolders = d.addressOf(owner, sHolders);
        address aAlloc = d.addressOf(owner, sAlloc);
        require(d.addressOf(owner, hookSalt) == aHook, "mineur");

        IPoolManager pm = IPoolManager(POOL_MANAGER);
        d.deploy(hookSalt, abi.encodePacked(type(SwogeHookV5).creationCode, abi.encode(pm, aCore, aHolders)));
        d.deploy(
            sCore,
            abi.encodePacked(
                type(SwogeLaunchpadV5).creationCode, abi.encode(pm, aHook, aHolders, aAlloc, treasury, fee, qs, ts)
            )
        );
        d.deploy(sHolders, abi.encodePacked(type(SwogeHoldersV5).creationCode, abi.encode(pm, aCore, aHook)));
        d.deploy(sAlloc, abi.encodePacked(type(SwogeAllocV5).creationCode, abi.encode(aCore)));
        vm.stopBroadcast();

        // cablage : chaque module designe les autres
        require(SwogeHookV5(aHook).core() == aCore && SwogeHookV5(aHook).holders() == aHolders, "hook");
        require(SwogeLaunchpadV5(aCore).hook() == aHook && SwogeLaunchpadV5(aCore).holders() == aHolders, "core");
        require(SwogeLaunchpadV5(aCore).alloc() == aAlloc && SwogeLaunchpadV5(aCore).treasury() == treasury, "core");
        require(SwogeHoldersV5(aHolders).core() == aCore && SwogeHoldersV5(aHolders).hook() == aHook, "holders");
        require(SwogeAllocV5(aAlloc).core() == aCore, "alloc");
        require(uint160(aHook) & Hooks.ALL_HOOK_MASK == HookMiner.FLAGS, "flags");
        require(SwogeLaunchpadV5(aCore).quotes().length == qs.length, "liste");

        console2.log("deployeur CREATE3 :", dep);
        console2.log("SwogeHookV5       :", aHook);
        console2.log("SwogeLaunchpadV5  :", aCore);
        console2.log("SwogeHoldersV5    :", aHolders);
        console2.log("SwogeAllocV5      :", aAlloc);
    }
}
