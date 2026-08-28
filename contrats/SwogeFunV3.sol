// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/* ============================================================
   $SWOGE FUN V3 — launchpad instantane, paire SWOGE, sans proprietaire

   CE QUI CHANGE PAR RAPPORT AU V2, ET POURQUOI

   1. UN SEUL MODE. Le V2 en portait deux ; l'interface n'a jamais appele que
      l'instantane. Le mode courbe — sa courbe, sa graduation, ses achats et
      ventes, son jeton dedie — represente pres de la moitie du contrat et n'a
      jamais tourne. Dans un contrat que PERSONNE ne pourra jamais reparer,
      chaque ligne qu'on ne deploie pas est une ligne qui ne peut pas casser
      pour toujours.

   2. LA PAIRE EST $SWOGE, PAS DU WETH. Il faut donc du $SWOGE pour acheter
      n'importe quel jeton lance ici : chaque lancement cree de la demande
      reelle. Le pool est amorce EN JETON SEUL — ni le lanceur ni le contrat
      n'apportent de $SWOGE.

   3. LES FRAIS REVIENNENT DEJA EN $SWOGE. Consequence directe du point 2 :
      `collect` rend du $SWOGE, il n'y a aucun echange a faire, aucun routeur
      a appeler. Le V2 devait deballer du WETH en ETH natif ; cette ligne
      disparait.

   4. 70 % AUX DETENTEURS, 30 % AU TRESOR. Le V2 donnait 70 % au createur.
      Ici le createur ne touche rien directement — il touche sa part comme
      detenteur, proportionnelle a ce qu'il GARDE. La regle recompense donc
      celui qui garde, pas celui qui prend, et elle est la meme pour tous.

   5. AUCUN PROPRIETAIRE. Pas de `owner`, pas de `onlyOwner`, aucun setter.
      Le tresor et le frais de lancement sont des `immutable` poses au
      deploiement. Il n'y a rien a renoncer : c'est plus fort qu'un renounce,
      parce que ca se lit dans la source au lieu de dependre d'une
      transaction qu'il faut aller chercher.

   6. `onMove` NE PEUT PLUS TUER UN JETON. Le V2 l'appelait nu depuis le
      jeton : le moindre revert dans la comptabilite faisait echouer le
      TRANSFERT, et le jeton etait mort pour toujours. Un chemin existait —
      `mps * value` finit par deborder. Ici l'appel est en `try/catch` : si la
      comptabilite casse, on perd les recompenses, pas le jeton.

   7. LA PLAGE DE PRIX EST RECALCULEE. Le V2 partait de 1e-9 WETH par jeton.
      Le WETH vaut ~3 000 $, le $SWOGE ~0,0004 $ : garder les memes ticks
      aurait lance chaque jeton a une capitalisation de 0,0004 $. La plage est
      donc refaite pour la nouvelle unite, en gardant la meme amplitude.

   CE QUI NE CHANGE PAS : le NFT de liquidite reste dans ce contrat pour
   toujours, et l'interface Uniswap declaree plus bas ne contient ni
   `decreaseLiquidity`, ni `safeTransferFrom`, ni `burn`. Le contrat ne peut
   pas retirer la liquidite — pas « il n'a pas le droit » : il ne connait pas
   la fonction qui le ferait.

   NON DEPLOYE, NON AUDITE. Compile, pas eprouve sur une chaine.
   ============================================================ */

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
interface ISwogeFun { function onMove(address from, address to, uint256 value) external; }
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

/* ---------- le jeton lance : offre figee, aucun proprietaire ----------
   Ni `owner`, ni `mint`, ni `pause`, ni liste noire. Il n'y a rien a
   renoncer parce qu'il n'y a jamais eu personne. C'est ce que verifie un
   scanner quand quelqu'un examine un jeton, et c'est vert par construction. */
