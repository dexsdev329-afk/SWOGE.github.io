// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/* ============================================================
   $SWOGE FUN V4 — launchpad instantane, paire SWOGE, jeton NU (29/09/2026)

   POURQUOI UN V4 : LES ALERTES DES SCANNERS
   Relu le 29/09 sur $SWOGEBET (jeton du modele V2/V3) : GoPlus affiche
   « External call : Yes » et « Ownership renounced : No », Quick Intel
   « Has suspicious functions : Yes ». Leurs causes, dans le code :
     - le jeton APPELLE le launchpad a chaque transfert (`onMove`, pour la
       reflexion aux detenteurs) : un transfert qui appelle un autre contrat a
       exactement la forme d'un piege, et un analyseur de bytecode ne peut pas
       faire la difference ;
     - `setPool` et l'anti-snipe ajoutent des fonctions et une condition dans
       le transfert, lues comme « suspectes » ;
     - sans fonction `owner()`, GoPlus rend l'adresse du CREATEUR comme
       proprietaire (owner_address = creator_address, relu le 29/09).
   Le V3 garde `onMove` : il aurait porte les memes alertes.

   CE QUE LE V4 CHANGE
   1. LE JETON EST UN ERC-20 NU : offre fixe creee une fois, aucun appel
      externe, aucune condition dans le transfert, aucun setter, et `owner()`
      rend l'adresse zero — il n'y a jamais eu de proprietaire, et c'est
      maintenant LISIBLE par un scanner au lieu d'etre deduit.
   2. PLUS DE REFLEXION. Elle etait la seule raison de l'appel externe, et
      elle portait l'essentiel de la complexite du V3 (magPerShare, retenue,
      caisse par jeton, onMove, claim) — toute la surface que ses deux audits
      avaient du durcir. Les detenteurs gardent la part de frais PERCUE DANS
      LE JETON, BRULEE a chaque recolte : ils en profitent par la rarete, sans
      aucune ligne dans le transfert.
   3. LE CREATEUR TOUCHE UNE PART DES FRAIS EN $SWOGE (50 %), le tresor
      l'autre moitie. Toujours AUCUN jeton gratuit : l'offre entiere part dans
      le pool, le createur achete au marche comme tout le monde. Il gagne sur
      l'activite qu'il amene — c'est ce qui fait venir des lanceurs.
   4. PAS D'ANTI-SNIPE DANS LE JETON. Il imposait une condition et `setPool`
      dans le transfert. Le pool est cree, amorce et approvisionne dans la
      MEME transaction que le jeton : personne ne peut acheter avant qu'il
      existe. Ce qui reste — acheter dans le bloc suivant — est public et au
      meme prix pour tous.

   CE QUI NE CHANGE PAS (repris du V3 audite) : paire $SWOGE, offre entiere
   dans le pool, NFT de liquidite garde ICI pour toujours (l'interface
   declaree ne contient ni `decreaseLiquidity`, ni `safeTransferFrom`, ni
   `burn`), CREATE2 avec sel (un lancement devance se relance), controle du
   prix du pool par `slot0`, frais de lancement BRULE, aucun proprietaire.

   NON DEPLOYE. Banc sur fork : banc_fork_v4.js. Un audit externe avant de
   mettre du monde dessus : ce contrat garde la liquidite pour toujours.
   ============================================================ */

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
/* On lit `slot0` pour verifier que le pool a bien ete amorce au prix qu'on a
   demande. Un tiers peut avoir cree et initialise le pool avant nous, a un
   prix de son choix — c'est le defaut le plus grave qu'a trouve l'audit. */
interface IUniswapV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96, int24 tick, uint16 observationIndex,
        uint16 observationCardinality, uint16 observationCardinalityNext,
        uint8 feeProtocol, bool unlocked
    );
}
interface INonfungiblePositionManager {
    struct MintParams {
        address token0; address token1; uint24 fee;
        int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired;
        uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline;
    }
    struct CollectParams {
        uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max;
    }
    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external payable returns (address pool);
    function mint(MintParams calldata params)
        external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata params)
        external payable returns (uint256 amount0, uint256 amount1);
}

/* ---------- le jeton lance : un ERC-20 NU ----------
   Offre figee a la creation, rien d'autre : ni `mint`, ni `pause`, ni liste
   noire, ni taxe, ni appel externe, ni condition dans le transfert. `owner()`
   rend l'adresse zero parce qu'il n'y a jamais eu de proprietaire — les
   scanners lisent cette fonction ; sans elle, GoPlus designait le createur. */
contract SwogeTokenV4 {
    string public name; string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    address public owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name; symbol = _symbol; totalSupply = _supply;
        owner = address(0); emit OwnershipTransferred(address(0), address(0));
        balanceOf[msg.sender] = _supply; emit Transfer(address(0), msg.sender, _supply);
    }
    function transfer(address to, uint256 v) external returns (bool) { _t(msg.sender, to, v); return true; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender]; require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _t(f, to, v); return true;
    }
    function _t(address f, address to, uint256 v) internal {
        require(to != address(0), "zero");
        uint256 b = balanceOf[f]; require(b >= v, "balance");
        unchecked { balanceOf[f] = b - v; balanceOf[to] += v; }
        emit Transfer(f, to, v);
    }
}

