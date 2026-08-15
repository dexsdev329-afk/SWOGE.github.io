/*
 * SWOGE — acheter le jeton sans quitter le site.
 *
 * Le tunnel du joueur avait trois portes : trouver un DEX, y acheter, revenir
 * deposer. La porte du milieu s'ouvrait sur un AUTRE site — et un joueur qui
 * part sur un autre site ne revient pas toujours. Ce fichier recolle les deux
 * premieres etapes a la troisieme : le panneau d'achat se pose DANS la boite
 * de depot, juste au-dessus du champ « Amount », et quand l'achat passe il
 * remplit ce champ tout seul. Acheter puis deposer devient un ecran.
 *
 * Trois decisions valent d'etre dites :
 *
 *  1. LA ROUTE EST CELLE DE swoge_bench.html, PAS CELLE DU LAUNCHPAD. Le
 *     launchpad parle Uniswap v3 ; la paire ou $SWOGE s'echange reellement est
 *     une paire v2. La difference n'est pas cosmetique : l'appel v3 ne trouve
 *     aucune liquidite et rend zero. On reprend donc le routeur v2 et les
 *     memes fonctions « SupportingFeeOnTransfer » que la page de bench, qui
 *     tournent depuis des mois.
 *
 *  2. ON MONTRE L'IMPACT REEL, PAS UNE TOLERANCE FIXE. La reserve est petite
 *     — environ 2 ETH en face de 312 millions de jetons — donc le prix bouge
 *     vite : 0,78 % a 0,01 ETH, 4,88 % a 0,1, 19,6 % a 0,5. Une tolerance
 *     fixe de 3 % ferait echouer tout achat au-dessus de 0,06 ETH sans dire
 *     pourquoi. On calcule l'ecart depuis les reserves et on l'affiche — avec
 *     le seul conseil qui soit vrai sur une courbe x·y=k : etaler dans le
 *     temps, et surtout pas decouper l'ordre en morceaux consecutifs.
 *
 *  3. ON N'ACCROCHE RIEN AU CODE DES PAGES — comme stakebubble.js. Les treize
 *     pages gardent leur `provider` et leur `signer` dans une fermeture qu'on
 *     ne peut pas lire. Plutot que d'ajouter une ligne dans treize fichiers,
 *     on retrouve le portefeuille par ce qui est deja global : `SwogePrivy`
 *     pour la connexion par e-mail, `window.ethereum` pour l'extension. Une
 *     seule balise <script> par page, et rien d'autre a maintenir.
 *
 * Ce que ce fichier ne fait pas : vendre. Une page de casino qui propose de
 * revendre le jeton pendant qu'on joue travaille contre elle-meme, et le
 * bench existe deja pour ca.
 */
