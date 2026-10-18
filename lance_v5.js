/* ==========================================================================
 * LANCER UN JETON SUR SWOGE V5 DEPUIS launchpad.html (18/10/2026)
 *
 * INERTE tant que contrats/v5/adresses_v5.json n'existe pas : la section dit
 * « V5 coming soon » et ne lit rien d'autre. Le flux V4 de la page n'est pas
 * touche. Le fichier est ecrit par le proprietaire a la fin de v5_deploy.html,
 * puis commite ; la page ne le croit pas sur parole : elle relit le noyau sur
 * la chaine (getConfig) et refuse si le hook, Holders ou Alloc ne sont pas
 * ceux du fichier.
 *
 * Le formulaire porte chaque parametre de lancement du README (tableau
 * « Parametres de lancement »), borne EXACTEMENT comme SwogeLaunchpadV5._check :
 * une valeur que le contrat refuserait est refusee ici, avec le meme message.
 * Les bornes viennent de getConfig() quand le noyau les publie, sinon de
 * SwogeTypesV5.sol (MIN_LIMIT_BPS, cliff, durees, champs de 256 octets).
 *
 * Le portefeuille du createur signe (launchpad.html le fournit) ; la page ne
 * voit aucune cle. Un sel aleatoire par lancement (README, risque 6 : un sel
 * rejoue echoue en brulant tout le gaz).
 *
 * Les actions Robinhood : un jeton brut vaut `uiMultiplier` actions (README,
 * « Le multiplicateur »). Les montants sont SAISIS et AFFICHES en actions, et
 * le multiplicateur est relu en direct a chaque choix de monnaie.
 *
 *   SwogeV5.monte({ hote, portefeuille, connecte, lecteur, ethUsd })
 *   SwogeV5.calc — les calculs purs (FDV, achat initial, bornes), pour les essais
 * ======================================================================== */
