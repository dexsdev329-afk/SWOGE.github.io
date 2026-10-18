/* ==========================================================================
 * ECHANGER UN JETON SWOGE V5 DEPUIS launchpad.html (18/10/2026)
 *
 * Le defaut : le proprietaire a voulu acheter SWAI, le premier jeton V5, sur
 * sa fiche, et a recu « Failed · execution reverted: unknown ». La boite
 * d'echange ne connaissait que Uniswap v3 (SwapRouter02, palier de 1 %) et la
 * courbe du V2 ; un jeton V5 vit dans un pool Uniswap v4 a hook
 * (fee 0, tickSpacing 200, hook SwogeHookV5). Le routeur v3 ne trouve aucun
 * pool v3 pour lui, d'ou le revert sans donnees.
 *
 * Ce module fait l'echange v4, et seulement lui :
 *   - la cle du pool vient du noyau (poolInfo), jamais d'un calcul de la page ;
 *     elle doit porter le hook de adresses_v5.json et redonner le poolId de
 *     getTokenInfo, sinon rien ne part ;
 *   - le devis vient du V4Quoter (callStatic) : le hook prend son frais dans
 *     le meme appel, le devis le contient deja (mesure sur fork le 18/10/2026 :
 *     0,001 ETH -> 102 864,576344334045270678 SWAI au devis, le meme nombre au
 *     wei pres sur la chaine apres l'achat ; la vente de la moitie rend
 *     0,000490075197722433 ETH au devis et a l'execution) ;
 *   - l'ordre part par l'UniversalRouter : commande V4_SWAP, actions
 *     SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL. Il est SIMULE (eth_call
 *     depuis le compte) avant toute signature, et une erreur est decodee
 *     (erreurs du hook, du routeur, du quoteur, de Permit2) au lieu de
 *     « unknown » ;
 *   - un ERC-20 en entree (la vente, ou l'achat d'un jeton cote en USDG,
 *     $SWOGE ou action) passe par Permit2 : approve(jeton -> Permit2), puis
 *     Permit2.approve(jeton, routeur, montant EXACT, 30 min).
 *
 * La page MONTRE ; le hook, le routeur et Permit2 revérifient tout sur la
 * chaine. Rien ici n'agit sur une autre adresse que le compte connecte.
 * ======================================================================== */
