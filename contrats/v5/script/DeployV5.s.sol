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

   Cinq transactions : le deployeur CREATE3 (sauf s'il existe), puis hook,
   noyau, Holders, Alloc. Les adresses sont calculees AVANT, chaque module
   recoit les autres en `immutable`, et le script verifie le cablage a la fin.
   ============================================================ */
contract DeployV5 is Script {
    // Uniswap v4 PoolManager de Robinhood Chain, relu le 18/10/2026 (24 009 octets ; PositionManager.poolManager() le designe)
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    /* La liste des monnaies de cotation, FIGEE au deploiement (aucune fonction pour la changer).
       Chaque adresse relue sur la chaine le 18/10/2026 : code present, symbol(), decimals().
       SPCX et NVDA : registre officiel https://api.robinhood.com/rhj/assets (chainId 4663).
       Prix de depart : 1 ETH de FDV dans chaque monnaie, aux prix DexScreener du 18/10/2026
       11:18 UTC (ETH 2 415,87 $ ; $SWOGE 7,88e-9 ETH ; SPCX 144,59 $ ; NVDA 213,70 $).
       A RECALCULER le jour du deploiement (formule dans le README) : un prix d'action qui a
       bouge de 20 % deplace l'ouverture de 20 %. */
    function quoteList() public pure returns (address[] memory qs, int24[] memory ts) {
        qs = new address[](5);
        ts = new int24[](5);
        qs[0] = address(0); // ETH natif
        ts[0] = -207_200; // 1e-9 ETH par jeton, le depart de V4
        qs[1] = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; // USDG, 6 decimales
        ts[1] = -405_600;
        qs[2] = 0x8a166Fb41Cd659a0a43396272FF73973Ce29F817; // $SWOGE
        ts[2] = -20_600;
        qs[3] = 0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa; // SPCX (SpaceX, Robinhood Token)
        ts[3] = -179_000;
        qs[4] = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC; // NVDA (NVIDIA, Robinhood Token)
        ts[4] = -183_000;
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

        console2.log("deployeur CREATE3 :", dep);
        console2.log("SwogeHookV5       :", aHook);
        console2.log("SwogeLaunchpadV5  :", aCore);
        console2.log("SwogeHoldersV5    :", aHolders);
        console2.log("SwogeAllocV5      :", aAlloc);
    }
}
