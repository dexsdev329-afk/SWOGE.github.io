/*
 * SWOGE — ce qui vient se poser a cote du solde, sur toutes les pages :
 *   • le rendement du staking, qui monte, et qu'un clic encaisse ;
 *   • le nombre de joueurs en ligne, et le nombre de comptes en tout ;
 *   • le PROFIL : depots, retraits, et chaque manche jouee, gardes a vie.
 *
 * Pourquoi un fichier a part plutot que le meme code colle dans onze pages :
 * les onze pages ont des coquilles differentes (le Pusher, le Spin, le Poker
 * et la page de staking n'ont pas la meme barre), mais TOUTES portent le solde
 * dans un element `#bal` et TOUTES parlent au meme serveur. Un seul fichier,
 * donc un seul comportement a corriger le jour ou il faudra le corriger.
 *
 * Trois decisions valent d'etre dites :
 *
 *  1. LE COMPTEUR EST CALCULE ICI, PAS DEMANDE AU SERVEUR. Le rendement est
 *     lineaire — montant x taux x temps — donc le navigateur peut le prolonger
 *     exactement, avec la meme formule que le serveur. Demander la valeur
 *     dix fois par seconde ferait dix fois plus de trafic pour un resultat
 *     identique, et le compteur sauterait au rythme du reseau au lieu de
 *     couler.
 *
 *  2. ON N'ACCROCHE RIEN AU CODE DES PAGES. On enveloppe WebSocket pour
 *     ECOUTER ce qui passe deja : la page continue de traiter ses messages
 *     comme avant, sans savoir qu'on regarde. Aucune des onze pages n'a une
 *     ligne a changer, et aucune ne peut casser a cause d'ici.
 *
 *  3. LA BULLE NE S'AFFICHE QUE S'IL Y A QUELQUE CHOSE DEDANS. Sans mise en
 *     jeu, pas de bulle : un compteur fige a zero a cote du solde n'apprend
 *     rien et prend de la place.
 */