(function (racine) {
  "use strict";
  var ADRESSES_URL = "contrats/v5/adresses_v5.json";
  /* ---- Uniswap v4 sur Robinhood Chain (4663), verifie le 18/10/2026 en lecture seule ----
     Memes adresses que swoge_wallet.html et miroir.js (serveur), relues ici sur la chaine :
       UniversalRouter 24 546 octets, V4Quoter 6 118, StateView 3 531, Permit2 9 152 ;
       poolManager() du routeur, du quoteur et du StateView = 0x8366…0951, le PoolManager
       de V5 (adresses_v5.json). Sur un fork local au bloc 91 911 368 : un achat de 0,001 ETH
       de SWAI par le routeur passe au minimum = devis et echoue a devis + 1 %
       (V4TooLittleReceived), une vente sans autorisation Permit2 echoue (AllowanceExpired(0)). */
  var ROUTEUR = "0x8876789976dEcBfCbBbe364623C63652db8C0904";   // UniversalRouter (2.1.1, d'apres swoge_wallet.html)
  var QUOTEUR = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";   // V4Quoter
  var ETAT = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";      // StateView
  var PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  var ZERO = "0x0000000000000000000000000000000000000000";
  /* Constantes relues dans les sources d'Uniswap (branche main, 18/10/2026) :
     universal-router Commands.sol V4_SWAP = 0x10 ; v4-periphery Actions.sol
     SWAP_EXACT_IN_SINGLE = 0x06, SETTLE_ALL = 0x0c, TAKE_ALL = 0x0f. */
  var V4_SWAP = "0x10", ACTES = "0x060c0f";
  /* IV4Router.ExactInputSingleParams (v4-periphery main) : (PoolKey, zeroForOne, amountIn,
     amountOutMinimum, minHopPriceX36, hookData). La forme 2.0, sans minHopPriceX36, passe
     aussi avec un hookData vide (swoge_wallet.html l'explique) ; on ecrit la forme juste. */
  var CLE_T = "(address,address,uint24,int24,address)";
  var SWAP_T = "(" + CLE_T + ",bool,uint128,uint128,uint256,bytes)";
  /* Une fenetre de journaux d'un million de blocs : la plus grande que le noeud accepte sur
     le PoolManager (mesure de swoge_wallet.html, FENETRE_V4) ; le noyau, peu bavard, s'en
     contente aussi (le noeud refuse plus de 10 000 000 blocs par requete). */
  var FENETRE = 1000000;
  var GLISSEMENT_BPS = 300;           // 3 %, comme le reste de la boite d'echange
  var DELAI_S = 1200;                 // echeance de l'ordre : 20 min apres le dernier bloc
  var PERMIT_S = 1800;                // l'autorisation Permit2 du routeur : 30 min, montant exact

  var ABI_CORE = [
    "function getTokenInfo(address token) view returns ((address creator,address feeRecipient,address pendingRecipient,uint64 recipientReadyAt,uint64 launchedAt,address quote,uint8 shape,bool exists,(uint16 creator,uint16 stakers,uint16 lp,uint16 buyback) split,bytes32 poolId))",
    "function poolInfo(address token) view returns ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool quoteIs0,address feeRecipient,(uint16 creator,uint16 stakers,uint16 lp,uint16 buyback) split)",
    "function currentFees(address token) view returns (uint16 buyBps, uint16 sellBps, uint32 snipeEndsAt)",
    "event Created(address indexed token, address indexed creator, string name, string symbol)",
    "event Meta(address indexed token, string telegram, string twitter, string website, string logo)",
    "event MetadataUpdated(address indexed token, string description, string logo, string website, string twitter, string telegram)",
    "event LaunchedV5(address indexed token, address indexed creator, address indexed quote, bytes32 poolId, uint8 shape, int24 startTick, uint256 initialBuy)"
  ];
  var ABI_HOOK = ["function getPending(bytes32 id) view returns ((uint128 treasury,uint128 creator,uint128 lp))"];
  var ABI_HOLDERS = ["function owed(address,uint256) view returns (uint256)", "function distribute(address token)",
    "function withdraw(address currency) returns (uint256)"];
  var ABI_ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)", "function decimals() view returns (uint8)", "function symbol() view returns (string)",
    "function name() view returns (string)", "function uiMultiplier() view returns (uint256)"];
  var ABI_Q = ["function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns (uint256 amountOut,uint256 gasEstimate)"];
  var ABI_ETAT = ["function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)"];
  var ABI_P2 = ["function allowance(address,address,address) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
    "function approve(address token,address spender,uint160 amount,uint48 expiration)"];
  var ABI_UR = ["function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"];
  var SWAP_PM = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

  /* Les erreurs qu'un echange peut rendre. Hook et noyau : celles de contrats/v5/build/v5_artefacts.json
     (echange_v5.test.js verifie qu'il n'en manque aucune). Routeur, quoteur, Permit2, PoolManager :
     relues dans leurs sources (v4-periphery, universal-router, permit2, v4-core). IsPaused() : la pause
     d'une action Robinhood (contrats/v5/README.md). */
  var ERREURS = [
    "error HookNotImplemented()", "error LiquidityLocked()", "error MaxBuyPerBlock(uint256 bought,uint256 max)",
    "error MaxBuyPerSwap(uint256 bought,uint256 max)", "error NotAllowed()", "error NotCore()", "error NotHolders()", "error NotLower()",
    "error NotOpen()", "error NotPoolManager()", "error UnknownPool()",
    "error Bound(string what)", "error NotRecipient()", "error Unknown()",
    "error V4TooLittleReceived(uint256 minAmountOutReceived,uint256 amountReceived)", "error V4TooMuchRequested(uint256 maxAmountInRequested,uint256 amountRequested)",
    "error DeltaNotPositive(address currency)", "error DeltaNotNegative(address currency)", "error InsufficientBalance()",
    "error ExecutionFailed(uint256 commandIndex,bytes message)", "error TransactionDeadlinePassed()", "error ETHNotAccepted()", "error InvalidEthSender()",
    "error NotEnoughLiquidity(bytes32 poolId)", "error UnexpectedRevertBytes(bytes revertData)", "error QuoteSwap(uint256 amount)",
    "error AllowanceExpired(uint256 deadline)", "error InsufficientAllowance(uint256 amount)",
    "error WrappedError(address target,bytes4 selector,bytes reason,bytes details)", "error CurrencyNotSettled()", "error PoolNotInitialized()",
    "error PriceLimitAlreadyExceeded(uint160 sqrtPriceCurrentX96,uint160 sqrtPriceLimitX96)", "error IsPaused()"
  ];

  function E() { return racine.ethers; }
  function meme(a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); }
  var S = { J: null, pJ: null, lecteur: null, infos: {}, iErr: null };
  function lecteur() { if (!S.lecteur) throw new Error("SwogeV5Echange: no reader"); return typeof S.lecteur === "function" ? S.lecteur() : S.lecteur; }

  /** Le lecteur RPC de la page (lecture seule) ; le portefeuille ne sert qu'a signer. */
  function initialise(o) { S.lecteur = o.lecteur; return adresses(); }
  function adresses() {
    if (S.pJ) return S.pJ;
    S.pJ = fetch(ADRESSES_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (J) {
      var a = function (x) { return /^0x[0-9a-fA-F]{40}$/.test(String(x || "")); };
      if (!J || J.version !== "v5" || Number(J.chainId) !== 4663 || !["core", "hook", "holders", "poolManager"].every(function (k) { return a(J[k]); })) return null;
      S.J = J; return J;
    }).catch(function () { S.pJ = null; return null; });
    return S.pJ;
  }
  function core() { return new (E().Contract)(S.J.core, ABI_CORE, lecteur()); }

  /* ============================ le jeton ============================ */
  /** null si le jeton n'est pas un jeton V5 ; sinon tout ce que l'echange doit savoir, relu sur la chaine. */
  async function info(token) {
    var J = await adresses(); if (!J) return null;
    var k = String(token).toLowerCase();
    if (S.infos[k]) return S.infos[k];
    var Et = E(), c = core(), ti = await c.getTokenInfo(token);
    if (!ti.exists) return null;
    var pi = await c.poolInfo(token), key = pi.key;
    var cle = [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks];
    var id = Et.utils.keccak256(Et.utils.defaultAbiCoder.encode(["address", "address", "uint24", "int24", "address"], cle));
    /* la cle n'est jamais reconstruite par la page : elle doit porter NOTRE hook et redonner le poolId du noyau */
    if (!meme(key.hooks, J.hook)) throw new Error("this V5 pool does not use the hook of contrats/v5/adresses_v5.json");
    if (id.toLowerCase() !== String(ti.poolId).toLowerCase()) throw new Error("poolInfo and getTokenInfo disagree on the pool id");
    var quote = pi.quoteIs0 ? key.currency0 : key.currency1, natif = meme(quote, ZERO);
    var I = { token: Et.utils.getAddress(token), cle: cle, poolId: id, quoteIs0: pi.quoteIs0, quote: quote, natif: natif,
      dec: 18, sym: "ETH", mult: null, creator: ti.creator, feeRecipient: ti.feeRecipient, launchedAt: Number(ti.launchedAt),
      split: { creator: ti.split.creator, stakers: ti.split.stakers, lp: ti.split.lp, buyback: ti.split.buyback } };
    if (!natif) {
      var q = new Et.Contract(quote, ABI_ERC20, lecteur());
      var r = await Promise.all([q.decimals(), q.symbol().catch(function () { return "?"; }), q.uiMultiplier().catch(function () { return null; })]);
      I.dec = Number(r[0]); I.sym = r[1]; if (r[2]) I.mult = +Et.utils.formatEther(r[2]);
    }
    S.infos[k] = I;
    return I;
  }
  async function frais(I) {
    var f = await core().currentFees(I.token);
    return { buyBps: Number(f.buyBps), sellBps: Number(f.sellBps), snipeEndsAt: Number(f.snipeEndsAt) };
  }
  /** Le prix du pool, en unites ENTIERES de cotation par jeton entier (StateView.getSlot0). */
  function prixDe(I, sqrtPriceX96) {
    var sp = +sqrtPriceX96.toString() / Math.pow(2, 96), brut = I.quoteIs0 ? 1 / (sp * sp) : sp * sp;
    return brut * Math.pow(10, 18 - I.dec);
  }
  async function prix(I) {
    var s0 = await new (E().Contract)(ETAT, ABI_ETAT, lecteur()).getSlot0(I.poolId);
    return prixDe(I, s0.sqrtPriceX96);
  }

  /* ============================ devis et ordre ============================ */
  function zeroVersUn(I, achat) { return achat ? I.quoteIs0 : !I.quoteIs0; }
  function entreeDe(I, achat) { return achat ? I.quote : I.token; }
  function sortieDe(I, achat) { return achat ? I.token : I.quote; }
  function cleObj(I) { return { currency0: I.cle[0], currency1: I.cle[1], fee: I.cle[2], tickSpacing: I.cle[3], hooks: I.cle[4] }; }
  /** Le devis du V4Quoter : la sortie exacte pour `montant` (unites brutes) en entree, frais du hook compris. */
  async function devis(I, achat, montant) {
    var q = new (E().Contract)(QUOTEUR, ABI_Q, lecteur());
    try {
      var r = await q.callStatic.quoteExactInputSingle({ poolKey: cleObj(I), zeroForOne: zeroVersUn(I, achat), exactAmount: montant, hookData: "0x" });
      return r.amountOut;
    } catch (e) { throw enErreur(e, I, achat); }
  }
  /** Le corps V4_SWAP : SWAP_EXACT_IN_SINGLE, SETTLE_ALL(entree, montant), TAKE_ALL(sortie, minimum). */
  function corps(I, achat, montant, mini) {
    var A = E().utils.defaultAbiCoder;
    return A.encode(["bytes", "bytes[]"], [ACTES, [
      A.encode([SWAP_T], [[I.cle, zeroVersUn(I, achat), montant, mini, 0, "0x"]]),
      A.encode(["address", "uint256"], [entreeDe(I, achat), montant]),
      A.encode(["address", "uint256"], [sortieDe(I, achat), mini])
    ]]);
  }
  function ordre(I, achat, montant, mini, echeance) {
    var i = new (E().utils.Interface)(ABI_UR);
    return { to: ROUTEUR, data: i.encodeFunctionData("execute", [V4_SWAP, [corps(I, achat, montant, mini)], echeance]),
      value: achat && I.natif ? E().BigNumber.from(montant) : E().BigNumber.from(0) };
  }

  /* ============================ les erreurs, lisibles ============================ */
  function iErr() { return S.iErr || (S.iErr = new (E().utils.Interface)(ERREURS)); }
  /** Les octets de revert, ou qu'ethers / le portefeuille les ait ranges. */
  function octetsRevert(e) {
    var vus = [], trouve = null;
    (function fouille(x, d) {
      if (trouve || x == null || d > 6) return;
      if (typeof x === "string") {
        if (/^0x[0-9a-fA-F]{8,}$/.test(x) && (x.length - 2) % 2 === 0) { trouve = x; return; }
        var m = /data="(0x[0-9a-fA-F]{8,})"/.exec(x) || /"data":"(0x[0-9a-fA-F]{8,})"/.exec(x);
        if (m) { trouve = m[1]; return; }
        if (/^\s*\{/.test(x)) { try { fouille(JSON.parse(x), d + 1); } catch (z) {} }
        return;
      }
      if (typeof x !== "object" || vus.indexOf(x) >= 0) return;
      vus.push(x);
      ["data", "error", "body"].forEach(function (k) { if (!trouve) fouille(x[k], d + 1); });
      if (!trouve && typeof x.message === "string") fouille(x.message, d + 1);
    })(e, 0);
    return trouve;
  }
  function fq(x, dec) { var v = +E().utils.formatUnits(x, dec == null ? 18 : dec); return v >= 1000 ? Math.round(v).toLocaleString("en-US") : String(+v.toPrecision(6)); }
  /** Decode des octets de revert en une phrase pour le joueur (anglais). ctx : { decOut, symOut }. */
  function decode(data, ctx, prof) {
    var Et = E(); ctx = ctx || {}; prof = prof || 0;
    if (!data || data === "0x") return null;
    var sel = data.slice(0, 10).toLowerCase();
    if (sel === "0x08c379a0") { try { return Et.utils.defaultAbiCoder.decode(["string"], "0x" + data.slice(10))[0]; } catch (e) {} }
    if (sel === "0x4e487b71") { try { return "panic " + Et.utils.defaultAbiCoder.decode(["uint256"], "0x" + data.slice(10))[0].toString(); } catch (e) {} }
    var p; try { p = iErr().parseError(data); } catch (e) { return "error " + sel; }
    var a = p.args, n = p.name;
    if (prof < 4 && (n === "ExecutionFailed" || n === "UnexpectedRevertBytes")) return decode(a[n === "ExecutionFailed" ? 1 : 0], ctx, prof + 1) || n;
    if (prof < 4 && n === "WrappedError") {
      var dedans = decode(a.reason, ctx, prof + 1);
      return dedans || ("contract " + a.target + " reverted (" + a.selector + ")");
    }
    if (n === "MaxBuyPerSwap") return "Over the launch limit per trade: this buy would get " + fq(a.bought) + " tokens, the limit is " + fq(a.max) + " for now. Buy less, or wait for the limit window to end.";
    if (n === "MaxBuyPerBlock") return "Over the launch limit per second: " + fq(a.bought) + " tokens bought this second, the limit is " + fq(a.max) + ". Wait a moment or buy less.";
    if (n === "NotOpen") return "The pool is not open for trading yet.";
    if (n === "UnknownPool") return "This pool is not registered with the SWOGE V5 hook.";
    if (n === "V4TooLittleReceived") return "The price moved: you would receive " + fq(a.amountReceived, ctx.decOut) + (ctx.symOut ? " " + ctx.symOut : "") + ", below your minimum of " + fq(a.minAmountOutReceived, ctx.decOut) + ". Try again.";
    if (n === "NotEnoughLiquidity") return "Not enough liquidity in the pool for this amount: try a smaller amount.";
    if (n === "AllowanceExpired" || n === "InsufficientAllowance") return "The Permit2 allowance for the Uniswap router is missing or expired: approve again.";
    if (n === "TransactionDeadlinePassed") return "The order deadline passed: try again.";
    if (n === "IsPaused") return "The quote token is paused by its issuer: nobody can trade this pool right now.";
    if (n === "Bound") return String(a[0]);
    return n + (a.length ? "(" + a.map(String).join(", ") + ")" : "");
  }
  /** Une erreur ethers -> une phrase. Un refus dans le portefeuille se dit comme tel. */
  function raison(e, ctx) {
    if (!e) return "unknown error";
    if (e.v5) return e.message;
    var m = String((e && (e.reason || e.message)) || e);
    if (e.code === 4001 || e.code === "ACTION_REJECTED" || /user rejected|user denied|rejected the request/i.test(m)) return "Cancelled in the wallet: nothing was sent.";
    var d = octetsRevert(e), t = d ? decode(d, ctx) : null;
    if (t) return t;
    if (e.reason && !/^(execution reverted|unknown)$/i.test(e.reason)) return String(e.reason);
    return m.slice(0, 180);
  }
  /* eth_call depuis le compte. ATTENTION : ethers 5 (JsonRpcProvider.call) REND les octets d'un revert
     au lieu de lever quand le noeud les donne (anvil, code 3) — mesure sur fork le 18/10/2026 : minimum
     = devis + 1 %, `call` rendait 0x8b063d73… (V4TooLittleReceived) sans erreur. `vide` : l'appel ne
     rend rien quand il reussit (execute, distribute) ; tout octet rendu est alors un revert. */
  async function simule(appel, I, achat, vide) {
    var r;
    try { r = await lecteur().call(appel); } catch (e) { throw enErreur(e, I, achat); }
    if (r && r !== "0x" && (vide || (r.length - 2) % 64 !== 0)) throw enErreur({ data: r }, I, achat);
    return r;
  }
  function enErreur(e, I, achat) {
    var ctx = I ? { decOut: achat ? 18 : I.dec, symOut: achat ? "" : I.sym } : {};
    var x = new Error(raison(e, ctx)); x.v5 = true; x.cause = e; return x;
  }

  /* ============================ l'echange ============================ */
  /** o : { signer, compte, token, achat, montant (BigNumber brut), glissementBps, etape(texte) }.
      Rend { hash, devis, mini, recu }. Chaque signature est precedee d'une simulation. */
  async function echange(o) {
    var Et = E(), P = lecteur(), etape = o.etape || function () {};
    var I = await info(o.token); if (!I) throw new Error("not a SWOGE V5 token");
    var compte = Et.utils.getAddress(o.compte), achat = !!o.achat, montant = Et.BigNumber.from(o.montant);
    if (montant.lte(0)) throw new Error("enter an amount");
    if (o.signer.getChainId && (await o.signer.getChainId()) !== 4663) throw new Error("switch your wallet to Robinhood Chain (4663) first");
    var entree = entreeDe(I, achat), entreeNative = achat && I.natif, sortieNative = !achat && I.natif;
    var decIn = achat ? I.dec : 18, symIn = achat ? I.sym : "tokens";
    // 1. le solde
    var solde = entreeNative ? await P.getBalance(compte) : await new Et.Contract(entree, ABI_ERC20, P).balanceOf(compte);
    if (solde.lt(montant)) throw Object.assign(new Error("Not enough " + symIn + ": you have " + fq(solde, decIn) + "."), { v5: true });
    // 2. le devis (simule le pool ET le hook, sans rien signer)
    etape("Quoting on Uniswap v4…");
    var q = await devis(I, achat, montant);
    if (q.isZero()) throw Object.assign(new Error("The pool would give 0 for this amount."), { v5: true });
    var gl = o.glissementBps == null ? GLISSEMENT_BPS : o.glissementBps, mini = q.mul(10000 - gl).div(10000);
    var bloc = await P.getBlock("latest"), maintenant = bloc.timestamp, echeance = maintenant + DELAI_S;
    // 3. Permit2, pour un ERC-20 en entree
    if (!entreeNative) {
      var t = new Et.Contract(entree, ABI_ERC20, o.signer);
      if ((await new Et.Contract(entree, ABI_ERC20, P).allowance(compte, PERMIT2)).lt(montant)) {
        etape("Step 1/3 — allow Permit2 to move your " + symIn + " (one time, Uniswap's standard approval contract)…");
        await attend(await t.approve(PERMIT2, Et.constants.MaxUint256), "approval");
      }
      var p2 = new Et.Contract(PERMIT2, ABI_P2, P), al = await p2.allowance(compte, entree, ROUTEUR);
      if (Et.BigNumber.from(al.amount).lt(montant) || Number(al.expiration) < maintenant + 60) {
        etape("Step 2/3 — allow the Uniswap router to spend exactly " + fq(montant, decIn) + " " + symIn + " for 30 minutes (Permit2)…");
        await attend(await new Et.Contract(PERMIT2, ABI_P2, o.signer).approve(entree, ROUTEUR, montant, maintenant + PERMIT_S), "Permit2 approval");
      }
    }
    // 4. la simulation de l'ordre exact, depuis le compte
    var tx = ordre(I, achat, montant, mini, echeance), appel = { from: compte, to: tx.to, data: tx.data, value: tx.value };
    etape("Simulating the swap…");
    var gaz = null;
    for (var essai = 0; ; essai++) {
      try { await simule(appel, I, achat, true); gaz = await P.estimateGas(appel); break; }
      catch (e) {
        var x = enErreur(e, I, achat);
        /* le noeud de lecture peut avoir un bloc de retard sur l'autorisation qui vient d'etre minee */
        if (essai < 3 && /Permit2 allowance/.test(x.message) && !entreeNative) { await new Promise(function (ok) { setTimeout(ok, 1500); }); continue; }
        throw x;
      }
    }
    // 5. la signature
    var avant = sortieNative ? await P.getBalance(compte) : await new Et.Contract(sortieDe(I, achat), ABI_ERC20, P).balanceOf(compte);
    etape((entreeNative ? "Step 1/1" : "Step 3/3") + " — confirm the swap in your wallet…");
    var envoi = await o.signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value, gasLimit: gaz.mul(130).div(100) });
    etape("Swapping… " + envoi.hash);
    var rc = await attend(envoi, "swap");
    var apres = sortieNative ? await P.getBalance(compte, rc.blockNumber) : await new Et.Contract(sortieDe(I, achat), ABI_ERC20, P).balanceOf(compte, { blockTag: rc.blockNumber });
    var recu = apres.sub(avant);
    if (sortieNative && rc.gasUsed && rc.effectiveGasPrice) recu = recu.add(rc.gasUsed.mul(rc.effectiveGasPrice));
    return { hash: envoi.hash, devis: q, mini: mini, recu: recu, I: I };
  }
  async function attend(tx, quoi) {
    var rc = await tx.wait();
    if (!rc || rc.status !== 1) throw Object.assign(new Error("The " + quoi + " transaction failed on-chain."), { v5: true });
    return rc;
  }

  /* ============================ frais du createur ============================ */
  /** Ce qui attend le destinataire des frais : `pret` (Holders.owed, retirable maintenant) et
      `attente` (seau createur du hook × part createur, credite par Holders.distribute). */
  async function fraisCreateur(I) {
    var Et = E(), J = await adresses(), P = lecteur();
    var r = await Promise.all([
      new Et.Contract(J.hook, ABI_HOOK, P).getPending(I.poolId),
      new Et.Contract(J.holders, ABI_HOLDERS, P).owed(I.feeRecipient, Et.BigNumber.from(I.quote))
    ]);
    var seau = Et.BigNumber.from(r[0].creator);
    return { pret: r[1], attente: seau.mul(I.split.creator).div(10000), seau: seau, dest: I.feeRecipient };
  }
  /** distribute(token) puis withdraw(cotation) : simules, puis signes. Le retrait vaut pour le compte connecte. */
  async function geste(o, quoi) {
    var Et = E(), J = await adresses(), I = await info(o.token), P = lecteur();
    var h = new Et.Contract(J.holders, ABI_HOLDERS, o.signer), i = h.interface;
    var data = quoi === "distribute" ? i.encodeFunctionData("distribute", [I.token]) : i.encodeFunctionData("withdraw", [I.quote]);
    await simule({ from: o.compte, to: J.holders, data: data }, I, false, quoi === "distribute");
    var tx = await o.signer.sendTransaction({ to: J.holders, data: data });
    return attend(tx, quoi);
  }

  /* ============================ journaux ============================ */
  async function parFenetres(lire, depuis) {
    var fin = await lecteur().getBlockNumber(), plages = [];
    for (var de = depuis; de <= fin; de += FENETRE) plages.push([de, Math.min(fin, de + FENETRE - 1)]);
    var parts = await Promise.all(plages.map(function (p) {
      return lire(p[0], p[1]).catch(function () { return new Promise(function (ok) { setTimeout(ok, 800); }).then(function () { return lire(p[0], p[1]); }); });
    }));
    return [].concat.apply([], parts);
  }
  /** Les echanges du pool : evenements Swap du PoolManager filtres sur le poolId. */
  async function swaps(I, depuis) {
    var Et = E(), J = await adresses(), i = new Et.utils.Interface([SWAP_PM]), sujet = i.getEventTopic("Swap");
    var logs = await parFenetres(function (a, b) { return lecteur().getLogs({ address: J.poolManager, topics: [sujet, I.poolId], fromBlock: a, toBlock: b }); },
      depuis || (J.blocks && J.blocks.core) || 0);
    return logs.map(function (l) {
      var p = i.parseLog(l), q = I.quoteIs0 ? p.args.amount0 : p.args.amount1, t = I.quoteIs0 ? p.args.amount1 : p.args.amount0;
      /* deltas du point de vue de l'echangeur : un achat recoit des jetons (t > 0) et paie la cotation */
      return { bn: l.blockNumber, li: l.logIndex, tx: l.transactionHash, sender: p.args.sender, achat: t.gt(0),
        quote: Math.abs(+Et.utils.formatUnits(q, I.dec)), tokens: Math.abs(+Et.utils.formatEther(t)), prix: prixDe(I, p.args.sqrtPriceX96) };
    });
  }
  /** Le portefeuille V5 d'un compte : jetons crees (LaunchedV5, createur indexe) et jetons detenus
      (balanceOf sur la liste de tous les LaunchedV5), avec prix, valeur, logo et frais du createur. */
  async function portefeuille(compte, o) {
    o = o || {};
    var Et = E(), J = await adresses(); if (!J) return null;
    var P = lecteur(), c = core(), de = (J.blocks && J.blocks.core) || 0;
    var lus = await Promise.all([
      parFenetres(function (a, b) { return c.queryFilter(c.filters.LaunchedV5(), a, b); }, de),
      parFenetres(function (a, b) { return c.queryFilter(c.filters.LaunchedV5(null, compte), a, b); }, de),
      parFenetres(function (a, b) { return c.queryFilter(c.filters.Created(), a, b); }, de),
      parFenetres(function (a, b) { return c.queryFilter(c.filters.Meta(), a, b); }, de).catch(function () { return []; }),
      parFenetres(function (a, b) { return c.queryFilter(c.filters.MetadataUpdated(), a, b); }, de).catch(function () { return []; })
    ]);
    var noms = {}, logos = {};
    lus[2].forEach(function (e) { noms[e.args.token.toLowerCase()] = { name: e.args.name, sym: e.args.symbol }; });
    lus[3].concat(lus[4]).sort(function (a, b) { return a.blockNumber - b.blockNumber || a.logIndex - b.logIndex; })
      .forEach(function (e) { logos[e.args.token.toLowerCase()] = { logo: e.args.logo, web: e.args.website, tw: e.args.twitter, tg: e.args.telegram }; });
    var miens = {}; lus[1].forEach(function (e) { miens[e.args.token.toLowerCase()] = 1; });
    var tous = [], vus = {};
    lus[0].forEach(function (e) { var k = e.args.token.toLowerCase(); if (vus[k]) return; vus[k] = 1; tous.push(e.args.token); });
    var lignes = await Promise.all(tous.map(async function (tok) {
      var k = tok.toLowerCase(), L = { addr: tok, v5: true, name: (noms[k] || {}).name, sym: (noms[k] || {}).sym, meta: logos[k] || null, cree: !!miens[k] };
      try {
        L.I = await info(tok); L.qsym = L.I.sym;
        var r = await Promise.all([new Et.Contract(tok, ABI_ERC20, P).balanceOf(compte), prix(L.I).catch(function () { return null; })]);
        L.balWei = r[0]; L.bal = +Et.utils.formatEther(r[0]); L.prixQ = r[1];
        L.valQ = L.prixQ != null ? L.bal * L.prixQ : null;
        var taux = o.usd ? await o.usd(L.I) : null;
        L.usd = (L.valQ != null && taux != null) ? L.valQ * taux : null;
        L.prixUsd = (L.prixQ != null && taux != null) ? L.prixQ * taux : null;
        if (L.cree) {
          try { var f = await fraisCreateur(L.I); L.fraisPret = +Et.utils.formatUnits(f.pret, L.I.dec); L.fraisAttente = +Et.utils.formatUnits(f.attente, L.I.dec);
            L.dest = f.dest; L.tauxUsd = taux; } catch (e) {}
        }
      } catch (e) { L.err = String(e.message || e).slice(0, 120); }
      return L;
    }));
    return { detenus: lignes.filter(function (L) { return L.bal > 0; }), crees: lignes.filter(function (L) { return L.cree; }), n: tous.length };
  }

  racine.SwogeV5Echange = {
    initialise: initialise, adresses: adresses, info: info, frais: frais, prix: prix, prixDe: prixDe, devis: devis,
    ordre: ordre, corps: corps, echange: echange, simule: simule, raison: raison, decode: decode, fraisCreateur: fraisCreateur,
    distribue: function (o) { return geste(o, "distribute"); }, retire: function (o) { return geste(o, "withdraw"); },
    swaps: swaps, portefeuille: portefeuille, ERREURS: ERREURS,
    ADR: { ROUTEUR: ROUTEUR, QUOTEUR: QUOTEUR, ETAT: ETAT, PERMIT2: PERMIT2 }, ACTES: ACTES, V4_SWAP: V4_SWAP, _etat: S
  };
})(typeof window !== "undefined" ? window : this);