library TickMath {
    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        unchecked {
            uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            require(absTick <= 887272, "T");
            uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
            if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
            if (tick > 0) ratio = type(uint256).max / ratio;
            sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
        }
    }
}


contract SwogeFunV4 {
    /* ---------- le partage, fige ----------
       Aucun setter, aucun proprietaire. Le $SWOGE recolte : moitie au createur
       du jeton, moitie au tresor. La part recoltee DANS le jeton lance est
       brulee (les detenteurs en profitent par la rarete). */
    uint16 public constant CREATOR_SHARE_BPS = 5000;   // 50 % du frais de pool en $SWOGE -> createur

    uint256 public immutable creationFee;               // en $SWOGE, BRULE
    address public immutable positionManager;
    address public immutable swoge;
    address public immutable swogeTreasury;

    uint24  public constant POOL_FEE = 10000;           // palier 1 %
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    /* La plage de prix du V3, recalculee pour une paire $SWOGE (voir le V3, point 7). */
    int24 public constant I_TICK_START = -46000;
    int24 public constant I_TICK_TOP   = 115200;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    struct Inst { address token; address creator; address pool; uint256 lpTokenId; bool exists; }
    mapping(address => Inst) public instant;
    address[] public allTokens;

    event Created(address indexed token, address indexed creator, string name, string symbol);
    event Meta(address indexed token, string telegram, string twitter, string website, string logo);
    event LaunchedInstant(address indexed token, address indexed creator, address pool, uint256 lpTokenId);
    event FeesCollected(address indexed token, uint256 swogeToCreator, uint256 swogeToTreasury, uint256 tokenBurned);

    bool private _locked;
    modifier nonReentrant() { require(!_locked, "reentrant"); _locked = true; _; _locked = false; }

    constructor(address _positionManager, address _swoge, address _treasury, uint256 _creationFee) {
        require(_positionManager != address(0) && _swoge != address(0) && _treasury != address(0), "zero");
        positionManager = _positionManager;
        swoge = _swoge;
        swogeTreasury = _treasury;
        creationFee = _creationFee;
    }

    struct LaunchParams {
        string name; string symbol;
        /* ---- LE SEL REND LE LANCEMENT REJOUABLE ----
         * Avec un CREATE ordinaire, l'adresse du prochain jeton est
         * `keccak(rlp(launchpad, nonce))` : entierement previsible, et LA MEME
         * pour tout le monde. Un tiers pouvait calculer cette adresse, creer et
         * INITIALISER son pool a un prix de son choix ; le mint mono-face
         * revertait, le revert annulait l'increment du nonce, et la tentative
         * suivante — de n'importe qui — retombait sur la MEME adresse
         * empoisonnee. Le launchpad entier etait mort pour toujours, pour le
         * prix du gaz, et sans owner personne n'aurait pu le rattraper.
         *
         * Avec un CREATE2 dont le sel melange l'appelant et cette valeur,
         * l'adresse change des qu'on change de sel. Il faut etre honnete sur ce
         * que ca corrige et ce que ca ne corrige pas : le sel etant visible
         * dans la transaction en attente, un attaquant qui surveille le mempool
         * peut toujours empoisonner CE lancement-la en le devancant. Ce qu'il
         * ne peut plus faire, c'est tuer le launchpad : la victime relance avec
         * un autre sel et passe. On a converti une brique definitive et globale
         * en un blocage repetable et individuel — le `require` sur `slot0`
         * juste apres garantit qu'on echoue proprement au lieu de lancer a un
         * prix truque. */
        bytes32 salt;
        string telegram; string twitter; string website; string logo;
    }

    /* ---------- lancer ----------
       N'est PAS `payable` : le frais se paie en $SWOGE, donc le lanceur doit
       d'abord autoriser ce contrat (`approve`) — une transaction de plus
       avant le lancement, c'est le prix de payer dans le jeton du projet. */
    function createToken(LaunchParams calldata p) external nonReentrant returns (address t) {
        require(bytes(p.name).length > 0 && bytes(p.symbol).length > 0, "name");
        if (creationFee > 0) {
            require(IERC20(swoge).transferFrom(msg.sender, DEAD, creationFee), "creation fee");
        }
        t = _launchInstant(p);
        allTokens.push(t);
        emit Meta(t, p.telegram, p.twitter, p.website, p.logo);
    }

    /* ---------- le pool, amorce en jeton seul ---------- */
    function _launchInstant(LaunchParams calldata p) internal returns (address t) {
        // CREATE2 : l'adresse depend du sel, donc un lancement bloque se relance.
        bytes32 sel = keccak256(abi.encode(msg.sender, p.salt));
        t = address(new SwogeTokenV4{salt: sel}(p.name, p.symbol, TOTAL_SUPPLY));
        require(IERC20(t).approve(positionManager, TOTAL_SUPPLY), "approve");

        INonfungiblePositionManager.MintParams memory mp;
        mp.fee = POOL_FEE;
        mp.recipient = address(this);          // le NFT de liquidite reste ici pour toujours
        mp.deadline = block.timestamp + 1200;
        uint160 sqrtP;
        if (t < swoge) {
            // le jeton est token0. prix = swoge/jeton, il monte. On initialise a
            // la borne BASSE pour que la position soit entierement en token0.
            mp.token0 = t; mp.token1 = swoge;
            mp.tickLower = _round(I_TICK_START); mp.tickUpper = _round(I_TICK_TOP);
            mp.amount0Desired = TOTAL_SUPPLY;
            sqrtP = TickMath.getSqrtRatioAtTick(mp.tickLower);
        } else {
            // le $SWOGE est token0 : le prix du pool est inverse, la plage est
            // donc niee et retournee, et l'amorce se fait a la borne HAUTE.
            mp.token0 = swoge; mp.token1 = t;
            mp.tickLower = _round(-I_TICK_TOP); mp.tickUpper = _round(-I_TICK_START);
            mp.amount1Desired = TOTAL_SUPPLY;
            sqrtP = TickMath.getSqrtRatioAtTick(mp.tickUpper);
        }

        address pool = INonfungiblePositionManager(positionManager)
            .createAndInitializePoolIfNecessary(mp.token0, mp.token1, POOL_FEE, sqrtP);

        /* ---- LE POOL DOIT ETRE AU PRIX QU'ON A DEMANDE ----
         * `createAndInitializePoolIfNecessary` n'initialise QUE si le pool
         * n'existe pas encore : si un tiers l'a devance, il rend le pool a SON
         * prix, en silence. Le mint qui suit reverterait alors avec un message
         * d'Uniswap incomprehensible. On verifie donc nous-memes, et le message
         * dit quoi faire : relancer avec un autre sel. */
        (uint160 prixReel,,,,,,) = IUniswapV3Pool(pool).slot0();
        require(prixReel == sqrtP, "pool deja amorce a un autre prix: relancez avec un autre salt");

        (uint256 tokenId,,,) = INonfungiblePositionManager(positionManager).mint(mp);
        /* L'arrondi d'Uniswap laisse quelques wei du jeton ici (3 wei au banc sur fork du 29/09).
           Un contrat sans proprietaire ne doit rien garder sans raison : le reste est brule. */
        uint256 reste = IERC20(t).balanceOf(address(this));
        if (reste > 0) require(IERC20(t).transfer(DEAD, reste), "burn");

        instant[t] = Inst({ token: t, creator: msg.sender, pool: pool, lpTokenId: tokenId, exists: true });
        emit Created(t, msg.sender, p.name, p.symbol);
        emit LaunchedInstant(t, msg.sender, pool, tokenId);
    }

    /* ---------- recevoir le NFT de liquidite ----------
       Le gestionnaire de positions deploye ici (0x73991a25...) mint avec
       `_mint` et non `_safeMint` : verifie ligne 156 de sa source verifiee, il
       n'appelle donc PAS ce crochet. On l'implemente quand meme. C'est trois
       lignes, et l'alternative — se tromper — serait un contrat dont AUCUN
       lancement ne passe, pour toujours, sans personne pour le reparer. */
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /* ---------- recolter le frais de trading ----------
       Ouvert a tous : n'importe qui peut le declencher, le partage est fige.
       $SWOGE : moitie au createur, moitie au tresor. Jeton lance : brule. */
    function collectFees(address token) external nonReentrant {
        Inst storage i = instant[token];
        require(i.exists, "not instant");
        (uint256 a0, uint256 a1) = INonfungiblePositionManager(positionManager).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: i.lpTokenId, recipient: address(this),
                amount0Max: type(uint128).max, amount1Max: type(uint128).max
            })
        );
        (uint256 swogeAmt, uint256 tokAmt) = token < swoge ? (a1, a0) : (a0, a1);
        uint256 toCreator; uint256 toTreasury;
        if (swogeAmt > 0) {
            toCreator  = swogeAmt * CREATOR_SHARE_BPS / 10000;
            toTreasury = swogeAmt - toCreator;
            if (toCreator > 0)  require(IERC20(swoge).transfer(i.creator, toCreator), "swoge");
            if (toTreasury > 0) require(IERC20(swoge).transfer(swogeTreasury, toTreasury), "swoge");
        }
        if (tokAmt > 0) require(IERC20(token).transfer(DEAD, tokAmt), "burn");
        emit FeesCollected(token, toCreator, toTreasury, tokAmt);
    }

    function tokenCount() external view returns (uint256) { return allTokens.length; }

    function _round(int24 tick) internal pure returns (int24) {
        int24 spacing = 200; // palier 1 %
        return tick / spacing * spacing;
    }
}