contract SwogeToken {
    string public name; string public symbol;
    uint8  public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable fun;          // le launchpad
    address public pool;                   // pose une seule fois, au lancement
    uint256 public immutable launchBlock;
    uint256 public constant SNIPE_BLOCKS  = 2;    // fenetre protegee
    uint16  public constant SNIPE_MAX_BPS = 500;  // 5 % de l'offre par portefeuille
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name; symbol = _symbol; totalSupply = _supply;
        fun = msg.sender; launchBlock = block.number;
        balanceOf[msg.sender] = _supply; emit Transfer(address(0), msg.sender, _supply);
    }
    function setPool(address p) external {
        require(msg.sender == fun && pool == address(0), "pool set");
        pool = p;
    }
    function transfer(address to, uint256 v) external returns (bool) { _t(msg.sender, to, v); return true; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s]=v; emit Approval(msg.sender,s,v); return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender]; require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _t(f, to, v); return true;
    }
    function _t(address f, address to, uint256 v) internal {
        require(to != address(0), "zero");
        uint256 b = balanceOf[f]; require(b >= v, "balance");
        unchecked { balanceOf[f]=b-v; balanceOf[to]+=v; }
        // anti-snipe : plafonne les portefeuilles non exemptes pendant la fenetre
        if (block.number < launchBlock + SNIPE_BLOCKS && to != pool && to != fun) {
            require(balanceOf[to] <= totalSupply * SNIPE_MAX_BPS / 10000, "anti-snipe: max 5% at launch");
        }
        emit Transfer(f, to, v);
        /* ---- ET LA COMPTABILITE NE PEUT PAS TUER LE TRANSFERT ----
           Le V2 appelait `onMove` nu, ligne 77 : un revert dans la
           comptabilite faisait echouer le transfert, et le jeton devenait
           inutilisable POUR TOUJOURS — sans proprietaire, rien ne pouvait le
           rattraper. Le chemin existait : `magPerShare * value` finit par
           deborder. Ici l'echec est absorbe. On perd la mise a jour d'une
           recompense ; on ne perd pas le jeton. */
        try ISwogeFun(fun).onMove(f, to, v) {} catch {}
    }
}

/* ---------- Uniswap v3 TickMath.getSqrtRatioAtTick (audited, verbatim) ---------- */
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

