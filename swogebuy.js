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
  var champ = null, sortie = null, avis = null, bouton = null, entete = null, corps = null;
  var derniereCote = null;   // { entree, sortie, impact }

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
      '.swb-go{width:100%;margin-top:9px;padding:9px;border-radius:10px;border:0;cursor:pointer;' +
      'font-weight:800;font-size:13px;color:#231a06;background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swb-go[disabled]{opacity:.55;cursor:default;}' +
      '.swb-x{margin-top:10px;padding-top:9px;border-top:1px solid rgba(230,165,55,.22);}' +
      '.swb-x p{margin:0 0 6px;font-size:11px;line-height:1.45;color:#B9B2A2;}' +
      '.swb-x div{display:flex;gap:5px;flex-wrap:wrap;}' +
      '.swb-x button{flex:1 1 30%;min-width:0;padding:5px 3px;font-size:11px;font-weight:700;' +
      'border-radius:8px;border:1px solid rgba(160,160,190,.32);background:rgba(0,0,0,.28);' +
      'color:#CFCADF;cursor:pointer;}' +
      '.swb-x button:hover{background:rgba(160,160,190,.16);}';
    document.head.appendChild(css);
  }

  function poseBloc() {
    var ancre = $('depAmt');
    if (!ancre || $('swbAmt')) return false;
    /* La boite de depot commence par une etiquette « Amount ». On se glisse
       AVANT elle : acheter vient avant deposer, et l'ecran doit le dire dans
       cet ordre. */
    var avant = ancre.previousElementSibling;
    if (avant && avant.tagName === 'LABEL') ancre = avant;

    styles();
    var bloc = document.createElement('div');
    bloc.className = 'swb';
    bloc.innerHTML =
      '<div class="swb-h" id="swbTete">🪙 Buy $SWOGE<span id="swbTaux">…</span></div>' +
      '<div class="swb-b plie" id="swbCorps">' +
        '<div class="swb-r"><input id="swbAmt" inputmode="decimal" placeholder="0.01"><b>ETH</b></div>' +
        '<div class="swb-p">' +
          '<button data-eth="0.005">0.005</button>' +
          '<button data-eth="0.01">0.01</button>' +
          '<button data-eth="0.05">0.05</button>' +
          '<button data-eth="max">MAX</button>' +
        '</div>' +
        '<div class="swb-q" id="swbCote">Enter an amount to see the price.</div>' +
        '<button class="swb-go" id="swbGo">Buy $SWOGE</button>' +
        '<div class="swb-x" id="swbAilleurs">' +
          '<p>No ETH on Robinhood Chain? Bring it from another chain — arrives in ' +
          'seconds, straight to your address.</p>' +
          '<div>' +
            '<button data-de="sol">◎ Solana</button>' +
            '<button data-de="eth">Ξ Ethereum</button>' +
            '<button data-de="base">🔵 Base</button>' +
            '<button data-de="tron">₮ USDT&nbsp;(TRON)</button>' +
            '<button data-de="btc">₿ Bitcoin</button>' +
            '<button data-de="autre">Other chain</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    ancre.parentNode.insertBefore(bloc, ancre);

    entete = $('swbTete'); corps = $('swbCorps'); champ = $('swbAmt');
    sortie = $('swbCote');  bouton = $('swbGo');

    entete.onclick = function () {
      corps.classList.toggle('plie');
      if (!corps.classList.contains('plie')) champ.focus();
    };
    champ.addEventListener('input', function () {
      clearTimeout(minuterie);
      minuterie = setTimeout(rafraichitCote, 320);
    });
    bloc.querySelector('.swb-p').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-eth]') : null;
      if (!b) return;
      var v = b.getAttribute('data-eth');
      if (v === 'max') return remplitMax();
      champ.value = v; rafraichitCote();
    });
    bouton.onclick = achete;
    $('swbAilleurs').querySelector('div').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-de]') : null;
      if (b) ailleurs(b.getAttribute('data-de'));
    });
    montreTaux();
    return true;
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

  function remplitMax() {
    portefeuille().then(function (w) {
      if (!w) { dis('Connect your wallet first.'); return; }
      return Promise.all([lecteur().getBalance(w.adresse), reserveGaz()]).then(function (x) {
        var reste = x[0].sub(x[1]);
        if (reste.lte(0)) { dis('Not enough ETH once the gas reserve is set aside.'); return; }
        champ.value = trim(ethers.utils.formatEther(reste), 6);
        rafraichitCote();
      });
    }).catch(function () {});
  }

  /* Tronquer, jamais arrondir : un arrondi vers le haut redemande plus que ce
     qu'on a et la transaction echoue au dernier moment. */
  function trim(s, n) {
    var i = s.indexOf('.');
    return i < 0 ? s : s.slice(0, i + 1 + n).replace(/\.$/, '');
  }

  function dis(html) { if (sortie) sortie.innerHTML = html; }

  function lit() {
    var s = (champ.value || '').replace(',', '.').trim();
    if (!s) return null;
    try {
      var w = ethers.utils.parseEther(s);
      return w.lte(0) ? null : w;
    } catch (e) { return null; }
  }

  function rafraichitCote() {
    var montant = lit();
    derniereCote = null;
    if (!montant) { dis('Enter an amount to see the price.'); return; }
    dis('Checking the pool…');
    cote(montant).then(function (c) {
      derniereCote = c;
      var mini = c.sortie.mul(10000 - TOLERANCE_BPS).div(10000);
      var txt = 'You get ≈ <b>' + fmtBig(c.sortieN) + ' $SWOGE</b>' +
                '<br>Price impact <b>' + c.impact.toFixed(2) + '%</b> · at least ' +
                fmtBig(parseFloat(ethers.utils.formatUnits(mini, 18))) + ' after slippage';
      /* L'avertissement n'est pas decoratif : au-dela de quelques centiemes
         d'ETH le joueur paie l'ecart, pas la maison. Autant qu'il le sache
         avant de signer.
       *
         Et le conseil doit etre VRAI. « Coupez l'ordre en morceaux » est le
         reflexe, et il est faux : sur une courbe x·y=k, cinq achats de 0,1
         ETH a la suite rendent 60 545 896 jetons la ou un seul achat de 0,5
         en rend 60 558 816 — moins 0,02 %, parce que les frais se cumulent et
         que la reserve ne se remplit pas entre deux clics. Ce qui aide, c'est
         le TEMPS : d'autres echanges et l'arbitrage ramenent le prix entre
         deux jours, pas entre deux secondes. */
      if (c.impact >= 12) {
        txt += '<div class="swb-w dur">Thin pool — this order alone moves the price by ' +
               c.impact.toFixed(1) + '%, and that cost is yours. Splitting it into back-to-back ' +
               'buys changes nothing: the pool does not refill in between. Buy less, or spread ' +
               'your buys over days.</div>';
      } else if (c.impact >= 4) {
        txt += '<div class="swb-w">Sizeable order for this pool: ' + c.impact.toFixed(1) +
               '% goes to the curve, not to the game. A smaller buy today and another one later ' +
               'costs you less.</div>';
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
      window.open(u, '_blank', 'noopener');
      if (!w) {
        dis('Connect your wallet first and press again — otherwise you have to ' +
            'retype your address over there, and that is the one step where money gets lost.');
      }
    }).catch(function () { window.open(RELAY, '_blank', 'noopener'); });
  }

  /* -------------------------------------------------------------------- l'achat */
  function achete() {
    var montant = lit();
    if (!montant) { dis('Enter an amount first.'); return; }
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
        dis('✅ Bought <b>' + fmtBig(recuN) + ' $SWOGE</b> — the deposit amount below is ' +
            'filled in. Press Deposit to play with it.');
        remplitDepot(recu);
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

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', amorce);
  else amorce();
})();