(function (racine) {
  "use strict";
  var CHAIN = { id: 4663, scan: "https://robinhoodchain.blockscout.com" };
  var ADRESSES_URL = "contrats/v5/adresses_v5.json", COT_URL = "contrats/v5/script/cotations_v5.json";
  var SWOGE_LOGO = "img/d65f1731a1b8.webp";
  /* Le registre Robinhood (api.robinhood.com/rhj/assets, releve du 18/10/2026) donne pour chacune des
     195 actions logoUrl = https://cdn.robinhood.com/ncw_assets/logos/<adresse en minuscules>.png :
     195 sur 195, aucune exception. Le generateur l'ecrit desormais dans la liste (`logo`) ; a defaut,
     la page reconstruit la meme adresse. */
  var LOGO_RH = "https://cdn.robinhood.com/ncw_assets/logos/";
  /* Le nom du registre n'est pas celui qu'on tape : SPCX s'appelle « Space Exploration Technologies Corp. »,
     et le proprietaire l'a demandee sous le nom de SpaceX (18/10/2026). */
  var ALIAS = { SPCX: "SpaceX" };

  /* Bornes de SwogeTypesV5.sol que getConfig() ne publie pas. */
  var B = { MAX_NAME: 32, MAX_SYMBOL: 10, MAX_META: 256, MIN_LIMIT_BPS: 50, MIN_CLIFF: 30 * 86400, MIN_VEST: 90 * 86400,
    MAX_VEST: 730 * 86400, MIN_CLAIM: 7 * 86400, MAX_CLAIM: 180 * 86400, MAX_OFFPOOL_BPS: 1000, TICK_SPACING: 200,
    RANGE: 161200, LADDER_BAND0: 40000, SUPPLY: 1e9 };

  var P_TUPLE = "(string name,string symbol,bytes32 salt,(string description,string logo,string website,string twitter,string telegram) meta," +
    "uint8 quote,uint8 shape,int24 startShift,uint16 creatorTaxBps,(uint16 creator,uint16 stakers,uint16 lp,uint16 buyback) split," +
    "(uint16 startBps,uint16 secs) snipe,(uint16 maxBuyPerSwapBps,uint16 maxBuyPerBlockBps,uint32 secs) limits," +
    "(uint16 creatorVestBps,uint32 cliff,uint32 duration,uint16 airdropBps,bytes32 merkleRoot,uint32 claimSecs) alloc," +
    "address feeRecipient,uint256 initialBuy,uint256 minTokensOut)";
  var ABI_CORE = [
    "function createToken(" + P_TUPLE + " p) payable returns (address token)",
    "function getConfig() view returns ((uint16 BASE_FEE_BPS,uint16 CREATOR_SHARE_BPS,uint16 MAX_CREATOR_TAX_BPS,uint16 MAX_SNIPE_START_BPS," +
      "uint16 MAX_SNIPE_SECONDS,uint32 MAX_LIMIT_SECONDS,uint16 MAX_INITIAL_BUY_BPS,uint16 MAX_VEST_BPS,uint16 MAX_AIRDROP_BPS,uint32 RECIPIENT_DELAY," +
      "uint256 LAUNCH_FEE_WEI,int24 MAX_START_SHIFT_TICKS,address treasury,address hook,address holders,address alloc,address[] quotes,int24[] startTicks))",
    "function currentFees(address token) view returns (uint16 buyBps, uint16 sellBps, uint32 snipeEndsAt)",
    "event LaunchedV5(address indexed token, address indexed creator, address indexed quote, bytes32 poolId, uint8 shape, int24 startTick, uint256 initialBuy)",
    "error Bound(string what)"
  ];
  var ABI_ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)", "function decimals() view returns (uint8)", "function symbol() view returns (string)",
    "function uiMultiplier() view returns (uint256)"];

  function E() { return racine.ethers; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function meme(a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); }
  function octets(s) { return new TextEncoder().encode(String(s || "")).length; }
  function adresseValide(a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")) && !/^0x0{40}$/.test(String(a)); }
  function fmt(x, d) {
    if (!isFinite(x)) return "—";
    var a = Math.abs(x);
    if (a >= 1e9) return (x / 1e9).toFixed(2) + "B"; if (a >= 1e6) return (x / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return Math.round(x).toLocaleString("en-US");
    if (a >= 1) return x.toFixed(d == null ? 2 : d);
    if (a === 0) return "0";
    return x.toPrecision(3);
  }

  /* ============================ les calculs purs ============================ */
  var calc = {
    /** FDV d'ouverture, en unites ENTIERES de la cotation : 10^9 jetons × prix (« cotation par jeton », brut) */
    fdvCotation: function (tick, decQ) { return B.SUPPLY * Math.pow(1.0001, tick) * Math.pow(10, 18 - decQ); },
    /** Jetons recus pour `brut` unites brutes de cotation, avant l'ouverture (ni surtaxe, ni autre echange).
        La premiere tranche porte tout l'achat : ≤ 5 % de l'offre < 30 % × 90 % (LADDER3, hors pool maximal). */
    sortie: function (brut, tick, forme, horsPoolBps, fraisBps) {
      var pool = 1e27 * (10000 - horsPoolBps) / 10000, A = forme === 1 ? pool * 0.3 : pool;
      var hi = forme === 1 ? B.LADDER_BAND0 : B.RANGE;
      var sa = Math.pow(1.0001, tick / 2), sb = Math.pow(1.0001, (tick + hi) / 2), L = A * sa * sb / (sb - sa);
      var net = brut * (10000 - fraisBps) / 10000;
      return L * (1 / sa - 1 / (sa + net / L));
    },
    /** L'achat initial (brut) qui donnerait exactement `plafond` jetons bruts : la borne de 5 % du noyau. */
    achatMax: function (plafond, tick, forme, horsPoolBps, fraisBps) {
      var pool = 1e27 * (10000 - horsPoolBps) / 10000, A = forme === 1 ? pool * 0.3 : pool;
      var hi = forme === 1 ? B.LADDER_BAND0 : B.RANGE;
      var sa = Math.pow(1.0001, tick / 2), sb = Math.pow(1.0001, (tick + hi) / 2), L = A * sa * sb / (sb - sa);
      var s1 = 1 / (1 / sa - plafond / L);
      return L * (s1 - sa) * 10000 / (10000 - fraisBps);
    },
    /** Le miroir de SwogeLaunchpadV5._check : null, ou le message exact du contrat. */
    verifie: function (p, cfg, n) {
      var nb = octets(p.name), sb = octets(p.symbol), m = p.meta;
      if (nb === 0 || nb > B.MAX_NAME) return "name: 1..32 bytes";
      if (sb === 0 || sb > B.MAX_SYMBOL) return "symbol: 1..10 bytes";
      if ([m.description, m.logo, m.website, m.twitter, m.telegram].some(function (f) { return octets(f) > B.MAX_META; })) return "meta field <= 256 bytes";
      if (!(p.quote >= 0 && p.quote < n)) return "quote: index in getConfig().quotes";
      if (p.shape !== 0 && p.shape !== 1) return "shape: 0 SINGLE, 1 LADDER3";
      var maxS = cfg.MAX_START_SHIFT_TICKS;
      if (p.startShift % B.TICK_SPACING !== 0 || p.startShift > maxS || p.startShift < -maxS) return "startShift: multiple of 200, |x| <= " + maxS;
      if (!(p.creatorTaxBps >= 0 && p.creatorTaxBps <= cfg.MAX_CREATOR_TAX_BPS)) return "creatorTaxBps <= " + cfg.MAX_CREATOR_TAX_BPS;
      var s = p.split;
      if ([s.creator, s.stakers, s.lp, s.buyback].some(function (x) { return !(x >= 0 && x <= 10000 && x === Math.floor(x)); }) ||
        s.creator + s.stakers + s.lp + s.buyback !== 10000) return "split: sum = 10000";
      if (p.snipe.startBps > cfg.MAX_SNIPE_START_BPS) return "snipe.startBps <= " + cfg.MAX_SNIPE_START_BPS;
      if (p.snipe.secs > cfg.MAX_SNIPE_SECONDS) return "snipe.secs <= " + cfg.MAX_SNIPE_SECONDS;
      var l = p.limits;
      if (l.maxBuyPerSwapBps !== 0 && (l.maxBuyPerSwapBps < B.MIN_LIMIT_BPS || l.maxBuyPerSwapBps > 10000)) return "maxBuyPerSwapBps: 0 or 50..10000";
      if (l.maxBuyPerBlockBps !== 0 && (l.maxBuyPerBlockBps < B.MIN_LIMIT_BPS || l.maxBuyPerBlockBps > 10000)) return "maxBuyPerBlockBps: 0 or 50..10000";
      if (l.secs > cfg.MAX_LIMIT_SECONDS) return "limits.secs <= " + cfg.MAX_LIMIT_SECONDS;
      var a = p.alloc;
      if (a.creatorVestBps > cfg.MAX_VEST_BPS) return "creatorVestBps <= " + cfg.MAX_VEST_BPS;
      if (a.creatorVestBps > 0) {
        if (a.cliff < B.MIN_CLIFF) return "cliff >= 30 days";
        if (a.duration < B.MIN_VEST || a.duration > B.MAX_VEST) return "duration: 90..730 days";
        if (a.cliff >= a.duration) return "cliff < duration";
      }
      if (a.airdropBps > cfg.MAX_AIRDROP_BPS) return "airdropBps <= " + cfg.MAX_AIRDROP_BPS;
      if (a.airdropBps > 0) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(a.merkleRoot) || /^0x0{64}$/.test(a.merkleRoot)) return "merkleRoot required";
        if (a.claimSecs < B.MIN_CLAIM || a.claimSecs > B.MAX_CLAIM) return "claimSecs: 7..180 days";
      }
      if (a.creatorVestBps + a.airdropBps > B.MAX_OFFPOOL_BPS) return "vest + airdrop <= 1000";
      if (!adresseValide(p.feeRecipient)) return "feeRecipient != 0";
      if (String(p.initialBuy) !== "0" && String(p.minTokensOut) === "0") return "minTokensOut required";
      return null;
    },
    B: B
  };

  /* ============================ l'etat ============================ */
  var S = { o: null, J: null, cfg: null, quotes: [], meta: {}, q: null, core: null, iface: null, tete: null };

  function lecteur() { return S.o.lecteur(); }
  function host() { return S.o.hote; }
  function $(id) { return document.getElementById(id); }

  /* ---- le fichier des adresses : absent = inerte ---- */
  function lisAdresses() {
    return fetch(ADRESSES_URL, { cache: "no-store" }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function adressesValides(J) {
    if (!J || J.version !== "v5" || Number(J.chainId) !== CHAIN.id) return false;
    return ["core", "hook", "holders", "alloc"].every(function (k) { return adresseValide(J[k]); });
  }
  function bientot(raison) {
    host().innerHTML = '<h2>SWOGE V5 <span class="count">coming soon</span></h2>' +
      '<div class="note" id="v5Etat">V5 coming soon — fair launches on Uniswap v4 with your own quote currency (ETH, USDG, $SWOGE or a Robinhood stock token), creator tax, anti-snipe and locked liquidity. ' +
      "The contracts are written and tested, not deployed yet." + (raison ? " " + esc(raison) : "") + "</div>";
    signale(false);
  }
  /* launchpad.html ouvre les lanceurs d'avant quand la section V5 reste eteinte (rien a lancer en V5) */
  function signale(pret) { try { host().setAttribute("data-v5", pret ? "pret" : "eteint"); racine.dispatchEvent(new CustomEvent("swogev5", { detail: { pret: pret } })); } catch (e) {} }

  async function monte(o) {
    S.o = o;
    if (!host()) return;
    var J = null;
    try { J = await lisAdresses(); } catch (e) { return bientot(""); }
    if (!J) return bientot("");
    if (!adressesValides(J)) return bientot("(contrats/v5/adresses_v5.json is not valid: the V5 section stays off.)");
    var Et = E();
    if (!Et) return bientot("");
    S.J = J;
    S.iface = new Et.utils.Interface(ABI_CORE);
    S.core = new Et.Contract(J.core, ABI_CORE, lecteur());
    host().innerHTML = '<h2>SWOGE V5 launch <span class="count">Uniswap v4</span></h2><div class="note" id="v5Etat">Reading the V5 core on-chain…</div>';
    try {
      var code = await lecteur().getCode(J.core);
      if (!code || code === "0x") throw new Error("no code at the V5 core address");
      var c = await S.core.getConfig();
      if (!meme(c.hook, J.hook) || !meme(c.holders, J.holders) || !meme(c.alloc, J.alloc)) throw new Error("the core on-chain does not match contrats/v5/adresses_v5.json");
      S.cfg = c;
    } catch (e) {
      return bientot("(V5 addresses could not be checked on-chain: " + String(e.message || e).slice(0, 120) + ")");
    }
    var cot = null;
    try { cot = await fetch(COT_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }); } catch (e) {}
    S.cot = cot;
    (cot && cot.liste || []).forEach(function (q) { S.meta[String(q.address).toLowerCase()] = q; });
    S.quotes = S.cfg.quotes.map(function (a, i) {
      var m = S.meta[String(a).toLowerCase()] || {};
      var action = !!m.uiMultiplier || i >= 3;
      return { i: i, address: a, refTick: Number(S.cfg.startTicks[i]), symbol: i === 0 ? "ETH" : (m.symbol || "#" + i),
        nom: i === 0 ? "Ether (native)" : i === 1 ? "Global Dollar (USDG)" : i === 2 ? "SWOGE" : String(m.nom || "").replace(/\s*•\s*Robinhood Token\s*$/, ""),
        dec: i === 0 ? 18 : (m.decimales != null ? Number(m.decimales) : null), action: action,
        logo: i === 0 ? "" : i === 2 ? SWOGE_LOGO : i === 1 ? "" : (m.logo || LOGO_RH + String(a).toLowerCase() + ".png"),
        prixBrutUsd: m.prixJetonBrutUsd != null ? Number(m.prixJetonBrutUsd) : null, multListe: m.uiMultiplier || null, coursDate: m.coursDate || "" };
    });
    dessine();
    signale(true);
    choisis(0);
  }

  /* ============================ le formulaire ============================ */
  /* 18/10/2026 : « trop d'options, les gens ne s'y retrouvent pas » (le proprietaire). Le formulaire
     montre quatre champs et un facultatif : nom, symbole, logo, paire (ETH par defaut, les 197 autres
     derriere « More pairs »), achat initial. Tout le reste (taxe, anti-snipe, limites, repartition,
     forme, prix d'ouverture, vesting, airdrop, liens) est replie sous « Advanced settings », pre-rempli
     avec les valeurs d'avant (toutes a zero ou eteintes : aucune n'a encore de mesure qui la fixe).
     Les identifiants des champs ne changent pas : les bornes, le calcul et l'envoi sont les memes. */
  function styleUneFois() {
    if (document.getElementById("v5Style")) return;
    var st = document.createElement("style"); st.id = "v5Style";
    st.textContent = ".v5-qliste{max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:6px}" +
      ".v5-q{display:flex;gap:10px;align-items:center;width:100%;min-height:44px;text-align:left;padding:8px 10px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--cream);cursor:pointer;font:inherit}" +
      ".v5-q:last-child{border-bottom:0}.v5-q.on{background:color-mix(in srgb,var(--gold) 12%,transparent)}" +
      ".v5-q img,.v5-q i,.v5-paire img,.v5-paire i{width:24px;height:24px;border-radius:50%;flex:0 0 auto;object-fit:cover;background:var(--void);display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:800}" +
      ".v5-q b{min-width:58px}.v5-q span{color:var(--dim);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".v5-sec{border-top:1px dashed var(--line);margin-top:12px;padding-top:12px}.v5-sec>label.t{font-size:12px;color:var(--cream)}" +
      ".v5-ex{font-size:12.5px;color:var(--dim);margin:2px 0 8px;line-height:1.45}" +
      ".v5-quatre{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}@media (max-width:560px){.v5-quatre{grid-template-columns:1fr 1fr}}" +
      "#v5Panel input[type=range]{padding:0;min-height:32px}#v5Panel input,#v5Panel select{min-height:44px}" +
      ".v5-alerte{border:1px solid var(--danger);color:var(--danger);border-radius:10px;padding:10px 12px;margin:10px 0;font-size:12.5px;line-height:1.5}" +
      ".v5-paire{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--void2)}" +
      ".v5-paire .nom{display:flex;align-items:center;gap:8px;font-weight:700;min-width:0}.v5-paire .lnk{margin-left:auto;min-height:44px;padding:0 6px}" +
      ".v5-logo{display:flex;align-items:center;gap:10px}.v5-logo img{width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid var(--line);flex:0 0 auto}.v5-logo input{flex:1 1 auto;min-width:0}" +
      ".v5-cout{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:14px;font-size:13px;line-height:1.5}" +
      ".v5-cout .l{display:flex;justify-content:space-between;gap:10px}.v5-cout .l span:first-child{color:var(--dim)}.v5-cout .tot{border-top:1px dashed var(--line);margin-top:6px;padding-top:6px;font-weight:700}" +
      ".v5-cout .err{color:var(--danger);margin-top:6px}.v5-cout .apres{color:var(--dim);font-size:12px;margin-top:6px}" +
      "#v5Lancer{font-size:17px;padding:16px;min-height:56px;margin-top:12px}" +
      ".v5-avance{margin-top:16px;border:1px solid var(--line);border-radius:12px;padding:0 12px}.v5-avance>summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font-weight:700;list-style:none}" +
      ".v5-avance>summary::-webkit-details-marker{display:none}.v5-avance>summary:after{content:'▾';margin-left:auto;color:var(--dim)}.v5-avance[open]>summary:after{content:'▴'}" +
      ".v5-avance>summary small{font-weight:400;color:var(--dim);margin-left:8px}.v5-avance[open]{padding-bottom:12px}";
    document.head.appendChild(st);
  }
  function champ(id, lab, attrs) { return '<div class="field"><label for="' + id + '">' + lab + '</label><input id="' + id + '" ' + (attrs || "") + "></div>"; }
  function ex(t) { return '<div class="v5-ex">' + t + "</div>"; }
  function dessine() {
    styleUneFois();
    var c = S.cfg, h = "";
    h += '<h2>Launch a token <span class="count">SWOGE V5 · Uniswap v4</span></h2>';
    h += '<div class="note" style="margin:0 0 12px">One transaction. The whole supply goes into a pool that is locked forever. No owner, no admin.</div>';
    h += '<div class="two">' + champ("v5Name", "Name", 'maxlength="32" placeholder="Swoge Inu" autocomplete="off"') +
      champ("v5Sym", "Symbol", 'maxlength="10" placeholder="SWINU" autocapitalize="characters" spellcheck="false" autocomplete="off" style="text-transform:uppercase"') + "</div>";
    h += '<div class="field"><label for="v5Logo">Logo</label><div class="v5-logo"><img id="v5LogoVu" alt="" hidden>' +
      '<input id="v5Logo" placeholder="Image link: https://…/logo.png or ipfs://…" spellcheck="false" autocomplete="off"></div>' +
      '<div class="v5-ex" id="v5LogoNote">Optional. Saved on-chain with your token (256 bytes max), so paste a link to a hosted image.</div></div>';

    h += '<div class="field"><label>Pair</label><div class="v5-paire"><span class="nom" id="v5PaireNow">ETH</span>' +
      '<button type="button" class="lnk" id="v5PlusPaires" aria-expanded="false" aria-controls="v5QBox">More pairs ›</button></div>' +
      '<div class="v5-ex">What buyers pay with. ETH is the simplest; USDG, $SWOGE and ' + (S.quotes.length - 3) + ' stock tokens are under More pairs.</div>' +
      '<div id="v5QBox" hidden><input id="v5QRech" placeholder="🔎 Search ETH, USDG, SWOGE, NVDA, SpaceX… (' + S.quotes.length + ')" autocomplete="off">' +
      '<div class="v5-qliste" id="v5QListe" role="listbox" aria-label="Pair"></div><div class="note" id="v5QChoisie"></div></div><div id="v5QAlerte"></div></div>';

    h += '<div class="field"><label for="v5Achat" id="v5AchatLab">Initial buy (optional)</label>' +
      '<div style="display:flex;gap:8px"><input id="v5Achat" inputmode="decimal" placeholder="0 (none)" autocomplete="off" style="flex:1 1 auto;min-width:0"><button type="button" class="btn" id="v5AchatMax" style="margin:0">Max</button></div>' +
      '<div class="v5-ex" id="v5AchatNote"></div></div>';

    h += '<div class="v5-cout" id="v5Resume" aria-live="polite"></div>';
    h += '<button class="btn primary full" id="v5Lancer" type="button">🚀 Launch</button>';
    h += '<div class="note" id="v5Note"></div><div class="lp-kit" id="v5Kit" hidden></div>';

    h += '<details class="v5-avance" id="v5Avance"><summary>Advanced settings <small>optional · safe defaults are set</small></summary>';
    h += '<div class="v5-sec"><label class="t">Description and links</label>' + ex("Shown on your token page. Optional.") +
      champ("v5Desc", "Description", 'maxlength="256" placeholder="What is this token about?"') +
      '<div class="two">' + champ("v5Web", "Website", 'placeholder="https://…"') + champ("v5Tw", "X / Twitter", 'placeholder="https://x.com/…"') + "</div>" +
      champ("v5Tg", "Telegram", 'placeholder="https://t.me/…"') + "</div>";
    h += '<div class="v5-sec"><label class="t" for="v5Tax">Creator tax</label>' + ex("An extra fee on every buy and sell, paid to you. Default 0 %. After launch it can only go down.") +
      '<input type="range" id="v5Tax" min="0" max="' + c.MAX_CREATOR_TAX_BPS + '" step="1" value="0"><div class="note" id="v5TaxNote"></div></div>';
    h += '<div class="v5-sec"><label class="t">Fee split</label>' + ex("Where your creator share goes. Default: 100 % to you. Must add up to 100 %.") + '<div class="v5-quatre">' +
      champ("v5SpC", "Creator %", 'inputmode="decimal" value="100"') + champ("v5SpS", "Stakers %", 'inputmode="decimal" value="0"') +
      champ("v5SpL", "LP floor %", 'inputmode="decimal" value="0"') + champ("v5SpB", "Buyback-burn %", 'inputmode="decimal" value="0"') +
      '</div><div class="note" id="v5SpNote"></div></div>';
    h += '<div class="v5-sec"><label class="t">Anti-snipe</label>' + ex("A surcharge on early buys that fades to 0, to slow down bots. Default off.") + '<div class="two">' +
      champ("v5SnB", "Start surcharge % (0–" + (c.MAX_SNIPE_START_BPS / 100) + ")", 'inputmode="decimal" value="0"') +
      champ("v5SnS", "Window, seconds (0–" + c.MAX_SNIPE_SECONDS + ")", 'inputmode="numeric" value="0"') + '</div><div class="note" id="v5SnNote"></div></div>';
    h += '<div class="v5-sec"><label class="t">Buy limits</label>' + ex("Caps how much one buyer can take right after opening. Default off (0).") + '<div class="two">' +
      champ("v5LiS", "Max per swap, % of supply (0 or 0.5–100)", 'inputmode="decimal" value="0"') +
      champ("v5LiB", "Max per second, % of supply (0 or 0.5–100)", 'inputmode="decimal" value="0"') + "</div>" +
      champ("v5LiT", "For how long, seconds (0–" + c.MAX_LIMIT_SECONDS + ")", 'inputmode="numeric" value="0"') + '<div class="note" id="v5LiNote"></div></div>';
    h += '<div class="v5-sec"><label class="t" for="v5Shape">Liquidity shape</label>' + ex("How the pool spreads your tokens over prices. SINGLE is the default and the simplest.") +
      '<select id="v5Shape"><option value="0">SINGLE — one range of 161,200 ticks above the opening price</option>' +
      '<option value="1">LADDER3 — 30 % / 30 % / 40 % on three ranges</option></select></div>';
    h += '<div class="v5-sec"><label class="t" for="v5Shift">Opening price</label>' + ex("The starting market cap. Default: the reference for this pair (shift 0). Steps of 200 ticks, −" +
      c.MAX_START_SHIFT_TICKS + " … +" + c.MAX_START_SHIFT_TICKS + ".") +
      '<input type="range" id="v5Shift" min="-' + c.MAX_START_SHIFT_TICKS + '" max="' + c.MAX_START_SHIFT_TICKS + '" step="200" value="0"><div class="note" id="v5Fdv"></div></div>';
    h += '<div class="v5-sec"><label class="t">Creator vesting</label>' + ex("Keep up to " + (c.MAX_VEST_BPS / 100) + " % of supply for yourself, unlocked slowly after a cliff. Default 0 %.") + '<div class="two">' +
      champ("v5VeP", "% of supply (0–" + (c.MAX_VEST_BPS / 100) + ")", 'inputmode="decimal" value="0"') +
      champ("v5VeC", "Cliff, days (≥ 30)", 'inputmode="numeric" value="30"') + "</div>" +
      champ("v5VeD", "Duration, days (90–730, longer than the cliff)", 'inputmode="numeric" value="180"') + "</div>";
    h += '<div class="v5-sec"><label class="t">Airdrop</label>' + ex("Set aside up to " + (c.MAX_AIRDROP_BPS / 100) + " % for a Merkle airdrop; unclaimed tokens are burned. Default 0 %.") + '<div class="two">' +
      champ("v5AiP", "% of supply (0–" + (c.MAX_AIRDROP_BPS / 100) + ")", 'inputmode="decimal" value="0"') +
      champ("v5AiJ", "Claim window, days (7–180)", 'inputmode="numeric" value="30"') + "</div>" +
      champ("v5AiR", "Merkle root (bytes32)", 'placeholder="0x…" spellcheck="false"') + "</div>";
    h += '<div class="v5-sec"><label class="t" for="v5Dest">Fee recipient</label>' + ex("Who receives the creator share. Default: your connected wallet. Changing it later takes 2 steps and 72 h.") +
      '<input id="v5Dest" placeholder="your connected wallet" spellcheck="false"></div>';
    h += "</details>";
    host().innerHTML = h;

    $("v5QRech").addEventListener("input", liste);
    $("v5Sym").addEventListener("input", function () { var s = $("v5Sym"), n = s.value.replace(/^\$/, "").toUpperCase(); if (n !== s.value) s.value = n; });
    ["v5Name", "v5Sym", "v5Desc", "v5Logo", "v5Web", "v5Tw", "v5Tg", "v5Shift", "v5Shape", "v5Tax", "v5SpC", "v5SpS", "v5SpL", "v5SpB", "v5SnB", "v5SnS",
      "v5LiS", "v5LiB", "v5LiT", "v5VeP", "v5VeC", "v5VeD", "v5AiP", "v5AiJ", "v5AiR", "v5Dest", "v5Achat"].forEach(function (id) {
      $(id).addEventListener("input", maj); $(id).addEventListener("change", maj);
    });
    ["v5Name", "v5Sym", "v5Achat"].forEach(function (id) { $(id).addEventListener("input", function () { S.touche = true; }); });
    $("v5Logo").addEventListener("input", apercuLogo);
    $("v5PlusPaires").onclick = function () { ouvrePaires($("v5QBox").hidden); };
    $("v5AchatMax").onclick = function () { var m = maxAchatAffiche(); if (m > 0) { $("v5Achat").value = String(+m.toPrecision(6)); S.touche = true; maj(); } };
    $("v5Lancer").onclick = lance;
    liste();
  }
  function ouvrePaires(ouvre) {
    $("v5QBox").hidden = !ouvre; $("v5PlusPaires").setAttribute("aria-expanded", String(!!ouvre));
    $("v5PlusPaires").textContent = ouvre ? "Close ✕" : "More pairs ›";
    if (ouvre) try { $("v5QRech").focus({ preventScroll: true }); } catch (e) {}
  }
  /* L'apercu du logo : la page montre l'image du lien saisi ; rien n'est televerse. Le champ Meta du
     noyau garde 256 octets au plus : une image envoyee depuis l'appareil (data:, ~1 Ko meme a 16 px,
     mesure du 18/10/2026) n'y tiendrait pas — d'ou un lien vers une image hebergee. */
  function apercuLogo() {
    var v = String($("v5Logo").value || "").trim(), im = $("v5LogoVu");
    if (/^https:\/\//i.test(v)) { im.hidden = false; im.onerror = function () { im.hidden = true; }; im.src = v; }
    else im.hidden = true;
  }
  function liste() {
    var q = String($("v5QRech").value || "").trim().toLowerCase(), h = "";
    S.quotes.forEach(function (x) {
      if (q && (x.symbol + " " + x.nom + " " + (ALIAS[x.symbol] || "") + " " + x.address).toLowerCase().indexOf(q) < 0) return;
      var img = x.logo ? '<img src="' + esc(x.logo) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : "<i>" + (x.i === 0 ? "Ξ" : esc(x.symbol.slice(0, 2))) + "</i>";
      h += '<button type="button" role="option" class="v5-q' + (S.q && S.q.i === x.i ? " on" : "") + '" data-i="' + x.i + '" aria-selected="' + (S.q && S.q.i === x.i) + '">' + img +
        "<b>" + esc(x.symbol) + "</b><span>" + esc(x.nom) + (x.action ? " · stock token" : "") + "</span></button>";
    });
    $("v5QListe").innerHTML = h || '<div class="note" style="padding:8px">No match.</div>';
    [].forEach.call($("v5QListe").querySelectorAll(".v5-q"), function (b) { b.onclick = function () { choisis(+b.getAttribute("data-i")); ouvrePaires(false); }; });
  }
  /* Le choix d'une monnaie relit, en direct : decimales, multiplicateur (actions), solde du createur. */
  async function choisis(i) {
    var x = S.quotes[i]; S.q = x; liste(); S.gaz = null;
    var Et = E();
    var img = x.logo ? '<img src="' + esc(x.logo) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : "<i>" + (x.i === 0 ? "Ξ" : esc(x.symbol.slice(0, 2))) + "</i>";
    $("v5PaireNow").innerHTML = img + "<span>" + esc(x.i === 2 ? "$SWOGE" : x.symbol) + (x.action ? ' <small style="font-weight:400;color:var(--dim)">stock token</small>' : "") + "</span>";
    $("v5QChoisie").innerHTML = "Selected: <b>" + esc(x.symbol) + "</b> " + (x.i ? "<code>" + esc(x.address) + "</code>" : "(native ETH)") + " · reading…";
    x.mult = null; x.solde = null;
    try {
      if (x.i > 0) {
        var t = new Et.Contract(x.address, ABI_ERC20, lecteur());
        x.dec = Number(await t.decimals());
        if (x.action) x.mult = await t.uiMultiplier();
      }
    } catch (e) { x.lectureKo = String(e.message || e).slice(0, 80); }
    await litSolde();
    if (S.q !== x) return;
    var unite = x.action ? "shares of " + x.symbol : x.symbol;
    $("v5AchatLab").textContent = "Initial buy, in " + unite + " (optional, ≤ " + (S.cfg.MAX_INITIAL_BUY_BPS / 100) + " % of supply)";
    $("v5QChoisie").innerHTML = "Selected: <b>" + esc(x.symbol) + "</b>" + (x.nom ? " — " + esc(x.nom) : "") + " " + (x.i ? "<code>" + esc(x.address) + "</code>" : "(native ETH)") +
      (x.action && x.mult ? " · uiMultiplier read now: <b>" + (+Et.utils.formatUnits(x.mult, 18)).toPrecision(8).replace(/\.?0+$/, "") + "</b> (1 token = that many shares)" : "") +
      (x.lectureKo ? ' · <span style="color:var(--danger)">could not read the token: ' + esc(x.lectureKo) + "</span>" : "");
    /* README, risques 5 : une action peut etre gelee pour toujours, et les conditions de Robinhood s'appliquent. Dit en tete. */
    $("v5QAlerte").innerHTML = x.action ? '<div class="v5-alerte"><b>Stock-token quote.</b> ' + esc(x.symbol) + " is issued by Robinhood, which can pause it, block any address (including the Uniswap v4 PoolManager), burn balances or change its code. " +
      "If that happens, every pool quoted in " + esc(x.symbol) + " can be frozen forever — no one, not even SWOGE, can unlock it. Robinhood's eligibility terms apply to buyers (" +
      '<a href="https://robinhood.com/stocktoken/rhj" target="_blank" rel="noopener">terms</a>). Amounts below are in shares (raw tokens × uiMultiplier).</div>'
      : x.i === 1 ? '<div class="v5-alerte" style="border-color:var(--line);color:var(--dim)">USDG is an upgradeable token with an admin (ERC-1967 proxy): its issuer can change it. 6 decimals.</div>' : "";
    maj();
  }
  async function litSolde() {
    var w = S.o.portefeuille(), x = S.q; if (!x) return;
    x.solde = null;
    if (!w || !w.account) return;
    try { x.solde = x.i === 0 ? await lecteur().getBalance(w.account) : await new (E().Contract)(x.address, ABI_ERC20, lecteur()).balanceOf(w.account); } catch (e) {}
  }

  /* ---- la lecture du formulaire, en parametres du contrat ---- */
  function pct(id) { var v = String($(id).value || "").trim().replace(",", "."); if (v === "") return 0; return /^\d+(\.\d{0,2})?$/.test(v) ? Math.round(parseFloat(v) * 100) : NaN; }
  function entier(id) { var v = String($(id).value || "").trim(); if (v === "") return 0; return /^\d+$/.test(v) ? parseInt(v, 10) : NaN; }
  function brutDe(x, saisie) {
    /* saisie en unites entieres (actions pour une action) -> unites brutes (BigNumber) */
    var Et = E(), v = String(saisie || "").trim().replace(",", ".");
    if (!v || +v === 0) return Et.BigNumber.from(0);
    if (!/^\d+(\.\d+)?$/.test(v)) return null;
    var d = x.dec == null ? 18 : x.dec;
    var parts = v.split("."); if (parts[1] && parts[1].length > d) v = parts[0] + "." + parts[1].slice(0, d);
    var u = Et.utils.parseUnits(v, d);
    if (x.action) { if (!x.mult || x.mult.isZero()) return null; u = u.mul(Et.constants.WeiPerEther).div(x.mult); }
    return u;
  }
  function enAffiche(x, brut) {
    /* unites brutes -> nombre affiche (actions pour une action) */
    var Et = E(), d = x.dec == null ? 18 : x.dec, n = +Et.utils.formatUnits(brut, d);
    if (x.action && x.mult) n = n * (+Et.utils.formatUnits(x.mult, 18));
    return n;
  }
  function frais() { var t = $("v5Tax") ? +$("v5Tax").value : 0; return S.cfg.BASE_FEE_BPS + t; }
  function horsPool() { var a = pct("v5VeP"), b = pct("v5AiP"); return (isNaN(a) ? 0 : a) + (isNaN(b) ? 0 : b); }
  function tickDepart() { return S.q.refTick + (+$("v5Shift").value); }
  function maxAchatAffiche() {
    var x = S.q; if (!x) return 0;
    var plafond = 1e27 * S.cfg.MAX_INITIAL_BUY_BPS / 10000;
    // 0,2 % sous la borne : le calcul flottant ne doit jamais faire refuser par le noyau un achat affiche comme permis
    var brut = calc.achatMax(plafond, tickDepart(), +$("v5Shape").value, horsPool(), frais()) * 0.998;
    var d = x.dec == null ? 18 : x.dec, n = brut / Math.pow(10, d);
    if (x.action && x.mult) n *= +E().utils.formatUnits(x.mult, 18);
    return n;
  }
  function params(salt) {
    var x = S.q, w = S.o.portefeuille() || {}, Et = E();
    var dest = String($("v5Dest").value || "").trim() || w.account || "";
    var achat = brutDe(x, $("v5Achat").value);
    var p = {
      name: $("v5Name").value.trim(), symbol: $("v5Sym").value.trim(), salt: salt || Et.constants.HashZero,
      meta: { description: $("v5Desc").value.trim(), logo: $("v5Logo").value.trim(), website: $("v5Web").value.trim(), twitter: $("v5Tw").value.trim(), telegram: $("v5Tg").value.trim() },
      quote: x.i, shape: +$("v5Shape").value, startShift: +$("v5Shift").value, creatorTaxBps: +$("v5Tax").value,
      split: { creator: pct("v5SpC"), stakers: pct("v5SpS"), lp: pct("v5SpL"), buyback: pct("v5SpB") },
      snipe: { startBps: pct("v5SnB"), secs: entier("v5SnS") },
      limits: { maxBuyPerSwapBps: pct("v5LiS"), maxBuyPerBlockBps: pct("v5LiB"), secs: entier("v5LiT") },
      alloc: { creatorVestBps: pct("v5VeP"), cliff: entier("v5VeC") * 86400, duration: entier("v5VeD") * 86400, airdropBps: pct("v5AiP"),
        merkleRoot: String($("v5AiR").value || "").trim() || Et.constants.HashZero, claimSecs: entier("v5AiJ") * 86400 },
      feeRecipient: dest, initialBuy: achat ? achat.toString() : "x", minTokensOut: "0"
    };
    // un vesting ou un airdrop nul n'a pas de duree : le contrat ne lit pas ces champs, on les pose a 0
    if (!p.alloc.creatorVestBps) { p.alloc.cliff = 0; p.alloc.duration = 0; }
    if (!p.alloc.airdropBps) { p.alloc.merkleRoot = Et.constants.HashZero; p.alloc.claimSecs = 0; }
    if (achat && !achat.isZero()) {
      var out = calc.sortie(+achat.toString(), tickDepart(), p.shape, p.alloc.creatorVestBps + p.alloc.airdropBps, frais());
      // marge de 0,5 % : rien ne peut s'intercaler (l'achat a lieu avant l'ouverture), seul l'arrondi flottant compte
      p.minTokensOut = BigInt(Math.floor(out * 0.995)).toString();
      p._sortie = out;
    }
    return p;
  }
  function erreurForm(p) {
    if (p.initialBuy === "x") return S.q.action && !S.q.mult ? "uiMultiplier could not be read: the initial buy cannot be converted" : "initial buy: not a number";
    var nums = [p.split.creator, p.split.stakers, p.split.lp, p.split.buyback, p.snipe.startBps, p.snipe.secs, p.limits.maxBuyPerSwapBps, p.limits.maxBuyPerBlockBps,
      p.limits.secs, p.alloc.creatorVestBps, p.alloc.cliff, p.alloc.duration, p.alloc.airdropBps, p.alloc.claimSecs];
    if (nums.some(function (v) { return isNaN(v); })) return "a number field is not valid (percent: up to 2 decimals)";
    if (p.meta.logo && !/^https:\/\//i.test(p.meta.logo) && !/^ipfs:\/\//i.test(p.meta.logo)) return "logo: an https:// (or ipfs://) URL";
    var e = calc.verifie(p, S.cfg, S.quotes.length);
    if (e) return e;
    if (p._sortie && p._sortie > 1e27 * S.cfg.MAX_INITIAL_BUY_BPS / 10000) return "initial buy <= " + (S.cfg.MAX_INITIAL_BUY_BPS / 100) + "% of supply (lower it, or press Max)";
    return null;
  }
  function usdCotation(x, ethUsd) {
    if (x.i === 0) return ethUsd;
    if (x.i === 1) return S.cot && S.cot.usdgUsd ? +S.cot.usdgUsd : 1;
    /* $SWOGE : sa reference vaut 1 ETH de FDV aux prix du jour de la liste ; on en deduit son prix d'alors (±1 % : le tick est arrondi a 200). */
    if (x.i === 2) return ethUsd ? ethUsd / calc.fdvCotation(x.refTick, 18) : null;
    if (x.prixBrutUsd == null) return null;
    /* prix du jeton brut = cours de l'action × uiMultiplier : si le multiplicateur a change depuis la liste, le prix brut suit */
    if (x.mult && x.multListe) return x.prixBrutUsd * (+E().utils.formatUnits(x.mult, 18)) / (+E().utils.formatUnits(x.multListe, 18));
    return x.prixBrutUsd;
  }
  var _ethUsd = null;
  function maj() {
    if (!S.q || !$("v5Fdv")) return;
    var x = S.q, Et = E(), c = S.cfg, shift = +$("v5Shift").value, t = tickDepart(), d = x.dec == null ? 18 : x.dec;
    // l'ETH en dollars : en direct (CoinGecko) si possible, sinon le prix ecrit dans la liste, date
    var ethUsd = _ethUsd || (S.cot && S.cot.ethUsd ? +S.cot.ethUsd : null);
    var fdv = calc.fdvCotation(t, d), u = usdCotation(x, ethUsd);
    var unite = x.action ? x.symbol + " tokens" : x.symbol;
    var parts = fdv * (x.action && x.mult ? +Et.utils.formatUnits(x.mult, 18) : 1);
    $("v5Fdv").innerHTML = "Opening FDV: <b>" + fmt(fdv, 4) + " " + esc(unite) + "</b>" + (x.action && x.mult ? " (= " + fmt(parts, 4) + " shares)" : "") +
      (u ? " ≈ <b>$" + fmt(fdv * u) + "</b>" + (x.i === 0 ? (_ethUsd ? "" : " at the ETH price of the list (" + esc(String(S.cot.genere).slice(0, 10)) + ")")
        : " at " + (x.action ? "the share price of " + esc(String(x.coursDate).slice(0, 10)) : "the list price")) : "") +
      " · shift " + (shift > 0 ? "+" : "") + shift + " ticks = ×" + Math.pow(1.0001, shift).toFixed(3) + " the reference (start tick " + t + ")" +
      ". The pool holds only your token at first: this FDV is a displayed price until someone buys.";
    var tax = +$("v5Tax").value;
    $("v5TaxNote").innerHTML = "<b>" + (tax / 100).toFixed(2) + " %</b> on every buy and sell, on top of the 1 % base fee (75 % of the base fee to you, 25 % to SWOGE). Max " +
      (c.MAX_CREATOR_TAX_BPS / 100) + " %. After launch it can only go down.";
    var sp = [pct("v5SpC"), pct("v5SpS"), pct("v5SpL"), pct("v5SpB")], som = sp.reduce(function (a, b) { return a + (isNaN(b) ? 0 : b); }, 0);
    $("v5SpNote").innerHTML = "Total " + (som / 100).toFixed(2) + " %" + (som !== 10000 ? ' <span style="color:var(--danger)">— must be exactly 100 %</span>' : "") + ". Later, the creator share can only move to holders.";
    var sb = pct("v5SnB"), ss = entier("v5SnS");
    $("v5SnNote").innerHTML = sb && ss ? "Buys pay +" + (sb / 100).toFixed(2) + " % at opening, decaying to 0 in " + ss + " s; the surcharge goes to the LP floor bucket. Off by default: no measured default yet." : "Off. (Off by default: no measured default yet.)";
    var ls = pct("v5LiS"), lb = pct("v5LiB"), lt = entier("v5LiT");
    $("v5LiNote").innerHTML = lt && (ls || lb) ? "During " + lt + " s after opening: " + (ls ? "≤ " + (ls / 100) + " % of supply per swap" : "") + (ls && lb ? ", " : "") + (lb ? "≤ " + (lb / 100) + " % per second" : "") + ". Limits can only be relaxed later." : "Off.";
    // achat initial
    var p = params(), e = erreurForm(p), w = S.o.portefeuille() || {};
    var aN = $("v5AchatNote"), achatTxt = "";
    var max = maxAchatAffiche();
    achatTxt += "Be the first buyer, before anyone else can trade. Max ≈ " + fmt(max, 6) + " " + (x.action ? "shares" : esc(x.symbol)) + " (" + (c.MAX_INITIAL_BUY_BPS / 100) + " % of supply).";
    if (p._sortie) achatTxt += " You receive ≈ <b>" + fmt(p._sortie / 1e18) + "</b> tokens (" + (p._sortie / 1e25).toFixed(3) + " % of supply); minTokensOut = " + fmt(+p.minTokensOut / 1e18) + " (−0.5 %). You pay the base fee and the tax, no anti-snipe surcharge.";
    if (p.initialBuy !== "x" && p.initialBuy !== "0" && x.action) achatTxt += " = " + fmt(+Et.utils.formatUnits(p.initialBuy, d), 6) + " raw " + esc(x.symbol) + " tokens.";
    if (x.solde) achatTxt += " Your balance: " + fmt(enAffiche(x, x.solde), 6) + " " + (x.action ? "shares" : esc(x.symbol)) + ".";
    aN.innerHTML = achatTxt;
    // le cout, en une boite : frais de lancement, achat initial, gaz (estime sur la chaine quand le formulaire est valide)
    var fee = c.LAUNCH_FEE_WEI, achatOk = p.initialBuy !== "x" && p.initialBuy !== "0", valeur = x.i === 0 && p.initialBuy !== "x" ? fee.add(p.initialBuy) : fee;
    var cle = e ? null : cleGaz(p), g = S.gaz && S.gaz.cle === cle ? S.gaz : null;
    var gazTxt = !w.account ? "after you connect" : e ? "—" : !g ? "estimating…" : g.ko ? esc(g.ko) : "≈ " + fmtEth(g.wei) + " ETH";
    var lignes = '<div class="l"><span title="Paid to the SWOGE treasury">Launch fee</span><b>' + fmtEth(fee) + " ETH</b></div>" +
      '<div class="l"><span>Initial buy</span><b>' + (achatOk ? fmt(enAffiche(x, p.initialBuy), 6) + " " + (x.action ? "shares of " : "") + esc(x.symbol) : "none") + "</b></div>" +
      '<div class="l"><span>Network gas</span><b>' + gazTxt + "</b></div>" +
      '<div class="l tot"><span>You send</span><b>' + fmtEth(valeur) + " ETH" + (x.i > 0 && achatOk ? " + " + fmt(enAffiche(x, p.initialBuy), 6) + " " + (x.action ? "shares of " : "") + esc(x.symbol) : "") +
      (g && !g.ko ? " + gas" : "") + "</b></div>" +
      '<div class="apres">After launch, trading fees: buy ' + ((frais() + (sb || 0)) / 100).toFixed(2) + " % at opening, sell " + (frais() / 100).toFixed(2) + " %." +
      (x.i > 0 && achatOk ? " The " + esc(x.symbol) + " amount is approved first (exact amount)." : "") + "</div>";
    /* une erreur ne s'affiche qu'une fois le formulaire commence : un formulaire vide n'est pas « faux » */
    var vide = !$("v5Name").value.trim() && !$("v5Sym").value.trim();
    if (e) lignes += vide && !S.touche ? '<div class="apres">Enter a name and a symbol to launch.</div>' : '<div class="err">' + esc(e) + "</div>";
    $("v5Resume").innerHTML = lignes;
    $("v5Lancer").disabled = !!e && !!w.account;
    var sym = p.symbol ? " $" + p.symbol : "";
    $("v5Lancer").textContent = w.account ? "🚀 Launch" + sym : "Connect wallet to launch";
    if (!e && w.account && !g) estimeGaz(p, cle);
  }
  function fmtEth(wei) { var v = +E().utils.formatEther(wei); return v === 0 ? "0" : v >= 0.001 ? String(+v.toFixed(6)) : String(+v.toPrecision(3)); }
  /* le gaz depend de tout ce qui part, sauf du sel : la cle de l'estimation */
  function cleGaz(p) { var q = Object.assign({}, p, { salt: "" }); delete q._sortie; return JSON.stringify(q) + "|" + ((S.o.portefeuille() || {}).account || ""); }
  function tuple(p) {
    return [p.name, p.symbol, p.salt, [p.meta.description, p.meta.logo, p.meta.website, p.meta.twitter, p.meta.telegram], p.quote, p.shape, p.startShift,
      p.creatorTaxBps, [p.split.creator, p.split.stakers, p.split.lp, p.split.buyback], [p.snipe.startBps, p.snipe.secs],
      [p.limits.maxBuyPerSwapBps, p.limits.maxBuyPerBlockBps, p.limits.secs],
      [p.alloc.creatorVestBps, p.alloc.cliff, p.alloc.duration, p.alloc.airdropBps, p.alloc.merkleRoot, p.alloc.claimSecs], p.feeRecipient, p.initialBuy, p.minTokensOut];
  }
  /* Estimation de LECTURE (eth_estimateGas depuis le compte connecte, sel au hasard) : rien n'est signe.
     Un achat initial dans un ERC-20 pas encore autorise ne s'estime pas : c'est dit, le gaz sera montre a la signature. */
  var _tGaz = null;
  function estimeGaz(p, cle) {
    clearTimeout(_tGaz);
    _tGaz = setTimeout(async function () {
      var Et = E(), w = S.o.portefeuille() || {}, x = S.q;
      if (!w.account) return;
      if (cleGaz(params()) !== cle) return maj();   /* le formulaire a change pendant l'attente : on repart de lui */
      var q = Object.assign({}, p, { salt: Et.utils.hexlify(Et.utils.randomBytes(32)) });
      var valeur = S.cfg.LAUNCH_FEE_WEI.add(x.i === 0 ? q.initialBuy : 0);
      var r = { cle: cle };
      try {
        var gaz = await S.core.estimateGas.createToken(tuple(q), { value: valeur, from: w.account });
        var prix = await lecteur().getGasPrice();
        r.wei = prix.mul(gaz); r.gaz = gaz;
      } catch (err) { r.ko = x.i > 0 && q.initialBuy !== "0" ? "shown at signing (approval first)" : "not estimated: " + String(raison(err)).slice(0, 60); }
      S.gaz = r; maj();
    }, 600);
  }

  /* ---- les messages du contrat (erreur Bound(string)), lisibles ---- */
  function raison(e) {
    if (!e) return "unknown error";
    if (e.errorArgs && e.errorArgs.length) return String(e.errorArgs[0]);
    var data = e.data || (e.error && (e.error.data || (e.error.error && e.error.error.data)));
    if (data && typeof data === "object" && data.data) data = data.data;
    if (typeof data === "string" && data.length > 10) {
      try { var p = S.iface.parseError(data); return p.name === "Bound" ? String(p.args[0]) : p.name; } catch (x) {}
      try { return E().utils.defaultAbiCoder.decode(["string"], "0x" + data.slice(10))[0]; } catch (x) {}
    }
    return String(e.reason || (e.error && e.error.message) || e.message || e).slice(0, 180);
  }

  /* ============================ lancer ============================ */
  async function lance() {
    var w = S.o.portefeuille() || {}, Et = E(), note = $("v5Note"), btn = $("v5Lancer"), x = S.q;
    if (!w.signer || !w.account) { if (S.o.connecte) S.o.connecte(); return; }
    // un sel neuf a chaque essai : un sel rejoue echouerait en brulant tout le gaz (README, risque 6)
    var salt = Et.utils.hexlify(Et.utils.randomBytes(32));
    var p = params(salt), e = erreurForm(p);
    if (e) { note.className = "note err"; note.textContent = e; return; }
    btn.disabled = true; note.className = "note"; $("v5Kit").hidden = true;
    try {
      var cid = await w.signer.getChainId();
      if (cid !== CHAIN.id) throw new Error("switch your wallet to Robinhood Chain (4663) first");
      var valeur = S.cfg.LAUNCH_FEE_WEI.add(x.i === 0 ? p.initialBuy : 0);
      var achat = Et.BigNumber.from(p.initialBuy);
      if (x.i > 0 && !achat.isZero()) {
        var t = new Et.Contract(x.address, ABI_ERC20, w.signer);
        var solde = await t.balanceOf(w.account);
        if (solde.lt(achat)) throw new Error("you hold " + fmt(enAffiche(x, solde), 6) + " " + (x.action ? "shares of " : "") + x.symbol + ", less than your initial buy");
        var deja = await t.allowance(w.account, S.J.core);
        if (deja.lt(achat)) {
          note.textContent = "Step 1/2 — approve exactly " + fmt(enAffiche(x, achat), 6) + " " + (x.action ? "shares of " : "") + x.symbol + " for the V5 core…";
          var ta = await t.approve(S.J.core, achat);
          await ta.wait();
        }
      }
      var cw = new Et.Contract(S.J.core, ABI_CORE, w.signer);
      var tup = tuple(p);
      note.textContent = "Simulating the launch…";
      // la simulation dit la borne exacte qui refuserait, avant toute signature
      await cw.callStatic.createToken(tup, { value: valeur, from: w.account });
      var gaz = await cw.estimateGas.createToken(tup, { value: valeur });
      var prix = null; try { prix = await lecteur().getGasPrice(); } catch (x2) {}
      note.innerHTML = "Confirm the launch in your wallet · estimated " + gaz.toNumber().toLocaleString("en-US") + " gas" + (prix ? " ≈ " + (+Et.utils.formatEther(prix.mul(gaz))).toFixed(6) + " ETH" : "") + "…";
      var tx = await cw.createToken(tup, { value: valeur, gasLimit: gaz.mul(120).div(100) });
      note.innerHTML = 'Sent · waiting… <a href="' + CHAIN.scan + "/tx/" + tx.hash + '" target="_blank" rel="noopener">↗</a>';
      var rc = await tx.wait();
      var ev = null;
      (rc.logs || []).forEach(function (l) { if (!meme(l.address, S.J.core)) return; try { var q = S.iface.parseLog(l); if (q.name === "LaunchedV5") ev = q; } catch (z) {} });
      if (!ev) throw new Error("launched, but the LaunchedV5 event was not found in the receipt");
      await kit(ev, rc, p);
      note.className = "note ok"; note.textContent = "Launched on SWOGE V5.";
    } catch (err) {
      note.className = "note err";
      var m = raison(err);
      note.textContent = /user rejected|denied/i.test(m) ? "Cancelled in the wallet — nothing was sent." : "Failed · " + m;
    }
    btn.disabled = false;
  }
  async function kit(ev, rc, p) {
    var Et = E(), tok = ev.args.token, x = S.q, k = $("v5Kit");
    var f = null; try { f = await S.core.currentFees(tok); } catch (e) {}
    var achatTxt = "";
    if (!ev.args.initialBuy.isZero()) achatTxt = "<br>Initial buy: " + fmt(enAffiche(x, ev.args.initialBuy), 6) + " " + (x.action ? "shares of " : "") + esc(x.symbol) + ".";
    k.innerHTML = "<h3>🎉 " + esc(p.name) + " ($" + esc(p.symbol) + ") is live on V5</h3>" +
      "Token <code>" + esc(tok) + "</code> · quoted in " + esc(x.symbol) + " · start tick " + ev.args.startTick + " · pool id <code>" + esc(ev.args.poolId) + "</code>" + achatTxt +
      '<div id="v5Frais">' + (f ? "Fees now (currentFees): buy <b>" + (f.buyBps / 100).toFixed(2) + " %</b> · sell <b>" + (f.sellBps / 100).toFixed(2) + " %</b>" +
        (f.snipeEndsAt ? " · anti-snipe ends " + new Date(f.snipeEndsAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "") : "Fees: not readable right now.") + "</div>" +
      '<div class="liens"><a id="v5LienJeton" href="launchpad.html?token=' + esc(tok) + '">Token page</a>' +
      '<a id="v5LienDex" href="https://dexscreener.com/robinhood/' + esc(String(tok).toLowerCase()) + '" target="_blank" rel="noopener">DexScreener ↗</a>' +
      '<a href="' + CHAIN.scan + "/token/" + esc(tok) + '" target="_blank" rel="noopener">Explorer ↗</a>' +
      '<a href="' + CHAIN.scan + "/tx/" + esc(rc.transactionHash) + '" target="_blank" rel="noopener">Transaction ↗</a></div>';
    k.hidden = false;
  }

  function demarre(o) {
    var r = monte(o).catch(function () { try { bientot(""); } catch (e) {} });
    if (o && o.ethUsd) Promise.resolve().then(o.ethUsd).then(function (u) { if (u) { _ethUsd = u; maj(); } }, function () {});
    return r;
  }
  /* launchpad.html appelle ceci quand le portefeuille change : le bouton et le solde suivent */
  function portefeuilleChange() { if (!S.q) return; S.gaz = null; litSolde().then(maj); }

  racine.SwogeV5 = { monte: demarre, calc: calc, portefeuilleChange: portefeuilleChange, ABI_CORE: ABI_CORE, _etat: S };
})(typeof window !== "undefined" ? window : this);
