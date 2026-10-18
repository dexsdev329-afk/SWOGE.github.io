// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/* ============================================================
   SWOGE V5 — LE JETON : UN ERC-20 NU (18/10/2026)

   Le meme jeton que V4 (SwogeTokenV4, source verifiee exact_match sur
   Sourcify), parce que c'est celui que les scanners lisent proprement :

   - offre fixe, creee UNE fois dans le constructeur, envoyee a l'appelant
     (le launchpad, qui la place aussitot dans le pool et les allocations) ;
   - ni mint, ni burn, ni pause, ni liste noire ou blanche, ni taxe, ni
     plafond par portefeuille, ni delai entre deux echanges, ni proxy ;
   - aucun appel externe, aucune condition dans le transfert hormis le solde
     et l'adresse zero ;
   - `owner` est une VARIABLE en stockage, mise a zero et annoncee par
     OwnershipTransferred(0, 0) a la creation. Mesure du 30/09/2026 (banc_fork_v4weth.js) :
     GoPlus notait « hidden_owner: 1 » quand owner() etait une constante
     (`pure`, return 0) ; sans owner() du tout, GoPlus designait le createur.
     La variable a zero est le motif que GoPlus note 0.

   Toute la logique de frais, de taxe et d'anti-snipe vit dans le hook
   Uniswap v4 (SwogeHookV5), declaree en evenements et lisible en vues.
   ============================================================ */
contract SwogeTokenV5 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    address public owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _supply;
        owner = address(0);
        emit OwnershipTransferred(address(0), address(0));
        balanceOf[msg.sender] = _supply;
        emit Transfer(address(0), msg.sender, _supply);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _t(msg.sender, to, v);
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _t(f, to, v);
        return true;
    }

    function _t(address f, address to, uint256 v) internal {
        require(to != address(0), "zero");
        uint256 b = balanceOf[f];
        require(b >= v, "balance");
        unchecked {
            balanceOf[f] = b - v;
            balanceOf[to] += v;
        }
        emit Transfer(f, to, v);
    }
}
