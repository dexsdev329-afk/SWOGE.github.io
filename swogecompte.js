/*
 * SWOGE — LE COMPTE SUR UNE PAGE QUI N'EN A PAS.
 *
 * Le hall des jeux est la page d'entree du site : c'est la qu'on arrive, et
 * c'est de la qu'on veut deposer. Il ne portait pourtant aucun panneau de
 * compte — ni portefeuille, ni depot, ni retrait, ni staking — parce que ces
 * panneaux sont ecrits DANS chacune des quinze pages de jeu. Le tiroir du
 * profil n'avait donc rien a y refleter, et ses cinq rangees « Account »
 * partaient ouvrir la page du Coin Pusher.
 *
 * ---- pourquoi un SEIZIEME exemplaire n'etait pas la reponse ----
 *
 * Recopier le bloc d'une page de jeu aurait ajoute une seizieme version du
 * chemin de l'argent, a tenir a jour en face des quinze autres. C'est
 * exactement ce que stakebubble.js et swogebuy.js s'interdisent, et sur la
 * partie ou une divergence coute le plus cher : un montant, une adresse de
 * coffre, un minimum de retrait qui ne suivraient pas.
 *
 * Ce fichier est donc la version PARTAGEE, ecrite une fois. Il ne s'installe
 * que sur une page qui n'a rien — la premiere ligne verifie qu'aucun panneau
 * n'existe deja et sort sinon. Les quinze pages de jeu ne le voient jamais,
 * meme si on l'y ajoutait par erreur.
 *
 * ---- ce qu'il fait, et ce qu'il ne fait pas ----
 *
 * Il fait les cinq gestes du compte : LIRE son adresse et ses soldes, DEPOSER
 * dans le solde de jeu, RETIRER vers le portefeuille, MISER au staking, et
 * RECLAMER ses quetes du jour — les trois quetes, le bonus de bienvenue et la
 * serie de sept jours.
 *
 * Une seule chose manque, et volontairement : la video recompensee. Elle
 * demande le SDK d'une regie publicitaire tierce, charge dans la page, avec
 * son identifiant de bloc. Charger une regie sur le hall pour un bouton
 * secondaire d'un panneau secondaire n'en vaut pas le prix ; elle reste sur
 * les pages de jeu, ou elle est deja installee.
 *
 * ---- comment il parle au serveur ----
 *
 * Il n'ouvre PAS de seconde socket. stakebubble.js en tient deja une, ouverte
 * avec le jeton de session range par les pages de jeu, et il enveloppe le
 * constructeur WebSocket pour ecouter tout ce qui passe. On reprend le meme
 * procede : on enveloppe a notre tour — les enveloppes s'empilent sans se
 * gener — et on retient la socket qui a repondu « auth ». Une socket de plus
 * par page voudrait dire deux authentifications, deux soldes a garder
 * d'accord, et le doute sur celle qui recevra le bon d'un retrait.
 *
 * ---- l'habit ----
 *
 * Les panneaux sont en CSS, pas en images peintes : ils s'ouvrent DANS le
 * tiroir du profil, qui est lui-meme en CSS. Ils portent `class="box"` et un
 * `.pscroll`, les deux marques que stakebubble.js cherche pour emprunter une
 * boite et lui retirer son cadre.
 */