(function () {
  'use strict';
  if (window.__swogeBuy) return;
  window.__swogeBuy = true;

  var CHAIN_ID = 4663;
  var RPC     = 'https://rpc.mainnet.chain.robinhood.com';
  var WETH    = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
  var SWOGE   = '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817';
  var ROUTER  = '0x89e5db8b5aa49aa85ac63f691524311aeb649eba';
  var FACTORY = '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f';

  var ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
    'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable'
  ];
  var FACTORY_ABI = ['function getPair(address,address) view returns (address)'];
  var PAIR_ABI = [
    'function getReserves() view returns (uint112,uint112,uint32)',
    'function token0() view returns (address)'
  ];
  var ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

  /* La tolerance. On redemande le prix JUSTE avant d'envoyer, donc elle ne
     couvre que ce qui peut bouger entre ce prix-la et le bloc suivant — pas
     l'impact de l'ordre lui-meme, qui est deja dans le prix. Deux pour cent
     suffisent sur une chaine a un bloc par dixieme de seconde. */
  var TOLERANCE_BPS = 200;

  /* Ce qu'on laisse pour le gaz. L'achat n'est pas la derniere transaction du
     joueur : il lui reste l'approbation et le depot. Un « MAX » qui vide le
     portefeuille au centime laisse quelqu'un avec des jetons qu'il ne peut
     plus deposer. */
  var GAZ_RESERVE_MIN = '0.00005';

  var lecteurCache = null, paireCache = null, minuterie = null;
  var champ = null, sortie = null, bouton = null, corps = null;
  var derniereCote = null;   // la cotation affichee, quand on paie en ETH

  function $(id) { return document.getElementById(id); }

  function fmtBig(n) {
    n = parseFloat(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'k';
    return (Math.round(n * 100) / 100).toString();
  }

  /* ------------------------------------------------------------------ chaine
   * Un lecteur a nous : les cotations doivent s'afficher AVANT toute
   * connexion. Quelqu'un qui decouvre le site voit le prix sans rien signer. */
  function lecteur() {
    if (!lecteurCache) lecteurCache = new ethers.providers.JsonRpcProvider(RPC);
    return lecteurCache;
  }

  function paire() {
    if (paireCache) return Promise.resolve(paireCache);
    return new ethers.Contract(FACTORY, FACTORY_ABI, lecteur()).getPair(WETH, SWOGE)
      .then(function (a) {
        if (!a || /^0x0+$/.test(a)) throw new Error('no pool');
        paireCache = new ethers.Contract(a, PAIR_ABI, lecteur());
        return paireCache;
      });
  }

  /* Les reserves, dans l'ordre qui nous interesse : ETH d'abord, jeton
     ensuite. `token0` est celui des deux adresses qui est la plus petite en
     valeur — ce n'est pas forcement le WETH, et l'inverser afficherait un
     prix a l'envers. */
  function reserves() {
    var p;
    return paire().then(function (c) { p = c; return Promise.all([c.getReserves(), c.token0()]); })
      .then(function (r) {
        var res = r[0], t0 = String(r[1]).toLowerCase();
        return t0 === WETH.toLowerCase()
          ? { eth: res[0], jeton: res[1] }
          : { eth: res[1], jeton: res[0] };
      });
  }

  /* Le prix a vide : ce que vaudrait un achat infiniment petit. C'est la
     reference contre laquelle on mesure l'ecart. */
  function prixMilieu(r) {
    return parseFloat(ethers.utils.formatUnits(r.jeton, 18)) /
           parseFloat(ethers.utils.formatEther(r.eth));
  }

  function cote(montantWei) {
    var r;
    return reserves().then(function (x) {
      r = x;
      return new ethers.Contract(ROUTER, ROUTER_ABI, lecteur())
        .getAmountsOut(montantWei, [WETH, SWOGE]);
    }).then(function (amts) {
      var recu = amts[amts.length - 1];
      var recuN = parseFloat(ethers.utils.formatUnits(recu, 18));
      var sansImpact = parseFloat(ethers.utils.formatEther(montantWei)) * prixMilieu(r);
      var impact = sansImpact > 0 ? (1 - recuN / sansImpact) * 100 : 0;
      return { entree: montantWei, sortie: recu, sortieN: recuN, impact: impact };
    });
  }

  /* -------------------------------------------------------------- portefeuille
   * On ne demande jamais l'ouverture d'un portefeuille : on prend celui avec
   * lequel le joueur s'est DEJA connecte a la page. `swogeAuth` dit lequel. */
  function portefeuille() {
    var mode = '';
    try { mode = localStorage.getItem('swogeAuth') || ''; } catch (e) {}
    if (mode === 'email' && window.SwogePrivy && SwogePrivy.getAddress && SwogePrivy.getAddress()) {
      return Promise.resolve({ eip1193: SwogePrivy.getProvider(), adresse: SwogePrivy.getAddress() });
    }
    if (window.ethereum) {
      return window.ethereum.request({ method: 'eth_accounts' }).then(function (cs) {
        if (!cs || !cs.length) return null;
        return { eip1193: window.ethereum, adresse: cs[0] };
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  /* ---- LA BARRE ET LES TITRES, SUR TELEPHONE ----
   *
   * Quatre choses occupaient le haut de chaque page pour dire ou l'on est,
   * alors qu'une seule suffit :
   *
   *   • le nom du jeu dans la barre — il est ecrit en grand juste dessous ;
   *   • le titre de la page lui-meme, souvent une image de cent pixels ;
   *   • le mot « $SWOGE » a cote du solde — la pastille est doree, elle est
   *     seule, et celle d'a cote commence par un dollar ;
   *   • quinze pixels de rembourrage vertical dans la barre.
   *
   * Ensemble, une centaine de pixels sur un ecran qui en a 844.
   *
   * ---- pourquoi ce style-la est pose TOUT DE SUITE ----
   *
   * Il vivait avec celui de la pastille en dollars, donc derriere le meme
   * garde-fou : « pas d'ethers, pas de portefeuille, on s'arrete ». Le jour ou
   * le CDN d'ethers repond lentement — ou pas du tout — la page gardait son
   * titre, sa barre epaisse et son mot en trop. Une mise en page ne doit
   * dependre d'aucune bibliotheque de portefeuille.
   */
  (function chromeMobile() {
    var css = document.createElement('style');
    css.id = 'swb-mob';
    css.textContent =
      '@media (max-width:640px){' +
        'nav .brand>span{display:none;}' +
        'nav{padding-top:8px!important;padding-bottom:8px!important;}' +
        '.swlbl{display:none;}' +
        '.hero h1,.hero p{display:none!important;}' +
        '.hero{padding:0!important;}' +
      '}';
    (document.head || document.documentElement).appendChild(css);
  })();

  /* Le mot « $SWOGE » colle au solde est un NOEUD DE TEXTE nu : aucune regle de
     style ne peut l'atteindre. On l'enveloppe des que la pastille existe — et
     l'envelopper plutot que l'effacer le rend a la rotation de l'ecran sans
     avoir a le reconstruire. Pose ici aussi, hors du garde-fou d'ethers. */
  function poseLabel() {
    var bal = document.getElementById('bal');
    if (!bal) return false;
    var a = (bal.closest && bal.closest('.chip, .stat, .balance, .bal, .solde')) || bal.parentElement;
    if (!a || a.querySelector('.swlbl')) return !!a;
    for (var k = a.childNodes.length - 1; k >= 0; k--) {
      var nd = a.childNodes[k];
      if (nd.nodeType === 3 && /\$?SWOGE/i.test(nd.nodeValue || '')) {
        var lbl = document.createElement('span');
        lbl.className = 'swlbl';
        lbl.textContent = nd.nodeValue;
        a.replaceChild(lbl, nd);
      }
    }
    return true;
  }
  (function attendLabel() {
    if (poseLabel()) return;
    var obs = new MutationObserver(function () { if (poseLabel()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 20000);
  })();

  /* ------------------------------------------- ce que le solde vaut en dollars
   *
   * La barre affiche « 412.5k $SWOGE ». Personne ne sait ce que ca pese : le
   * jeton n'a pas de cours de reference dans la tete des gens, et c'est le
   * seul montant du site qu'on regarde a chaque instant. Une pastille de plus,
   * a cote, donne la somme en dollars.
   *
   * ---- d'ou vient le prix ----
   *
   * De deux sources qu'on a deja, multipliees :
   *
   *   • combien de $SWOGE vaut un ETH — la reserve de la paire, lue sur la
   *     chaine par `reserves()`, celle-la meme qui sert a coter un achat ;
   *   • combien vaut un ETH en dollars — une cotation Relay d'un ETH, la meme
   *     route que le pont de depot.
   *
   * Aucune des deux n'est un oracle de prix, et c'est assume : ce qu'on affiche
   * est ce que le joueur obtiendrait REELLEMENT en vendant sur cette paire-la,
   * ce qui est plus honnete qu'un cours de place ou personne ne peut echanger.
   * D'ou le « ≈ ».
   *
   * ---- ce qui se passe quand ca echoue ----
   *
   * Rien. Pas de cle Relay, pas de portefeuille, reserve vide, RPC muet : la
   * pastille ne s'affiche pas. Elle ne doit jamais empecher de lire son solde.
   */
  var TAUX = null, tauxQuand = 0, pastilleUsd = null;
  var TAUX_TTL = 5 * 60 * 1000;        // le cours d'un jeton ne change pas a la seconde

  function dollarsParSwoge() {
    if (TAUX !== null && Date.now() - tauxQuand < TAUX_TTL) return Promise.resolve(TAUX);
    return Promise.all([
      reserves(),
      /* AUCUN PORTEFEUILLE REQUIS. Chiffrer un ETH en dollars ne verse rien a
         personne : le serveur se sert de l'adresse nulle, valide sur la chaine
         d'arrivee. L'exiger privait de la pastille tous ceux qui jouent dans le
         webview Telegram ou se connectent par e-mail — c'est-a-dire la plupart —
         sans que rien ne le dise, puisqu'un chiffrage rate n'affiche rien. */
      fetch(base() + '/relay/prix?de=eth&montant=1')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }),
    ]).then(function (x) {
      var r = x[0], j = x[1];
      if (!r || !j || j.dollarsEnvoi == null) return null;
      var swogeParEth = prixMilieu(r);                 // $SWOGE pour 1 ETH
      var dollarsParEth = parseFloat(j.dollarsEnvoi);  // $ pour 1 ETH
      if (!(swogeParEth > 0) || !(dollarsParEth > 0)) return null;
      TAUX = dollarsParEth / swogeParEth;
      tauxQuand = Date.now();
      return TAUX;
    }).catch(function () { return null; });
  }

  function sommeUsd(v) {
    if (!(v >= 0)) return '';
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    if (v >= 1) return '$' + v.toFixed(2);
    if (v > 0) return '$' + v.toFixed(4);
    return '$0';
  }

  /* Le solde est ecrit par la page dans #bal, a chaque manche. On l'observe au
     lieu de s'accrocher a chaque jeu : il y a seize facons de gagner des
     jetons sur ce site, et une seule case ou le total finit par s'ecrire. */
  function poseUsd() {
    var bal = $('bal');
    if (!bal || pastilleUsd) return;
    var ancre = (bal.closest && bal.closest('.chip, .stat, .balance, .bal, .solde')) || bal.parentElement;
    if (!ancre || !ancre.parentElement) return;
    var css = document.createElement('style');
    css.textContent =
      '.swusd{display:none;align-items:center;vertical-align:middle;margin-left:8px;' +
      'padding:5px 11px;border-radius:999px;font-family:inherit;font-size:12.5px;' +
      'font-weight:800;line-height:1;white-space:nowrap;color:#BFE9CF;' +
      'background:rgba(18,44,32,.72);border:1px solid rgba(124,255,155,.28);}' +
      '.swusd.on{display:inline-flex;}' +
      '@media (max-width:520px){.swusd{font-size:10.5px;padding:3px 8px;margin-left:5px;}}' +
      /* ---- ELLE NE S'EFFACE PLUS QUAND LA PLACE MANQUE ----
         Premiere version : au premier cran de repli, la pastille disparaissait
         « parce que le solde en jetons passe avant sa conversion ». Sauf que le
         cran se declenchait sur toutes les pages de jeu, donc elle ne
         s'affichait jamais sur telephone — c'est-a-dire la ou l'on en a le plus
         besoin, faute de place pour lire quoi que ce soit d'autre.
         Ce qui saute a la place, c'est LE NOM DU JEU dans la barre. Il est
         ecrit en grand deux lignes plus bas, sur la page elle-meme, et il
         occupait la moitie de la largeur pour redire ou l'on est. */
      'html.swtight .swusd{font-size:10px!important;padding:3px 6px!important;' +
      'margin-left:4px!important;}' +
      '';
    document.head.appendChild(css);
    poseLabel();
    pastilleUsd = document.createElement('span');
    pastilleUsd.className = 'swusd';
    pastilleUsd.title = 'Roughly what your balance is worth, at the pool price';
    ancre.parentElement.insertBefore(pastilleUsd, ancre.nextSibling);
    var obs = new MutationObserver(majUsd);
    obs.observe(bal, { childList: true, characterData: true, subtree: true });
    majUsd();
  }

  /* « 412.5k » ne se relit pas : on defait le suffixe pour retrouver le nombre.
     C'est le prix a payer pour lire un affichage plutot qu'une variable — et il
     est moindre que celui de brancher seize jeux. */
  function litSolde() {
    var bal = $('bal');
    var t = (bal && bal.textContent || '').trim().replace(/[\s,]/g, '');
    var m = /^(-?[\d.]+)([kKmMbB])?$/.exec(t);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return null;
    var mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
    return n * mult;
  }

  function majUsd() {
    if (!pastilleUsd) return;
    var n = litSolde();
    if (n === null) { pastilleUsd.classList.remove('on'); return; }
    dollarsParSwoge().then(function (t) {
      if (t === null) { pastilleUsd.classList.remove('on'); return; }
      var s = sommeUsd(n * t);
      if (!s) { pastilleUsd.classList.remove('on'); return; }
      pastilleUsd.textContent = '\u2248 ' + s;
      pastilleUsd.classList.add('on');
    });
  }

  /* ------------------------------------------------------------------- l'ecran */
  function styles() {
    if ($('swb-css')) return;
    var css = document.createElement('style');
    css.id = 'swb-css';
    css.textContent =
      '.swb{margin:0 0 12px;border:1px solid rgba(230,165,55,.34);border-radius:12px;' +
      'background:linear-gradient(180deg,rgba(230,165,55,.10),rgba(230,165,55,.03));overflow:hidden;}' +
      '.swb-h{display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer;' +
      'font-size:12.5px;font-weight:700;color:#E6A537;user-select:none;white-space:nowrap;}' +
      '.swb-h span{margin-left:auto;font-size:11px;font-weight:600;opacity:.8;white-space:nowrap;}' +
      '.swb-b{padding:0 11px 11px;}' +
      '.swb-b.plie{display:none;}' +
      '.swb-r{display:flex;gap:6px;align-items:center;margin-bottom:7px;}' +
      '.swb-r input{flex:1;min-width:0;}' +
      '.swb-r b{font-size:12px;color:#E6A537;}' +
      '.swb-p{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;}' +
      '.swb-p button{flex:1;min-width:0;padding:5px 2px;font-size:11px;font-weight:700;' +
      'border-radius:8px;border:1px solid rgba(230,165,55,.35);background:rgba(0,0,0,.28);' +
      'color:#E6C98A;cursor:pointer;}' +
      '.swb-p button:hover{background:rgba(230,165,55,.16);}' +
      '.swb-q{font-size:11.5px;line-height:1.5;color:#D8D2C4;min-height:34px;}' +
      '.swb-q b{color:#F2C868;}' +
      '.swb-w{font-size:11.5px;line-height:1.45;margin-top:5px;color:#E8913F;}' +
      '.swb-w.dur{color:#E5533F;}' +
      '.swb-ok{font-size:11.5px;line-height:1.45;margin-bottom:5px;color:#7BD88F;font-weight:700;}' +
      '.swb-pont{margin-top:8px;}' +
      '.swb-usd{min-height:15px;margin:5px 2px 0;font-size:12px;font-weight:700;' +
      'letter-spacing:.2px;color:#8DA0C4;}' +
      '.swb-usd b{color:#FFD97A;font-weight:800;}' +
      '.swb-usd .sep{opacity:.5;margin:0 6px;}' +
      '.swb-pont .swb-q{min-height:0;margin-top:7px;}' +
      '.swb-adr{margin-top:7px;padding:8px 9px;border-radius:9px;border:1px dashed rgba(160,160,190,.45);' +
      'background:rgba(0,0,0,.34);font-size:11px;line-height:1.5;color:#E7E3F2;word-break:break-all;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}' +
      '.swb-cop{margin-top:6px;width:100%;padding:7px;border-radius:9px;cursor:pointer;' +
      'font-size:11.5px;font-weight:700;border:1px solid rgba(160,160,190,.35);' +
      'background:rgba(0,0,0,.28);color:#CFCADF;}' +
      '.swb-ret{display:inline-block;margin-top:8px;font-size:11px;color:#9E97B5;cursor:pointer;' +
      'text-decoration:underline;}' +
      '.swb-go{width:100%;margin-top:9px;padding:9px;border-radius:10px;border:0;cursor:pointer;' +
      'font-weight:800;font-size:13px;color:#231a06;background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swb-go[disabled]{opacity:.55;cursor:default;}' +
      '.swb-x{margin-top:10px;padding-top:9px;border-top:1px solid rgba(230,165,55,.22);}' +
      '.swb-x p{margin:0 0 6px;font-size:11px;line-height:1.45;color:#B9B2A2;}' +
      '.swb-x div{display:flex;gap:5px;flex-wrap:wrap;}' +
      /* DEUX par ligne, pas trois. A trois, sur un telephone de 390 pixels, la
         tuile fait 74 pixels : l'icone en prend 20 et « Ethereum » se termine
         en points de suspension. Un nom coupe est pire qu'un symbole. */
      '.swb-x button{flex:1 1 46%;min-width:0;display:flex;align-items:center;' +
      'justify-content:center;gap:5px;padding:6px 4px;font-size:11px;font-weight:700;' +
      'border-radius:8px;border:1px solid rgba(160,160,190,.32);background:rgba(0,0,0,.28);' +
      'color:#CFCADF;cursor:pointer;text-transform:none;letter-spacing:normal;}' +
      '.swb-x button img{width:15px;height:15px;flex:none;display:block;}' +
      '.swb-x button span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.swb-x button:hover{background:rgba(160,160,190,.16);}' +
      /* `.swb .swb-c` et pas `.swb-c` : les pages habillent leurs etiquettes
         par `.box label{...}` — majuscules, lettres espacees, centrees — et
         une regle a deux crans bat une regle a un cran. Sans ce poids, la case
         se retrouvait seule sur sa ligne, au milieu, en capitales. */
      '.swb label.swb-c{display:flex;align-items:center;gap:7px;margin:8px 0 0;padding:0;' +
      'font-size:11.5px;font-weight:500;line-height:1.35;color:#C9C2B2;cursor:pointer;' +
      'user-select:none;text-transform:none;letter-spacing:normal;text-align:left;}' +
      '.swb label.swb-c input{width:14px;height:14px;flex:none;margin:0;padding:0;cursor:pointer;}' +
      /* Le texte va dans un <span> a lui. Les pages habillent leurs etiquettes
         par `#box-dep label{...}` — un identifiant, qu'aucune combinaison de
         classes ne rattrape. Un span a l'interieur n'est vise par personne, et
         c'est la seule facon d'en sortir sans surenchere de `!important`. */
      '.swb .swb-ct{flex:1;text-align:left;text-transform:none;letter-spacing:normal;' +
      'font-size:11.5px;font-weight:500;line-height:1.35;color:#C9C2B2;}' +
      /* Le choix de la devise : deux onglets, pas un menu deroulant. Il y a
         DEUX possibilites — les montrer toutes les deux coute une ligne et
         evite un clic pour decouvrir ce qu'il y a dedans. */
      '.swb-d{display:flex;gap:6px;margin-bottom:9px;}' +
      '.swb-d button{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;' +
      'gap:6px;padding:8px 6px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:800;' +
      'text-transform:none;letter-spacing:normal;border:1px solid rgba(230,165,55,.30);' +
      'background:rgba(0,0,0,.30);color:#B6AF9E;}' +
      '.swb-d button.on{border-color:#E6A537;color:#231a06;' +
      'background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swb-d button i{display:block;font-style:normal;font-size:10px;font-weight:600;opacity:.75;}' +
      '.swb-d button u{display:block;text-decoration:none;}' +
      '';
    document.head.appendChild(css);
  }

  /* Un bouton de provenance : sa marque, puis son nom. L'image est decorative
     — le nom est ecrit a cote — donc `alt` reste vide : un lecteur d'ecran qui
     annonce « image Solana Solana » est moins clair que « Solana ». */
  function bouton6(cle, nom) {
    var i = ICONES[cle];
    return '<button data-de="' + cle + '">' +
           (i ? '<img src="' + i + '" alt="" width="15" height="15">' : '') +
           '<span>' + nom + '</span></button>';
  }

  /* Les elements du formulaire d'origine qu'on remplace : le champ, son
     etiquette, la rangee de pourcentages et le bouton. Ils restent dans la
     page — le code de depot les lit — mais ils ne s'affichent plus.
   *
     ON ECRIT LE STYLE SUR L'ELEMENT, pas une classe. Une classe a un cran de
     specificite ; les pages portent des regles comme
     `#box-dep .abtn.aimg{display:block !important}`, qui en ont trois et un
     `!important` par-dessus. Mesure faite : avec une classe, le vieux bouton
     « DEPOSIT » restait affiche sous le nouveau. Un style pose sur l'element
     avec la priorite passe devant n'importe quelle feuille, et c'est le seul
     moyen qui ne demande pas de connaitre les treize pages par coeur. */
  function efface(el) {
    if (el) try { el.style.setProperty('display', 'none', 'important'); } catch (e) {}
  }

  function cacheAncien() {
    var champDep = $('depAmt');
    if (!champDep) return;
    var av = champDep.previousElementSibling;
    if (av && av.tagName === 'LABEL') efface(av);
    efface(champDep);
    var pct = champDep.parentNode.querySelector('.pcts, .dpct');
    if (pct) efface(pct.classList.contains('pcts') ? pct : pct.parentNode);
    /* Le bouton d'origine partage parfois sa rangee avec « Close » : on ne
       cache que lui, sinon on emporte la sortie du panneau avec. */
    efface($('depGo'));
  }

  function onglet(cle, nom, note) {
    var i = cle === 'eth' ? null : null;
    return '<button data-dev="' + cle + '"><span><u>' + nom + '</u>' +
           '<i id="swbSolde-' + cle + '">' + note + '</i></span></button>';
  }

  function poseBloc() {
    var ancre = $('depAmt');
    if (!ancre || $('swbAmt')) return false;
    var avant = ancre.previousElementSibling;
    if (avant && avant.tagName === 'LABEL') ancre = avant;

    styles();
    var bloc = document.createElement('div');
    bloc.className = 'swb';
    bloc.innerHTML =
      '<div class="swb-h">💰 Top up<span id="swbTaux">…</span></div>' +
      '<div class="swb-b" id="swbCorps">' +
        '<div class="swb-d" id="swbDev">' +
          onglet('swoge', '$SWOGE', '…') +
          onglet('eth', 'ETH · RH', '…') +
        '</div>' +
        '<div class="swb-r"><input id="swbAmt" inputmode="decimal" placeholder="0">' +
        '<b id="swbUnite">$SWOGE</b></div>' +
        '<div class="swb-p">' +
          '<button data-pc="10">10%</button>' +
          '<button data-pc="25">25%</button>' +
          '<button data-pc="50">50%</button>' +
          '<button data-pc="100">MAX</button>' +
        '</div>' +
        '<div class="swb-q" id="swbCote">Pick an amount.</div>' +
        '<button class="swb-go" id="swbGo">Deposit and play</button>' +
        '<div class="swb-x" id="swbAilleurs">' +
          '<p>No <b>ETH on Robinhood Chain</b> yet? Bring funds from another chain — ' +
          'arrives in seconds, straight to your address.</p>' +
          '<div>' +
            bouton6('sol', 'Solana') + bouton6('eth', 'Ethereum') +

          '</div>' +
          '<div class="swb-pont" id="swbPont" style="display:none">' +
            '<div class="swb-r"><input id="swbPontAmt" inputmode="decimal" placeholder="0">' +
            '<b id="swbPontUnite">SOL</b></div>' +
            /* La valeur en dollars a sa PROPRE ligne. La ligne d'etat en
               dessous est reecrite a chaque etape — « Getting an address… »,
               puis l'adresse et le suivi — et le chiffre y aurait disparu
               au moment ou l'on confirme le montant. */
            '<div class="swb-usd" id="swbPontUsd"></div>' +
            '<button class="swb-cop" id="swbPontGo">Get the address to send to</button>' +
            '<div class="swb-q" id="swbPontDit"></div>' +
            '<span class="swb-ret" id="swbPontRetour">← other chains</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    ancre.parentNode.insertBefore(bloc, ancre);
    cacheAncien();

    corps = $('swbCorps'); champ = $('swbAmt');
    sortie = $('swbCote');  bouton = $('swbGo');

    champ.addEventListener('input', function () {
      annonce = null;                       // il a repris la main
      clearTimeout(minuterie);
      minuterie = setTimeout(rafraichitCote, 320);
    });
    $('swbDev').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-dev]') : null;
      if (b) choisitDevise(b.getAttribute('data-dev'));
    });
    bloc.querySelector('.swb-p').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-pc]') : null;
      if (b) partDuSolde(parseInt(b.getAttribute('data-pc'), 10));
    });
    bouton.onclick = envoie;
    $('swbAilleurs').querySelector('div').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-de]') : null;
      if (b) ailleurs(b.getAttribute('data-de'));
    });
    $('swbPontGo').onclick = demandeAdresse;
    $('swbPontAmt').addEventListener('input', chiffre);
    $('swbPontRetour').onclick = fermePont;
    demandeProvenances();
    choisitDevise('swoge');
    montreTaux();
    lisSoldes();
    /* Le guet tourne DES L'OUVERTURE, pas seulement apres un clic sur une
       provenance. Le joueur peut avoir demande son adresse de depot hier, ou
       s'etre fait envoyer de l'ETH par un ami, ou avoir recharge la page
       pendant que le pont livrait : dans tous ces cas son ETH arrive sans que
       personne ne regarde, et il se retrouve devant un panneau qui n'a rien
       remarque. */
    portefeuille().then(function (w) { if (w) guette(w.adresse); }).catch(function () {});
    return true;
  }

  /* ------------------------------------------------------- la devise choisie
   *
   * Deux facons d'alimenter son compte, et une seule difference entre elles :
   * l'ETH passe par un echange avant d'entrer. Le reste du chemin est le meme,
   * donc l'ecran est le meme et le bouton dit la meme chose. */
  var devise = 'swoge';
  var soldes = { swoge: null, eth: null };

  function choisitDevise(d, garde) {
    if (!garde) annonce = null;
    devise = (d === 'eth') ? 'eth' : 'swoge';
    var bs = $('swbDev').querySelectorAll('button[data-dev]');
    for (var i = 0; i < bs.length; i++)
      bs[i].classList.toggle('on', bs[i].getAttribute('data-dev') === devise);
    /* « ETH » tout court est ambigu et l'ambiguite coute cher ici : l'onglet
       parle de l'ETH DEJA SUR Robinhood Chain, la tuile « Ethereum » plus bas
       parle de l'ETH du reseau principal. Deux choses differentes, le meme mot.
       On nomme donc la chaine partout ou le mot apparait. */
    $('swbUnite').textContent = devise === 'eth' ? 'ETH (RH)' : '$SWOGE';
    champ.value = '';
    rafraichitCote();
  }

  /* Les deux soldes du PORTEFEUILLE. Ils s'affichent sous chaque onglet :
     sans eux, le joueur choisit une devise pour decouvrir ensuite qu'il n'en a
     pas, et repart en arriere. */
  function lisSoldes() {
    portefeuille().then(function (w) {
      if (!w) { montreSoldes(); return; }
      return Promise.all([
        lecteur().getBalance(w.adresse),
        new ethers.Contract(SWOGE, ERC20_ABI, lecteur()).balanceOf(w.adresse)
      ]).then(function (x) {
        soldes.eth = x[0]; soldes.swoge = x[1];
        montreSoldes();
        rafraichitSoldes(w.adresse);
      });
    }).catch(function () {});
  }

  function montreSoldes() {
    var a = $('swbSolde-swoge'), b = $('swbSolde-eth');
    if (a) a.textContent = soldes.swoge === null ? 'connect'
      : fmtBig(parseFloat(ethers.utils.formatUnits(soldes.swoge, 18))) + ' in wallet';
    if (b) b.textContent = soldes.eth === null ? 'connect'
      : trim(ethers.utils.formatEther(soldes.eth), 4) + ' in wallet';
  }

  /* Une part du solde. Pour l'ETH on retire d'abord la reserve de gaz : « 100 %
     du solde » qui ne laisse pas de quoi payer le depot n'est pas 100 % utile. */
  function partDuSolde(pc) {
    lisSoldes();
    var dispo = devise === 'eth' ? soldes.eth : soldes.swoge;
    if (dispo === null) { dis('Connect your wallet first.'); return; }
    if (devise === 'eth') {
      reserveGaz().then(function (gaz) {
        var utile = dispo.sub(gaz);
        if (utile.lte(0)) { dis('Not enough ETH once the gas reserve is set aside.'); return; }
        champ.value = trim(ethers.utils.formatEther(utile.mul(pc).div(100)), 6);
        rafraichitCote();
      });
      return;
    }
    if (dispo.lte(0)) { dis('No $SWOGE in your wallet — switch to ETH, or bring funds from another chain.'); return; }
    champ.value = trim(ethers.utils.formatUnits(dispo.mul(pc).div(100), 18), 6);
    rafraichitCote();
  }

  /* Le taux dans l'en-tete : il donne une raison d'ouvrir le panneau sans
     avoir a taper quoi que ce soit. */
  function montreTaux() {
    reserves().then(function (r) {
      var t = $('swbTaux');
      if (t) t.textContent = '1 ETH (RH) ≈ ' + fmtBig(prixMilieu(r));
    }).catch(function () {});
  }

  function reserveGaz() {
    return lecteur().getGasPrice().then(function (g) {
      var calcule = g.mul(1000000);                       // de quoi approuver + deposer
      var plancher = ethers.utils.parseEther(GAZ_RESERVE_MIN);
      return calcule.gt(plancher) ? calcule : plancher;
    }).catch(function () { return ethers.utils.parseEther(GAZ_RESERVE_MIN); });
  }

  /* Tronquer, jamais arrondir : un arrondi vers le haut redemande plus que ce
     qu'on a et la transaction echoue au dernier moment. Et on enleve les zeros
     de queue : « 1000.0 » dans un champ de saisie donne l'impression qu'on a
     touche au chiffre. */
  function trim(s, n) {
    var i = s.indexOf('.');
    if (i >= 0) s = s.slice(0, i + 1 + n);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /* L'annonce d'arrivee doit survivre a la cotation qui la suit.
   *
   * Mesure : le guet ecrivait « 0,15 ETH just landed », puis appelait la
   * cotation, qui ecrivait « Checking the pool… » dans le meme tour de boucle.
   * L'annonce n'existait donc pendant AUCUNE image a l'ecran — le joueur ne
   * voyait jamais que son argent etait arrive, ce qui est precisement la seule
   * chose que ce guet existe pour dire. Elle est donc rangee a part et
   * reaffichee en tete, jusqu'au prochain geste du joueur. */
  var annonce = null;

  function dis(html) {
    if (!sortie) return;
    sortie.innerHTML = (annonce ? '<div class="swb-ok">' + annonce + '</div>' : '') + html;
  }

  function lit() {
    var s = (champ.value || '').replace(',', '.').trim();
    if (!s) return null;
    try {
      var w = ethers.utils.parseUnits(s, 18);      // les deux ont 18 decimales
      return w.lte(0) ? null : w;
    } catch (e) { return null; }
  }

  /* Ce qui va se passer, ecrit avant que ca se passe.
   *
   * En $SWOGE il n'y a rien a calculer : le montant entre tel quel. En ETH il
   * y a un echange, donc un prix, donc un ecart — et cet ecart, c'est le
   * joueur qui le paie. On l'affiche AVANT le clic, pas dans le recu. */
  function rafraichitCote() {
    var montant = lit();
    derniereCote = null;
    if (!montant) { dis('Pick an amount.'); return; }

    if (devise === 'swoge') {
      var n = parseFloat(ethers.utils.formatUnits(montant, 18));
      var txt = 'Deposits <b>' + fmtBig(n) + ' $SWOGE</b> into your game balance. ' +
                'Nothing is swapped, nothing is lost on the way.';
      if (soldes.swoge && montant.gt(soldes.swoge))
        txt += '<div class="swb-w">That is more than the ' +
               fmtBig(parseFloat(ethers.utils.formatUnits(soldes.swoge, 18))) +
               ' $SWOGE in your wallet.</div>';
      dis(txt);
      return;
    }

    dis('Checking the pool…');
    cote(montant).then(function (c) {
      derniereCote = c;
      var mini = c.sortie.mul(10000 - TOLERANCE_BPS).div(10000);
      var txt = 'Spends your <b>ETH on Robinhood Chain</b> to buy ≈ <b>' +
                fmtBig(c.sortieN) + ' $SWOGE</b> and deposits it — ' +
                'at least ' + fmtBig(parseFloat(ethers.utils.formatUnits(mini, 18))) +
                ' after slippage.<br>Price impact <b>' + c.impact.toFixed(2) + '%</b>.';
      /* L'avertissement n'est pas decoratif : au-dela de quelques centiemes
         d'ETH le joueur paie l'ecart, pas la maison.
       *
         Et le conseil doit etre VRAI. « Coupez l'ordre en morceaux » est le
         reflexe, et il est faux : sur une courbe x·y=k, cinq achats de 0,1
         ETH a la suite rendent 60 545 896 jetons la ou un seul achat de 0,5
         en rend 60 558 816 — moins 0,02 %, parce que les frais se cumulent et
         que la reserve ne se remplit pas entre deux clics. Ce qui aide, c'est
         le TEMPS. */
      if (c.impact >= 12) {
        txt += '<div class="swb-w dur">Thin pool — this order alone moves the price by ' +
               c.impact.toFixed(1) + '%, and that cost is yours. Splitting it into back-to-back ' +
               'buys changes nothing: the pool does not refill in between. Deposit less, or ' +
               'spread it over days.</div>';
      } else if (c.impact >= 4) {
        txt += '<div class="swb-w">Sizeable order for this pool: ' + c.impact.toFixed(1) +
               '% goes to the curve, not to the game. A smaller top-up today and another one ' +
               'later costs you less.</div>';
      }
      dis(txt);
    }).catch(function (e) {
      dis('Price unavailable right now — ' + String(e.message || e).slice(0, 70));
    });
  }

  /* ---------------------------------------------------------- LE SERVEUR
   *
   * Meme convention que stakebubble.js : l'adresse du serveur peut etre
   * remplacee par `?server=` pour une recette, sinon c'est la production. */
  function adresseServeur() {
    try {
      var q = new URLSearchParams(location.search).get('server');
      if (q) return q;
    } catch (e) {}
    return 'wss://web-production-220a3.up.railway.app';
  }
  function base() { return adresseServeur().replace(/^ws/, 'http').replace(/\/+$/, ''); }

  /* Le serveur a-t-il la cle Relay ? On le demande AVANT de proposer quoi que
     ce soit : sans elle on peut encore envoyer le joueur sur relay.link, ce qui
     marche, mais ce n'est pas la meme promesse et le bouton ne doit pas mentir
     sur ce qui va se passer. */
  var pontActif = false, bornes = {};
  function demandeProvenances() {
    fetch(base() + '/relay/depuis').then(function (r) { return r.json(); }).then(function (j) {
      pontActif = !!j.actif;
      (j.provenances || []).forEach(function (p) { bornes[p.cle] = p; });
      var t = $('swbAilleurs');
      if (t) t.querySelector('p').textContent = pontActif
        ? 'Nothing on Robinhood Chain yet? Send from another chain — no wallet to connect, '
          + 'works straight from an exchange withdrawal.'
        : 'Nothing on Robinhood Chain yet? Bring funds from another chain — arrives in '
          + 'seconds, straight to your address.';
    }).catch(function () {});
  }

  /* ================== VENIR D'UNE AUTRE CHAINE ==================
   *
   * Deux chemins, et le second n'existe que si le serveur porte la cle.
   *
   *   • SANS CLE : on ouvre relay.link, prerempli avec l'adresse du joueur. Ca
   *     marche, mais ca le fait sortir du site.
   *   • AVEC CLE : Relay rend une ADRESSE DE DEPOT. Le joueur y envoie ses SOL
   *     depuis son portefeuille OU depuis son compte d'echange — rien a
   *     connecter, rien a signer — et l'ETH arrive a son adresse ici. C'est le
   *     seul chemin qui serve aussi ceux qui gardent tout sur un echange.
   *
   * Dans les deux cas l'argent ne passe jamais par nous.
   */
  var RELAY = 'https://relay.link/bridge/robinhood';
  var NATIF = '0x0000000000000000000000000000000000000000';
  /* DEUX PROVENANCES, ET C'EST VOULU. Vingt-quatre chaines ont une route vers
     Robinhood Chain, mais chaque tuile de plus dilue celles qui servent : ceux
     qui tiennent leur ETH sur le reseau principal, et ceux qui n'ont pas d'ETH
     du tout. Le reste s'ajoute en une ligne le jour ou on le demande.
   *
     CE QUI NE PEUT PAS Y ETRE, ET POURQUOI. Chacune a rendu une vraie adresse de
     depot sur la production ; les trois qui manquaient ont ete retirees parce
     qu'elles ne le pouvaient pas :
   *
       • le bitcoin : aucune route, a aucun montant ;
       • le TRON : le repere de repli n'est pas accepte pour sa machine
         virtuelle, et on n'a pas d'adresse TRON du joueur a mettre a la place ;
       • « Other chain » : il ouvrait le choix complet chez Relay, donc aussi
         les soixante chaines dont on ne sait pas si elles aboutissent. Envoyer
         quelqu'un choisir une provenance qui echouera ensuite est pire que ne
         pas la proposer.
   *
     Un bouton qui echoue toujours est pire que pas de bouton : le joueur croit
     que c'est lui qui s'y prend mal. */
  var DEPUIS = {
    sol:   { chaine: 792703809, jeton: '11111111111111111111111111111111', unite: 'SOL' },
    /* Ici « ETH » designe celui du RESEAU PRINCIPAL, pas celui de Robinhood
       Chain : c'est ce qu'on envoie, pas ce qu'on recoit. */
    eth:   { chaine: 1,         jeton: NATIF, unite: 'ETH (mainnet)' },
  };

  var pontCle = null;

  function ailleurs(cle) {
    var d = DEPUIS[cle];
    /* « Other chain » n'a pas de route a nous : il n'y a rien a lui demander,
       on ouvre le choix complet chez Relay. */
    if (pontActif && d) return ouvrePont(cle);
    portefeuille().then(function (w) {
      var u = RELAY + '?toCurrency=' + NATIF;
      if (d) u += '&fromChainId=' + d.chaine + '&fromCurrency=' + encodeURIComponent(d.jeton);
      /* L'adresse d'arrivee est celle du joueur. Sans elle il faudrait la
         recopier a la main, et une adresse recopiee a la main est la seule
         etape de tout ce parcours ou l'on peut perdre son argent. */
      if (w) u += '&toAddress=' + w.adresse;
      if (w) guette(w.adresse);
      window.open(u, '_blank', 'noopener');
      if (!w) {
        dis('Connect your wallet first and press again — otherwise you have to ' +
            'retype your address over there, and that is the one step where money gets lost.');
      }
    }).catch(function () { window.open(RELAY, '_blank', 'noopener'); });
  }

  function ouvrePont(cle) {
    pontCle = cle;
    var b = bornes[cle] || {};
    $('swbPontUnite').textContent = DEPUIS[cle].unite;
    $('swbPontAmt').value = '';
    $('swbPontAmt').placeholder = b.min != null ? String(b.min) : '0';
    $('swbPontDit').innerHTML = b.min != null
      ? 'Between ' + b.min + ' and ' + b.max + ' ' + b.symbole + '.' : '';
    $('swbAilleurs').querySelector('div').style.display = 'none';
    $('swbAilleurs').querySelector('p').style.display = 'none';
    ditPrix('');
    $('swbPont').style.display = '';
    $('swbPontAmt').focus();
  }

  /* ------------------------------------------- ce que vaut ce qu'on tape
   *
   * « 0,05 » ne dit rien. Le joueur saisit un nombre de SOL ou d'ETH et
   * n'avait aucun moyen de savoir s'il venait d'engager dix dollars ou mille
   * — c'est le seul champ de tout le site ou l'on tape une somme sans voir
   * ce qu'elle pese.
   *
   * Le chiffrage est AMORTI : on attend 500 ms sans frappe avant de demander.
   * Sans ca, « 0.05 » ferait quatre appels a Relay, dont trois pour des
   * montants que personne n'a voulu envoyer.
   *
   * Et il ne bloque RIEN. Si le serveur n'a pas de cle, si Relay ne repond
   * pas, si le montant est hors bornes : la ligne reste vide et le bouton
   * fonctionne comme avant. C'est un confort, pas une etape.
   */
  var minuteriePrix = null, prixJeton = 0;
  function ditPrix(html) { var e = $('swbPontUsd'); if (e) e.innerHTML = html || ''; }
  function chiffre() {
    clearTimeout(minuteriePrix);
    if (!pontCle) return ditPrix('');
    var m = ($('swbPontAmt').value || '').replace(',', '.').trim();
    if (!m || !/^\d*\.?\d*$/.test(m) || parseFloat(m) > 0 === false) return ditPrix('');
    var b = bornes[pontCle] || {};
    var n = parseFloat(m);
    /* Hors bornes, on ne demande rien : Relay refuserait, et la ligne dirait
       « erreur » la ou le message d'aide dit deja quoi faire. */
    if (b.min != null && (n < b.min || n > b.max)) return ditPrix('');
    ditPrix('<span class="sep">…</span>');
    var jeton = ++prixJeton;
    minuteriePrix = setTimeout(function () {
      /* L'ADRESSE DU JOUEUR PART AVEC LA DEMANDE. Le chiffrage est une cotation
         de la meme route que le depot, et Relay valide le destinataire contre
         la chaine d'arrivee : sans elle, le serveur devait inventer une adresse
         — et celle qu'il inventait n'etait valide que pour Ethereum. Depuis
         Solana la ligne restait vide, sans que rien ne le dise. */
      /* L'adresse part QUAND ON L'A — c'est la route reelle, donc le chiffre le
         plus juste. Quand on ne l'a pas, on chiffre quand meme : le serveur
         retombe sur l'adresse nulle, et un joueur sans portefeuille connecte
         doit pouvoir savoir ce que vaut son montant AVANT de se connecter. */
      portefeuille().catch(function () { return null; }).then(function (w) {
        return fetch(base() + '/relay/prix?de=' + encodeURIComponent(pontCle) +
            (w ? '&vers=' + w.adresse : '') + '&montant=' + encodeURIComponent(m))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          /* Une reponse arrivee APRES qu'on a retape n'a plus rien a dire : le
             jeton garantit que c'est bien la derniere demande qui s'affiche,
             et pas la plus lente. */
          if (jeton !== prixJeton || !j) return ditPrix('');
          var g = [];
          if (j.dollarsEnvoi != null) g.push('≈ <b>' + dollars(j.dollarsEnvoi) + '</b>');
          if (j.recoit != null) g.push('you get ≈ <b>' + trim(String(j.recoit), 6) + ' ETH</b>' +
                                       (j.dollars != null ? ' (' + dollars(j.dollars) + ')' : ''));
          ditPrix(g.join('<span class="sep">·</span>'));
        });
      }).catch(function () { if (jeton === prixJeton) ditPrix(''); });
    }, 500);
  }
  /* Deux decimales au-dessus d'un dollar, quatre en dessous : « $0.00 » pour
     un envoi de test ferait croire que rien n'arrive. */
  function dollars(v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return '';
    return '$' + (n >= 1 ? n.toFixed(2) : n.toFixed(4)).replace(/\B(?=(\d{3})+(?!\d))/, ',');
  }

  function fermePont() {
    pontCle = null;
    clearTimeout(minuteriePrix); prixJeton++; ditPrix('');
    $('swbPont').style.display = 'none';
    $('swbAilleurs').querySelector('div').style.display = '';
    $('swbAilleurs').querySelector('p').style.display = '';
  }

  var suivi = null;
  function demandeAdresse() {
    if (!pontCle) return;
    var m = ($('swbPontAmt').value || '').replace(',', '.').trim();
    if (!m) { $('swbPontDit').textContent = 'Enter how much you will send.'; return; }
    var go = $('swbPontGo');
    go.disabled = true;
    $('swbPontDit').textContent = 'Getting an address…';
    portefeuille().then(function (w) {
      if (!w) throw new Error('Connect your wallet first — the address has to be yours.');
      /* Le guet est arme AVANT : le pont peut livrer en trois secondes, plus
         vite que le joueur ne revient sur l'onglet. */
      guette(w.adresse);
      return fetch(base() + '/relay/depot?de=' + encodeURIComponent(pontCle) +
                   '&vers=' + w.adresse + '&montant=' + encodeURIComponent(m))
        .then(function (r) { return r.json().then(function (j) { return { code: r.status, j: j }; }); })
        .then(function (x) {
          if (x.code !== 200) throw new Error(x.j && x.j.error ? x.j.error : 'not available');
          montreAdresse(x.j);
        });
    }).catch(function (e) {
      $('swbPontDit').textContent = String(e.message || e).slice(0, 160);
    }).then(function () { go.disabled = false; });
  }

  function montreAdresse(r) {
    var recu = r.recoit ? ' You get ≈ <b>' + trim(String(r.recoit), 6) + ' ETH on Robinhood Chain</b>' +
                          (r.dollars != null ? ' (' + dollars(r.dollars) + ')' : '') +
                          (r.secondes ? ', usually in ' + r.secondes + 's.' : '.') : '';
    /* Le chiffrage du montant envoye reste affiche au-dessus de l'adresse.
       C'est l'instant ou l'on copie une adresse pour y envoyer de l'argent :
       c'est le pire moment pour retirer de l'ecran ce que la somme vaut. */
    if (r.dollarsEnvoi != null)
      ditPrix('≈ <b>' + dollars(r.dollarsEnvoi) + '</b>');
    $('swbPontDit').innerHTML =
      'Send <b>' + r.envoie + ' ' + r.symbole + '</b> to this address — from your wallet or ' +
      'straight from an exchange withdrawal.' + recu +
      '<div class="swb-adr" id="swbAdr">' + r.adresse + '</div>' +
      '<button class="swb-cop" id="swbCop">Copy the address</button>' +
      '<div class="swb-q" id="swbEtat">Waiting for your transfer…</div>';
    $('swbCop').onclick = function () {
      var t = r.adresse;
      var fini = function () { $('swbCop').textContent = 'Copied ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(t).then(fini).catch(function () {});
      else {
        var z = document.createElement('textarea');
        z.value = t; document.body.appendChild(z); z.select();
        try { document.execCommand('copy'); fini(); } catch (e) {}
        document.body.removeChild(z);
      }
    };
    if (r.id) suitEnvoi(r.id);
  }

  /* On regarde ou en est l'envoi. Sans ca, le joueur a une adresse et aucune
     idee de ce qui se passe apres — et c'est le moment ou il a le plus besoin
     qu'on lui parle, puisque son argent est en vol. */
  function suitEnvoi(id) {
    if (suivi) clearInterval(suivi);
    var limite = Date.now() + 30 * 60000;
    suivi = setInterval(function () {
      if (Date.now() > limite) { clearInterval(suivi); suivi = null; return; }
      fetch(base() + '/relay/etat?id=' + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var e = $('swbEtat');
          if (!e) { clearInterval(suivi); suivi = null; return; }
          if (j.fini) {
            clearInterval(suivi); suivi = null;
            e.innerHTML = '✅ Sent through — your ETH is on its way to your address.';
          } else if (j.statut && j.statut !== 'unknown' && j.statut !== 'waiting') {
            e.textContent = 'Status: ' + j.statut;
          }
        }).catch(function () {});
    }, 5000);
  }

  /* ---------------------------- L'ARRIVEE
   *
   * Le pont met trois secondes, mais le joueur, lui, revient sur cet onglet
   * sans savoir si c'est arrive. Sans rien, il rafraichit la page, retape un
   * montant, se demande. On regarde donc son solde a sa place : des que l'ETH
   * tombe, le panneau le dit et remplit le champ tout seul.
   *
   * On ne guette QU'APRES un clic sur une provenance — pas en permanence.
   * Interroger la chaine toutes les six secondes pour tout le monde, tout le
   * temps, serait du trafic pour rien. */
  var guet = null;
  function guette(addr) {
    /* On garde l'IDENTIFIANT de la minuterie, pas un objet reassignable.
       Mesure faite en cliquant les six provenances a la suite : six guets se
       lancent, chacun ecrase la reference du precedent, et celui qui finit par
       voir l'ETH arriver essaie d'arreter une minuterie qui n'est plus la
       sienne — l'annonce se perdait, silencieusement. */
    if (guet !== null) { clearInterval(guet); guet = null; }
    lecteur().getBalance(addr).then(function (depart) {
      /* Deux heures. Le guet ne coute qu'une lecture de solde toutes les six
         secondes, et un joueur qui laisse l'onglet ouvert pendant qu'il retire
         depuis un echange revient bien apres vingt minutes. */
      var limite = Date.now() + 120 * 60000;
      var id = setInterval(function () {
        if (Date.now() > limite) { clearInterval(id); if (guet === id) guet = null; return; }
        lecteur().getBalance(addr).then(function (b) {
          if (b.lte(depart)) return;
          var arrive = b.sub(depart);
          /* On NE S'ARRETE PAS : le pont peut livrer en deux fois, et un joueur
             qui recharge sa poche deux fois de suite doit le voir deux fois.
             On repart simplement du nouveau solde. */
          depart = b;
          rafraichitSoldes(addr);
          reserveGaz().then(function (gaz) {
            /* C'est de l'ETH qui arrive : on bascule sur l'onglet ETH avant de
               remplir, sinon le montant se retrouve dans un champ libelle
               $SWOGE et le joueur croit deposer des jetons. */
            lisSoldes();
            choisitDevise('eth', true);     // sans effacer l'annonce qu'on vient de poser
            var utile = b.sub(gaz);
            if (utile.gt(0)) champ.value = trim(ethers.utils.formatEther(utile), 6);
            annonce = '✅ ' + trim(ethers.utils.formatEther(arrive), 6) +
                      ' ETH just landed on Robinhood Chain — the amount is filled in.';
            rafraichitCote();
          });
        }).catch(function () {});
      }, 6000);
      guet = id;
    }).catch(function () {});
  }

  /* ------------------------------------------------------------- LE BOUTON
   *
   * Un seul, et il fait tout le chemin jusqu'au bout : en $SWOGE il depose, en
   * ETH il achete PUIS il depose. Le joueur n'a pas a savoir qu'il y a deux
   * chemins — il a dit combien et avec quoi, ca suffit.
   *
   * Le depot lui-meme reste celui de la PAGE : on remplit son champ et on
   * actionne son bouton. Le coffre, son ABI, le signataire et l'approbation
   * lui appartiennent ; une deuxieme implementation serait une deuxieme facon
   * de se tromper d'adresse. */
  function envoie() {
    var montant = lit();
    if (!montant) { dis('Pick an amount first.'); return; }
    if (devise === 'swoge') return deposeJetons(montant);
    return acheteEtDepose(montant);
  }

  /* Le $SWOGE est deja le bon jeton : il n'y a rien a echanger. */
  function deposeJetons(montant) {
    var d = $('depAmt'), go = $('depGo');
    if (!d || !go) { dis('This page has no deposit form.'); return; }
    if (soldes.swoge !== null && montant.gt(soldes.swoge)) {
      dis('That is more than the $SWOGE in your wallet.');
      return;
    }
    d.value = trim(ethers.utils.formatUnits(montant, 18), 6);
    try { d.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    dis('Sending <b>' + fmtBig(parseFloat(ethers.utils.formatUnits(montant, 18))) +
        ' $SWOGE</b> into the game. Your wallet will ask once or twice.');
    setTimeout(function () { try { go.click(); } catch (e) {} }, 250);
  }

  function acheteEtDepose(montant) {
    bouton.disabled = true;
    portefeuille().then(function (w) {
      if (!w) throw new Error('Connect your wallet first — the button at the top of the page.');
      var fp = new ethers.providers.Web3Provider(w.eip1193, 'any');
      var signataire = fp.getSigner();
      var avant;
      return fp.getNetwork().then(function (n) {
        if (n.chainId === CHAIN_ID) return null;
        if (!w.eip1193.request) throw new Error('Wrong network — switch to Robinhood Chain.');
        return w.eip1193.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + CHAIN_ID.toString(16) }]
        });
      }).then(function () {
        return lecteur().getBalance(w.adresse);
      }).then(function (solde) {
        return reserveGaz().then(function (gaz) {
          if (solde.lt(montant.add(gaz)))
            throw new Error('Not enough ETH — leave a little for gas on top of the amount.');
        });
      }).then(function () {
        /* On redemande le prix MAINTENANT. Celui qu'affiche l'ecran peut
           dater d'une minute, et la tolerance ne couvre que le delai entre
           cette seconde-ci et le bloc qui vient. */
        dis('Getting a fresh price…');
        return cote(montant);
      }).then(function (c) {
        derniereCote = c;
        var mini = c.sortie.mul(10000 - TOLERANCE_BPS).div(10000);
        var jeton = new ethers.Contract(SWOGE, ERC20_ABI, lecteur());
        return jeton.balanceOf(w.adresse).then(function (b) {
          avant = b;
          var routeur = new ethers.Contract(ROUTER, ROUTER_ABI, signataire);
          var date = Math.floor(Date.now() / 1000) + 600;
          dis('Confirm in your wallet… ' + trim(ethers.utils.formatEther(montant), 6) +
              ' ETH → ≈ ' + fmtBig(c.sortieN) + ' $SWOGE');
          return routeur.swapExactETHForTokensSupportingFeeOnTransferTokens(
            mini, [WETH, SWOGE], w.adresse, date, { value: montant }
          );
        });
      }).then(function (tx) {
        dis('Swapping… waiting for the block.');
        return tx.wait();
      }).then(function () {
        return new ethers.Contract(SWOGE, ERC20_ABI, lecteur()).balanceOf(w.adresse);
      }).then(function (apres) {
        /* Ce qu'on annonce est ce que la CHAINE dit, pas ce que la cotation
           promettait : c'est la difference de solde, mesuree apres coup. */
        var recu = apres.sub(avant);
        var recuN = parseFloat(ethers.utils.formatUnits(recu, 18));
        rafraichitSoldes(w.adresse);
        /* Zero jeton de plus alors que la transaction a ete minee : ca ne
           devrait pas arriver, et c'est precisement pour ca qu'il faut le
           dire au lieu de feter un achat vide et de remplir le champ de
           depot avec zero. */
        if (recu.lte(0)) {
          dis('The swap went through but no $SWOGE landed in your wallet. ' +
              'Check the explorer before trying again.');
          return;
        }
        remplitDepot(recu);
        /* Et on enchaine, sans rien demander de plus : le joueur a appuye sur
           « Deposit and play », pas sur « Buy ». S'arreter ici pour lui
           montrer un deuxieme bouton serait revenir a ce qu'on vient de
           supprimer. */
        if ($('depGo')) {
          dis('✅ Bought <b>' + fmtBig(recuN) + ' $SWOGE</b> — sending it into the game now. ' +
              'Your wallet will ask once or twice more.');
          setTimeout(function () { try { $('depGo').click(); } catch (e) {} }, 350);
          return;
        }
        dis('✅ Bought <b>' + fmtBig(recuN) + ' $SWOGE</b>.');
      });
    }).catch(function (e) {
      var m = String(e && (e.reason || (e.data && e.data.message) || e.message) || e);
      if (/user rejected|denied|ACTION_REJECTED/i.test(m)) dis('Cancelled — nothing was sent.');
      else if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(m))
        dis('The price moved while you were confirming. Try again — the quote is refreshed each time.');
      else dis('Failed · ' + m.slice(0, 140));
    }).then(function () { bouton.disabled = false; });
  }

  /* Remplir le champ de depot : c'est tout l'interet de coller l'achat ici.
     On tronque a six decimales — le champ est lu par `parseUnits`, qui refuse
     au-dela de dix-huit, et personne ne depose a la femtoseconde pres. */
  function remplitDepot(recuWei) {
    var d = $('depAmt');
    if (!d) return;
    d.value = trim(ethers.utils.formatUnits(recuWei, 18), 6);
    try { d.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
  }

  /* Les deux chiffres que la boite de depot affiche en haut. La page les
     recalcule a l'ouverture du panneau ; apres un achat, elle ne sait pas
     qu'il s'est passe quelque chose. */
  function rafraichitSoldes(addr) {
    lecteur().getBalance(addr).then(function (b) {
      var v = (+ethers.utils.formatEther(b)).toFixed(5);
      ['acEth', 'depEth'].forEach(function (id) { var e = $(id); if (e) e.textContent = v; });
    }).catch(function () {});
    new ethers.Contract(SWOGE, ERC20_ABI, lecteur()).balanceOf(addr).then(function (b) {
      var v = fmtBig(+ethers.utils.formatUnits(b, 18));
      ['acSwoge', 'depSwoge'].forEach(function (id) { var e = $(id); if (e) e.textContent = v; });
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- l'amorce
   * Le champ de depot existe des le chargement sur les treize pages, mais on
   * ne parie pas la-dessus : l'observateur rattrape une boite construite plus
   * tard, et se retire des qu'il a pose le panneau. */
  function amorce() {
    if (typeof ethers === 'undefined') return;      // page sans portefeuille
    poseUsd();
    if (poseBloc()) return;
    var obs = new MutationObserver(function () { if (poseBloc()) { poseUsd(); obs.disconnect(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 20000);
  }


  /* ====================== LES MARQUES DES CHAINES ======================
   *
   * Elles viennent TOUTES du jeu d'icones de Relay — celui-la meme dont on
   * lit les cotations. Une seule source : le jour ou une chaine s'ajoute, son
   * icone est deja la, au bon endroit, sans aller la chercher ailleurs.
   *
   * Elles sont EN DUR dans le fichier, en base64, et pas chargees depuis leur
   * hebergeur. Trois raisons : aucune requete de plus a l'ouverture du
   * panneau, aucun carre casse le jour ou l'hebergeur bouge, et rien qui dise
   * a un tiers quelles pages du site sont regardees. Six kilo-octets en tout —
   * le prix d'une seule des images deja presentes.
   *
   * Deux retouches, dites parce qu'elles ne se devinent pas en relisant :
   *
   *   • le bitcoin arrive en carre orange alors que sa marque est un disque —
   *     il est decoupe, sinon il fait un pave au milieu de quatre pastilles ;
   *   • Base arrive en tuile bleue posee sur un fond OPAQUE, noir dans la
   *     variante sombre. Ce fond ferait un rectangle visible sur le panneau :
   *     on ne garde que la tuile, coins adoucis.
   *
   * Trente-six pixels : deux fois la taille d'affichage, pour les ecrans fins.
   */
  var ICONES = {
    sol: 'data:image/webp;base64,UklGRtgDAABXRUJQVlA4WAoAAAAQAAAAIwAAIwAAQUxQSA8BAAABgFtr25vmVRwAtyrRJoSSJdyRWYDObV7DlT2DK9NROYcFyOkPX/FL4vv+CSKCkds2jiBr+55SHgGPhEKKerlGltdzPvUMQIzBVmnDRtGiIEmwtO8U1JYsE9J230CCoZONoUMbCbp0EvyhnTGmJKIo3r6+vtl8fc5bTiCRkJaqGoUi4hheCADg+u6Bz/39VQ0RgBnJeL1wiR5pp/gciwmSZzoRH1VIKM+sBhRyVHz29FJI+kQy/gGESC7H4wmX8XjULRbIC5GwE6LSOKaJBGeM1vxT0plfb872gWRMi0qm5ERdJE4jmFhNQyRo7K1mT6xzgBidHVmSMEQMLEgJ/lBbdw1koiWUZ542mZ+t6A8AAFZQOCCiAgAAMA8AnQEqJAAkAD4xFodCoiELjgMyEAGCWwAnTKEcDeHfkd+IHyCVX+W/fz8eMuubg9R/476DP1n+Yn9Wf2K97X+5dQB0i3oAeV5+3fwe/tb6SLRAqfT0pqAH65Eyprs4gvqjAZjuyHXQeNFsdJxDgjhmbj6dvVbjhV9aWwoETU+gAAD+w97FpzO96hrpStx7tD+Azqa56bxK/VDHoQbR3UQ3iISaC1sQLMRwq/+TaLXnc6YjoZ5QriqcwmOzjlkP/yr2Tn8H0PhZ4ev1x3G99iASrFS8pHvDdH3d9BNiswzepaixyRyQcqIhVGwJmKjvdJ0MgnYlnsMAJ4CZ+U3PuXzUlsc6m0DZb7TN7AJ4bvinSf0tiEEcTker/8GdeDCwNse7wOqvw1mEC7RvJajsXtR8pKK2I30iIh4jSXZ9m7Z46bjy72OF2h1s8hi//xi/Ic5X4qf8xSe+JBroQX+RX5qM3j0c55x1QZ2egwX1NVg0thCM3yxQApGJgs75xfzq0nxkJrgQvAZhDhwTipr3aL/tFvidK0WHodk1IMIvXVNlKDYFizv1FDF7ETXrDr3ad5omtCrt2OkV0QAxJ+L0Nfv3mv+0/9aq+HxxZtH9eddUdQoGbHQrWJj5kcvCdacNlDDIUofJsT+7+FEODBuULUlV/csMgTWEnHlFT1A+DJPegZPEomcm2HWbIzjMmR93gZPo9ravugY1NnWDVuW6LPb3GOuZ5FVpZW8ChJZQX2ObYK+7RkpGlly5ay10S4cR/+tP78pLadeZvzfBc3kaMBNRAA7YYwKaFRh4LrJW0iZYhcaHqBPcZGtNNuMa+ChVUAj8l9QIC0v/PkDfnneZqky8P/7eZZzLYY3wv2CoRCaN/gttWmb/+R4kCfttklnAAAA=',
    eth: 'data:image/webp;base64,UklGRkIEAABXRUJQVlA4WAoAAAAQAAAAIwAAIwAAQUxQSB4BAAABgFxbe+Lmk2SuwOMeqI7Q2tCG42IcFxFYM2eJxjLCieb/gvLoryAiGLhtpChdPMY8Av/iALT627NHkcfZdr/551KWxDjkuwfvDOTtsJeHM0EssHFD0qfyi6Se5M0GYIO1PCS9l1Aj3pPDMmyg1i7pUy5N6nlZg/1XkzE/mCkfHCd/inHl69+atVyXnQEcRr81exnBwWGFn4zIJ1fgTGEsaQypTIoGHXpGxbMDcyKxyJGpfzA6740BfSyegz0N9haUWITzRyrkUTQQHXQmc5VNVA60O9Bgs6HxDdTNcfy3dGzQVvkmi5PYb3tcMDr/SPy/tgWn9c/Cohrz71dDgsjukAQ23kUVWBWnLXVjb/8t6Mb9bsiNYcc2Q45tBR0LVlA4IP4CAAAwEgCdASokACQAPjEUh0KiIQuOAzIQAYJbACdOUF+AcQpEPon4k/kz03vL0LJ7jyr/pumBtoPMB+sf9A9VX1O+TB1gHoQfsZ6Yf7K/B3+2Po+//95T/wGZSx082L/53lQ+lf9n7gX6p/7j1meod/UAkgnRhE0M38vV9IMMYhLPfpdmUAkiKe5MUmRvXJ2KaxMfOAKlBAHd6V/gAPnqh6btdhs297EyTOYT/hRX8PRzNJCbWijRHE95An43eLvio1UHSSn4TWuYD5XYiPiyg/rfirTVcN8ueOhwXa6rYW+1Eb0jcZ0/8hZHlgvLBfn6hIuA5CjslmOFk7uOR1aldF02+MK0HDPIrpNumL75ygTetKP6qbx8j+16Uvn5+9K3219x85gRJNLfxjFfWxBt7lRcR7lZSmQ+h8cUU+/Y46VfKvRD5wZyRJAXv2DquizMCdhMT414TzquMDP1qfTqfPHcJ/mziHtetiysusqIK5N/8FACEJzUSXc/8ZS4bFNWGCGMMMIEOz40tBoN2unvUsmOHfmbLnMqGwjTm/bOMGFG360xNc6lbxrA6FX/RWEIf+dt8mixS1jDZDC4eXZ5ibWU5zCLKtK1n9IP9hANX8QFmKL1jGUANxanyUZ8ZfzQnFF0pxlhnz7tKBb0bNayC0rNUOCmT43cNVO7Tu8rOsngkqXCrzSiSlHTZjEKsOQoCrYEhpPyshjs6735QI8y0B/9Fbmkk+//XxOcIf/3lp7onsQXW2Xpe0XFyyCwChvHSw7afXmiSLtkAyHsXj4oC/E4Su0Uo1H0fh+698RHGuyI2eb3ywagw3jv91/VDXq7E64ffMXmvz2L1X9NDGPyhgPjifSZDk2u6xkSfebzEY6DKP2a3KKEwGJZGWLKTt145Qo8CiL/iREknt6HXGyPMi1jz7TdWtdiEGbs5jEw1XD1yQ200dH2G5QSz2x/9Dgd6FshxYeON9wZ8j6Q5p2sA47kgAgvg7vDSRtk1WnnJJ68pRnL/9w0bk+3GvrtgAAA',
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', amorce);
  else amorce();
})();