(function () {
  'use strict';
  if (window.__swogeStake) return;          // une seule fois par page
  window.__swogeStake = true;

  var MS_AN = 31536000000;                  // 365 jours — la constante du serveur
  var etat = { mise: 0, acquis: 0, tauxBps: 0, t0: 0, socket: null, prete: false };
  var bulle = null, chiffre = null, occupe = false;
  var pastille = null, gens = null;
  var profBtn = null, profBoite = null, profOnglet = 'r', profItems = [], profFin = null,
      profEncore = false, profCharge = false, profResume = null, profOuvert = false;

  /* ---------------------------------------------------------------------
   * LES PAGES SANS PORTEFEUILLE
   *
   * games.html est un catalogue : pas de socket, pas de session, pas de solde.
   * Le joueur y arrive pourtant avec un compte — le meme, puisque c'est le
   * meme site — et n'a aucune raison de ne pas y voir son solde, son
   * rendement et son profil.
   *
   * On ne recopie pas la coquille d'une page de jeu : elle pese six cents
   * kilo-octets et refait toute la connexion. On ouvre juste une socket et on
   * presente le JETON DE SESSION deja range dans le navigateur par les pages
   * de jeu. Pas de signature, pas de portefeuille a rouvrir : si le joueur
   * s'est connecte ailleurs sur le site, il est connecte ici.
   *
   * Sans jeton, on n'affiche rien du tout plutot qu'un solde a zero qui
   * ferait croire a un compte vide.
   */
  function adresseServeur() {
    try {
      var q = new URLSearchParams(location.search).get('server');
      if (q) return q;
    } catch (e) {}
    return 'wss://web-production-220a3.up.railway.app';
  }
  function jetonRange() {
    try { return localStorage.getItem('swogeSession'); } catch (e) { return null; }
  }
  function connecteSeul() {
    if (document.getElementById('bal')) return;      // la page a deja sa socket
    var jeton = jetonRange();
    if (!jeton) return;                              // jamais connecte ici : on se tait
    var w;
    try { w = new window.WebSocket(adresseServeur()); } catch (e) { return; }
    w.addEventListener('message', function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'hello') { try { w.send(JSON.stringify({ type: 'resume', token: jeton })); } catch (e) {} }
      else if (m.type === 'auth') { etat.socket = w; poseSolde(m.balance); }
      else if (m.type === 'balance' || m.type === 'stakeInfo') {
        if (m.balance != null) poseSolde(m.balance);
      }
      else if (m.type === 'resumeFailed') {
        try { localStorage.removeItem('swogeSession'); } catch (e) {}
        try { w.close(); } catch (e) {}
      }
    });
    w.addEventListener('close', function () { setTimeout(connecteSeul, 5000); });
  }

  /* La pastille du solde, fabriquee ici parce que la page n'en a pas. Elle
     porte l'identifiant `bal` : tout le reste du module s'accroche a lui, et
     deux facons de trouver le solde finiraient par diverger. */
  var soldeSeul = null;
  function poseSolde(v) {
    if (!soldeSeul) {
      var barre = document.querySelector('nav');
      if (!barre) return;
      var css = document.createElement('style');
      css.textContent =
        '.swbal{display:inline-flex;align-items:center;gap:7px;vertical-align:middle;' +
        'padding:7px 13px;border-radius:999px;font-family:inherit;font-size:13px;' +
        'font-weight:800;color:#FFD97A;white-space:nowrap;' +
        'background:linear-gradient(180deg,rgba(46,26,10,.92),rgba(20,10,4,.96));' +
        'border:1px solid rgba(230,165,55,.45);}' +
        '.swbal .pt{width:8px;height:8px;border-radius:50%;background:#16D97F;' +
        'box-shadow:0 0 8px #16D97F;}' +
        '.swbal em{font-style:normal;font-size:10px;color:#C9A24A;letter-spacing:.8px;}' +
        '@media (max-width:520px){.swbal{font-size:11px;padding:5px 10px;}}';
      document.head.appendChild(css);
      soldeSeul = document.createElement('span');
      soldeSeul.className = 'swbal';
      soldeSeul.innerHTML = '<span class="pt"></span><b id="bal">—</b><em>$SWOGE</em>';
      var avant = barre.querySelector('.menubtn, .buy') || null;
      if (avant) barre.insertBefore(soldeSeul, avant); else barre.appendChild(soldeSeul);
    }
    var n = parseFloat(v || 0);
    soldeSeul.querySelector('#bal').textContent =
      n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(2);
    rend(); rendGens(); profBtnVisible(true);
  }

  // ------------------------------------------------------------ le reseau
  /* On enveloppe le constructeur sans le remplacer : `new` renvoie l'objet
     rendu, donc la page recoit une VRAIE WebSocket native. Rien ne change
     pour elle. */
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
    /* La charge d'authentification porte l'etat du staking sous `stake` ; le
       message `stakeInfo` le porte a plat. Les deux chemins existent deja, on
       lit les deux plutot que d'en imposer un nouveau. */
    if (m.type === 'auth' && m.stake) { etat.socket = ev.target; pose(m.stake); }
    else if (m.type === 'stakeInfo') { etat.socket = ev.target; pose(m); }
    else if (m.type === 'stakeUnstaked') { etat.socket = ev.target; demande(); }
    else if (m.type === 'stakeClaimed') { occupe = false; eclat(); }
    else if (m.type === 'error' && occupe) { occupe = false; }
    /* Le compte arrive avec le « hello », donc AVANT que le joueur se
       connecte : la page annonce le monde present des la premiere seconde,
       ce qui est justement le moment ou l'information sert. */
    if (m.type === 'history') { etat.socket = ev.target; poseHistorique(m); }
    if (m.type === 'profile') {
      etat.socket = ev.target;
      if (m.avatars) VISAGES = m.avatars;
      if (m.uploaded) { versionPhoto++; dit('Photo saved — other players see it now.', 'ok'); }
      if (m.profile) MOI = m.profile;
      if (m.friends) AMIS = m.friends;
      profEnTete(); if (profOnglet === 'am') profRend();
    }
    if (m.type === 'friends') { AMIS = m.friends || []; if (profOnglet === 'am') profRend(); }
    if (m.type === 'transferSent' || m.type === 'transferGot') {
      /* Un virement change le solde ET l'historique : on redemande la page
         courante plutot que de deviner ou inserer la ligne. */
      if (profOuvert) profVa(profOnglet);
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send('{"type":"profile"}');
    }
    if (m.type === 'auth') { etat.socket = ev.target; profBtnVisible(true); }
    if (m.type === 'hello' && m.explorer) EXPLORATEUR = String(m.explorer).replace(/\/+$/, '');
    if (m.type === 'hello' && m.joueurs) gens = m.joueurs;
    else if (m.type === 'joueurs') gens = m;
    if (gens) rendGens();
  }

  function pose(s) {
    var mise = parseFloat(s.staked || 0), acquis = parseFloat(s.pending || 0);
    if (!isFinite(mise)) mise = 0;
    if (!isFinite(acquis)) acquis = 0;
    etat.mise = mise; etat.acquis = acquis;
    etat.tauxBps = Number(s.aprBps || 0);
    etat.t0 = Date.now();
    etat.prete = true;
    rend();
  }

  function demande() {
    try { if (etat.socket && etat.socket.readyState === 1) etat.socket.send('{"type":"stakeInfo"}'); }
    catch (e) {}
  }

  // ---------------------------------------------------------- le compteur
  /* La meme formule que le serveur : montant x taux x temps ecoule / an. */
  function courant() {
    if (!etat.mise || !etat.tauxBps) return etat.acquis;
    var dt = Date.now() - etat.t0;
    return etat.acquis + etat.mise * (etat.tauxBps / 10000) * (dt / MS_AN);
  }
  function parSeconde() { return etat.mise * (etat.tauxBps / 10000) / (MS_AN / 1000); }

  /* Assez de decimales pour que le dernier chiffre BOUGE a chaque rafraichis-
     sement : c'est tout l'interet du compteur. Une mise de dix jetons gagne
     3e-7 par seconde — avec deux decimales on regarderait un nombre fige. */
  function decimales() {
    var r = parSeconde();
    if (!(r > 0)) return 2;
    var d = Math.ceil(1 - Math.log(r) / Math.LN10);
    return Math.min(8, Math.max(2, d));
  }

  function texte() {
    var v = courant(), d = decimales();
    /* Au-dela du millier la partie entiere suffit a voir que ca monte, et
       huit decimales sur cinq chiffres seraient illisibles. */
    if (v >= 1000) return v.toFixed(Math.min(d, 3));
    return v.toFixed(d);
  }

  // -------------------------------------------------------------- l'ecran
  function monte() {
    if (bulle) return true;
    var bal = document.getElementById('bal');
    if (!bal) return false;
    /* On se pose a cote de la pastille du solde, pas a cote du chiffre nu :
       les onze coquilles n'ont pas la meme, d'ou la liste. */
    var ancre = (bal.closest && bal.closest('.chip, .stat, .balance, .bal, .solde')) || bal.parentElement;
    if (!ancre || !ancre.parentElement) return false;

    var css = document.createElement('style');
    css.textContent =
      '.swstk{display:inline-flex;align-items:center;gap:6px;vertical-align:middle;' +
      'margin-left:8px;padding:5px 11px;border:0;border-radius:999px;cursor:pointer;' +
      'font-family:inherit;font-size:12.5px;font-weight:800;line-height:1;color:#0A1608;' +
      'background:linear-gradient(180deg,#8CFFC0,#16D97F 58%,#0E9257);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 2px 8px rgba(22,217,127,.3);' +
      'white-space:nowrap;transition:transform .1s,box-shadow .15s;}' +
      '.swstk:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 0 0 2px rgba(22,217,127,.45),0 4px 12px rgba(22,217,127,.4);}' +
      '.swstk:active{transform:translateY(1px);}' +
      '.swstk b{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.2px;}' +
      '.swstk .swi{font-size:12px;filter:none;}' +
      '.swstk.swflash{animation:swflash .7s ease-out;}' +
      '@keyframes swflash{0%{transform:scale(1.18);box-shadow:0 0 0 6px rgba(22,217,127,.5);}' +
      '100%{transform:scale(1);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 2px 8px rgba(22,217,127,.3);}}' +
      /* Sur telephone la barre du Blackjack n'a pas cinq pixels a donner : la
         bulle debordait de l'ecran. On la resserre au lieu d'esperer que
         chaque barre saura l'absorber — et sous 400 px le cadenas s'efface,
         le chiffre suffit. */
      '@media (max-width:520px){.swstk{font-size:10.5px;padding:3px 8px;margin-left:5px;gap:4px;}' +
      '.swstk .swi{font-size:10px;}}' +
      '@media (max-width:400px){.swstk .swi{display:none;}.swstk{gap:0;padding:3px 7px;}}' +
      /* Les deux crans de repli, appliques par la mesure et non par un seuil
         devine : onze barres differentes n'ont pas la meme place, et une
         valeur en pixels choisie a la main serait fausse pour au moins l'une
         d'elles. */
      'html.swtight .swstk .swi,html.swtight .swppl i{display:none!important;}' +
      'html.swtight .swstk,html.swtight .swppl{font-size:10px!important;' +
      'padding:3px 6px!important;margin-left:4px!important;gap:4px!important;}' +
      'html.swnoppl .swppl{display:none!important;}' +
      'html.swnostk .swstk{display:none!important;}';
    document.head.appendChild(css);

    bulle = document.createElement('button');
    bulle.className = 'swstk';
    bulle.type = 'button';
    bulle.style.display = 'none';
    bulle.innerHTML = '<span class="swi">🔒</span><b>0</b>';
    chiffre = bulle.querySelector('b');
    bulle.addEventListener('click', reclame);
    ancre.parentElement.insertBefore(bulle, ancre.nextSibling);
    ajusteBientot();
    return true;
  }

  /* Le compte de joueurs : posé APRÈS la bulle de staking, donc toujours dans
     le meme ordre, quelle que soit celle qui apparait la premiere. */
  function monteGens() {
    if (pastille) return true;
    if (!monte()) return false;              // meme point d'ancrage que la bulle
    var css = document.createElement('style');
    css.textContent =
      '.swppl{display:inline-flex;align-items:center;gap:6px;vertical-align:middle;' +
      'margin-left:8px;padding:5px 11px;border-radius:999px;' +
      'font-family:inherit;font-size:12px;font-weight:700;line-height:1;color:#EAF2FF;' +
      'background:linear-gradient(180deg,rgba(46,123,255,.22),rgba(10,16,32,.75));' +
      'border:1px solid rgba(46,123,255,.5);white-space:nowrap;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}' +
      '.swppl .swdot{width:7px;height:7px;border-radius:50%;background:#16D97F;' +
      'box-shadow:0 0 7px #16D97F;animation:swbat 2.2s ease-in-out infinite;}' +
      '@keyframes swbat{50%{opacity:.35}}' +
      '.swppl b{font-variant-numeric:tabular-nums;}' +
      '.swppl i{font-style:normal;opacity:.62;font-weight:600;}' +
      '@media (max-width:520px){.swppl{font-size:10.5px;padding:3px 8px;margin-left:5px;gap:5px;}}' +
      '@media (max-width:400px){.swppl i{display:none;}.swppl{padding:3px 7px;}}';
    document.head.appendChild(css);
    pastille = document.createElement('span');
    pastille.className = 'swppl';
    pastille.style.display = 'none';
    pastille.innerHTML = '<span class="swdot"></span><b>0</b><i>online</i>';
    bulle.parentElement.insertBefore(pastille, bulle.nextSibling);
    ajusteBientot();
    return true;
  }

  var derniereLargeur = '';
  /* On rejuge la place quand ce qui est ECRIT change de taille : une pastille
     qui passe de « 9 » a « 10 », un compteur qui gagne un chiffre entier. Ne
     le faire qu'au montage laissait la barre deborder des la premiere dizaine
     — et laissait surtout le repli inactif tant que la pastille n'etait pas
     encore visible. */
  function veille() {
    var t = (bulle && bulle.style.display !== 'none' ? chiffre.textContent : '')
          + '|' + (pastille && pastille.style.display !== 'none' ? pastille.textContent : '');
    if (t.length !== derniereLargeur.length) { derniereLargeur = t; ajusteBientot(); }
    else derniereLargeur = t;
  }

  function rendGens() {
    if (!gens || !monteGens()) return;
    var avant = pastille.style.display;
    pastille.style.display = '';
    if (avant === 'none') ajusteBientot();
    pastille.querySelector('b').textContent = Number(gens.enLigne || 0).toLocaleString('en-US');
    var t = Number(gens.total || 0);
    pastille.title = gens.enLigne + ' player' + (gens.enLigne === 1 ? '' : 's') +
                     ' online right now · ' + t.toLocaleString('en-US') + ' accounts in total';
    /* Le total ne bouge presque jamais : il tient dans l'infobulle et dans le
       texte discret a cote, pas dans un second gros chiffre. */
    pastille.querySelector('i').textContent = 'online · ' + t.toLocaleString('en-US');
    veille();
  }

  function rend() {
    if (!monte()) return;
    /* Rien en jeu : pas de bulle. Un compteur fige a zero n'apprend rien. */
    var avant = bulle.style.display;
    if (!etat.prete || etat.mise <= 0) {
      bulle.style.display = 'none';
      if (avant !== 'none') ajusteBientot();
      return;
    }
    bulle.style.display = '';
    if (avant === 'none') ajusteBientot();
    chiffre.textContent = texte();
    var v = courant();
    veille();
    bulle.title = occupe ? 'Claiming…'
      : v > 0 ? 'Yield earned on your ' + Math.round(etat.mise).toLocaleString('en-US') +
                ' staked $SWOGE — tap to claim it now'
              : 'Your staking yield will appear here';
  }

  function eclat() {
    if (!bulle) return;
    bulle.classList.remove('swflash');
    void bulle.offsetWidth;                 // force la reprise de l'animation
    bulle.classList.add('swflash');
    demande();                              // on relit l'etat plutot que de le deviner
  }

  function reclame() {
    if (occupe) return;
    /* On ne demande rien quand il n'y a rien : le serveur repondrait « no
       yield to claim yet », et la page afficherait une erreur pour un clic
       parfaitement raisonnable. */
    if (!(courant() > 0)) return;
    if (!etat.socket || etat.socket.readyState !== 1) return;
    occupe = true;
    try { etat.socket.send('{"type":"claimStake"}'); }
    catch (e) { occupe = false; }
    setTimeout(function () { occupe = false; }, 6000);   // filet, si rien ne revient
  }

  /* ---- tenir dans la barre ----
   * Les deux pastilles ajoutent une centaine de pixels a une barre qui n'en
   * avait pas forcement. On ne devine pas un seuil : on MESURE le debordement
   * que l'on cause soi-meme — on cache tout, on note la largeur de la page
   * sans nous, on remet, et on compare. Une page qui debordait deja n'est pas
   * mise sur notre compte, et une barre qu'on ne connait pas encore sera
   * traitee correctement le jour ou elle existera.
   */
  var basePage = null;
  function tropLarge() { return document.documentElement.scrollWidth - window.innerWidth; }
  function ajuste() {
    if (!bulle) return;
    var r = document.documentElement;
    r.classList.remove('swtight', 'swnoppl', 'swnostk');
    // la largeur de la page sans nous, mesuree a chaque fois : la barre peut
    // avoir change pour ses propres raisons
    var vb = bulle.style.display, vp = pastille ? pastille.style.display : null;
    bulle.style.display = 'none'; if (pastille) pastille.style.display = 'none';
    basePage = tropLarge();
    bulle.style.display = vb; if (pastille) pastille.style.display = vp;
    if (tropLarge() <= basePage + 1) return;          // on ne gene pas
    r.classList.add('swtight');                       // premier cran : on resserre
    if (tropLarge() <= basePage + 1) return;
    r.classList.add('swnoppl');                       // second : le compte s'efface
    if (tropLarge() <= basePage + 1) return;
    /* Troisieme cran. Sur une barre de 320 px, marque + solde + menu occupent
       deja toute la place : il n'y a rien a gagner a insister. On s'efface
       plutot que de pousser la page hors de l'ecran — le rendement reste
       reclamable sur la page de staking. */
    r.classList.add('swnostk');
  }
  var ajusteT = null;
  function ajusteBientot() { clearTimeout(ajusteT); ajusteT = setTimeout(ajuste, 120); }
  window.addEventListener('resize', ajusteBientot);
  window.addEventListener('orientationchange', ajusteBientot);

  /* ============================== LE PROFIL ==============================
   *
   * Depots, retraits, et chaque manche jouee — gardes a vie cote serveur, dans
   * un fichier par joueur. Ici on ne fait que demander et afficher.
   *
   * On demande UNE PAGE a la fois. Un joueur de la premiere heure a des
   * dizaines de milliers de manches : les charger d'un bloc figerait sa page
   * pendant plusieurs secondes pour lui montrer vingt lignes. Le curseur est
   * l'horodatage du dernier element recu — « ce qui precede cet instant » —
   * et non un numero de page : rien ne se decale si une manche se termine
   * entre deux demandes.
   */
  var JEUX = { plinko:'Plinko', crash:'Crash', bj:'Blackjack', spin:'SWOGE Spin',
               smash:'Smash', mines:'Mines', hilo:'Hi-Lo', holdem:"Casino Hold'em",
               three:'Three Card', p4:'Connect 4', pusher:'Coin Pusher' };
  var ONGLETS = [['r','Rounds'],['dep','Deposits'],['wd','Withdrawals'],
                 ['st','Staking'],['tr','Transfers'],['am','Friends']];
  var VISAGES = [], MOI = { name: null, visage: null, address: null }, AMIS = [];
  var EXPLORATEUR = 'https://robinhoodchain.blockscout.com';

  function nb(v, d) {
    var n = Number(v || 0);
    if (!isFinite(n)) return '0';
    return n.toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 2 : d });
  }
  /* Jour, mois, ANNEE, heure, minute et SECONDE. C'est un journal dont on se
     sert pour retrouver ce qui s'est passe : « 14:32 » sans la date ni la
     seconde ne permet de recouper avec rien. L'heure est celle du navigateur,
     donc celle du joueur — c'est la sienne qu'il reconnaitra. */
  /* Une adresse entiere fait quarante-deux caracteres et casse la ligne sur un
     telephone ; le debut et la fin suffisent a la reconnaitre, et le titre
     porte la valeur complete pour qui veut la copier. */
  function court(a) {
    a = String(a || '');
    return a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a;
  }

  function quand(t) {
    var d = new Date(Number(t) || 0);
    if (!isFinite(d.getTime()) || !t) return '—';
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
           ' · ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit',
                                                   second:'2-digit', hour12:false });
  }

  function profStyle() {
    var css = document.createElement('style');
    css.textContent =
      '.swpb{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;' +
      'margin-left:8px;width:34px;height:34px;padding:0;border-radius:50%;cursor:pointer;' +
      'font-size:15px;line-height:1;color:#FFD97A;' +
      'background:linear-gradient(180deg,rgba(46,26,10,.95),rgba(20,10,4,.98));' +
      'border:1px solid rgba(230,165,55,.5);}' +
      '.swpb:hover{border-color:#FFC53D;color:#fff;}' +
      '.swpov{position:fixed;inset:0;z-index:99999;display:none;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(3,6,12,.82);' +
      '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}' +
      '.swpov.on{display:flex;}' +
      '.swp{width:min(680px,100%);max-height:86vh;display:flex;flex-direction:column;' +
      'border-radius:16px;overflow:hidden;font-family:inherit;color:#EAF2FF;' +
      'background:linear-gradient(180deg,#141C30,#080C16);' +
      'border:1px solid rgba(255,197,61,.4);box-shadow:0 24px 60px rgba(0,0,0,.7);}' +
      '.swp-h{display:flex;align-items:center;gap:10px;padding:13px 15px;' +
      'border-bottom:1px solid rgba(255,197,61,.26);background:rgba(255,197,61,.08);}' +
      '.swp-h b{font-size:13.5px;letter-spacing:1.4px;text-transform:uppercase;color:#FFD97A;}' +
      '.swp-h span{flex:1;font-size:11px;color:#8DA0C4;}' +
      '.swp-x{width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:15px;' +
      'color:#EAF2FF;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);}' +
      '.swp-t{display:flex;gap:6px;padding:10px 13px 0;}' +
      '.swp-t button{flex:1;padding:8px 6px;border-radius:9px 9px 0 0;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.5px;' +
      'color:#8DA0C4;background:rgba(255,255,255,.05);border:1px solid transparent;' +
      'border-bottom:0;}' +
      '.swp-t button.on{color:#07101F;background:linear-gradient(180deg,#FFE08A,#FFC53D);}' +
      '.swp-l{flex:1;overflow-y:auto;padding:10px 13px 14px;min-height:180px;}' +
      '.swp-r{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;' +
      'margin-bottom:6px;background:rgba(255,255,255,.04);' +
      'border:1px solid rgba(255,255,255,.07);}' +
      '.swp-r .w{flex:1;min-width:0;}' +
      '.swp-r .w b{display:block;font-size:13px;font-weight:800;color:#EAF2FF;}' +
      '.swp-r .w span{display:block;font-size:10.5px;color:#8DA0C4;margin-top:2px;}' +
      '.swp-r .v{flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;}' +
      '.swp-r .v b{display:block;font-size:13.5px;font-weight:800;}' +
      '.swp-r .v span{font-size:10px;color:#8DA0C4;}' +
      '.swp-r .g{color:#7CFF9B;} .swp-r .p{color:#F2685E;} .swp-r .n{color:#E7C97A;}' +
      '.swp-v{text-align:center;color:#8DA0C4;font-size:12.5px;padding:30px 10px;line-height:1.7;}' +
      '.swp-more{display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;' +
      'cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:800;color:#EAF2FF;' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);}' +
      '.swp-more[disabled]{opacity:.5;cursor:default;}' +
      /* Six onglets ne tiennent pas sur une ligne de telephone : ils se
         replient au lieu de sortir de la boite. */
      '.swp-t{flex-wrap:wrap;}' +
      '.swp-t button{flex:1 1 88px;}' +
      /* l en-tete : le visage, le nom, et de quoi les changer */
      '.swp-me{display:flex;align-items:center;gap:11px;padding:11px 13px;' +
      'border-bottom:1px solid rgba(255,197,61,.18);background:rgba(255,255,255,.03);}' +
      '.swp-av{flex:0 0 auto;width:40px;height:40px;border-radius:50%;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;font-size:21px;' +
      'background:linear-gradient(180deg,rgba(46,26,10,.95),rgba(20,10,4,.98));' +
      'border:1px solid rgba(230,165,55,.5);}' +
      '.swp-me .nm{flex:1;min-width:0;}' +
      '.swp-me .nm b{display:block;font-size:14.5px;font-weight:800;color:#EAF2FF;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.swp-me .nm span{display:block;font-size:10.5px;color:#8DA0C4;margin-top:2px;' +
      'font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.swp-ed{flex:0 0 auto;padding:7px 11px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:800;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);border:0;}' +
      '.swp-form{padding:11px 13px;border-bottom:1px solid rgba(255,197,61,.18);' +
      'background:rgba(0,0,0,.25);}' +
      '.swp-form.off{display:none;}' +
      '.swp-avs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px;}' +
      '.swp-avs button{width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);}' +
      '.swp-avs button.on{background:rgba(255,197,61,.28);border-color:#FFC53D;}' +
      '.swp-in{display:flex;gap:7px;flex-wrap:wrap;}' +
      '.swp-in input{flex:1 1 150px;min-width:0;padding:9px 11px;border-radius:9px;' +
      'font-family:inherit;font-size:13px;color:#EAF2FF;background:rgba(0,0,0,.4);' +
      'border:1px solid rgba(255,255,255,.16);}' +
      '.swp-in button{flex:0 0 auto;padding:9px 14px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12.5px;font-weight:800;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);border:0;}' +
      '.swp-up{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px;}' +
      '.swp-up button{flex:1 1 auto;padding:9px 12px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#EAF2FF;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);}' +
      '.swp-up button:hover{border-color:#FFC53D;}' +
      '.swp-up .swp-drop{flex:0 0 auto;}' +
      '.swp-msg{margin-top:8px;font-size:11.5px;line-height:1.5;color:#8DA0C4;}' +
      '.swp-msg.ko{color:#F2685E;} .swp-msg.ok{color:#7CFF9B;}' +
      '.swp-r .av{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:flex;' +
      'align-items:center;justify-content:center;font-size:15px;' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);}' +
      '.swp-r .mini{flex:0 0 auto;padding:6px 10px;border-radius:8px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:800;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);border:0;}' +
      '.swp-r .mini.gh{color:#EAF2FF;background:rgba(255,255,255,.08);' +
      'border:1px solid rgba(255,255,255,.16);}' +
      '.swp-fair{font-size:10px;color:#6E80A4;margin-top:3px;font-family:monospace;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      /* les mois : un bandeau qu'on replie */
      '.swp-mo{display:flex;align-items:center;gap:9px;width:100%;margin:10px 0 6px;' +
      'padding:8px 11px;border-radius:9px;cursor:pointer;font-family:inherit;' +
      'font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;' +
      'color:#FFD97A;background:rgba(255,197,61,.10);' +
      'border:1px solid rgba(255,197,61,.28);}' +
      '.swp-mo:first-child{margin-top:0;}' +
      '.swp-mo i{font-style:normal;font-weight:600;letter-spacing:.3px;text-transform:none;' +
      'color:#8DA0C4;font-size:11px;margin-left:auto;}' +
      '.swp-mo .ch{color:#8DA0C4;font-size:10px;}' +
      '@media (max-width:520px){.swpb{width:30px;height:30px;font-size:13px;margin-left:5px;}' +
      '.swp-h b{font-size:12px;}}' +
      'html.swtight .swpb{width:28px;height:28px;font-size:12px;margin-left:4px;}' +
      'html.swnoppl .swpb{margin-left:4px;}';
    document.head.appendChild(css);
  }

  function profMonte() {
    if (profBtn) return true;
    if (!monte()) return false;
    profStyle();
    profBtn = document.createElement('button');
    profBtn.className = 'swpb';
    profBtn.type = 'button';
    profBtn.title = 'Your profile — deposits, withdrawals and every round you played';
    profBtn.textContent = '👤';
    profBtn.style.display = 'none';
    profBtn.addEventListener('click', profOuvre);
    var apres = pastille || bulle;
    apres.parentElement.insertBefore(profBtn, apres.nextSibling);

    profBoite = document.createElement('div');
    profBoite.className = 'swpov';
    profBoite.innerHTML =
      '<div class="swp">' +
        '<div class="swp-h"><b>Your profile</b><span class="swp-sub"></span>' +
        '<button class="swp-x" type="button">&times;</button></div>' +
        '<div class="swp-me">' +
          '<div class="swp-av"></div>' +
          '<div class="nm"><b></b><span></span></div>' +
          '<button class="swp-ed" type="button">Edit</button>' +
        '</div>' +
        '<div class="swp-form off">' +
          '<div class="swp-avs"></div>' +
          '<div class="swp-up">' +
            '<input type="file" accept="image/jpeg,image/png,image/webp" hidden>' +
            '<button class="swp-pick" type="button">📷 Use a photo from my phone</button>' +
            '<button class="swp-drop" type="button">Remove photo</button>' +
          '</div>' +
          '<div class="swp-in">' +
            '<input class="swp-nom" maxlength="18" placeholder="Your name, 3 to 18 characters">' +
            '<button class="swp-save" type="button">Save</button>' +
          '</div>' +
          '<div class="swp-msg"></div>' +
        '</div>' +
        '<div class="swp-t"></div>' +
        '<div class="swp-l"></div>' +
      '</div>';
    document.body.appendChild(profBoite);
    profBoite.addEventListener('click', function (e) {
      if (e.target === profBoite || e.target.classList.contains('swp-x')) profFerme();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') profFerme(); });

    var ed = profBoite.querySelector('.swp-ed');
    var form = profBoite.querySelector('.swp-form');
    ed.addEventListener('click', function () {
      var ouvert = !form.classList.contains('off');
      form.classList.toggle('off', ouvert);
      ed.textContent = ouvert ? 'Edit' : 'Close';
      if (!ouvert) { profBoite.querySelector('.swp-nom').value = MOI.name || ''; profVisages(); }
    });
    profBoite.querySelector('.swp-save').addEventListener('click', enregistre);

    /* ---- la photo venue du telephone ----
     * Elle est REDIMENSIONNEE DANS LE NAVIGATEUR avant d'etre envoyee. Une
     * photo de telephone pese trois a huit megaoctets ; la faire monter pour
     * l'afficher en trente-quatre pixels serait absurde, couteux pour le
     * joueur en donnees mobiles, et le serveur n'a pas de bibliotheque
     * d'images pour la reduire lui-meme. Un carre de 256 px en JPEG pese
     * quelques kilo-octets et suffit largement.
     *
     * On recadre au CENTRE plutot que de deformer : une photo de portrait
     * ecrasee en carre ne ressemble a personne.
     */
    var champ = profBoite.querySelector('.swp-up input[type=file]');
    profBoite.querySelector('.swp-pick').addEventListener('click', function () { champ.click(); });
    profBoite.querySelector('.swp-drop').addEventListener('click', function () {
      if (etat.socket && etat.socket.readyState === 1) {
        etat.socket.send('{"type":"avatarRemove"}');
        dit('Photo removed.', 'ok');
      }
    });
    champ.addEventListener('change', function () {
      var f = champ.files && champ.files[0];
      champ.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) return dit('That file is not an image.', 'ko');
      dit('Preparing your photo…');
      var lecteur = new FileReader();
      lecteur.onerror = function () { dit('Could not read that file.', 'ko'); };
      lecteur.onload = function () {
        var img = new Image();
        img.onerror = function () { dit('That image could not be opened.', 'ko'); };
        img.onload = function () {
          try {
            var N = 256;
            var c = document.createElement('canvas');
            c.width = N; c.height = N;
            var g = c.getContext('2d');
            // recadrage centre : on prend le plus grand carre de la photo
            var cote = Math.min(img.width, img.height);
            g.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, N, N);
            var data = c.toDataURL('image/jpeg', 0.82);
            /* On verifie le poids ICI aussi : le serveur refusera de toute
               facon, mais autant ne pas faire monter ce qu'on sait trop gros.
               Si le premier essai depasse, on baisse la qualite une fois. */
            if (data.length > 40000) data = c.toDataURL('image/jpeg', 0.6);
            if (data.length > 44000) return dit('That photo is too heavy even after resizing.', 'ko');
            if (!etat.socket || etat.socket.readyState !== 1) return dit('Not connected.', 'ko');
            etat.socket.send(JSON.stringify({ type: 'avatarUpload', data: data }));
            versionPhoto++;
            dit('Uploading…');
          } catch (e) { dit('Could not prepare that photo.', 'ko'); }
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(f);
    });
    profBoite.querySelector('.swp-nom').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') enregistre();
    });

    var t = profBoite.querySelector('.swp-t');
    ONGLETS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = o[1]; b.dataset.k = o[0];
      b.addEventListener('click', function () { profVa(o[0]); });
      t.appendChild(b);
    });
    return true;
  }

  function profBtnVisible(v) {
    if (!profMonte()) return;
    profBtn.style.display = v ? '' : 'none';
    ajusteBientot();
    /* Le nom, le visage et la liste des visages ne viennent PAS avec
       l'authentification : on les demande des qu'on sait a qui on parle,
       sinon le panneau s'ouvre sur un formulaire vide. */
    if (v && etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"profile"}'); } catch (e) {}
    }
  }

  function profOuvre() {
    if (!profMonte()) return;
    profOuvert = true;
    profBoite.classList.add('on');
    profEnTete();
    // on rafraichit le profil a chaque ouverture : il a pu changer ailleurs
    if (etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"profile"}'); } catch (e) {}
    }
    profVa(profOnglet);
  }
  function profFerme() { profOuvert = false; if (profBoite) profBoite.classList.remove('on'); }

  function profVa(k) {
    profOnglet = k; profItems = []; profFin = null; profEncore = false;
    [].forEach.call(profBoite.querySelectorAll('.swp-t button'), function (b) {
      b.classList.toggle('on', b.dataset.k === k);
    });
    profRend();
    profDemande();
  }

  function profDemande() {
    if (profOnglet === 'am') {
      if (etat.socket && etat.socket.readyState === 1) etat.socket.send('{"type":"profile"}');
      return;
    }
    if (profCharge) return;
    if (!etat.socket || etat.socket.readyState !== 1) { profRend(); return; }
    profCharge = true;
    try {
      /* Le curseur rendu par le serveur est une POSITION dans le fichier du
         joueur, pas un horodatage : trente manches lancees d'affilee partagent
         la meme milliseconde, et « ce qui precede cet instant » en sautait une
         a chaque page. On le renvoie tel quel, sans l'interpreter. */
      var q = { type: 'history', kind: profOnglet, limit: 25 };
      if (profFin !== null) q.cursor = profFin;      // absent = depuis la fin
      etat.socket.send(JSON.stringify(q));
    } catch (e) { profCharge = false; }
    setTimeout(function () { profCharge = false; }, 6000);
  }

  function poseHistorique(m) {
    profCharge = false;
    if (!profMonte()) return;
    if (m.kind !== profOnglet) return;      // reponse d'un onglet qu'on a quitte
    profItems = profItems.concat(m.items || []);
    profEncore = !!m.more;
    if (m.cursor !== undefined && m.cursor !== null) profFin = m.cursor;
    profResume = m.summary || profResume;
    profRend();
  }

  function ligne(e) {
    var d = document.createElement('div');
    d.className = 'swp-r';
    if (e.from || e.to || e.tx) d.title = [e.from && 'from ' + e.from, e.to && 'to ' + e.to,
                                            e.tx && 'tx ' + e.tx].filter(Boolean).join('\n');
    if (e.k === 'dep') {
      /* Le hash devient un LIEN vers l'explorateur : c'est la seule chose qui
         permette a un joueur d'aller verifier son depot par lui-meme, et un
         hash qu'on ne peut pas cliquer ne sert qu'a etre recopie a la main. */
      var lien = (e.tx && /^0x[0-9a-fA-F]{64}$/.test(e.tx))
        ? ' · <a href="' + EXPLORATEUR + '/tx/' + e.tx + '" target="_blank" rel="noopener" ' +
          'style="color:#7CFF9B">view on the explorer ↗</a>' : '';
      d.innerHTML = '<div class="w"><b>Deposit</b><span>' + quand(e.t) +
                    (e.from ? ' · from ' + court(e.from) : '') + lien + '</span></div>' +
                    '<div class="v"><b class="g">+' + nb(e.m) + '</b><span>$SWOGE</span></div>';
    } else if (e.k === 'tr') {
      var sortant = e.sens === 'out';
      d.innerHTML = '<div class="w"><b>' + (sortant ? 'Sent to a friend' : 'Received') + '</b>' +
                    '<span>' + quand(e.t) + ' · ' + (sortant ? 'to ' : 'from ') + court(e.autre) +
                    '</span></div>' +
                    '<div class="v"><b class="' + (sortant ? 'p' : 'g') + '">' +
                    (sortant ? '−' : '+') + nb(e.m) + '</b><span>$SWOGE</span></div>';
    } else if (e.k === 'wd') {
      d.innerHTML = '<div class="w"><b>Withdrawal</b><span>' + quand(e.t) +
                    (e.to ? ' · to ' + court(e.to) : '') + '</span></div>' +
                    '<div class="v"><b class="p">−' + nb(e.m) + '</b><span>$SWOGE</span></div>';
    } else if (e.k === 'st') {
      var quoi = e.s === 'stake' ? 'Staked' : e.s === 'claim' ? 'Yield claimed' : 'Unstaked';
      var signe = e.s === 'stake' ? '−' : '+';
      var couleur = e.s === 'stake' ? 'n' : 'g';
      var detail = quand(e.t);
      if (e.s === 'unstake') {
        if (Number(e.yld) > 0) detail += ' · yield ' + nb(e.yld);
        if (Number(e.pen) > 0) detail += ' · penalty ' + nb(e.pen);
      } else if (e.total !== undefined) detail += ' · staked total ' + nb(e.total);
      d.innerHTML = '<div class="w"><b>' + quoi + '</b><span>' + detail + '</span></div>' +
                    '<div class="v"><b class="' + couleur + '">' + signe + nb(e.m) + '</b>' +
                    '<span>$SWOGE</span></div>';
    } else {
      var net = (Number(e.p) || 0) - (Number(e.m) || 0);
      var cl = net > 0 ? 'g' : net < 0 ? 'p' : 'n';
      /* De quoi refaire le calcul : l'empreinte de la graine du serveur, la
         graine du joueur, et les numeros utilises par CETTE manche. */
      var fair = e.sh ? '<div class="swp-fair">seed ' + court(e.sh) +
                        (e.cs ? ' · client ' + court(e.cs) : '') +
                        (e.n0 != null ? ' · nonce ' + e.n0 + (e.n1 > e.n0 + 1 ? '–' + (e.n1 - 1) : '') : '') +
                        '</div>' : '';
      d.innerHTML = '<div class="w"><b>' + (JEUX[e.g] || e.g || 'Round') + '</b>' +
                    '<span>' + quand(e.t) + ' · stake ' + nb(e.m) + '</span>' + fair + '</div>' +
                    '<div class="v"><b class="' + cl + '">' + (net > 0 ? '+' : '') + nb(net) + '</b>' +
                    '<span>returned ' + nb(e.p) + '</span></div>';
    }
    return d;
  }

  // ---------------------------------------------- le profil, le formulaire
  var visageChoisi = null;
  /* L'image se demande a une ADRESSE, pas dans le message : le navigateur la
     met alors en cache au lieu de la recevoir a chaque manche. Le parametre
     `v` change a chaque enregistrement pour que le cache ne serve pas
     l'ancienne. */
  function urlPhoto(addr) {
    var base = adresseServeur().replace(/^ws/, 'http').replace(/\/+$/, '');
    return base + '/avatar/' + String(addr).toLowerCase() + '?v=' + versionPhoto;
  }
  var versionPhoto = 1;
  function peintVisage(el, p) {
    if (p && p.photo) {
      el.style.backgroundImage = 'url("' + urlPhoto(p.address) + '")';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = (p && p.visage) || '👤';
    }
  }

  function profEnTete() {
    if (!profBoite) return;
    peintVisage(profBoite.querySelector('.swp-av'), MOI);
    profBoite.querySelector('.swp-me .nm b').textContent = MOI.name || 'no name yet';
    profBoite.querySelector('.swp-me .nm span').textContent = MOI.address || '';
    if (MOI.address) profBoite.querySelector('.swp-me .nm span').title = MOI.address;
  }
  function profVisages() {
    var box = profBoite.querySelector('.swp-avs');
    if (visageChoisi === null) visageChoisi = MOI.visage;
    box.innerHTML = '';
    VISAGES.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = v;
      b.classList.toggle('on', v === visageChoisi);
      b.addEventListener('click', function () { visageChoisi = v; profVisages(); });
      box.appendChild(b);
    });
  }
  function dit(t, cl) {
    var m = profBoite.querySelector('.swp-msg');
    m.className = 'swp-msg' + (cl ? ' ' + cl : '');
    m.textContent = t || '';
  }
  function enregistre() {
    if (!etat.socket || etat.socket.readyState !== 1) return dit('Not connected.', 'ko');
    var nom = (profBoite.querySelector('.swp-nom').value || '').trim();
    var q = { type: 'setProfile' };
    if (nom && nom !== MOI.name) q.name = nom;
    if (visageChoisi && visageChoisi !== MOI.visage) q.avatar = visageChoisi;
    if (q.name === undefined && q.avatar === undefined) return dit('Nothing changed.');
    dit('Saving…');
    try { etat.socket.send(JSON.stringify(q)); } catch (e) { dit('Not connected.', 'ko'); }
    /* La reponse arrive par le meme canal que les erreurs : on laisse
       poseProfil et le message d'erreur du serveur parler. */
    setTimeout(function () {
      if (MOI.name === nom || (q.name === undefined && MOI.visage === visageChoisi))
        dit('Saved — other players see it now.', 'ok');
    }, 900);
  }

  // ------------------------------------------------------------ les amis
  function ligneAmi(a) {
    var d = document.createElement('div');
    d.className = 'swp-r';
    d.innerHTML = '<div class="av"></div>' +
      '<div class="w"><b>' + ech(a.name || court(a.address)) + '</b>' +
      '<span>' + court(a.address) + (a.connu ? '' : ' · never played here') + '</span></div>';
    peintVisage(d.querySelector('.av'), a);
    d.title = a.address;
    var envoyer = document.createElement('button');
    envoyer.className = 'mini'; envoyer.type = 'button'; envoyer.textContent = 'Send';
    envoyer.addEventListener('click', function (e) { e.stopPropagation(); demandeEnvoi(a); });
    var oter = document.createElement('button');
    oter.className = 'mini gh'; oter.type = 'button'; oter.textContent = '✕';
    oter.title = 'Remove from friends';
    oter.addEventListener('click', function (e) {
      e.stopPropagation();
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'friendRemove', address: a.address }));
    });
    d.appendChild(envoyer); d.appendChild(oter);
    return d;
  }
  function demandeEnvoi(a) {
    var v = window.prompt('How much $SWOGE do you want to send to ' + (a.name || court(a.address)) + '?', '');
    if (v === null) return;
    v = String(v).replace(',', '.').trim();
    if (!(parseFloat(v) > 0)) return;
    if (etat.socket && etat.socket.readyState === 1)
      etat.socket.send(JSON.stringify({ type: 'transfer', address: a.address, amount: v }));
  }
  function ech(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rendAmis() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    var form = document.createElement('div');
    form.className = 'swp-in';
    form.style.marginBottom = '10px';
    form.innerHTML = '<input class="swp-ami" placeholder="0x… address of a friend">' +
                     '<button type="button">Add</button>';
    form.querySelector('button').addEventListener('click', function () {
      var a = (form.querySelector('.swp-ami').value || '').trim();
      if (!a) return;
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'friendAdd', address: a }));
      form.querySelector('.swp-ami').value = '';
    });
    l.appendChild(form);
    if (!AMIS.length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.innerHTML = 'No friends yet.<br>Add someone by address and send them $SWOGE in one tap.';
      l.appendChild(v);
      return;
    }
    AMIS.forEach(function (a) { l.appendChild(ligneAmi(a)); });
  }

  function profRend() {
    if (!profBoite) return;
    if (profOnglet === 'am') { profEnTete(); return rendAmis(); }
    var l = profBoite.querySelector('.swp-l');
    var sous = profBoite.querySelector('.swp-sub');
    if (profResume) {
      sous.textContent = nb(profResume.lignes, 0) + ' event' + (profResume.lignes === 1 ? '' : 's') +
        (profResume.depuis ? ' since ' + new Date(profResume.depuis).toLocaleDateString('en-US',
          { day: '2-digit', month: 'short', year: 'numeric' }) : '');
    }
    l.innerHTML = '';
    if (!profItems.length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.innerHTML = profCharge ? 'Loading…'
        : (etat.socket && etat.socket.readyState === 1
            ? 'Nothing here yet.<br>Everything you play is kept — for good.'
            : 'Sign in to see your history.');
      l.appendChild(v);
      return;
    }
    /* Regroupe par MOIS. Les evenements arrivent du plus recent au plus
       ancien, donc il suffit de poser un bandeau quand le mois change : rien
       a trier, rien a recompter, et ca marche aussi bien sur une page que sur
       dix. Chaque mois se replie — un joueur qui cherche aout n'a pas a
       derouler septembre. */
    var moisCourant = null, corps = null;
    profItems.forEach(function (e) {
      var d = new Date(Number(e.t) || 0);
      var cle = d.getFullYear() + '-' + d.getMonth();
      if (cle !== moisCourant) {
        moisCourant = cle;
        var titre = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        var n = profItems.filter(function (x) {
          var y = new Date(Number(x.t) || 0);
          return y.getFullYear() + '-' + y.getMonth() === cle;
        }).length;
        var tete = document.createElement('button');
        tete.className = 'swp-mo'; tete.type = 'button';
        tete.innerHTML = '<span class="ch">▾</span>' + titre +
                         '<i>' + n + ' event' + (n === 1 ? '' : 's') + '</i>';
        corps = document.createElement('div');
        (function (t2, c2) {
          t2.addEventListener('click', function () {
            var ferme = c2.style.display === 'none';
            c2.style.display = ferme ? '' : 'none';
            t2.querySelector('.ch').textContent = ferme ? '▾' : '▸';
          });
        })(tete, corps);
        /* Le mois en cours est ouvert, les precedents replies : on arrive sur
           ce qu'on vient de faire, pas sur six mois a derouler. */
        if (l.querySelector('.swp-mo')) {
          corps.style.display = 'none';
          tete.querySelector('.ch').textContent = '▸';
        }
        l.appendChild(tete); l.appendChild(corps);
      }
      corps.appendChild(ligne(e));
    });
    if (profEncore) {
      var b = document.createElement('button');
      b.className = 'swp-more'; b.type = 'button';
      b.textContent = profCharge ? 'Loading…' : 'Load older';
      b.disabled = profCharge;
      b.addEventListener('click', function () { b.disabled = true; b.textContent = 'Loading…'; profDemande(); });
      l.appendChild(b);
    }
  }

  // Dix fois par seconde : le dernier chiffre coule sans que ca coute rien.
  /* On tente la connexion autonome apres le chargement : la barre doit exister
     pour y poser la pastille. */
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', connecteSeul);
  else connecteSeul();

  setInterval(rend, 100);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { rend(); });
  else rend();
})();