(function () {
  'use strict';
  if (window.__swogeCompte) return;
  window.__swogeCompte = true;

  /* La page a-t-elle deja ses panneaux ? Les pages de jeu portent `#box-dep`,
     le Coin Pusher `#accountBox`. Dans les deux cas on s'efface : leur code
     est le maitre, et deux formulaires de depot sur une page seraient pires
     que pas de formulaire du tout. */
  function dejaEquipee() {
    return !!(document.getElementById('box-dep') || document.getElementById('accountBox'));
  }
  if (dejaEquipee()) return;

  var CHAIN = { id: 4663, hex: '0x1237', name: 'Robinhood Chain',
                rpc: 'https://rpc.mainnet.chain.robinhood.com',
                scan: 'https://robinhoodchain.blockscout.com', sym: 'ETH' };
  var TOKEN = '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817';
  var ERC20_ABI = [
    'function approve(address,uint256) returns (bool)',
    'function allowance(address,address) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)'
  ];
  var VAULT_ABI = [
    'function deposit(uint256)',
    'function withdraw(uint256 cumulative,uint256 deadline,uint8 v,bytes32 r,bytes32 s)'
  ];

  /* Ce que le serveur nous apprend au « hello » et a l'« auth ». Rien de tout
     cela n'est ecrit en dur : l'adresse du coffre et le minimum de retrait
     changent sans qu'on republie quinze pages. */
  var VAULT = '', MIN_WD = 50, ADR = null, SOLDE = 0, SOCK = null;
  var ST = { staked: 0, pending: 0, aprBps: 10000, locked: 0, unlocked: 0,
             nextUnlock: null, penaltyBps: 5000, lockDays: 365, t0: 0 };
  var PORTE = { swoge: null, eth: null };

  function $(id) { return document.getElementById(id); }
  function nb(n, d) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'k';
    return n.toFixed(d === undefined ? 2 : d);
  }

  // ------------------------------------------------------------- le message
  /* Un mot au joueur, en bas de l'ecran. Court volontairement : il double
     toujours quelque chose de visible ailleurs — un solde qui bouge, un
     panneau qui se ferme — et sert surtout a dire qu'une transaction est
     partie, ce qui n'a aucun autre signe a l'ecran. */
  var boiteMsg = null, minuterieMsg = 0;
  /* `action` = { texte, href }. Un message qui annonce un blocage sans donner
     la sortie laisse le joueur devant une porte fermee : c'est exactement ce
     qui s'est passe avec le depot, ou « rechargez la page » ne menait nulle
     part. Quand il y a un geste a faire, il est DANS le message. */
  function dit(t, cl, action) {
    if (!boiteMsg) {
      boiteMsg = document.createElement('div');
      boiteMsg.className = 'swc-msg';
      (document.body || document.documentElement).appendChild(boiteMsg);
    }
    boiteMsg.className = 'swc-msg on' + (cl ? ' ' + cl : '') + (action ? ' act' : '');
    boiteMsg.textContent = t;
    if (action && (action.href || action.fait)) {
      var a = document.createElement(action.fait ? 'button' : 'a');
      if (action.href) a.href = action.href;
      if (action.fait) {
        a.type = 'button';
        a.addEventListener('click', function () {
          boiteMsg.className = 'swc-msg';
          action.fait();
        });
      }
      a.textContent = action.texte || 'Continue';
      boiteMsg.appendChild(a);
    }
    clearTimeout(minuterieMsg);
    /* Un message qu'on doit pouvoir TOUCHER reste plus longtemps : quatre
       secondes suffisent a lire, pas a decider puis viser. */
    minuterieMsg = setTimeout(function () { boiteMsg.className = 'swc-msg'; },
                              action ? 11000 : 4200);
  }

  // -------------------------------------------------------------- le reseau
  /* On enveloppe le constructeur comme le fait stakebubble.js. Les enveloppes
     s'empilent : la sienne appelle la native, la notre appelle la sienne, et
     chacune accroche son ecouteur. `new` rend l'objet retourne, donc la page
     recoit toujours une vraie WebSocket. */
  try {
    var Native = window.WebSocket;
    if (Native) {
      var Enveloppe = function (url, protos) {
        var s = arguments.length > 1 ? new Native(url, protos) : new Native(url);
        try { s.addEventListener('message', surMessage); } catch (e) {}
        return s;
      };
      Enveloppe.prototype = Native.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { Enveloppe[k] = i; });
      window.WebSocket = Enveloppe;
    }
  } catch (e) { /* jamais au detriment de la page */ }

  function surMessage(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || !m.type) return;
    if (m.type === 'hello') {
      if (m.vault) VAULT = m.vault;
      if (m.minWithdraw != null) MIN_WD = Number(m.minWithdraw) || MIN_WD;
    }
    if (m.type === 'auth') {
      /* La socket qui a repondu « auth » est celle par laquelle on parlera :
         c'est la seule qui soit authentifiee. */
      SOCK = ev.target;
      ADR = String(m.address || '').toLowerCase() || null;
      if (m.vault) VAULT = m.vault;
      if (m.balance != null) SOLDE = parseFloat(m.balance) || 0;
      if (m.stake) poseStake(m.stake);
      poseTout();
    }
    if (m.type === 'balance' || m.type === 'deposit') {
      if (m.balance != null) SOLDE = parseFloat(m.balance) || 0;
      poseTout();
      if (m.type === 'deposit') dit('💰 Deposit credited — ' + nb(SOLDE) + ' $SWOGE', 'ok');
    }
    if (m.type === 'stakeInfo' || m.type === 'stakeUnstaked') {
      poseStake(m);
      if (m.balance != null) SOLDE = parseFloat(m.balance) || 0;
      poseTout();
      if (m.type === 'stakeUnstaked') dit('Unstaked ' + nb(m.returned) + ' $SWOGE', 'ok');
    }
    if (m.type === 'stakeClaimed') { dit('Yield claimed', 'ok'); demande('stakeInfo'); }
    if (m.type === 'quests') { QUETES = m.quests || QUETES; poseQuetes(); }
    if (m.type === 'bonus') { BONUS = m.bonus || BONUS; poseQuetes(); }
    if (m.type === 'questClaimed' || m.type === 'welcomeClaimed' || m.type === 'streakClaimed') {
      if (m.balance != null) { SOLDE = parseFloat(m.balance) || 0; poseTout(); }
      if (m.quests) QUETES = m.quests;
      if (m.bonus) BONUS = m.bonus;
      poseQuetes();
      dit((m.type === 'questClaimed' ? '🎯 Quest' : m.type === 'welcomeClaimed' ? '🎁 Welcome' : '🔥 Day ' + m.day) +
          ' +' + (m.reward != null ? m.reward : '') + ' $SWOGE', 'ok');
      /* Le solde n'arrive pas toujours avec l'accuse : on le redemande plutot
         que de le deviner. */
      if (m.balance == null) demande('balance');
    }
    /* Le bon de retrait : le serveur signe, la chaine paie. C'est la seule
       reponse qui demande une transaction en retour. */
    if (m.type === 'voucher') {
      if (m.balance != null) { SOLDE = parseFloat(m.balance) || 0; poseTout(); }
      envoieRetrait(m.voucher || m);
    }
    if (m.type === 'error') dit(String(m.error || 'error').slice(0, 90), 'ko');
  }

  function poseStake(s) {
    if (!s) return;
    if (s.staked != null) ST.staked = parseFloat(s.staked) || 0;
    if (s.pending != null) ST.pending = parseFloat(s.pending) || 0;
    if (s.aprBps != null) ST.aprBps = Number(s.aprBps) || 0;
    if (s.locked != null) ST.locked = parseFloat(s.locked) || 0;
    if (s.unlocked != null) ST.unlocked = parseFloat(s.unlocked) || 0;
    if (s.penaltyBps != null) ST.penaltyBps = Number(s.penaltyBps);
    if (s.lockDays != null) ST.lockDays = Number(s.lockDays);
    if ('nextUnlock' in s) ST.nextUnlock = s.nextUnlock;
    ST.t0 = Date.now();
  }
  /* Le rendement coule entre deux reponses du serveur, avec la meme formule
     que lui : montant x taux x temps ecoule / an. Sans ca le chiffre reste
     fige et donne l'impression que le staking ne rapporte rien. */
  function acquisCourant() {
    if (!ST.staked || !ST.aprBps || !ST.t0) return ST.pending;
    return ST.pending + ST.staked * (ST.aprBps / 10000) *
           ((Date.now() - ST.t0) / 31536000000);
  }

  function demande(type, extra) {
    if (!SOCK || SOCK.readyState !== 1) return false;
    var q = extra || {}; q.type = type;
    try { SOCK.send(JSON.stringify(q)); return true; } catch (e) { return false; }
  }

  // ------------------------------------------------------- le portefeuille
  /* On ne demande jamais l'ouverture d'un portefeuille pour AFFICHER quelque
     chose : un solde est public, il se lit par un lecteur RPC. On ne reclame
     une signature qu'au moment d'envoyer une transaction. C'est la meme regle
     que dans swogebuy.js, et c'est ce qui permet au panneau de s'ouvrir sans
     rien demander a personne. */
  var _lecteur = null;
  function lecteur() {
    if (typeof ethers === 'undefined') return null;
    if (!_lecteur) {
      try { _lecteur = new ethers.providers.JsonRpcProvider(CHAIN.rpc); }
      catch (e) { _lecteur = null; }
    }
    return _lecteur;
  }
  /* Le portefeuille avec lequel le joueur s'est DEJA connecte. `swogeAuth` dit
     lequel : Privy pour une entree par e-mail, l'extension sinon. */
  /* ---- LE PORTEFEUILLE EMAIL N'EXISTAIT PAS SUR CETTE PAGE ----
   *
   * Les dix-sept pages de jeu chargent `privy-swoge.js` elles-memes, depuis
   * leur propre formulaire de connexion. games.html n'en a pas — c'est
   * justement la raison d'etre de ce fichier — et `window.SwogePrivy` n'y
   * existait donc jamais. Un joueur connecte PAR EMAIL qui tapait « Deposit
   * and play » depuis le hall tombait sur « Sign in first », alors qu'il
   * etait connecte et que son solde s'affichait a l'ecran.
   *
   * On charge donc le module a la demande, et UNIQUEMENT si le compte est un
   * compte email : personne d'autre n'a de raison de tirer le SDK d'un tiers.
   * La promesse est mise en cache — deux appels rapproches ne doivent pas
   * injecter deux fois le meme script.
   *
   * L'identifiant d'application est PUBLIC (il voyage deja dans le HTML des
   * dix-sept pages) ; ce n'est pas un secret, c'est le nom du projet cote
   * Privy. */
  var PRIVY_APP_ID = 'cmsga0yzp00a50biaf9vlzzd2';
  var chargePrivy = null;
  function assurePrivy() {
    if (window.SwogePrivy) return Promise.resolve(window.SwogePrivy);
    if (chargePrivy) return chargePrivy;
    chargePrivy = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'privy-swoge.js';
      s.onload = function () {
        try { window.SwogePrivy.init(PRIVY_APP_ID); } catch (e) {}
        res(window.SwogePrivy);
      };
      s.onerror = function () { chargePrivy = null; rej(new Error('privy')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return chargePrivy;
  }

  function portefeuilleEmail() {
    return assurePrivy().then(function (P) {
      if (!P) return null;
      var suite = (P.restore) ? P.restore()
                : Promise.resolve(P.isLoggedIn && P.isLoggedIn() ? P.getAddress() : null);
      return Promise.resolve(suite).then(function (adr) {
        adr = adr || (P.getAddress && P.getAddress());
        if (!adr) return null;
        return { eip1193: P.getProvider(), adresse: adr };
      });
    }).catch(function () { return null; });
  }

  function portefeuille() {
    var mode = '';
    try { mode = localStorage.getItem('swogeAuth') || ''; } catch (e) {}
    if (mode === 'email') {
      /* Deja pret : on ne repasse pas par le chargement. */
      if (window.SwogePrivy && SwogePrivy.getAddress && SwogePrivy.getAddress()) {
        return Promise.resolve({ eip1193: SwogePrivy.getProvider(), adresse: SwogePrivy.getAddress() });
      }
      return portefeuilleEmail().then(function (w) {
        if (w) return w;
        /* On ne retombe PAS sur window.ethereum : un compte email et une
           extension installee sur la meme machine sont deux adresses
           differentes, et deposer depuis la mauvaise enverrait les jetons
           sur un solde qui n'est pas le sien. */
        return null;
      });
    }
    if (window.ethereum) {
      return window.ethereum.request({ method: 'eth_accounts' }).then(function (cs) {
        if (!cs || !cs.length) return null;
        return { eip1193: window.ethereum, adresse: cs[0] };
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }
  /* Le signataire, sur la bonne chaine. On propose le changement de reseau
     plutot que de refuser : un joueur qui a MetaMask sur Ethereum ne sait pas
     forcement qu'il existe une chaine Robinhood. */
  function signataire() {
    return portefeuille().then(function (w) {
      /* « Sign in first » etait faux et deroutant pour quelqu'un qui voyait
         son pseudo et son solde a l'ecran. On distingue les deux cas. */
      if (!w) {
        var mode = '';
        try { mode = localStorage.getItem('swogeAuth') || ''; } catch (e) {}
        /* « Rechargez la page » etait un mauvais conseil : recharger ne
           ressuscite pas un portefeuille qui ne repond pas. Et on n'affirme
           PAS pourquoi il ne repond pas — session expiree, module qui refuse
           de s'ouvrir, autre chose : je ne l'ai pas etabli, et un message qui
           donne une cause fausse fait chercher au mauvais endroit. On dit ce
           qu'on sait, et on donne le chemin qui marche a coup sur : la page
           qui porte le formulaire de connexion complet, ouverte directement
           sur le depot. */
        var err = new Error(mode
          ? 'Your wallet did not open — sign in again to deposit'
          : 'Sign in first');
        /* ON NE DEPLACE PLUS PERSONNE. La sortie envoyait sur le Coin Pusher :
           le joueur tapait « me reconnecter » depuis le hall et se retrouvait
           dans un autre jeu, loin de ce qu'il voulait faire. Le formulaire de
           connexion de stakebubble.js sait se rouvrir SUR PLACE, et il
           recharge la meme page une fois signe. On l'appelle, et on ne garde
           le lien que si ce fichier tourne seul, sans lui. */
        err.sortie = (window.swogeConnexion && window.swogeConnexion.ouvre)
          ? { texte: 'Sign in again →', fait: function () { window.swogeConnexion.ouvre(); } }
          : { texte: 'Sign in and deposit →', href: 'swoge_pusher.html#deposit' };
        throw err;
      }
      if (typeof ethers === 'undefined') throw new Error('Chain library not loaded — reload the page');
      var fp = new ethers.providers.Web3Provider(w.eip1193, 'any');
      return fp.getNetwork().then(function (n) {
        if (n.chainId === CHAIN.id) return null;
        if (!w.eip1193.request) throw new Error('Wrong network — switch to ' + CHAIN.name);
        return w.eip1193.request({
          method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }]
        }).catch(function (sw) {
          if (sw && sw.code === 4902) {
            return w.eip1193.request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: CHAIN.hex, chainName: CHAIN.name,
                         nativeCurrency: { name: CHAIN.sym, symbol: CHAIN.sym, decimals: 18 },
                         rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.scan] }]
            });
          }
          throw sw;
        });
      }).then(function () {
        return { signer: new ethers.providers.Web3Provider(w.eip1193, 'any').getSigner(),
                 adresse: w.adresse };
      });
    });
  }

  function litSoldesChaine() {
    var lec = lecteur();
    if (!lec || !ADR) return;
    try {
      lec.getBalance(ADR).then(function (b) {
        PORTE.eth = Number(ethers.utils.formatEther(b));
        poseTout();
      }).catch(function () {});
      new ethers.Contract(TOKEN, ERC20_ABI, lec).balanceOf(ADR).then(function (b) {
        PORTE.swoge = Number(ethers.utils.formatUnits(b, 18));
        poseTout();
      }).catch(function () {});
    } catch (e) {}
  }

  // ----------------------------------------------------------- les panneaux
  var PANNEAUX = ['wallet', 'dep', 'wd', 'stake', 'quests'];
  var QUETES = null, BONUS = null;
  var monte = false;

  function style() {
    if ($('swc-css')) return;
    var c = document.createElement('style');
    c.id = 'swc-css';
    c.textContent =
      /* Le voile et les boites. Ce sont les memes marques que sur les pages de
         jeu — #ovl, .box, .show — parce que c'est ce que stakebubble.js cherche
         pour emprunter une boite et l'ouvrir dans le tiroir. */
      '#ovl{position:fixed;inset:0;z-index:9998;display:none;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(4,6,12,.74);}' +
      '#ovl.show{display:flex;}' +
      '#ovl .box{display:none;width:min(420px,100%);max-height:88vh;overflow:auto;' +
      'padding:16px;border-radius:16px;background:#0E1422;color:#EAF2FF;' +
      'border:1px solid rgba(255,197,61,.28);box-shadow:0 24px 60px rgba(0,0,0,.6);}' +
      '#ovl .box.show{display:block;}' +
      '.swc h4{margin:0 0 10px;font-size:14px;letter-spacing:.4px;color:#FFD97A;}' +
      /* Dans le tiroir, la barre de retour porte deja le nom de la section :
         le titre du panneau le repetait mot pour mot, deux lignes plus bas.
         C'est la meme raison qui fait disparaitre les titres peints des
         pages de jeu quand leur boite est empruntee. */
      '#swpHote .swc h4{display:none!important;}' +
      '.swc label{display:block;margin:12px 0 5px;font-size:10.5px;letter-spacing:1px;' +
      'text-transform:uppercase;color:#8DA0C4;}' +
      '.swc input{width:100%;box-sizing:border-box;padding:11px;border-radius:11px;' +
      'font-family:inherit;font-size:15px;text-align:center;color:#EAF2FF;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.12);}' +
      /* Les cartes de solde : meme forme que celles du portefeuille dans le
         tiroir, pour qu'on reconnaisse la meme chose au meme endroit. */
      '.swc-c{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:11px 13px;margin:0 0 7px;border-radius:12px;font-size:11.5px;color:#8DA0C4;' +
      'background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);}' +
      '.swc-c b{font-size:14px;font-weight:800;color:#EAF2FF;font-variant-numeric:tabular-nums;}' +
      '.swc-c.or{padding:14px;background:rgba(255,197,61,.07);border-color:rgba(255,197,61,.20);}' +
      '.swc-c.or b{font-size:22px;color:#FFD97A;}' +
      '.swc-adr{width:100%;box-sizing:border-box;padding:12px 8px;border-radius:11px;' +
      'text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:min(11.5px,2.8vw);color:#C6D3EA;background:rgba(0,0,0,.30);' +
      'border:1px solid rgba(255,255,255,.10);}' +
      '.swc-b{display:block;width:100%;box-sizing:border-box;margin:8px 0 0;padding:12px;' +
      'border-radius:11px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:800;' +
      'text-align:center;text-decoration:none;color:#EAF2FF;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);}' +
      '.swc-b.p{margin-top:14px;padding:13px;color:#231a06;border-color:transparent;' +
      'background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swc-b.g{color:#FFD97A;background:rgba(255,197,61,.10);border-color:rgba(255,197,61,.34);}' +
      '.swc-b.d{margin-top:16px;padding:10px;font-size:11.5px;font-weight:700;color:#F2685E;' +
      'background:transparent;border-color:rgba(242,104,94,.28);}' +
      '.swc-b[disabled]{opacity:.45;cursor:default;}' +
      '.swc-pc{display:flex;gap:6px;margin-top:8px;}' +
      '.swc-pc button{flex:1 1 0;min-width:0;padding:8px 2px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:700;color:#FFD97A;' +
      'background:rgba(255,197,61,.10);border:1px solid rgba(255,197,61,.30);}' +
      '.swc-n{margin-top:9px;font-size:11.5px;line-height:1.5;color:#8DA0C4;text-align:left;}' +
      /* Les quetes : une carte par quete, une barre, un bouton. */
      '.swc-wc{margin:0 0 10px;padding:11px 12px;border-radius:12px;text-align:left;' +
      'background:rgba(255,197,61,.07);border:1px solid rgba(255,197,61,.20);}' +
      '.swc-wc-t{font-size:12px;font-weight:800;color:#FFD97A;}' +
      '.swc-days{display:flex;gap:5px;margin:9px 0 2px;}' +
      '.swc-d{flex:1 1 0;min-width:0;padding:6px 2px;border-radius:9px;text-align:center;' +
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);}' +
      '.swc-d span{display:block;font-size:9.5px;color:#8DA0C4;}' +
      '.swc-d b{display:block;font-size:10.5px;color:#C6D3EA;}' +
      '.swc-d.ok{background:rgba(124,255,155,.10);border-color:rgba(124,255,155,.32);}' +
      '.swc-d.ok b{color:#7CFF9B;}' +
      '.swc-d.now{background:rgba(255,197,61,.14);border-color:rgba(255,197,61,.45);}' +
      '.swc-d.now b{color:#FFD97A;}' +
      '.swc-q{margin:0 0 8px;padding:11px 12px;border-radius:12px;text-align:left;' +
      'background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);}' +
      '.swc-q-h{font-size:12.5px;font-weight:700;color:#EAF2FF;}' +
      '.swc-q-b{height:6px;margin:8px 0 2px;border-radius:99px;overflow:hidden;' +
      'background:rgba(255,255,255,.08);}' +
      '.swc-q-b i{display:block;height:100%;border-radius:99px;' +
      'background:linear-gradient(90deg,#E6A537,#F2C868);}' +
      '.swc-q .swc-b{margin-top:8px;padding:9px;font-size:12px;}' +
      '.swc-n b{color:#FFC53D;}' +
      /* Le message. Au-dessus du tiroir (9999) : il commente souvent ce qui
         vient d'y etre fait. */
      /* `--swbb-h` est la hauteur MESUREE de la barre du bas, publiee par
         stakebubble.js. Sans ce decalage — et sans un z-index superieur au
         sien — ce bandeau se peint DERRIERE elle : c'est ce qui faisait
         qu'un depot rate ou reussi ne disait jamais rien au joueur. Le
         repli a 0px vaut pour les pages sans barre. */
      '.swc-msg{position:fixed;left:50%;bottom:calc(var(--swbb-h,0px) + 14px);' +
      'z-index:2147483000;transform:translate(-50%,14px);' +
      'max-width:min(420px,92vw);padding:11px 15px;border-radius:12px;opacity:0;' +
      'pointer-events:none;transition:opacity .18s,transform .18s;' +
      'font-family:inherit;font-size:12.5px;font-weight:700;color:#EAF2FF;' +
      'background:rgba(14,20,34,.97);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 34px rgba(0,0,0,.55);}' +
      '.swc-msg.on{opacity:1;transform:translate(-50%,0);}' +
      '.swc-msg.ok{border-color:rgba(124,255,155,.45);}' +
      '.swc-msg.ko{border-color:rgba(242,104,94,.5);}' +
      /* Sans action le bandeau est traversant, pour ne jamais gener un
         geste ; des qu'il en porte une, il faut pouvoir la toucher. */
      '.swc-msg.act{pointer-events:auto;}' +
      '.swc-msg a,.swc-msg button{display:block;width:100%;border:0;font:inherit;cursor:pointer;' +
      'margin-top:9px;padding:9px 12px;border-radius:9px;' +
      'background:#FFC53D;color:#141A24;text-decoration:none;text-align:center;' +
      'font-weight:800;font-size:12.5px;}';
    document.head.appendChild(c);
  }

  /* Le menu que le tiroir REFLETE. Il n'est jamais montre : stakebubble.js le
     masque des qu'il l'a copie. C'est une declaration, pas une interface —
     l'endroit ou l'on dit quelles rangees existent et ce qu'elles ouvrent. */
  function poseMenu() {
    if ($('menu')) return;
    var m = document.createElement('div');
    m.className = 'menu'; m.id = 'menu';
    m.style.display = 'none';
    var ici = (location.pathname.split('/').pop() || '').toLowerCase();
    m.innerHTML =
      '<a href="#" data-panel="wallet">👛 My Wallet</a>' +
      '<a href="#" data-panel="stake">🔒 Staking</a>' +
      '<a href="#" data-panel="dep">💰 Deposit</a>' +
      '<a href="#" data-panel="wd">🏧 Withdraw</a>' +
      '<a href="#" data-panel="quests">🎯 Daily Quests</a>' +
      '<div class="msep"></div>' +
      (ici === 'games.html' ? '' : '<a href="games.html">🎮 Other games</a>') +
      '<a href="index.html">🏠 Home</a>';
    (document.body || document.documentElement).appendChild(m);
    m.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-panel]') : null;
      if (!a) return;
      e.preventDefault();
      ouvre(a.getAttribute('data-panel'));
    });
  }

  function poseBoites() {
    if ($('ovl')) return;
    var o = document.createElement('div');
    o.className = 'ovl'; o.id = 'ovl';
    o.innerHTML =
      '<div class="box swc" id="box-wallet"><div class="pscroll">' +
        '<h4>👛 My Wallet</h4>' +
        '<div class="swc-c or"><span>$SWOGE in wallet</span><b id="swcWSwoge">…</b></div>' +
        '<div class="swc-c"><span>ETH (RH) — gas</span><b id="swcWEth">…</b></div>' +
        '<label>Your address</label>' +
        '<div class="swc-adr" id="swcWAdr">…</div>' +
        '<button class="swc-b g" id="swcWCopy" type="button">Copy</button>' +
        '<button class="swc-b p" id="swcWDep" type="button">Deposit</button>' +
        '<a class="swc-b" id="swcWScan" target="_blank" rel="noopener">Explorer ↗</a>' +
        '<button class="swc-b d" id="swcWOut" type="button">Disconnect</button>' +
        '<button class="swc-b" data-close type="button">Close</button>' +
      '</div></div>' +

      '<div class="box swc" id="box-dep"><div class="pscroll">' +
        '<h4>💰 Deposit</h4>' +
        '<div class="swc-c or"><span>$SWOGE in wallet</span><b id="swcDSwoge">…</b></div>' +
        '<div class="swc-c"><span>ETH (RH) — gas</span><b id="swcDEth">…</b></div>' +
        '<div class="swc-n">Depositing moves $SWOGE <b>from your own wallet</b> into your ' +
          'game balance. You need both at your address: $SWOGE to play with, and a few ' +
          'cents of ETH (RH) to pay for the transfer.</div>' +
        '<label>Amount</label>' +
        '<input id="swcDAmt" inputmode="decimal" placeholder="e.g. 100">' +
        '<div class="swc-pc" data-pc="d">' +
          '<button type="button" data-p="10">10%</button>' +
          '<button type="button" data-p="25">25%</button>' +
          '<button type="button" data-p="50">50%</button>' +
          '<button type="button" data-p="100">MAX</button>' +
        '</div>' +
        '<button class="swc-b p" id="swcDGo" type="button">Deposit and play</button>' +
        '<button class="swc-b" data-close type="button">Close</button>' +
      '</div></div>' +

      '<div class="box swc" id="box-wd"><div class="pscroll">' +
        '<h4>🏧 Withdraw</h4>' +
        '<div class="swc-c or"><span>Game balance</span><b id="swcWdBal">…</b></div>' +
        '<label>Amount</label>' +
        '<input id="wdAmt" inputmode="decimal" placeholder="e.g. 100">' +
        '<div class="swc-pc" data-pc="w">' +
          '<button type="button" data-p="10">10%</button>' +
          '<button type="button" data-p="25">25%</button>' +
          '<button type="button" data-p="50">50%</button>' +
          '<button type="button" data-p="100">MAX</button>' +
        '</div>' +
        '<div class="swc-n" id="swcWdNote"></div>' +
        '<button class="swc-b p" id="swcWdGo" type="button">Withdraw</button>' +
        '<button class="swc-b" data-close type="button">Close</button>' +
      '</div></div>' +

      '<div class="box swc" id="box-quests"><div class="pscroll">' +
        '<h4>🎯 Daily Quests</h4>' +
        '<div id="swcWc" class="swc-wc" style="display:none">' +
          '<div class="swc-wc-t">🎁 Welcome bonus</div>' +
          '<div class="swc-n" id="swcWcNote"></div>' +
          '<button class="swc-b p" id="swcWcGo" type="button">Claim</button>' +
        '</div>' +
        '<div id="swcStk" class="swc-wc" style="display:none">' +
          '<div class="swc-wc-t">🔥 Daily streak</div>' +
          '<div class="swc-days" id="swcDays"></div>' +
          '<button class="swc-b g" id="swcStkGo" type="button">Claim today</button>' +
        '</div>' +
        '<div id="swcQrows"></div>' +
        '<button class="swc-b" data-close type="button">Close</button>' +
      '</div></div>' +

      '<div class="box swc" id="box-stake"><div class="pscroll">' +
        '<h4>🔒 Staking</h4>' +
        '<div class="swc-c or"><span>Staked</span><b id="swcSStaked">…</b></div>' +
        '<div class="swc-c"><span>Pending yield</span><b id="swcSPending">…</b></div>' +
        '<div class="swc-c"><span>Unlocked</span><b id="swcSUnlocked">…</b></div>' +
        '<div class="swc-n" id="swcSNote"></div>' +
        '<label>Amount to stake</label>' +
        '<input id="swcSAmt" inputmode="decimal" placeholder="e.g. 1000">' +
        '<button class="swc-b p" id="swcSGo" type="button">Stake</button>' +
        '<button class="swc-b g" id="swcSClaim" type="button">Claim yield</button>' +
        '<button class="swc-b d" id="swcSOut" type="button">Unstake everything</button>' +
        '<button class="swc-b" data-close type="button">Close</button>' +
      '</div></div>';
    (document.body || document.documentElement).appendChild(o);

    /* Le voile ne recoit qu'un seul geste : le clic a cote, qui ferme. */
    o.addEventListener('click', function (e) { if (e.target === o) ferme(); });

    /* Tout le reste est delegue A CHAQUE BOITE, pas au voile.
     *
     * Ce n'est pas un detail de style : le tiroir du profil DEPLACE la boite
     * hors du voile pour l'ouvrir chez lui. Un gestionnaire pose sur le voile
     * ne voit alors plus rien passer — les boutons de pourcentage etaient
     * dessines, cliquables, et ne remplissaient rien. Une boite, elle, emmene
     * ses ecouteurs avec elle : deplacer un noeud n'en detache aucun. */
    [].forEach.call(o.querySelectorAll('.box'), function (boite) {
      boite.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        if (e.target.closest('[data-close]')) return ferme();
        var pc = e.target.closest('.swc-pc button');
        if (pc) pourcent(pc.parentNode.getAttribute('data-pc'), Number(pc.dataset.p));
      });
    });

    $('swcWCopy').addEventListener('click', function () {
      if (!ADR) return;
      var b = this;
      /* `writeText` rend une PROMESSE : un `try` ne rattrape pas son echec, et
         un navigateur qui refuse le presse-papiers — c'est le cas hors d'un
         geste juge sur, ou dans un onglet sans permission — laissait un rejet
         non traite dans la console. On attrape des deux cotes. */
      try { var q = navigator.clipboard.writeText(ADR); if (q && q.catch) q.catch(function () {}); }
      catch (e) {}
      b.textContent = 'Copied ✓';
      setTimeout(function () { b.textContent = 'Copy'; }, 1400);
    });
    $('swcWDep').addEventListener('click', function () { vaVers('dep', /Deposit/i); });
    $('swcWOut').addEventListener('click', deconnecte);
    $('swcDGo').addEventListener('click', depose);
    $('swcWdGo').addEventListener('click', demandeRetrait);
    $('swcSGo').addEventListener('click', mise);
    $('swcSClaim').addEventListener('click', function () { demande('claimStake'); });
    $('swcSOut').addEventListener('click', retireMise);
    $('swcWcGo').addEventListener('click', function () { demande('claimWelcome'); });
    $('swcStkGo').addEventListener('click', function () { demande('claimStreak'); });
    /* Les rangees de quetes sont refaites a chaque reponse : on delegue a leur
       conteneur plutot que d'accrocher un ecouteur par bouton a chaque fois. */
    $('swcQrows').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-q]') : null;
      if (b && !b.disabled) demande('claimQuest', { id: b.getAttribute('data-q') });
    });
  }

  function pourcent(quoi, p) {
    var base = quoi === 'd' ? (PORTE.swoge || 0) : SOLDE;
    if (!(base > 0)) return dit(quoi === 'd' ? 'No $SWOGE in your wallet' : 'No game balance', 'ko');
    var v = Math.floor(base * p / 100 * 10000) / 10000;
    $(quoi === 'd' ? 'swcDAmt' : 'wdAmt').value = String(v);
  }

  function ouvre(nom) {
    poseBoites();
    if (!ADR) { dit('Sign in first — the button in the top bar', 'ko'); return; }
    $('ovl').classList.add('show');
    PANNEAUX.forEach(function (b) {
      var el = $('box-' + b);
      if (!el) return;
      /* On efface le style EN LIGNE avant de poser la classe. Quand le tiroir
         rend une boite qu'il avait empruntee, il lui repose le display qu'elle
         avait — c'est-a-dire `none`, puisqu'elle etait fermee. Un style en
         ligne l'emporte sur n'importe quelle feuille : sans cet effacement, un
         panneau ouvert une premiere fois ne se rouvrirait jamais. */
      el.style.removeProperty('display');
      el.classList.toggle('show', b === nom);
    });
    if (nom === 'wallet' || nom === 'dep') litSoldesChaine();
    if (nom === 'stake') demande('stakeInfo');
    if (nom === 'quests') { demande('quests'); demande('bonusState'); }
    poseTout();
  }
  /* ---- ALLER D'UN PANNEAU A L'AUTRE ----
   *
   * « Deposit » depuis le portefeuille ne doit PAS passer par notre propre
   * ouverture. Quand le panneau est affiche, il n'est plus chez nous : le
   * tiroir l'a DEPLACE chez lui. Rallumer le voile posait donc une fenetre au
   * milieu de la page, par-dessus le tiroir — deux presentations du meme
   * compte a l'ecran en meme temps, et un retour qui ne ramene pas ou l'on
   * croit.
   *
   * On appuie donc sur la RANGEE du tiroir, exactement comme le ferait le
   * joueur : elle rend la boite empruntee, emprunte la suivante, et met a jour
   * la barre de retour. Hors du tiroir — s'il n'a pas ete monte, faute de
   * connexion — on ouvre nous-memes, comme avant.
   */
  function vaVers(nom, motif) {
    if (document.querySelector('.swpov.on')) {
      var rs = document.querySelectorAll('.swp-t button');
      for (var i = 0; i < rs.length; i++) {
        if (motif.test(rs[i].textContent || '')) { rs[i].click(); return; }
      }
    }
    ouvre(nom);
  }

  function ferme() {
    var o = $('ovl');
    if (!o) return;
    o.classList.remove('show');
    PANNEAUX.forEach(function (b) { var el = $('box-' + b); if (el) el.classList.remove('show'); });
  }

  function poseTout() {
    if (!$('ovl')) return;
    var pose = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    var sw = PORTE.swoge == null ? '…' : nb(PORTE.swoge);
    var et = PORTE.eth == null ? '…' : PORTE.eth.toFixed(5);
    pose('swcWSwoge', sw); pose('swcDSwoge', sw);
    pose('swcWEth', et);   pose('swcDEth', et);
    pose('swcWAdr', ADR || '…');
    pose('swcWdBal', nb(SOLDE));
    var scan = $('swcWScan');
    if (scan && ADR) scan.href = CHAIN.scan + '/address/' + ADR;
    pose('swcSStaked', nb(ST.staked));
    pose('swcSPending', nb(acquisCourant(), 4));
    pose('swcSUnlocked', nb(ST.unlocked));
    var n = $('swcSNote');
    if (n) {
      n.innerHTML = '<b>' + (ST.aprBps / 100) + '% APR</b> · locked ' + ST.lockDays +
        ' days · yield every second.' +
        (ST.locked > 0
          ? ' <b>' + nb(ST.locked) + '</b> still locked — unstaking now forfeits ' +
            (ST.penaltyBps / 100) + '% of it.'
          : ST.staked > 0 ? ' All unlocked — unstake with no penalty.' : '');
    }
    var w = $('swcWdNote');
    if (w) w.innerHTML = 'Minimum <b>' + MIN_WD + ' $SWOGE</b>. Paid straight to your ' +
      'wallet: the server signs a voucher, your wallet confirms the transfer.';
  }
  /* Les quetes du jour. Trois blocs qui viennent du serveur et n'ont aucune
     regle ici : ce qui est reclamable, ce qui est verrouille et ce que ca
     rapporte sont decides la-bas. On ne fait que peindre. */
  function poseQuetes() {
    if (!$('box-quests')) return;
    var b = BONUS || {};

    var wc = $('swcWc');
    if (wc) {
      var w = b.welcome;
      if (!w || w.claimed) wc.style.display = 'none';
      else {
        wc.style.display = '';
        $('swcWcNote').innerHTML = w.claimable
          ? 'Your welcome reward is ready: <b>+' + w.reward + ' $SWOGE</b>.'
          : 'You got <b>' + w.amount + ' $SWOGE</b> to try the games — play them to ' +
            'unlock <b>+' + w.reward + '</b>.';
        var g = $('swcWcGo');
        g.disabled = !w.claimable;
        g.textContent = w.claimable ? 'Claim +' + w.reward : 'Play your bonus first';
      }
    }

    var stk = $('swcStk');
    if (stk) {
      var s2 = b.streak;
      if (!s2) stk.style.display = 'none';
      else {
        stk.style.display = '';
        var rw = s2.rewards || [], h = '';
        for (var i = 0; i < rw.length; i++) {
          var jour = i + 1, cl = 'swc-d';
          if (s2.claimedToday) { if (jour <= s2.day) cl += ' ok'; }
          else if (jour < s2.day) cl += ' ok';
          else if (jour === s2.day) cl += ' now';
          h += '<div class="' + cl + '"><span>' + jour + '</span><b>+' + rw[i] + '</b></div>';
        }
        $('swcDays').innerHTML = h;
        var sg = $('swcStkGo');
        sg.disabled = !s2.claimable;
        sg.textContent = s2.claimable
          ? 'Claim day ' + s2.day + ' (+' + s2.todayReward + ')'
          : '✓ Claimed today';
      }
    }

    var box = $('swcQrows');
    if (!box) return;
    if (!QUETES || !QUETES.length) {
      box.innerHTML = '<div class="swc-n">No quest today — come back tomorrow.</div>';
      return;
    }
    box.innerHTML = QUETES.map(function (q) {
      var but = (q.target != null ? q.target : (q.goal != null ? q.goal : 0));
      var fait = q.progress || 0;
      var termine = (q.done != null) ? q.done : (but > 0 ? fait >= but : true);
      var prenable = (q.claimable != null) ? q.claimable : (termine && !q.claimed && !q.locked);
      var pct = but > 0 ? Math.min(100, Math.round(100 * fait / but)) : (termine ? 100 : 0);
      var libelle = q.claimed ? '✓ Claimed'
        : prenable ? 'Claim +' + q.reward
        : q.locked ? '🔒 Deposit to unlock'
        : but > 0 ? fait + ' / ' + but : 'Play to unlock';
      return '<div class="swc-q">' +
        '<div class="swc-q-h">' + ech(q.label || q.id) + '</div>' +
        '<div class="swc-q-b"><i style="width:' + pct + '%"></i></div>' +
        '<button class="swc-b' + (prenable ? ' g' : '') + '" data-q="' + ech(q.id) + '"' +
        (prenable ? '' : ' disabled') + '>' + ech(libelle) + '</button>' +
        '</div>';
    }).join('');
  }
  function ech(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Le rendement coule : on repeint la seule ligne qui bouge, et seulement
     quand le panneau du staking est ouvert. */
  setInterval(function () {
    var b = $('box-stake');
    if (b && b.classList.contains('show')) {
      var e = $('swcSPending');
      if (e) e.textContent = nb(acquisCourant(), 4);
    }
  }, 250);

  // -------------------------------------------------------------- les gestes
  function depose() {
    var s = ($('swcDAmt').value || '').replace(',', '.').trim();
    if (!(parseFloat(s) > 0)) return dit('Enter an amount', 'ko');
    if (!VAULT) return dit('The server has no vault set — try again in a moment', 'ko');
    var bouton = $('swcDGo');
    bouton.disabled = true;
    signataire().then(function (w) {
      var montant = ethers.utils.parseUnits(s, 18);
      var jeton = new ethers.Contract(TOKEN, ERC20_ABI, w.signer);
      var coffre = new ethers.Contract(VAULT, VAULT_ABI, w.signer);
      /* L'autorisation est demandee UNE FOIS, pour un montant illimite : la
         redemander a chaque depot ferait payer deux transactions au lieu
         d'une, a chaque fois. */
      return jeton.allowance(w.adresse, VAULT).then(function (a) {
        if (!a.lt(montant)) return null;
        dit('Approve $SWOGE in your wallet…');
        return jeton.approve(VAULT, ethers.constants.MaxUint256)
          .then(function (t) { return t.wait(); });
      }).then(function () {
        dit('Depositing…');
        return coffre.deposit(montant);
      }).then(function (t) { return t.wait(); });
    }).then(function () {
      dit('✅ Deposited — your balance updates in a moment', 'ok');
      $('swcDAmt').value = '';
      ferme();
      litSoldesChaine();
      demande('balance');
    }).catch(function (e) {
      dit('Deposit: ' + String((e && (e.reason || e.message)) || e).slice(0, 90), 'ko',
          e && e.sortie);
    }).then(function () { bouton.disabled = false; });
  }

  function demandeRetrait() {
    var s = ($('wdAmt').value || '').replace(',', '.').trim();
    if (!(parseFloat(s) >= MIN_WD)) return dit('Minimum ' + MIN_WD + ' $SWOGE', 'ko');
    if (parseFloat(s) > SOLDE) return dit('More than your balance', 'ko');
    if (!demande('withdraw', { amount: s })) return dit('Not connected — try again in a few seconds', 'ko');
    dit('Requesting a voucher…');
  }
  /* Le retrait se termine SUR LA CHAINE : le serveur signe un bon, et c'est le
     joueur qui l'encaisse depuis son propre portefeuille. */
  function envoieRetrait(v) {
    if (!v) return;
    signataire().then(function (w) {
      var coffre = new ethers.Contract(v.vault || VAULT, VAULT_ABI, w.signer);
      dit('Confirm the withdrawal in your wallet…');
      return coffre.withdraw(v.cumulative, v.deadline, v.v, v.r, v.s)
        .then(function (t) { return t.wait(); });
    }).then(function () {
      dit('✅ Paid to your wallet', 'ok');
      ferme(); litSoldesChaine();
    }).catch(function (e) {
      dit('Withdraw: ' + String((e && (e.reason || e.message)) || e).slice(0, 90), 'ko',
          e && e.sortie);
    });
  }

  function mise() {
    var v = ($('swcSAmt').value || '').replace(',', '.').trim();
    if (!(parseFloat(v) > 0)) return dit('Enter an amount', 'ko');
    if (parseFloat(v) > SOLDE) return dit('More than your balance', 'ko');
    if (!window.confirm('Stake ' + v + ' $SWOGE at ' + (ST.aprBps / 100) + '% APR?\n\n' +
        'Locked ' + ST.lockDays + ' days. Unstaking early forfeits ' +
        (ST.penaltyBps / 100) + '% of what is still locked.')) return;
    if (!demande('stake', { amount: v })) return dit('Not connected', 'ko');
    $('swcSAmt').value = '';
  }
  function retireMise() {
    if (!(ST.staked > 0)) return dit('Nothing staked', 'ko');
    if (ST.locked > 0 && !window.confirm('⚠️ ' + nb(ST.locked) +
        ' $SWOGE is still locked. Unstaking now forfeits ' +
        (ST.penaltyBps / 100) + '% of it. Continue?')) return;
    demande('unstake');
  }

  function deconnecte() {
    if (!window.confirm('Sign out of this device?')) return;
    try { localStorage.removeItem('swogeSession'); } catch (e) {}
    try { localStorage.removeItem('swogeAuth'); } catch (e) {}
    location.reload();
  }

  // ------------------------------------------------------------- l'amorce
  function amorce() {
    if (monte) return;
    if (dejaEquipee()) return;     // une page a pu se garnir entre-temps
    monte = true;
    style(); poseMenu(); poseBoites();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', amorce);
  else amorce();
})();
