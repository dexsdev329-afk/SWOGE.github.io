// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";

/* ============================================================
   MINAGE DU SEL DU HOOK V5 (18/10/2026)

   PoolManager v4 lit les permissions d'un hook dans les 14 bits de poids
   faible de son ADRESSE. Celles de SwogeHookV5 :
     beforeInitialize | beforeAddLiquidity | beforeRemoveLiquidity |
     beforeSwap | afterSwap | beforeSwapReturnDelta | afterSwapReturnDelta
     = 0x2ACC
   (le meme motif « …2acc » que plusieurs hooks a frais deja actifs sur la
   chaine, ex. 0x2c668601…2acc releve le 16/10).

   Avec SwogeDeployerV5 (CREATE3), l'adresse ne depend que du deployeur, de
   l'appelant et du sel : on cherche un sel dont l'adresse finale porte
   exactement 0x2ACC. En moyenne 2^14 = 16 384 essais, deux keccak chacun.

   Hors chaine, aucune transaction :
     forge script contrats/v5/script/MineHookSalt.s.sol \
       --sig "run(address,address)" <deployeur> <proprietaire>
   ============================================================ */
library HookMiner {
    uint160 internal constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    /// Meme calcul que SwogeDeployerV5.addressOf, sans appel.
    function addressOf(address deployer, address by, bytes32 salt) internal pure returns (address) {
        bytes32 s = keccak256(abi.encode(by, salt));
        address proxy = address(
            uint160(uint256(keccak256(abi.encodePacked(hex"ff", deployer, s, keccak256(hex"67363d3d37363d34f03d5260086018f3")))))
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", proxy, hex"01")))));
    }

    function mine(address deployer, address by, uint256 from) internal pure returns (bytes32 salt, address hook) {
        for (uint256 i = from; i < from + 4_000_000; ++i) {
            salt = keccak256(abi.encode("swoge.v5.hook", i));
            hook = addressOf(deployer, by, salt);
            if (uint160(hook) & Hooks.ALL_HOOK_MASK == FLAGS) return (salt, hook);
        }
        revert("no salt");
    }
}

contract MineHookSalt is Script {
    function run(address deployer, address owner) external pure returns (bytes32 salt, address hook) {
        (salt, hook) = HookMiner.mine(deployer, owner, 0);
        console2.log("sel du hook :");
        console2.logBytes32(salt);
        console2.log("adresse du hook :", hook);
    }
}
