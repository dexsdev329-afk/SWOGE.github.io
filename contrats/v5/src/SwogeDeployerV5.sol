// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/* ============================================================
   SWOGE V5 — DEPLOYEUR CREATE3, SANS PROPRIETAIRE (18/10/2026)

   Les quatre modules de V5 se connaissent par des adresses `immutable` :
   le hook doit connaitre le noyau et Holders, le noyau doit connaitre le
   hook, etc. Avec CREATE ou CREATE2, l'adresse d'un module depend de son
   code d'init, donc des adresses des autres : un cercle. CREATE3 casse le
   cercle : l'adresse ne depend que de (ce deployeur, l'appelant, le sel).
   On calcule les quatre adresses d'abord, puis on deploie chaque module avec
   les trois autres en arguments.

   Le hook doit en plus porter ses drapeaux de permission dans les 14 bits de
   poids faible de son adresse : son sel est mine hors chaine
   (script/MineHookSalt.s.sol), ce qui ne demande que deux keccak par essai.

   Le sel est mele a l'appelant : un tiers qui rejoue le meme sel obtient
   d'autres adresses, il ne peut pas occuper celles du proprietaire. Ce
   contrat n'a aucun pouvoir sur ce qu'il deploie, aucun proprietaire, aucun
   etat : c'est un outil de deploiement, pas une partie de V5.

   Mandataire CREATE3 (le motif de Solady / 0xSequence) : son code d'init
   0x67363d3d37363d34f03d5260086018f3 depose le code 363d3d37363d34f0, qui
   CREE un contrat avec les donnees d'appel comme code d'init. Le contrat
   final est a l'adresse keccak256(rlp([mandataire, nonce 1]))[12:].
   ============================================================ */
contract SwogeDeployerV5 {
    bytes internal constant PROXY_INIT = hex"67363d3d37363d34f03d5260086018f3";

    event Deployed(address indexed by, bytes32 indexed salt, address addr);

    function deploy(bytes32 salt, bytes calldata initCode) external payable returns (address addr) {
        bytes32 s = keccak256(abi.encode(msg.sender, salt));
        bytes memory pi = PROXY_INIT;
        address proxy;
        assembly {
            proxy := create2(0, add(pi, 0x20), mload(pi), s)
        }
        require(proxy != address(0), "proxy");
        addr = _child(proxy);
        (bool ok,) = proxy.call{value: msg.value}(initCode);
        // le mandataire ne remonte pas l'echec de CREATE : on verifie le code a l'adresse attendue
        require(ok && addr.code.length > 0, "create");
        emit Deployed(msg.sender, salt, addr);
    }

    function addressOf(address by, bytes32 salt) public view returns (address) {
        bytes32 s = keccak256(abi.encode(by, salt));
        address proxy = address(uint160(uint256(keccak256(abi.encodePacked(hex"ff", address(this), s, keccak256(PROXY_INIT))))));
        return _child(proxy);
    }

    function _child(address proxy) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", proxy, hex"01")))));
    }
}