contract SwogeFunV3 {
    /* ---------- le partage, fige ----------
       Aucun setter, aucun proprietaire : ces deux nombres sont ce qu'ils
       seront toujours. Un pourcentage survit a n'importe quel prix du jeton,
       c'est pour ca que l'economie repose sur lui et non sur un montant. */
    uint16 public constant HOLDER_SHARE_BPS   = 7000;   // 70 % du frais de pool -> detenteurs
    uint16 public constant TREASURY_SHARE_BPS = 3000;   // 30 % -> tresor $SWOGE

    /* ---------- le frais de lancement ----------
       BRULE, pas encaisse : meme effet anti-spam, et personne ne peut dire que
       l'equipe se paie a chaque lancement.

       C'est le SEUL nombre du contrat qui peut mal vieillir : il est fige en
       jetons, pas en valeur. A 0,0004 $ le $SWOGE, mille jetons valent 0,40 $ ;
       a x10 quatre dollars ; a x100 quarante. On vise volontairement bas :
       « trop cher » tue le launchpad et rien ne pourra le reparer, « trop peu
       cher » ne fait qu'une liste en desordre, qui se filtre dans l'interface —
       la ou l'on garde la main. On ne met pas le risque irreparable du cote
       qu'on ne peut pas corriger. */
    uint256 public immutable creationFee;

    address public immutable positionManager;
    address public immutable swoge;             // le jeton de paire ET de recompense
    address public immutable swogeTreasury;

    uint24  public constant POOL_FEE = 10000;   // palier 1 %
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /* ---------- la plage de prix, en $SWOGE par jeton ----------
       RECALCULEE. Le V2 partait de 1e-9 WETH par jeton, soit une
       capitalisation de depart d'environ une ETH. Le WETH et le $SWOGE ne sont
       pas du tout a la meme echelle : reprendre ses ticks aurait lance chaque
       jeton a 1 $SWOGE de capitalisation totale.

       Depart : tick -46000, soit 0,010054 $SWOGE par jeton — dix millions de
       $SWOGE de capitalisation pour une offre d'un milliard. Haut : +115200,
       la meme amplitude que le V2 (un facteur dix millions), pour que la
       position ne soit jamais a court de marge. Les deux sont multiples de
       200, l'ecart de ticks du palier 1 %. */
    int24 public constant I_TICK_START = -46000;
    int24 public constant I_TICK_TOP   = 115200;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    struct Inst { address token; address creator; address pool; uint256 lpTokenId; bool exists; }
    mapping(address => Inst) public instant;
    address[] public allTokens;

    /* ---------- la reflexion ----------
       Comptabilite magnifiee : on ne parcourt jamais les detenteurs, on tient
       un cumul par part et une correction par personne a chaque mouvement. */
    uint256 internal constant MAG = 2**128;
    mapping(address => uint256) public magPerShare;
    mapping(address => mapping(address => int256)) internal magCorrection;
    mapping(address => mapping(address => uint256)) public withdrawn;

    event Created(address indexed token, address indexed creator, string name, string symbol);
    event Meta(address indexed token, string telegram, string twitter, string website, string logo);
    event LaunchedInstant(address indexed token, address indexed creator, address pool, uint256 lpTokenId);
    event FeesCollected(address indexed token, uint256 swogeToHolders, uint256 swogeToTreasury, uint256 tokenBurned);
    event HolderRewards(address indexed token, uint256 amount);
    event Claimed(address indexed token, address indexed holder, uint256 amount);

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
        t = address(new SwogeToken(p.name, p.symbol, TOTAL_SUPPLY));
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
        SwogeToken(t).setPool(pool);   // exempter le pool de l'anti-snipe AVANT le mint
        (uint256 tokenId,,,) = INonfungiblePositionManager(positionManager).mint(mp);

        instant[t] = Inst({ token: t, creator: msg.sender, pool: pool, lpTokenId: tokenId, exists: true });
        emit Created(t, msg.sender, p.name, p.symbol);
        emit LaunchedInstant(t, msg.sender, pool, tokenId);
    }

    /* ---------- recolter le frais de trading ----------
       Ouvert a tous : n'importe qui peut le declencher, le partage est fige.
       Le $SWOGE recolte part a 70 % aux detenteurs et 30 % au tresor. La part
       revenue dans le jeton lance, elle, est BRULEE : ca evite une seconde
       comptabilite dans un contrat qu'on ne pourra jamais corriger, et ca
       profite aux memes personnes, par la rarete. */
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

        uint256 toHolders; uint256 toTreasury;
        if (swogeAmt > 0) {
            toHolders  = swogeAmt * HOLDER_SHARE_BPS / 10000;
            toTreasury = swogeAmt - toHolders;
            if (toHolders  > 0) _distributeToHolders(token, toHolders);
            if (toTreasury > 0) require(IERC20(swoge).transfer(swogeTreasury, toTreasury), "swoge");
        }
        if (tokAmt > 0) IERC20(token).transfer(DEAD, tokAmt);
        emit FeesCollected(token, toHolders, toTreasury, tokAmt);
    }

    /* ---------- la base de repartition ----------
       Les jetons VRAIMENT dans les mains des gens : l'offre, moins ce que
       detient le pool, moins ce que detient ce contrat. Sans cette
       soustraction le pool — qui detient l'essentiel au depart — absorberait
       les recompenses de tout le monde.

       Le V2 utilisait `tokensSold`, un nombre propre a la courbe. Il n'existe
       pas ici : toute l'offre part dans le pool au lancement. */
    function shares(address token) public view returns (uint256) {
        Inst storage i = instant[token];
        if (!i.exists) return 0;
        uint256 total = IERC20(token).totalSupply();
        uint256 hors  = IERC20(token).balanceOf(i.pool) + IERC20(token).balanceOf(address(this));
        return total > hors ? total - hors : 0;
    }

    function _distributeToHolders(address token, uint256 amount) internal {
        uint256 s = shares(token);
        // Personne dehors : la part revient au tresor plutot que de rester
        // bloquee sans ayant droit.
        if (s == 0) { require(IERC20(swoge).transfer(swogeTreasury, amount), "swoge"); return; }
        magPerShare[token] += amount * MAG / s;
        emit HolderRewards(token, amount);
    }

    /* ---------- le crochet de transfert ----------
       Appele par le jeton a chaque mouvement, en `try/catch` de son cote : un
       revert ici ne peut pas faire echouer un transfert. Le pool et ce contrat
       sont exclus, exactement comme dans `shares` — sinon la somme des droits
       depasserait ce qui a ete distribue. */
    function onMove(address from, address to, uint256 value) external {
        Inst storage i = instant[msg.sender];
        if (!i.exists) return;
        uint256 mps = magPerShare[msg.sender];
        if (mps == 0) return;
        int256 delta = int256(mps * value);
        if (!_exclu(msg.sender, from)) magCorrection[msg.sender][from] += delta;
        if (!_exclu(msg.sender, to))   magCorrection[msg.sender][to]   -= delta;
    }

    function _exclu(address token, address who) internal view returns (bool) {
        return who == address(0) || who == address(this)
            || who == instant[token].pool || who == DEAD;
    }

    function pendingRewards(address token, address holder) public view returns (uint256) {
        if (_exclu(token, holder)) return 0;
        int256 acc = int256(magPerShare[token] * IERC20(token).balanceOf(holder)) + magCorrection[token][holder];
        uint256 total = acc < 0 ? 0 : uint256(acc) / MAG;
        uint256 w = withdrawn[token][holder];
        return total > w ? total - w : 0;
    }

    /* ---------- reclamer, en $SWOGE ---------- */
    function claimRewards(address token) external nonReentrant {
        uint256 amt = pendingRewards(token, msg.sender);
        require(amt > 0, "nothing");
        withdrawn[token][msg.sender] += amt;
        require(IERC20(swoge).transfer(msg.sender, amt), "swoge");
        emit Claimed(token, msg.sender, amt);
    }

    function tokenCount() external view returns (uint256) { return allTokens.length; }

    function _round(int24 tick) internal pure returns (int24) {
        int24 spacing = 200; // palier 1 %
        return tick / spacing * spacing;
    }
}
