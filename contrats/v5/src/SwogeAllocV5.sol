// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {V5, Alloc} from "./SwogeTypesV5.sol";

interface IERC20A {
    function transfer(address, uint256) external returns (bool);
}

/* ============================================================
   SWOGE V5 — ALLOCATIONS HORS POOL (18/10/2026)

   Deux allocations optionnelles, choisies au lancement et figees ensuite :
   - VESTING du createur (≤ 5 % de l'offre) : rien avant le cliff (≥ 30 j),
     puis lineaire depuis le lancement jusqu'a `duration` (90 a 730 j).
     Liberable par n'importe qui, toujours au createur (l'appelant du lancement).
   - AIRDROP Merkle (≤ 5 %) : feuille = keccak256(bytes.concat(keccak256(
     abi.encode(compte, montant)))), paires triees. Reclamable pendant
     `claimSecs` (7 a 180 j) ; ensuite le reliquat est BRULE par n'importe qui.

   Total hors pool ≤ 10 % de l'offre. Ces allocations sont de l'offre que le
   createur controle : la page doit les afficher en tete de la fiche (§4.7).
   Ni proprietaire, ni setter : seul le noyau enregistre, une fois par jeton.
   ============================================================ */
contract SwogeAllocV5 {
    address public immutable core;

    struct Vest {
        address beneficiary;
        uint64 start;
        uint32 cliff;
        uint32 duration;
        uint256 total;
        uint256 released;
    }

    struct Drop {
        bytes32 root;
        uint64 deadline;
        uint256 remaining;
    }

    mapping(address => Vest) public vests;
    mapping(address => Drop) public drops;
    mapping(address => mapping(address => bool)) public claimed;

    event VestingReleased(address indexed token, address indexed beneficiary, uint256 amount);
    event AirdropClaimed(address indexed token, address indexed account, uint256 amount);
    event AirdropSwept(address indexed token, uint256 burned);

    constructor(address _core) {
        require(_core != address(0), "zero");
        core = _core;
    }

    function register(address token, address beneficiary, Alloc calldata a) external {
        require(msg.sender == core, "core");
        require(vests[token].total == 0 && drops[token].root == bytes32(0), "registered");
        if (a.creatorVestBps > 0) {
            vests[token] = Vest({
                beneficiary: beneficiary,
                start: uint64(block.timestamp),
                cliff: a.cliff,
                duration: a.duration,
                total: V5.TOTAL_SUPPLY * a.creatorVestBps / 10_000,
                released: 0
            });
        }
        if (a.airdropBps > 0) {
            drops[token] = Drop({
                root: a.merkleRoot,
                deadline: uint64(block.timestamp + a.claimSecs),
                remaining: V5.TOTAL_SUPPLY * a.airdropBps / 10_000
            });
        }
    }

    function vested(address token) public view returns (uint256) {
        Vest storage v = vests[token];
        if (v.total == 0 || block.timestamp < uint256(v.start) + v.cliff) return 0;
        uint256 el = block.timestamp - v.start;
        if (el >= v.duration) return v.total;
        return v.total * el / v.duration;
    }

    function release(address token) external returns (uint256 amount) {
        Vest storage v = vests[token];
        amount = vested(token) - v.released;
        require(amount > 0, "nothing");
        v.released += amount;
        require(IERC20A(token).transfer(v.beneficiary, amount), "transfer");
        emit VestingReleased(token, v.beneficiary, amount);
    }

    function claim(address token, address account, uint256 amount, bytes32[] calldata proof) external {
        Drop storage d = drops[token];
        require(d.root != bytes32(0), "no airdrop");
        require(block.timestamp < d.deadline, "ended");
        require(!claimed[token][account], "claimed");
        bytes32 h = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        for (uint256 i; i < proof.length; ++i) {
            bytes32 o = proof[i];
            h = h < o ? keccak256(abi.encode(h, o)) : keccak256(abi.encode(o, h));
        }
        require(h == d.root, "proof");
        require(amount <= d.remaining, "remaining");
        claimed[token][account] = true;
        d.remaining -= amount;
        require(IERC20A(token).transfer(account, amount), "transfer");
        emit AirdropClaimed(token, account, amount);
    }

    function sweep(address token) external returns (uint256 burned) {
        Drop storage d = drops[token];
        require(d.root != bytes32(0), "no airdrop");
        require(block.timestamp >= d.deadline, "not ended");
        burned = d.remaining;
        require(burned > 0, "nothing");
        d.remaining = 0;
        require(IERC20A(token).transfer(V5.DEAD, burned), "burn");
        emit AirdropSwept(token, burned);
    }
}
