// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/* ============================================================================
 * SwogeBetVault — le coffre des paris, en $SWOGEBET et rien d'autre
 *
 * « Il faudrait faire le contrat vault SWOGEBET pour qu'on puisse jouer aux
 *   paris qu'avec du SWOGEBET. »
 *
 * Le coffre du casino (SwogePusherVault) tient le $SWOGE de tous les jeux.
 * Celui-ci tient le $SWOGEBET des paris sportifs, avec EXACTEMENT le meme
 * mecanisme, pour que le serveur et les pages n'aient rien de nouveau a
 * apprendre :
 *
 *   1. le joueur `approve` puis `deposit(montant)` : le jeton entre dans le
 *      coffre, et l'evenement `Deposit` dit combien. Le serveur lit cet
 *      evenement et credite le solde de paris du joueur — pas son solde
 *      $SWOGE, un solde a part ;
 *   2. pour sortir, le serveur signe un BON EIP-712 qui porte un CUMUL : tout
 *      ce que ce joueur a jamais ete autorise a retirer. Le contrat paie
 *      l'ecart entre ce cumul et ce qu'il a deja verse. Un bon presente deux
 *      fois ne paie donc rien la seconde fois, et un bon perdu se resigne
 *      sans risque : il ne peut pas payer un jeton de plus.
 *
 * ---- CE QUE CE CONTRAT NE FAIT PAS ----
 *
 *   - il ne brule rien et ne prend aucun frais : le frais de retrait est
 *     calcule par le serveur, qui n'autorise que le NET, comme pour le
 *     $SWOGE. Un frais dans le contrat ET un frais dans le serveur auraient
 *     fini par se cumuler un jour ;
 *   - il ne connait pas les paris. Il ne sait que deux choses par joueur :
 *     ce qu'il a depose, et ce qu'il a retire. Tout le reste — cotes, mises,
 *     gains — vit dans le serveur, comme pour le casino ;
 *   - il ne fait confiance a aucune valeur de retour : le $SWOGEBET rend
 *     `true`, mais un jeton qui ne rend rien passerait aussi. Ce qui est
 *     credite est ce qui est ARRIVE, mesure sur le solde du coffre, pas ce
 *     qui a ete demande.
 *
 * ---- LE DOMAINE EIP-712 ----
 *
 *   name « SwogeBetVault », version « 1 », chainId 4663, ce contrat.
 *   Type : Withdraw(address player,uint256 cumulative,uint256 deadline)
 *
 * C'est le domaine que le serveur signe (`chain.js`, `domainName`). Un bon
 * signe pour le coffre $SWOGE ne vaut pas ici, et reciproquement : le nom du
 * domaine et l'adresse du contrat entrent dans la signature.
 * ==========================================================================*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract SwogeBetVault {
    IERC20 public immutable token;

    address public owner;
    address public signer;
    uint256 public minWithdraw;
    bool public depositsPaused;
    bool public withdrawalsPaused;

    mapping(address => uint256) public deposited;   // total jamais depose par ce joueur
    mapping(address => uint256) public withdrawn;   // total jamais verse a ce joueur

    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address player,uint256 cumulative,uint256 deadline)");
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private immutable DOMAIN_SEPARATOR;

    uint256 private _lock = 1;

    event Deposit(address indexed player, uint256 amount, uint256 playerTotal, uint256 timestamp);
    event Withdraw(address indexed player, uint256 amount, uint256 cumulative);
    event OwnerDeposit(address indexed from, uint256 amount);
    event OwnerWithdraw(address indexed to, uint256 amount);
    event SignerChanged(address indexed previous, address indexed current);
    event MinWithdrawChanged(uint256 previous, uint256 current);
    event DepositsPaused(bool paused);
    event WithdrawalsPaused(bool paused);
    event OwnershipTransferred(address indexed previous, address indexed current);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier nonReentrant() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param token_      le $SWOGEBET : 0xc0aed547862fba5d7d9fbf3cb14204cd756c8bea
    /// @param signer_     l'adresse dont le serveur a la cle (SIGNER_PRIVATE_KEY)
    /// @param minWithdraw_ en wei du jeton (18 decimales) : 50 $SWOGEBET = 50e18
    constructor(address token_, address signer_, uint256 minWithdraw_) {
        require(token_ != address(0), "token");
        require(signer_ != address(0), "signer");
        token = IERC20(token_);
        owner = msg.sender;
        signer = signer_;
        minWithdraw = minWithdraw_;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256(bytes("SwogeBetVault")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    /* ------------------------------------------------------------ le joueur */

    /// Depose `amount` $SWOGEBET (apres `approve`). Ce qui est credite est ce
    /// qui est arrive dans le coffre, pas ce qui a ete demande.
    function deposit(uint256 amount) external nonReentrant {
        require(!depositsPaused, "deposits paused");
        require(amount > 0, "amount");
        uint256 recu = _pull(msg.sender, amount);
        deposited[msg.sender] += recu;
        emit Deposit(msg.sender, recu, deposited[msg.sender], block.timestamp);
    }

    /// Encaisse un bon signe par le serveur. `cumulative` est TOUT ce que ce
    /// joueur a jamais ete autorise a retirer ; le contrat paie l'ecart avec
    /// ce qu'il a deja verse. Presenter deux fois le meme bon ne paie rien la
    /// seconde fois.
    function withdraw(uint256 cumulative, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external nonReentrant
    {
        require(!withdrawalsPaused, "withdrawals paused");
        require(block.timestamp <= deadline, "voucher expired");
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(WITHDRAW_TYPEHASH, msg.sender, cumulative, deadline))
        ));
        address qui = ecrecover(digest, v, r, s);
        require(qui != address(0) && qui == signer, "bad signature");
        uint256 deja = withdrawn[msg.sender];
        require(cumulative > deja, "nothing due");
        uint256 due = cumulative - deja;
        require(due >= minWithdraw, "below minimum");
        withdrawn[msg.sender] = cumulative;
        _push(msg.sender, due);
        emit Withdraw(msg.sender, due, cumulative);
    }

    /// Tout ce que le coffre detient : depots des joueurs et bankroll confondus.
    function totalPot() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /* ------------------------------------------------------- le proprietaire */

    /// Approvisionner la bankroll, pour que les gains puissent toujours payer.
    function ownerDeposit(uint256 amount) external onlyOwner nonReentrant {
        uint256 recu = _pull(msg.sender, amount);
        emit OwnerDeposit(msg.sender, recu);
    }

    /// Retirer du surplus. Le serveur dit combien est retirable sans manquer
    /// a un joueur ; le contrat, lui, ne peut pas le savoir.
    function ownerWithdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "to");
        _push(to, amount);
        emit OwnerWithdraw(to, amount);
    }

    function setSigner(address s) external onlyOwner {
        require(s != address(0), "signer");
        emit SignerChanged(signer, s);
        signer = s;
    }

    function setMinWithdraw(uint256 v) external onlyOwner {
        emit MinWithdrawChanged(minWithdraw, v);
        minWithdraw = v;
    }

    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }

    function setWithdrawalsPaused(bool paused) external onlyOwner {
        withdrawalsPaused = paused;
        emit WithdrawalsPaused(paused);
    }

    function transferOwnership(address n) external onlyOwner {
        require(n != address(0), "owner");
        emit OwnershipTransferred(owner, n);
        owner = n;
    }

    /* ------------------------------------------------------------ le jeton */

    /// Tire `amount` chez `from` et rend ce qui est REELLEMENT arrive.
    function _pull(address from, uint256 amount) private returns (uint256) {
        uint256 avant = token.balanceOf(address(this));
        _appel(abi.encodeWithSelector(token.transferFrom.selector, from, address(this), amount));
        uint256 apres = token.balanceOf(address(this));
        require(apres > avant, "nothing received");
        return apres - avant;
    }

    function _push(address to, uint256 amount) private {
        require(amount > 0, "amount");
        _appel(abi.encodeWithSelector(token.transfer.selector, to, amount));
    }

    /// Un transfert qui revertit, ou qui rend `false`, est un echec. Un jeton
    /// qui ne rend rien du tout est accepte : c'est le cas de plusieurs
    /// jetons anciens, et le solde est de toute facon relu apres.
    function _appel(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "token transfer failed");
    }
}
