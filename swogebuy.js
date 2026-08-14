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
          onglet('eth', 'ETH', '…') +
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
          '<p>Nothing on Robinhood Chain yet? Bring funds from another chain — ' +
          'arrives in seconds, straight to your address.</p>' +
          '<div>' +
            bouton6('sol', 'Solana') + bouton6('eth', 'Ethereum') +
            bouton6('base', 'Base') + bouton6('tron', 'USDT · TRON') +
            bouton6('btc', 'Bitcoin') + bouton6('autre', 'Other chain') +
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
    choisitDevise('swoge');
    montreTaux();
    lisSoldes();
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
    $('swbUnite').textContent = devise === 'eth' ? 'ETH' : '$SWOGE';
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
      if (t) t.textContent = '1 ETH ≈ ' + fmtBig(prixMilieu(r));
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
      var txt = 'Buys ≈ <b>' + fmtBig(c.sortieN) + ' $SWOGE</b> and deposits it — ' +
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

  /* ================== VENIR D'UNE AUTRE CHAINE ==================
   *
   * La question posee etait : faut-il trois adresses de depot, une par chaine,
   * et convertir soi-meme au prix du marche ? Non — et pour deux raisons
   * mesurees plutot que supposees.
   *
   * 1. LE PRIX N'EST PAS UN ORACLE. La reserve tient dans deux ETH : 188 $
   *    d'achat deplacent le prix de 10 %, 940 $ de 54 %. Un serveur qui
   *    crediterait au prix du pool se ferait vider par quelqu'un qui fait
   *    tomber ce prix pour deux cents dollars, depose, puis rachete.
   *
   * 2. TENIR TROIS GUICHETS, C'EST DEVENIR LA CONTREPARTIE : une adresse par
   *    joueur et par chaine, un surveillant par chaine, du gaz sur trois
   *    chaines, des cles a garder — et l'invariant du coffre (ce qui est du
   *    tient dans ce qui est depose) casse a chaque credit.
   *
   * Robinhood Chain est une chaine Orbit, et Relay la dessert deja. Cotations
   * relevees le jour ou ceci a ete ecrit, vers de l'ETH sur Robinhood Chain :
   * 1 SOL en 3 s pour 0,87 % ; 0,1 ETH depuis le reseau principal en 2 s pour
   * 0,02 % ; 100 USDT depuis TRON en 2 s pour 0,2 %. Non custodial : l'argent
   * ne passe jamais par nous. Le joueur revient avec de l'ETH sur la bonne
   * chaine, et le panneau au-dessus fait le reste.
   *
   * Le TRX natif n'a pas de route ; l'USDT sur TRON en a une, et c'est ce que
   * detiennent la plupart des porteurs TRON. On ne propose donc pas un bouton
   * qui echouerait — chacun de ces boutons a ete cote pour de vrai avant
   * d'etre pose.
   */
  var RELAY = 'https://relay.link/bridge/robinhood';
  var NATIF = '0x0000000000000000000000000000000000000000';
  var DEPUIS = {
    sol:   { chaine: 792703809, jeton: '11111111111111111111111111111111' },
    eth:   { chaine: 1,         jeton: NATIF },
    base:  { chaine: 8453,      jeton: NATIF },
    tron:  { chaine: 728126428, jeton: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },  // USDT
    /* Le bitcoin n'a pas d'adresse « nulle » : son jeton natif porte un
       identifiant a lui. La route n'a pas pu etre cotee d'ici faute d'une
       adresse approvisionnee — le refus obtenu parlait des fonds du test, pas
       de la route. C'est la seule des six qui n'ait pas ete verifiee de bout
       en bout. */
    btc:   { chaine: 8253038,   jeton: 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmql8k8' },
    autre: null
  };

  function ailleurs(cle) {
    var d = DEPUIS[cle];
    portefeuille().then(function (w) {
      var u = RELAY + '?toCurrency=' + NATIF;
      if (d) u += '&fromChainId=' + d.chaine + '&fromCurrency=' + encodeURIComponent(d.jeton);
      /* L'adresse d'arrivee est celle du joueur. Sans elle il faudrait la
         recopier a la main, et une adresse recopiee a la main est la seule
         etape de tout ce parcours ou l'on peut perdre son argent. */
      if (w) u += '&toAddress=' + w.adresse;
      /* Le guet est arme AVANT d'ouvrir l'onglet : son point de depart est le
         solde d'avant le depart. Arme apres, il note un solde qui a pu deja
         bouger — et il attendrait alors une arrivee qui a deja eu lieu. */
      if (w) guette(w.adresse);
      window.open(u, '_blank', 'noopener');
      if (!w) {
        dis('Connect your wallet first and press again — otherwise you have to ' +
            'retype your address over there, and that is the one step where money gets lost.');
      }
    }).catch(function () { window.open(RELAY, '_blank', 'noopener'); });
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
      var limite = Date.now() + 20 * 60000;        // vingt minutes, puis on lache
      var id = setInterval(function () {
        if (Date.now() > limite) { clearInterval(id); if (guet === id) guet = null; return; }
        lecteur().getBalance(addr).then(function (b) {
          if (b.lte(depart)) return;
          clearInterval(id); if (guet === id) guet = null;
          var arrive = b.sub(depart);
          rafraichitSoldes(addr);
          reserveGaz().then(function (gaz) {
            /* C'est de l'ETH qui arrive : on bascule sur l'onglet ETH avant de
               remplir, sinon le montant se retrouve dans un champ libelle
               $SWOGE et le joueur croit deposer des jetons. */
            lisSoldes();
            choisitDevise('eth', true);     // sans effacer l'annonce qu'on vient de poser
            var utile = b.sub(gaz);
            if (utile.gt(0)) champ.value = trim(ethers.utils.formatEther(utile), 6);
            annonce = '✅ ' + trim(ethers.utils.formatEther(arrive), 6) + ' ETH just landed — ' +
                      'the amount is filled in.';
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
    if (poseBloc()) return;
    var obs = new MutationObserver(function () { if (poseBloc()) obs.disconnect(); });
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
    base: 'data:image/webp;base64,UklGRugAAABXRUJQVlA4WAoAAAAQAAAAIwAAIwAAQUxQSH0AAAABcBzbrtM8UCMMVVABtvuMFcRi4o6hBEn/OdvS0quIUNq2AdPBSpsjAAFm86PxB9txPnvZQtBuGPCmhUDQDXQvv6m4c+ggVTNSGbBybKr68Gwsh7qnMWhjvy5xlfWVJarCqzPBzr+hPaU5X8v5bM73cxiSw6IcpuWwMYWxAABWUDggRAAAAJADAJ0BKiQAJAA+MRiLRCIhoRHEACADBLOAOwB+AAAc1HqlBAAA/v1jx///wsz+DMfwsz/4WZ//8KtwxDKzhIIAAAAA',
    tron: 'data:image/webp;base64,UklGRv4DAABXRUJQVlA4WAoAAAAQAAAAIwAAIwAAQUxQSJkCAAABoLRtmyHJHtAbFTm2bdu2bXtmZdu2tcTa9s62rWNbVRHxvYPIzL5ORDBw20jRdPZo4GjaRyAKOkAEAo00IZEAdMXu4+fPH9+jov78HGkwDdTb8lToQZ5tqQfEXlQKdY6SpDWfYEnyaB0oFZ0GLE1RjAtvnBGapQqJyJXtBMUyBlZ4MnuEK5XtClPCWEiKV7KFgkqr00xa6yT+QoqnlfZcYwlT9OG8TCcS9iXQn5NUdWvk1z3nn3xvoiNe0NrqKgEkcJJG/ikCnSlz6aYDZ2zdf+nFT/+R4peehIZGLXE0XKdU8ZENimeBh2J1ltAKSSe1oANso6HjuwyBXkX++9OLywe2Lc4OzKIR0nArAhW8pCMtO2Sdhs6/0cMGLF+IOZ/d8WWgUMGRpJGjOHgG5Z/wv/84HdPI0ZhN71IFoActSeG/uSvzeoEMJ8jZWEWSwzE35WjZA5hA4+04DXf4VQNsX4yht3fP71utVAYcpTWcAMz3zfIRpgj/GwwfBToVx4h/nRjOjzA61sr1jyVr5B6xZP/9H3gxU3tHoWcTQma4E0doXb4+/Iwbqtqf4shPJ6EUL/mXjO3IXzHb/Jvkq9zFvqEjvRS/kR8enHjHp9jFJH8un/Vx6JldBXj/LmQXsELO4hxNshku+K/u+CJQAbaGAhRbohh345VjfxygIRmaAX+WQs+xEs/XqN84BTu85w3PEjROht+Y7zF1XB5uwLzPK2Im/dm2EvJWuUv1OYlRNMKo2Y7hiJH9QB3dTmw0R0JcO+W78M9CCdT8U1x4nVJaxXLWcCrKfkMXzdl47lu5VuAJbZj7J7LFCASW+Bryzwu6CA0BErFadMRvkozWorRo2uYITXvqaVpatbFC9/Hz5o3rHquN/4vGAgBWUDggPgEAADALAJ0BKiQAJAA+MRKHQqIhDVVXVBABglqAKS5eP6r+IHV2eI5f+HP6k8a53E/XT+jZhhrt+JPYA8Rj7AO0B5gP1V/QDfZutV9AD9VfSQ9hr9rPUN/kYER9f8PjIzhCApKYAP73iUZkgmRNh0fnLxTimr5jT+/Juz4XH/uGzEvGMUWfzG7Bco5HBt6HdEO5gylVfRPKTqV1L/6tohueyoIf/50M4vKxdjyKYErLz13zBvDZAwkPuK3DMk26M5z2hFM9rWSDVjgmCgXuhmD1H4rkFpFLNdvUdcKo2Qurj9h6mBixwV/uKxS0vMjb5vpnf/WoancNJTDN26WWUBK0fo3lUL8KRX8cUWR3gImM7XIxCPWVDwMfCPw6JmC2FIXD8Uu/oOVSTBKQe6kmvzZcHNwRLx6/3Dn+SVrAAAAAAA==',
    btc: 'data:image/webp;base64,UklGRo4EAABXRUJQVlA4WAoAAAAQAAAAIwAAIwAAQUxQSPIAAAABgF3btqpmX0G+oQsrQ5ISrBDoAwqBAuLuX0gbcTn37OiTM1JARDBw27aRlbS3Z+JH4A8BQHc4Xd6r3i+nw+6vR8nBBcTtnRdm8LKzHRFcpjywfkdSkpKkJiF5tw74zKyPSRFlBipCjuvwGdk4oSTmkoQnjT/hXfOS7yzEOy+bzv+6WvX0J4vGaTU4IGDyk8VjgoCIHj9Ygg/2EH1lrqmMks4rHhsUlkK4ARxoWekBWm8szVtrRCkr4WhmodmKWlbK1SMNeOS/wWbF5hCbC9n8O5sasKklm5q0qW2bHjHpNZueNel9Ew8x8SITTzP0RhOPBVZQOCB2AwAAkBMAnQEqJAAkAD4xFolDIiEhE5UkIAMEtgBOmVn6S8L/CL8mehr2z8HZPfzQ/pftG94HqA8SnpAeYD9O/9n/kveI/kv8r9iHoAfqh1gHoGfqP6SH7QfBJ+0P7b+5L/cf/tSZsVjNL9xJvR7O99NewB+rHV3/YD2AP1VKeKcHIAVuMCrfWwgegvE5KLYZZ3CJPN0Qci+ayfmO3PwaB2MNAdBuuBUAAP7v1mVKz9Bxcgh6K6C4ndRURc95P1A/kX4wyhsFe0PFoC0j/vxP32Vi/0ULP/VfpcFDSgHg9lMIYDZcoP/+/9ic23wVsc1orytlm9ipK3j5Jawb3P+MLw3/9tjnnLf/56bWhCM+Y7cytnX1JgX0cQKj0TnJf1uyNVl5j7F6LH9X/2u59yX+hCByk6GqM+bc/tHLtV8oj/8UX3KExgOO7xWneFvUW7PKve6iRhK8t3ZI9GqzhRuFZHRCdFXklakv3W4YubGMuo6bv36jdfnTb4p2cYd319QAJERS0t99v0vGMD+sF6l60rmqqBB8y+MsiLvHpE14fPwi91KANTuuFUqzUsFFSJnp8mVCGTxhBPheWOfOSQccnL1lTlRdAHs4Nzq/OlWxHDRoUqlEb7Vo350RdkHksTReX38J34BupQ2v1Xeh9cd9uPS2/I/10TriQw5ZdboQuJ9PX79Oy7vn9tnqyKd9/xkmeGlOCQW8ZpTuyH3hu8Q4CD6E+h4b8JPM7dnbJj3zgyXf4dQ1+kpvSsecjtlgux/zvXPUFEKr7jgdB9qtzOWWpLuW78Qe87moS2MuMvjVjTvHMg9x+GM+TqTxFn58jH0lj3cIXAeXfFYBUNxS5SQsZU7BfDE9xhU0w1KMQLK6GpDqL2c/hMBEa2hqM4CFbnpgBgpexDwp7ldayud3TQqdFVeULMgVNejs1fkQS2VoPn8bZpkbvaEmy9A8w5Lr3JLohwzcXW+H3RUjW3s6Ir+UPYURehWPGaxl+JQ17wbCYy3R9sGkEjqlA9xWdO5iq6CLdQfUx3NJrufLfLtVgubEWMg87ZP8hbGlFnY3AAEeNmZEyZPJR99FvNMyAcyKu/8o9Rl0Yx0VoP8hdymbXJDRIfOTWjA+JSTOiX5t1qlxqOF9NMx8kWR60iHLpoqkQ4/z5MO1XQJn6upAV/9UdaD4lVcrxiAx3AAAAA=='
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', amorce);
  else amorce();
})();
