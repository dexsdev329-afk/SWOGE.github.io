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
    'function balanceOf(address) view returns (uint256)',
    /* Ajoute pour « Send to another address », plus bas : sans lui, le
       contrat ne connait pas le transfert et l'envoi echoue a l'appel. */
    'function transfer(address,uint256) returns (bool)'
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
  function dit(t, cl, action, garde) {
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
    /* ---- UN MESSAGE D'ATTENTE NE S'EFFACE PAS AVANT LA FIN DE L'ATTENTE ----
     * « Opening your wallet… » disparaissait au bout de quatre secondes alors
     * que l'ouverture peut en prendre douze. Le joueur voyait donc un mot,
     * puis huit secondes de silence complet — c'est-a-dire exactement le
     * symptome qu'on cherchait a supprimer, un peu plus tard. Un message qui
     * decrit quelque chose EN COURS reste jusqu'a ce que le suivant le
     * remplace.
     *
     * Un message qu'on doit pouvoir TOUCHER reste plus longtemps aussi :
     * quatre secondes suffisent a lire, pas a decider puis viser. */
    if (garde) return;
    /* ---- UNE REPARATION NE S'EFFACE PAS ----
     * Onze secondes suffisent a lire un message et a viser un bouton. Elles ne
     * suffisent PAS quand le bouton ouvre un formulaire qu'il faut ensuite
     * remplir : le joueur lisait la phrase, touchait « Unlock », et la
     * minuterie posee AVANT son geste effacait le formulaire sous ses yeux.
     * Rapporte tel quel — « le bouton unlock my wallet fonctionne pas » — et
     * c'etait vrai : il fonctionnait, puis le compte a rebours reprenait ce
     * qu'il venait d'ouvrir.
     * Une action marquee `persiste` ne s'efface donc jamais toute seule. Elle
     * s'en va quand le joueur la resout ou qu'un autre message la remplace,
     * ce qui est le seul moment ou l'on sait qu'il n'en a plus besoin. */
    if (action && action.persiste) return;
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
    if (m.type === 'bonAttente') {
      var attend = parseFloat(m.montant) || 0;
      montreLeBon(attend > 0, attend);
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
  /* ---- NOS PHRASES NE SE FONT PAS COUPER ----
   * La troncature a 90 caracteres existe pour qu'une erreur de la chaine — un
   * pave de JSON-RPC — ne remplisse pas l'ecran. Mais elle coupait AUSSI les
   * messages qu'on ecrit nous-memes, et « open sw » au lieu de « open
   * swoleeswoge.dog in Chrome or Safari » supprime justement le conseil.
   * Nos erreurs portent une sortie (`e.sortie`) : c'est a ca qu'on les
   * reconnait, et celles-la passent entieres. Le prefixe non plus n'a pas
   * lieu d'etre sur une phrase deja redigee pour le joueur. */
  function texteErreur(quoi, e) {
    if (e && e.sortie) return String(e.message || e);
    return quoi + ': ' + String((e && (e.reason || e.message)) || e).slice(0, 90);
  }

  /* ================== UNE PROMESSE QUI NE REPOND JAMAIS ==================
   *
   * Un joueur a signale que « Deposit and play » ne faisait RIEN : aucune
   * erreur, aucune confirmation, rien. Reproduit : ce n'est pas un message
   * peint au mauvais endroit, c'est le portefeuille qui ne repond NI oui NI
   * non. `SwogePrivy.restore()` ouvre une iframe cachee chez Privy et attend
   * qu'elle reponde ; quand cette iframe ne peut pas fonctionner — c'est le
   * cas dans le navigateur interne de Telegram, qui cloisonne le stockage
   * des tiers — la promesse ne se resout jamais et ne se rejette jamais.
   *
   * Or `.catch()` ne rattrape PAS une promesse qui ne finit pas. Toute la
   * suite du depot — le message d'erreur, la reactivation du bouton — vivait
   * derriere ce `.then()` qui n'arrivait jamais. Le bouton restait grise et
   * muet, pour toujours.
   *
   * D'ou cette fonction. Elle ne repare pas le portefeuille : elle garantit
   * qu'on finit TOUJOURS par dire quelque chose au joueur. Un echec annonce
   * vaut infiniment mieux qu'un bouton mort.
   */
  function avecDelai(promesse, ms, message) {
    return new Promise(function (res, rej) {
      var fini = false;
      var t = setTimeout(function () {
        if (fini) return;
        fini = true;
        rej(new Error(message));
      }, ms);
      Promise.resolve(promesse).then(function (v) {
        if (fini) return;
        fini = true; clearTimeout(t); res(v);
      }, function (e) {
        if (fini) return;
        fini = true; clearTimeout(t); rej(e);
      });
    });
  }

  /* Douze secondes. Assez pour un telephone lent sur un reseau lent — ouvrir
     un portefeuille embarque demande un aller-retour reseau puis une poignee
     de main avec une iframe — et assez court pour qu'un joueur n'ait pas
     encore conclu que le bouton est casse. Ce delai ne couvre QUE l'ouverture
     du portefeuille : jamais la transaction elle-meme, qui attend legitimement
     que le joueur confirme et peut prendre une minute. */
  var DELAI_PORTEFEUILLE = 12000;
  /* Le second essai : l'iframe est deja montee et chargee, elle repond en
     quelques dizaines de millisecondes ou elle ne repondra jamais. */
  var DELAI_RETOUR = 6000;

  /* ---- LE NAVIGATEUR INTERNE D'UNE APPLICATION ----
   *
   * Telegram, Facebook, Instagram : leur navigateur embarque n'est pas Chrome
   * ni Safari, et il cloisonne — voire interdit — le stockage des sites
   * tiers. Un portefeuille embarque, qui vit precisement dans une iframe
   * tierce, y echoue souvent.
   *
   * On ne s'en sert PAS pour affirmer une cause : on ne peut pas la verifier
   * d'ici. On s'en sert pour ajouter la piste la plus probable au message
   * quand le portefeuille n'a pas repondu — « essaie dans ton vrai
   * navigateur » est le conseil qui debloque le plus souvent, et il ne coute
   * rien a suivre s'il se trouve que ce n'etait pas ca. */
  function dansUneApp() {
    try {
      if (window.TelegramWebviewProxy || window.TelegramWebview) return 'Telegram';
      var u = navigator.userAgent || '';
      if (/Telegram/i.test(u)) return 'Telegram';
      if (/FBAN|FBAV|FB_IAB/.test(u)) return 'Facebook';
      if (/Instagram/i.test(u)) return 'Instagram';
      if (/Line\//.test(u)) return 'LINE';
    } catch (e) {}
    return null;
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
  /* ---- L'INITIALISATION EST REJOUEE, ET SON ECHEC EST RETENU ----
   *
   * `assurePrivy` sortait des que `window.SwogePrivy` existait, SANS s'assurer
   * qu'il avait ete initialise. Deux facons d'y perdre le portefeuille, toutes
   * deux muettes :
   *
   *   - LA COURSE. Le module pose son global a la FIN de son execution ; son
   *     `onload`, qui appelle `init`, est une tache separee. Un autre chargeur
   *     — le tiroir, la barre de connexion — qui regarde entre les deux voit
   *     un module present et non initialise, et sort.
   *   - L'ECHEC AVALE. `init` etait enveloppe dans un `try` vide. S'il jette,
   *     `Zr` reste indefini a l'interieur du module, et TOUS les appels
   *     suivants ressortent par ce meme raccourci sans jamais reessayer.
   *
   * Dans les deux cas, `restore()` trouve son client absent, rend `null` sans
   * une requete ni une ligne de console, et le joueur lit que sa session ne
   * peut pas etre verifiee. C'est exactement ce qui a ete decrit : « il n'y a
   * rien dans la console », et se reconnecter n'y change rien puisque le
   * tiroir sort par le meme raccourci.
   *
   * `init` est idempotent — le module garde `Zr || (Zr = ...)`. On peut donc
   * le rejouer sans risque a chaque passage, ce qui supprime la course et
   * redonne une chance a l'echec. Et l'echec n'est plus avale : on le retient
   * pour pouvoir le NOMMER au lieu d'accuser un bloqueur de contenu. */
  var ECHEC_INIT = null;

  /* ---- COMBIEN DE REQUETES SONT PARTIES CHEZ PRIVY ----
   *
   * Il ne me manquait qu'une donnee, et je l'ai demandee deux fois au joueur :
   * l'onglet Reseau. C'est trop demander pour un diagnostic dont l'application
   * dispose elle-meme.
   *
   * `restore()` avale toutes ses erreurs. Mais il ne peut pas cacher qu'il n'a
   * RIEN DEMANDE : le navigateur tient la liste de ce qu'il a charge, et on la
   * lit sans rien intercepter — pas de `fetch` enveloppe, pas de risque de
   * casser la page pour un diagnostic.
   *
   * La distinction est celle qui tranche :
   *   zero requete  le client interne n'existe pas. Rien n'a ete tente, donc
   *                 aucun bloqueur, aucun reseau, aucun cloisonnement de
   *                 stockage n'y est pour quoi que ce soit. C'est chez nous.
   *   au moins une  quelque chose a ete demande et n'a pas suffi. La, et la
   *                 seulement, le reseau ou le compte sont en cause.
   *
   * On ne lit ni entete ni contenu : un compteur, et c'est tout. */
  /* ---- ET ON COMPTE AU FIL DE L'EAU, PAS APRES COUP ----
   *
   * Premiere version : `getEntriesByType('resource')` au moment de l'echec.
   * Le tampon de ces entrees est PLAFONNE — deux cent cinquante par defaut —
   * et une page de jeu qui charge des centaines de tuiles le remplit ; les
   * entrees suivantes sont perdues, en silence. Le compteur rendait donc zero
   * la ou la reponse honnete etait « je n'ai pas pu voir ».
   *
   * Et c'est la meme faute que les trois precedentes, sous une autre forme :
   * confondre « je n'observe rien » avec « il ne s'est rien passe ». Un
   * `PerformanceObserver` pose au chargement recoit chaque entree au moment ou
   * elle arrive, sans dependre d'aucun tampon.
   *
   * S'il n'existe pas, on rend `null` — inconnu — et surtout PAS zero. Un
   * chiffre qu'on n'a pas mesure ne doit jamais ressembler a un chiffre qu'on
   * a mesure. */
  var VU_PRIVY = null;
  (function guettePrivy() {
    try {
      if (typeof PerformanceObserver === 'undefined') return;
      VU_PRIVY = 0;
      new PerformanceObserver(function (l) {
        var e = l.getEntries();
        for (var i = 0; i < e.length; i++) {
          if (String(e[i].name || '').indexOf('privy.io') >= 0) VU_PRIVY++;
        }
      }).observe({ type: 'resource', buffered: true });
    } catch (x) { VU_PRIVY = null; }
  })();
  function requetesPrivy() { return VU_PRIVY; }
  function initPrivy() {
    if (!window.SwogePrivy || !window.SwogePrivy.init) return;
    try { window.SwogePrivy.init(PRIVY_APP_ID); ECHEC_INIT = null; }
    catch (e) { ECHEC_INIT = e; }
  }
  function assurePrivy() {
    if (window.SwogePrivy) { initPrivy(); return Promise.resolve(window.SwogePrivy); }
    if (chargePrivy) return chargePrivy;
    chargePrivy = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'privy-swoge.js';
      s.onload = function () {
        initPrivy();
        res(window.SwogePrivy);
      };
      s.onerror = function () { chargePrivy = null; rej(new Error('privy')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return chargePrivy;
  }

  /* ---- ON REVEILLE LE PORTEFEUILLE AVANT QU'ON EN AIT BESOIN ----
   *
   * `portefeuille()` n'etait appele que par `signataire()`, c'est-a-dire au
   * moment EXACT ou le joueur appuie sur Deposit, Withdraw ou Send. Tout se
   * declenchait donc d'un coup, sous son doigt : telecharger un module de
   * 670 kilo-octets, monter l'iframe du portefeuille embarque, attendre
   * qu'elle reponde. Sur un telephone en 4G, douze secondes n'y suffisent pas
   * toujours — et l'on affichait « votre portefeuille n'a pas repondu ».
   *
   * Le reveil part maintenant a l'OUVERTURE du panneau. Entre le moment ou
   * l'on ouvre « Withdraw » et celui ou l'on a saisi un montant puis appuye,
   * il se passe plusieurs secondes : elles sont gratuites, autant les
   * employer. Quand le bouton est presse, `SwogePrivy.getAddress()` repond
   * deja et `portefeuille()` sort par son chemin court, sans rien attendre.
   *
   * Sans consequence s'il echoue : on ignore le resultat. Ce n'est pas une
   * verification, c'est une mise en route. */
  var reveilLance = false;
  function reveilleLePortefeuille() {
    if (reveilLance) return;
    reveilLance = true;
    try { portefeuille().catch(function () {}); } catch (e) {}
  }

  /* ---- POURQUOI LE PORTEFEUILLE MANQUE : ON NOTE LEQUEL DES TROIS ----
   *
   * Trois echecs tres differents finissaient dans la meme phrase, « votre
   * portefeuille n'a pas repondu », et le joueur qui la lisait ne pouvait rien
   * en faire :
   *
   *   'muet'    `restore()` ne repond NI oui NI rien pendant douze secondes.
   *             C'est l'iframe du portefeuille embarque qui ne peut pas
   *             fonctionner. La phrase etait juste dans ce cas-la, et dans
   *             celui-la seulement.
   *   'perime'  `restore()` repond tout de suite, et il repond NON : plus
   *             aucune session e-mail dans ce navigateur. Rien n'a mis douze
   *             secondes, rien ne s'est tu — la session n'existe plus. C'est
   *             le seul cas ou « reconnectez-vous » est le bon conseil, et
   *             c'est justement celui ou on ne le disait pas clairement.
   *   'absent'  le module lui-meme n'a pas pu etre charge.
   *
   * Le motif est pose sur `POURQUOI`, lu par `signataire()` juste apres. Une
   * variable de module plutot qu'une valeur rendue : `portefeuille()` doit
   * pouvoir rendre `null` par quatre chemins sans qu'on reecrive sa signature
   * a chaque fois. */
  var POURQUOI = null;
  /* Combien de requetes etaient parties chez Privy au moment de l'echec. On la
     fait voyager jusqu'au message : c'est le seul chiffre qui separe « on n'a
     rien demande » de « on a demande et ca n'a pas suffi ». */
  var REQUETES = null;

  /* ---- LA SESSION EST-ELLE SEULEMENT LA ? ----
   *
   * `restore()` avale toutes ses erreurs : il essaie de rafraichir la session
   * aupres de Privy, puis de lire l'utilisateur, et si l'un ou l'autre echoue
   * il rend `null` sans un mot. Deux situations tres differentes finissent
   * donc au meme endroit :
   *
   *   il n'y a AUCUN jeton dans ce navigateur — on ne s'y est jamais connecte
   *   par e-mail, ou l'on s'en est deconnecte. « Reconnectez-vous » est alors
   *   exactement le bon conseil.
   *
   *   le jeton EST la, et le rafraichissement a echoue quand meme. La session
   *   n'est pas « invalide » : elle n'a pas pu etre verifiee. Un bloqueur de
   *   contenu, un VPN, un reseau qui filtre, l'API de Privy injoignable — et
   *   se reconnecter ne changera rien, puisque la connexion passe par la meme
   *   API. Lui dire de se reconnecter, c'est l'envoyer se cogner au meme mur.
   *
   * Privy range ses jetons dans `localStorage` (on l'a verifie dans le
   * module : sa classe de stockage est `localStorage`, rien d'autre). On
   * regarde donc s'il y en a un, et c'est tout — on ne le lit pas, on ne
   * l'interprete pas, on constate sa presence. */
  /* ---- ET « UNE CLE QUI COMMENCE PAR privy » NE VEUT RIEN DIRE ----
   *
   * Premiere version de ce garde : toute cle commencant par `privy`. C'etait
   * FAUX, et je l'ai livre. Le module ecrit `privy-app-id`, `privy-client-id`
   * et `privy-ca-id` a son INITIALISATION — c'est-a-dire sur toute page qui
   * l'a seulement charge, connecte ou non. N'importe quel visiteur avait donc
   * un « jeton », et le message lui annoncait qu'une session parfaitement
   * inexistante etait bloquee par quelque chose. On envoie chercher un
   * bloqueur de contenu a quelqu'un qui n'a simplement jamais ouvert de
   * session : c'est le genre de conseil qui fait perdre une soiree.
   *
   * La liste est donc EXPLICITE, et ne contient que ce que la CONNEXION pose.
   * L'ecrire en toutes lettres plutot qu'en prefixe est ce qui rend la
   * distinction verifiable : on peut relire les quatre noms et dire s'ils sont
   * les bons. */
  var CLES_SESSION = ['privy:token', 'privy:refresh_token', 'privy:id-token',
                      'privy:active-user'];
  function jetonPrivy() {
    try {
      for (var i = 0; i < CLES_SESSION.length; i++) {
        if (localStorage.getItem(CLES_SESSION[i]) != null) return true;
      }
    } catch (e) {}
    return false;
  }
  /* ---- ET C'EST LE JETON DE RAFRAICHISSEMENT QUI DECIDE ----
   *
   * `restore()` commence par `refreshSession()`. Cette fonction lit le jeton de
   * RAFRAICHISSEMENT dans le stockage : s'il n'y est pas, elle echoue SUR PLACE,
   * sans une seule requete. Les autres cles — le jeton d'acces expire,
   * l'utilisateur actif — peuvent parfaitement survivre a lui : ce sont des
   * restes, pas une session.
   *
   * C'est la nuance qui m'a manque, et je l'ai payee deux fois. J'ai d'abord
   * compte n'importe quelle cle `privy*`, puis les quatre cles de session ; les
   * deux fois, un joueur sans session refreshable etait annonce comme bloque
   * par quelque chose. Or « aucune requete n'est partie » ne veut PAS dire
   * « on n'a pas pu demander » : le plus souvent, ca veut dire qu'il n'y avait
   * rien a envoyer.
   *
   * Une seule cle porte la reponse. On la nomme. */
  function peutRafraichir() {
    try { return localStorage.getItem('privy:refresh_token') != null; }
    catch (e) { return false; }
  }

  function portefeuilleEmail(essai2) {
    return assurePrivy().then(function (P) {
      if (!P) { POURQUOI = 'absent'; return null; }
      var suite = (P.restore) ? P.restore()
                : Promise.resolve(P.isLoggedIn && P.isLoggedIn() ? P.getAddress() : null);
      /* C'EST ICI que ca se bloquait. `restore()` peut ne jamais repondre. */
      return avecDelai(suite, essai2 ? DELAI_RETOUR : DELAI_PORTEFEUILLE, 'wallet-muet').then(function (adr) {
        adr = adr || (P.getAddress && P.getAddress());
        if (!adr) {
          /* Zero requete pendant que le module cherchait la session : son
             client interne n'existe pas. Ce n'est ni le reseau ni le compte —
             c'est notre module qui n'a pas demarre, et le dire evite d'envoyer
             le joueur couper un bloqueur pour rien. */
          var req = requetesPrivy();
          REQUETES = req;
          /* ---- L'ORDRE COMPTE, ET JE L'AI EU FAUX D'ABORD ----
           * J'avais mis « zero requete » en tete. Mais quelqu'un qui ne s'est
           * JAMAIS connecte par e-mail ici n'en fait aucune non plus — et on
           * lui annoncait une panne de notre cote alors qu'il n'avait
           * simplement pas de session. L'absence de jeton passe donc en
           * premier : elle se constate sans rien interpreter, et elle a une
           * seule reponse possible. Le compteur ne departage QUE les cas ou il
           * y a bien une session a verifier. */
          /* ---- QUATRE CAS, ET CHACUN A SA REPONSE ----
           *   'init'    l'initialisation a JETE. Le module n'a pas demarre :
           *             c'est chez nous, et rien d'autre n'a pu etre tente.
           *   'perime'  aucun jeton de rafraichissement. La session ne peut
           *             pas etre reprise, quoi qu'il arrive — se reconnecter
           *             est la seule reponse, et elle marche.
           *   'muet'    un jeton refreshable, et pourtant PAS UNE requete.
           *             Celui-la n'a pas d'explication simple : on le dit, on
           *             ne l'invente pas.
           *   'refus'   des requetes sont parties et n'ont pas suffi. */
          POURQUOI = ECHEC_INIT ? 'init'
                   : !peutRafraichir() ? 'perime'
                   /* `null` veut dire « pas mesure » : on ne conclut PAS a
                      partir de rien. Seul un zero VERITABLEMENT observe
                      autorise a dire que rien n'est parti. */
                   : req === 0 ? 'inerte'
                   : 'refus';
          return null;
        }
        POURQUOI = null;
        return { eip1193: P.getProvider(), adresse: adr };
      });
    }).catch(function (e) {
      /* `avecDelai` rejette avec ce motif-la quand le delai tombe : c'est la
         SEULE facon de distinguer un silence d'un refus, et sans elle les deux
         se ressemblaient. */
      POURQUOI = (e && /wallet-muet/.test(String(e.message || e))) ? 'muet' : 'absent';
      return null;
    });
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
        /* ---- ON REESSAIE UNE FOIS, ET CE N'EST PAS DE L'ESPOIR ----
         *
         * `restore()` monte l'iframe du portefeuille embarque, attend six
         * cents millisecondes EN AVEUGLE, puis lui parle. Sur un telephone
         * l'iframe n'a pas fini de charger au bout de six cents
         * millisecondes : la demande part dans un document vide, la reponse
         * n'arrive jamais, et notre delai de douze secondes tranche.
         *
         * Mais l'iframe, elle, RESTE — le module la garde. Au deuxieme appel
         * il ne la remonte pas : elle a eu douze secondes pour charger, et
         * elle repond. C'est pour ca que le deuxieme essai reussit la ou le
         * premier echoue, et pourquoi se reconnecter ne changeait rien : la
         * connexion recharge la page, l'iframe repart de zero, et l'on
         * retombait sur la meme course perdue.
         *
         * Six secondes pour ce second essai et non douze : si l'iframe est
         * chargee elle repond en quelques dizaines de millisecondes ; si elle
         * ne peut PAS fonctionner — un navigateur qui cloisonne le stockage
         * des tiers — rien ne la sauvera, et il ne faut pas faire attendre le
         * joueur une seconde fois pour rien. */
        return portefeuilleEmail(true);
        /* On ne retombe PAS sur window.ethereum : un compte email et une
           extension installee sur la meme machine sont deux adresses
           differentes, et deposer depuis la mauvaise enverrait les jetons
           sur un solde qui n'est pas le sien. */
        return null;
      });
    }
    if (window.ethereum) {
      /* Meme garde-fou pour une extension : `eth_accounts` ne demande rien au
         joueur, donc il ne doit jamais mettre douze secondes. Une extension
         qui ne repond pas est aussi muette qu'un portefeuille embarque, et
         laisserait le meme bouton mort. */
      return avecDelai(window.ethereum.request({ method: 'eth_accounts' }),
                       DELAI_PORTEFEUILLE, 'wallet-muet').then(function (cs) {
        if (!cs || !cs.length) return null;
        return { eip1193: window.ethereum, adresse: cs[0] };
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }
  /* Le signataire, sur la bonne chaine. On propose le changement de reseau
     plutot que de refuser : un joueur qui a MetaMask sur Ethereum ne sait pas
     forcement qu'il existe une chaine Robinhood. */
  /* `quoi` nomme CE QU'ON ALLAIT FAIRE — 'deposit', 'withdraw', 'send'.
   *
   * Le message disait « sign in again to deposit » quel que soit le bouton
   * appuye. Un joueur qui essayait de RETIRER lisait donc qu'il fallait se
   * reconnecter pour deposer : il a rapporte la capture, et il avait raison
   * de trouver ca louche. Un message qui parle d'autre chose que de ce qu'on
   * vient de faire fait douter du reste de la phrase, y compris de la partie
   * qui etait vraie. */
  /* ==================== DEVERROUILLER LE PORTEFEUILLE ====================
   *
   * ---- LA PANNE, ENFIN NOMMEE ----
   *
   * Le SDK de Privy ne renouvelle une session que si l'une de ces deux choses
   * est vraie — c'est ecrit dans son code, pas devine :
   *
   *     hasRefreshCredentials(acces, rafraichissement) {
   *       return mightHaveServerCookies()
   *           || (typeof acces === 'string' && typeof rafraichissement === 'string');
   *     }
   *
   * Sinon il journalise « missing tokens, SKIPPING REQUEST » et renonce SANS
   * contacter personne. Voila pourquoi le compteur voyait zero requete,
   * pourquoi la console restait vide, et pourquoi trois navigateurs
   * echouaient a l'identique : ce n'etait ni le reseau, ni le compte, ni un
   * bloqueur. Le module renoncait tout seul.
   *
   * Il lui faut DEUX jetons, et le second se lit sous une cle derivee de
   * l'utilisateur actif. Notre stockage est du `localStorage` pur : on ne pose
   * aucun cookie serveur, donc la premiere branche est toujours fausse chez
   * nous — tout repose sur une paire complete.
   *
   * ---- ET POURQUOI SE RECONNECTER N'Y CHANGEAIT RIEN ----
   *
   * La connexion par e-mail REUSSIT : `verifyCode` rend un portefeuille vivant
   * en memoire. Puis le tiroir recharge la page pour reprendre la session, et
   * la memoire part avec. Apres le rechargement il faut reconstruire depuis le
   * stockage — c'est-a-dire retomber sur la paire manquante. Le joueur se
   * reconnectait correctement A CHAQUE FOIS ; le rechargement jetait le
   * resultat a chaque fois.
   *
   * ---- CE QUE FAIT CE DEVERROUILLAGE ----
   *
   * Il refait le seul geste qui marche — code par e-mail, `verifyCode` — SANS
   * RECHARGER. Le portefeuille revient en memoire et l'action reprend tout de
   * suite. Il ne repare pas le stockage et ne pretend pas le faire : il rend
   * la main au joueur, ici et maintenant, ce qu'aucun des messages precedents
   * ne savait faire.
   *
   * C'est aussi pourquoi je n'ai pas retire le rechargement de la connexion :
   * une fois qu'on peut deverrouiller sur place, il ne coute plus rien, et le
   * retirer aurait touche le chemin par lequel TOUT LE MONDE entre — pour un
   * benefice que celui-ci apporte deja.
   */
  function formulaireDeverrou(reprend) {
    if (!boiteMsg) return;
    /* La minuterie du message qui nous a ouverts est peut-etre encore en
       route : sans ce nettoyage, elle efface ce formulaire quelques secondes
       apres qu'on l'a pose. C'est la moitie de la panne rapportee. */
    clearTimeout(minuterieMsg);
    boiteMsg.className = 'swc-msg on act';
    boiteMsg.textContent = '';
    var t = document.createElement('div');
    t.textContent = 'Unlock your wallet — we will email you a code. '
      + 'Nothing reloads, so you keep what you were doing.';
    var em = document.createElement('input');
    em.type = 'email'; em.placeholder = 'your email'; em.autocomplete = 'email';
    var cd = document.createElement('input');
    cd.inputMode = 'numeric'; cd.placeholder = 'code'; cd.style.display = 'none';
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Send me a code';
    var etat = document.createElement('div');
    [t, em, cd, b, etat].forEach(function (x) { boiteMsg.appendChild(x); });
    [em, cd].forEach(function (x) {
      x.style.cssText = 'display:block;width:100%;margin:8px 0;padding:10px;'
        + 'border-radius:10px;border:1px solid #E1E9F6;font-family:inherit;font-size:14px;';
    });
    cd.style.display = 'none';
    var phase = 'email';
    b.addEventListener('click', function () {
      var P = window.SwogePrivy;
      if (!P) { etat.textContent = 'The wallet module is not loaded.'; return; }
      b.disabled = true;
      if (phase === 'email') {
        etat.textContent = 'Sending…';
        Promise.resolve(P.sendCode(String(em.value || '').trim())).then(function () {
          phase = 'code'; cd.style.display = 'block'; b.textContent = 'Unlock';
          etat.textContent = 'Code sent — check your inbox.'; cd.focus();
        })['catch'](function (e) {
          etat.textContent = String((e && e.message) || e).slice(0, 110);
        }).then(function () { b.disabled = false; });
        return;
      }
      etat.textContent = 'Unlocking…';
      Promise.resolve(P.verifyCode(String(em.value || '').trim(),
                                   String(cd.value || '').trim()))
        .then(function () {
          /* Le mode doit dire `email`, sinon `portefeuille()` irait chercher
             une extension qui n'existe pas sur telephone. */
          try { localStorage.setItem('swogeAuth', 'email'); } catch (x) {}
          boiteMsg.className = 'swc-msg';
          if (typeof reprend === 'function') reprend();
        })['catch'](function (e) {
          etat.textContent = String((e && e.message) || e).slice(0, 110);
          b.disabled = false;
        });
    });
  }

  /* `reprend` : ce qu'on refera une fois le portefeuille rendu. Sans lui, le
     joueur deverrouille puis doit retrouver son bouton et tout resaisir —
     et c'est au moment ou il a deja essaye cinq fois. */
  function signataire(quoi, reprend) {
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
        /* ---- ON DIT CE QU'ON SAIT, ET LA PISTE LA PLUS PROBABLE ----
         * On sait que le portefeuille n'a pas repondu. On ne sait pas
         * pourquoi — session perdue, iframe bloquee, autre chose — et
         * affirmer une cause ferait chercher au mauvais endroit. Mais quand
         * la page tourne dans le navigateur interne d'une application, la
         * piste est assez forte pour valoir d'etre nommee : ces navigateurs
         * cloisonnent le stockage des sites tiers, et un portefeuille
         * embarque vit precisement dans une iframe tierce. */
        var app = dansUneApp();
        var acte = quoi === 'withdraw' ? 'withdraw'
                 : quoi === 'send' ? 'send'
                 : quoi === 'deposit' ? 'deposit' : 'continue';
        /* ---- TROIS CAUSES, ET UNE SEULE PHRASE LES COUVRAIT ----
         *
         * « Your wallet did not answer » etait faux dans le cas le plus
         * frequent sur telephone. Un joueur connecte PAR PORTEFEUILLE
         * (`swogeAuth = wallet`) qui rouvre le site dans Safari ou Chrome n'a
         * tout simplement PAS de portefeuille dans ce navigateur : il n'y a
         * pas d'extension sur telephone, `window.ethereum` n'existe pas, et
         * `portefeuille()` rend `null` immediatement. Rien n'a ete demande a
         * personne — il n'y avait personne a qui demander. Lui dire qu'on n'a
         * pas eu de reponse l'envoie chercher une panne qui n'existe pas, et
         * se reconnecter ne peut RIEN y changer : il retombera sur « No wallet
         * found in this browser ».
         *
         * On separe donc les trois :
         *   - pas de portefeuille du tout dans ce navigateur ;
         *   - un portefeuille embarque que le navigateur d'une application
         *     empeche de repondre ;
         *   - un portefeuille qui a vraiment mis douze secondes sans repondre.
         * Chacun a une sortie differente, et c'est tout l'interet de les
         * distinguer. */
        var sansPortefeuille = (mode === 'wallet' && !window.ethereum);
        /* ---- ET LA SESSION PERIMEE N'EST PAS UN SILENCE ----
         * `restore()` a repondu tout de suite, et il a repondu NON : il n'y a
         * plus de session e-mail dans ce navigateur. Rien n'a mis douze
         * secondes, rien ne s'est tu. C'est le SEUL cas ou se reconnecter est
         * le bon geste — et c'etait justement celui ou l'on disait au joueur
         * que son portefeuille n'avait pas repondu, ce qui l'envoyait chercher
         * une panne au lieu de le faire signer. */
        var perime = (mode === 'email' && POURQUOI === 'perime');
        /* Le jeton est la, et il n'a pas pu etre verifie. Se reconnecter passe
           par la MEME API : le conseil serait de l'envoyer se cogner au meme
           mur. On nomme donc ce qui bloque le plus souvent, et on propose ce
           qui a une chance — un autre navigateur, sans filtre. */
        var refuse = (mode === 'email' && POURQUOI === 'refus');
        /* Le module n'a pas pu demarrer. Rien de ce que le joueur peut faire
           dans son navigateur n'y changera quoi que ce soit : c'est chez nous.
           On le dit, plutot que de lui faire couper un bloqueur pour rien. */
        var casse = (mode === 'email' && POURQUOI === 'init');
        /* Une session reprenable, et rien n'est parti. Je n'ai pas de cause a
           proposer, alors je n'en propose pas : le code suffit a ce qu'on
           cherche, et une cause inventee fait chercher au mauvais endroit —
           trois fois de suite dans cette affaire. */
        var inerte = (mode === 'email' && POURQUOI === 'inerte');
        var err = new Error(!mode ? 'Sign in first'
          : sansPortefeuille
            ? 'No wallet in this browser. You signed in with a wallet, and there is '
              + 'none here — open swoleeswoge.dog inside your wallet app\'s browser, '
              + 'or sign in with your email instead.'
          : perime
            ? 'Your email session cannot be resumed in this browser — the part that '
              + 'renews it is gone. Tap Unlock below to sign in again with an email '
              + 'code; your ' + acte + ' resumes on its own (code W-SESSION).'
          : casse
            ? 'The email wallet could not start on this page — this one is on us, not '
              + 'on your browser. Reload the page; if it happens again, tell us '
              + '(code W-BOOT).'
          : inerte
            /* ---- LE REMEDE D'ABORD, LA CAUSE ENSUITE ----
             * Ce message disait « nous ne savons pas pourquoi » et proposait de
             * recharger. Depuis, on SAIT — le module de Privy exige DEUX jetons
             * pour reprendre une session et n'en a qu'un, alors il renonce sans
             * rien demander — et surtout on a de quoi REPARER : le bouton juste
             * en dessous refait la connexion par code, sans recharger.
             * Un message qui commence par « on ne sait pas » se lit comme une
             * impasse, et le joueur ne cherche pas le bouton. Il commence donc
             * par ce qu'il faut faire. Le rechargement, lui, est exactement ce
             * qui a casse la session : le conseiller etait le pire de tous. */
            ? 'Your email wallet needs unlocking — its session is half there, so it '
              + 'gave up without asking Privy. Tap Unlock below: it takes an email '
              + 'code, nothing reloads, and your ' + acte + ' resumes on its own '
              + '(code W-QUIET).'
          : refuse
            ? 'Your sign-in could not be verified. '
              + (REQUETES ? REQUETES + ' request(s) did go out, so it is the account or '
                            + 'the network, not this page. '
                          : '')
              + 'Tap Unlock below to sign in again with an email code — nothing '
              + 'reloads, and your ' + acte + ' resumes on its own (code W-VERIF'
              + (REQUETES === null ? '' : '/' + REQUETES) + ').'
          : app
            ? 'Your wallet did not answer. ' + app + "'s built-in browser often blocks it — "
              + 'open swoleeswoge.dog in Chrome or Safari, or sign in again.'
            : 'Your wallet did not answer — sign in again to ' + acte);
        /* ON NE DEPLACE PLUS PERSONNE. La sortie envoyait sur le Coin Pusher :
           le joueur tapait « me reconnecter » depuis le hall et se retrouvait
           dans un autre jeu, loin de ce qu'il voulait faire. Le formulaire de
           connexion de stakebubble.js sait se rouvrir SUR PLACE, et il
           recharge la meme page une fois signe. On l'appelle, et on ne garde
           le lien que si ce fichier tourne seul, sans lui. */
        /* ON DECONNECTE D'ABORD. Ouvrir le formulaire par-dessus une session
           qui ne repond plus ne changeait rien : le jeton perime restait en
           place, la page se rechargeait avec, et on revenait au meme mur.
           Se reconnecter commence par se DEconnecter — c'est le sens du
           bouton, et c'est ce que le joueur croyait faire. */
        /* ---- LA SORTIE QUI MARCHE, QUAND ELLE MARCHE ----
         * Se deconnecter puis se reconnecter rechargeait la page, et le
         * rechargement est precisement ce qui tue le portefeuille e-mail. On
         * propose donc le DEVERROUILLAGE SUR PLACE des qu'on est dans un cas ou
         * il peut aider — c'est-a-dire des que le module est charge et que le
         * compte est un compte e-mail. Il refait le seul geste qui marche, sans
         * rien recharger, et REPREND l'action au lieu de laisser le joueur
         * recommencer : c'est la difference entre un conseil et une reparation.
         * Les autres cas gardent l'ancienne sortie : pour un compte
         * portefeuille, ou quand le module n'est meme pas la, un code par
         * e-mail ne repare rien. */
        if (mode === 'email' && window.SwogePrivy && window.SwogePrivy.verifyCode) {
          err.sortie = { texte: 'Unlock my wallet →', persiste: true,
                         fait: function () { formulaireDeverrou(reprend); } };
          throw err;
        }
        err.sortie = (window.swogeConnexion && window.swogeConnexion.ouvre)
          ? { texte: 'Sign out and sign in again →', fait: function () {
                try { localStorage.removeItem('swogeSession'); } catch (x) {}
                try { localStorage.removeItem('swogeAuth'); } catch (x) {}
                try { if (window.SwogePrivy && SwogePrivy.logout) SwogePrivy.logout(); } catch (x) {}
                window.swogeConnexion.ouvre();
              } }
          : { texte: 'Sign in and deposit →', href: 'swoge_pusher_live.html#deposit' };
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

  /* ---- LES PANNEAUX PASSENT AU BLANC (AU CLAIR) ----
   * Ce fichier ne sert qu'a `index.html` et `games.html`, et il PEINT lui-meme
   * tout le panneau de compte. Les deux pages avaient donc beau porter la barre
   * blanche et le fond clair, leurs panneaux restaient en #0E1422 sur bord or :
   * une carte bleu nuit flottant au milieu d'une page blanche. Aucune des deux
   * n'a de feuille a elle pour ces boites — c'est ici, et nulle part ailleurs,
   * qu'elles se decident.
   * A noter : `stakebubble.js` EMPRUNTE ces boites pour son tiroir, et ce
   * tiroir est deja clair (#0B1B36 / #1B5FE0 / #F4F7FC). La boite sombre y
   * detonnait donc deja. Meme palette que `swoge_casino.html`, ecrite en clair.
   * Le bandeau `.swc-msg` reste sombre : les toasts le sont restes sur toutes
   * les pages converties. */
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
      'padding:16px;border-radius:18px;background:#FFFFFF;color:#0B1B36;' +
      'border:1px solid #E1E9F6;box-shadow:0 20px 60px rgba(11,27,54,.16);}' +
      '#ovl .box.show{display:block;}' +
      '.swc h4{margin:0 0 10px;font-size:14px;letter-spacing:.4px;color:#1B5FE0;}' +
      /* Dans le tiroir, la barre de retour porte deja le nom de la section :
         le titre du panneau le repetait mot pour mot, deux lignes plus bas.
         C'est la meme raison qui fait disparaitre les titres peints des
         pages de jeu quand leur boite est empruntee. */
      '#swpHote .swc h4{display:none!important;}' +
      '.swc label{display:block;margin:12px 0 5px;font-size:10.5px;letter-spacing:1px;' +
      'text-transform:uppercase;color:#6B7C99;}' +
      '.swc input{width:100%;box-sizing:border-box;padding:11px;border-radius:11px;' +
      'font-family:inherit;font-size:15px;text-align:center;color:#0B1B36;' +
      'background:#EEF3FB;border:1px solid #E1E9F6;}' +
      /* Les cartes de solde : meme forme que celles du portefeuille dans le
         tiroir, pour qu'on reconnaisse la meme chose au meme endroit. */
      '.swc-c{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:11px 13px;margin:0 0 7px;border-radius:12px;font-size:11.5px;color:#6B7C99;' +
      'background:#EEF3FB;border:1px solid #E1E9F6;}' +
      '.swc-c b{font-size:14px;font-weight:800;color:#0B1B36;font-variant-numeric:tabular-nums;}' +
      '.swc-c.or{padding:14px;background:#EAF1FF;border-color:#E1E9F6;}' +
      '.swc-c.or b{font-size:22px;color:#1B5FE0;}' +
      '.swc-adr{width:100%;box-sizing:border-box;padding:12px 8px;border-radius:11px;' +
      'text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:min(11.5px,2.8vw);color:#0B1B36;background:#EEF3FB;' +
      'border:1px solid #E1E9F6;}' +
      '.swc-b{display:block;width:100%;box-sizing:border-box;margin:8px 0 0;padding:12px;' +
      'border-radius:11px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:800;' +
      'text-align:center;text-decoration:none;color:#0B1B36;' +
      'background:#FFFFFF;border:1px solid #E1E9F6;}' +
      '.swc-b.p{margin-top:14px;padding:13px;color:#FFFFFF;border-color:transparent;' +
      'background:#1B5FE0;}' +
      '.swc-b.g{color:#1B5FE0;background:#EAF1FF;border-color:#1B5FE0;}' +
      '.swc-b.d{margin-top:16px;padding:10px;font-size:11.5px;font-weight:700;color:#E0443E;' +
      'background:transparent;border-color:rgba(224,68,62,.45);}' +
      '.swc-b[disabled]{opacity:.45;cursor:default;}' +
      /* La section d'envoi : un trait pour la detacher du reste, un titre,
         et la ligne montant + jeton. */
      '.swc-sep{height:1px;margin:16px 0 12px;background:#E1E9F6;}' +
      'font-size:14px;color:#0B1B36;background:#EEF3FB;border:1px solid #E1E9F6;cursor:pointer;}' +
      '.swc-pc{display:flex;gap:6px;margin-top:8px;}' +
      '.swc-pc button{flex:1 1 0;min-width:0;padding:8px 2px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:700;color:#0B1B36;' +
      'background:#EEF3FB;border:1px solid #E1E9F6;}' +
      '.swc-n{margin-top:9px;font-size:11.5px;line-height:1.5;color:#6B7C99;text-align:left;}' +
      /* Les quetes : une carte par quete, une barre, un bouton. */
      '.swc-wc{margin:0 0 10px;padding:11px 12px;border-radius:12px;text-align:left;' +
      'background:#EAF1FF;border:1px solid #E1E9F6;}' +
      '.swc-wc-t{font-size:12px;font-weight:800;color:#1B5FE0;}' +
      '.swc-days{display:flex;gap:5px;margin:9px 0 2px;}' +
      '.swc-d{flex:1 1 0;min-width:0;padding:6px 2px;border-radius:9px;text-align:center;' +
      'background:#EEF3FB;border:1px solid #E1E9F6;}' +
      '.swc-d span{display:block;font-size:9.5px;color:#6B7C99;}' +
      '.swc-d b{display:block;font-size:10.5px;color:#0B1B36;}' +
      '.swc-d.ok{background:rgba(90,220,140,.16);border-color:rgba(120,230,160,.5);}' +
      '.swc-d.ok b{color:#0E7C3E;}' +
      '.swc-d.now{background:#EAF1FF;border-color:#1B5FE0;}' +
      '.swc-d.now b{color:#1B5FE0;}' +
      '.swc-q{margin:0 0 8px;padding:11px 12px;border-radius:12px;text-align:left;' +
      'background:#EEF3FB;border:1px solid #E1E9F6;}' +
      '.swc-q-h{font-size:12.5px;font-weight:700;color:#0B1B36;}' +
      '.swc-q-b{height:6px;margin:8px 0 2px;border-radius:99px;overflow:hidden;' +
      'background:#E1E9F6;}' +
      '.swc-q-b i{display:block;height:100%;border-radius:99px;' +
      'background:linear-gradient(90deg,#22B45E,#7CFF9B);}' +
      '.swc-q .swc-b{margin-top:8px;padding:9px;font-size:12px;}' +
      '.swc-n b{color:#1B5FE0;}' +
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
      /* ---- LA SORTIE DOIT SE LAISSER TOUCHER, MEME SUR UNE PAGE QUI EN
         TIENT AUCUNE ----
         Trois pages du site — l'accueil, `games.html`, `swogebet.html` — posent
         « a[href], button { pointer-events:none } » pour que leurs vignettes de
         demonstration ne promettent pas un clic qui ne mene nulle part. La
         regle vise TOUS les boutons, et le tiroir s'en exempte lui-meme. Ce
         bandeau, lui, est la seule piece de ce module qui vit hors du tiroir :
         il heritait donc de l'inertie, et le bouton « Unlock my wallet » se
         dessinait, s'annoncait, et ne repondait a aucun doigt. Rapporte deux
         fois — « le bouton unlock my wallet fonctionne pas », puis « toujours
         pas clickable » — et la seconde fois etait exacte : la minuterie
         n'etait qu'une moitie du defaut.
         Un module qui pose sa propre interface ne doit rien supposer de la
         page qui l'accueille. Il se rend donc lui-meme touchable, et sa
         specificite suffit a passer devant la regle de la page. */
      '.swc-msg a,.swc-msg button{display:block;width:100%;border:0;font:inherit;' +
      'pointer-events:auto;cursor:pointer;' +
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
    /* ---- PLUS DE RANGEE « WALLET » DANS LE MENU DU PROFIL ----
       « Il y a withdraw, deposit, my wallet… faudrait le retirer de toutes les
       pages : on est cense l'ouvrir depuis le petit bouton rond en bas. »
       Le portefeuille a son rond en bas a droite de chaque page ; deux
       rangees de plus ici ne faisaient que le repeter. Le panneau
       `box-wallet` existe toujours pour qui l'ouvre autrement. */
    m.innerHTML =
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
        /* ---- ENVOYER VERS UNE ADRESSE DE SON CHOIX ----
           DEMANDE : « je dois le voir sur toutes les pages, pas que sur coin
           pusher ». Les pages de jeu portent cette section dans LEUR propre
           panneau, que le tiroir emprunte. `index.html` et `games.html`, elles,
           n'ont pas de panneau a elles : c'est ce fichier qui le fabrique — et
           il ne proposait que Copy / Deposit / Explorer / Disconnect. Le retrait
           du jeu depose sur le portefeuille du COMPTE ; sans ceci, les fonds y
           restaient sans porte de sortie sur les deux pages les plus visitees. */
        /* ---- L'ENVOI VERS UNE ADRESSE LIBRE EST RETIRE ----
         *
         * Demande apres coup, et c'est un bon retrait. Le jeu depose deja sur
         * l'adresse DU COMPTE : le retrait n'a pas de destinataire a choisir,
         * il va la ou le joueur est connecte. Ce formulaire ne servait donc a
         * rien que le portefeuille du joueur ne fasse mieux — et il portait
         * trois risques que rien ne compensait : une adresse mal recopiee
         * envoie des jetons dans le vide, un « 0x… » colle depuis une
         * conversation est le vecteur d'arnaque le plus banal qui soit, et
         * c'etait la troisieme porte qui demandait une signature, donc une
         * troisieme facon de tomber sur un portefeuille qui ne repond pas.
         *
         * Ce qui reste fait tout : deposer, retirer, et — depuis peu —
         * emporter sa cle. Un joueur qui veut envoyer a quelqu'un le fait
         * depuis son propre portefeuille, ou il voit ce qu'il signe. */
        /* ---- LA CLE, DEPUIS LE PORTEFEUILLE AUSSI ----
         * Le meme lien est pose dans le panneau de RETRAIT, devant le bouton
         * qui peut ne pas repondre. Ici, il n'est pas une sortie de secours
         * mais une PROPRIETE : c'est la page du portefeuille, et un joueur doit
         * pouvoir emporter son adresse ailleurs sans avoir a etre bloque
         * d'abord. Les deux endroits disent donc la meme chose autrement — l'un
         * repare, l'autre appartient. */
        '<a class="swc-b" id="swcWCle" href="wallet-export.html" ' +
          'style="display:block;text-align:center;text-decoration:none">' +
          'Export my private key</a>' +
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
        /* ---- LE BON QU'ON N'A PAS ENCAISSE ----
         *
         * Refuser dans son portefeuille, une transaction qui echoue, un onglet
         * ferme : le solde est DEJA parti et le bon expire au bout d'une heure.
         * « Withdraw » ne peut plus rien : il exige un solde, et le solde est
         * vide. Le joueur n'avait aucun recours qu'un nouveau depot, pour
         * reprendre un argent qui etait deja le sien.
         *
         * Ce bouton redemande le bon sans rien debiter. Il reste CACHE tant que
         * rien n'attend : un « Claim » permanent sur un panneau de retrait se
         * lit comme un second retrait, et on finirait par cliquer les deux. */
        /* Sa PROPRE ligne, pas `swcWdNote` : celle-la porte le minimum et les
           frais, et `poseTout` la reecrit a chaque repeinture — un message
           pose dessus disparaitrait au premier rafraichissement du solde. */
        '<div class="swc-n" id="swcWdAttente" style="display:none"></div>' +
        '<button class="swc-b" id="swcWdClaim" type="button" style="display:none">' +
          'Claim pending withdrawal</button>' +
        /* ---- LA SORTIE DE SECOURS, LA OU L'ON EST BLOQUE ----
         * Un joueur dont le portefeuille e-mail ne se restaure plus n'a AUCUN
         * recours dans cette page : le bon l'attend, et rien ne peut le
         * signer. `wallet-export.html` lui rend sa cle privee — apres quoi il
         * encaisse depuis MetaMask, Phantom ou Uniswap, sans dependre de quoi
         * que ce soit d'ici.
         * Le lien est POSE ICI et pas seulement dans le panneau du
         * portefeuille : c'est devant le bouton qui ne repond pas qu'on a
         * besoin de savoir qu'une autre porte existe. */
        '<a class="swc-b" id="swcWdCle" href="wallet-export.html" ' +
          'style="display:block;text-align:center;text-decoration:none">' +
          'Wallet stuck? Get your private key</a>' +
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
    $('swcWdClaim').addEventListener('click', reprendLeBon);
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
    /* Les trois panneaux qui finiront par demander une signature. On lance le
       reveil ici, pas au chargement de la page : un joueur qui vient jouer
       n'a aucune raison de telecharger le module du portefeuille. */
    if (nom === 'wallet' || nom === 'dep' || nom === 'wd') reveilleLePortefeuille();
    /* On demande a chaque ouverture s'il reste un bon a encaisser. Le garder en
       memoire depuis la derniere fois ne suffirait pas : le cas qu'on veut
       couvrir est justement celui du joueur qui a recharge sa page apres avoir
       refuse dans son portefeuille. */
    if (nom === 'wd') { montreLeBon(false); demande('withdrawPending'); }
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
    /* ---- ON PARLE AVANT D'ATTENDRE ----
     * Le premier signe de vie ne doit pas dependre de la reponse du
     * portefeuille : c'est justement lui qui peut ne jamais repondre. Le
     * joueur voit donc « Opening your wallet… » a la milliseconde ou il
     * appuie, et le bouton porte le meme mot. Meme si tout le reste echoue,
     * personne ne se retrouve devant un bouton qui n'a rien dit. */
    var libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Opening your wallet…';
    dit('Opening your wallet…', '', null, true);
    signataire('deposit', depose).then(function (w) {
      var montant = ethers.utils.parseUnits(s, 18);
      var jeton = new ethers.Contract(TOKEN, ERC20_ABI, w.signer);
      var coffre = new ethers.Contract(VAULT, VAULT_ABI, w.signer);
      /* L'autorisation est demandee UNE FOIS, pour un montant illimite : la
         redemander a chaque depot ferait payer deux transactions au lieu
         d'une, a chaque fois. */
      return jeton.allowance(w.adresse, VAULT).then(function (a) {
        if (!a.lt(montant)) return null;
        dit('Approve $SWOGE in your wallet…', '', null, true);
        return jeton.approve(VAULT, ethers.constants.MaxUint256)
          .then(function (t) { return t.wait(); });
      }).then(function () {
        dit('Depositing…', '', null, true);
        return coffre.deposit(montant);
      }).then(function (t) { return t.wait(); });
    }).then(function () {
      dit('✅ Deposited — your balance updates in a moment', 'ok');
      $('swcDAmt').value = '';
      ferme();
      litSoldesChaine();
      demande('balance');
    }).catch(function (e) {
      dit(texteErreur('Deposit', e), 'ko', e && e.sortie);
    }).then(function () { bouton.disabled = false; bouton.textContent = libelle; });
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
    dit('Opening your wallet…', '', null, true);
    signataire('withdraw', function () { envoieRetrait(v); }).then(function (w) {
      var coffre = new ethers.Contract(v.vault || VAULT, VAULT_ABI, w.signer);
      dit('Confirm the withdrawal in your wallet…', '', null, true);
      return coffre.withdraw(v.cumulative, v.deadline, v.v, v.r, v.s)
        .then(function (t) { return t.wait(); });
    }).then(function () {
      dit('✅ Paid to your wallet', 'ok');
      ferme(); litSoldesChaine();
    }).catch(function (e) {
      /* ---- ON DIT QUE L'ARGENT N'EST PAS PERDU ----
       * C'est le moment exact ou le joueur croit qu'il vient de perdre son
       * solde : il a vu le chiffre tomber a zero, et sa transaction a echoue.
       * Le bon est cumulatif — le contrat paiera l'ecart la prochaine fois —
       * mais personne ne peut le deviner. */
      dit(texteErreur('Withdraw', e), 'ko', e && e.sortie);
      montreLeBon(true);
    });
  }

  /* Le bouton n'apparait QUE quand il sert : apres un encaissement rate, ou
     quand le serveur nous a dit qu'un bon attendait. */
  function montreLeBon(oui, montant) {
    var b = $('swcWdClaim');
    if (b) b.style.display = oui ? '' : 'none';
    var l = $('swcWdAttente');
    if (!l) return;
    l.style.display = oui ? '' : 'none';
    /* On le DIT en toutes lettres, avec le montant quand on le connait :
       « Claim pending withdrawal » tout seul ne dit pas s'il s'agit de dix
       jetons ou de tout ce qu'on possede, et c'est precisement le doute du
       joueur qui vient de voir son solde tomber a zero. */
    if (!oui) { l.textContent = ''; return; }
    /* ---- « IL EST TOUJOURS A VOUS » NE DIT PAS OU IL EST ----
     *
     * Rapporte mot pour mot : « j'ai retire mais ca m'a bloque les jetons, je
     * ne sais pas ou ». La phrase rassurait sans rien expliquer, et au moment
     * precis ou le joueur vient de voir dix millions quitter son solde, une
     * promesse sans lieu ne vaut rien.
     *
     * On dit donc CE QUI S'EST PASSE, dans l'ordre ou ca s'est passe : le
     * solde de jeu a ete debite, les jetons n'ont pas bouge du coffre, et il
     * ne reste qu'a les en sortir. C'est exactement ce que le serveur fait —
     * `requestWithdraw` debite la fiche et inscrit la somme au `bonDu`, qui
     * est compte dans ce que le coffre DOIT, pour que le surplus du
     * proprietaire ne puisse jamais passer par-dessus.
     *
     * Et on dit que le bouton se represente : le bon est resigne a la demande,
     * autant de fois qu'il faut, et le contrat ne paie que l'ecart avec ce qui
     * est deja sorti. Reessayer ne peut donc rien couter ni rien doubler —
     * c'est la seule chose qui transforme l'attente en patience. */
    l.innerHTML = (montant > 0
      ? '<b>' + montant.toLocaleString('en-US') + ' $SWOGE</b> left your game balance '
      : 'Your last withdrawal left your game balance ')
      + 'and is waiting in the vault, in your name. Nothing moved on-chain yet: '
      + 'the last step is your wallet claiming it. You can retry as often as you '
      + 'need — the vault only ever pays what has not been paid.';
  }

  /* Redemander le bon deja signe. Le serveur ne debite rien : il resigne le
     cumul deja autorise, et le contrat ne paie que l'ecart avec ce qui a deja
     ete tire — un bon resigne ne peut donc pas payer un jeton de plus. */
  function reprendLeBon() {
    if (!demande('withdrawVoucher')) return dit('Not connected — try again in a few seconds', 'ko');
    dit('Looking up your pending withdrawal…');
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
