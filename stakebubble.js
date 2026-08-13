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
    dernierRecu = Date.now();
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
      if (m.pending !== undefined) EN_ATTENTE = m.pending;
      if (m.unread !== undefined) NON_LUS = m.unread;
      if (m.stats) STATS = m.stats;
      pastilleAmis();
      profEnTete(); if (profOnglet === 'am' || profOnglet === 'in') profRend();
    }
    if (m.type === 'unread') { NON_LUS = m.unread || 0; pastilleAmis(); }
    if (m.type === 'referral' || m.type === 'referralClaimed') {
      PARRAIN = m;
      if (m.type === 'referralClaimed') { toast('✅ Claimed ' + nb(m.montant) + ' $SWOGE from your invites', 'ok'); rafraichitSolde(); }
      if (m.nouveau) toast('🎉 ' + m.nouveau + ' joined with your invite link', 'ok');
      /* Le lien accroche : on efface le code garde de cote, sinon on
         retenterait a chaque page pour rien. */
      if (m.parrain) { try { localStorage.removeItem('swogeRef'); } catch (e) {} }
      if (profOnglet === 'in') profRend();
    }
    if (m.type === 'leaderboard') { CLASSEMENT = m; if (profOnglet === 'lb') profRend(); }
    if (m.type === 'friends') {
      AMIS = m.friends || { amis: [], recues: [], envoyees: [] };
      EN_ATTENTE = m.pending || 0;
      pastilleAmis();
      if (m.nouvelle) toastAmi(m.nouvelle + ' wants to be your friend');
      if (profOnglet === 'am') profRend();
    }
    if (m.type === 'friendSearch') { RECHERCHE = m.results || []; if (profOnglet === 'am') rendRecherche(); }
    if (m.type === 'transferSent' || m.type === 'transferGot') {
      /* Un envoi d'argent sans accuse de reception, c'est une inquietude : le
         joueur ne sait pas si c'est parti, et il recommence. On le dit donc
         tout de suite, avec le MONTANT et le DESTINATAIRE — les deux choses
         qu'il veut relire — puis on redemande le solde, parce que la page
         possede son propre affichage et ne lit pas ce message-ci. */
      if (m.type === 'transferSent')
        toast('✅ Sent ' + nb(m.montant) + ' $SWOGE to ' +
              (m.nomDest || court(m.vers)), 'ok');
      else {
        toast('💰 ' + (m.fromName || court(m.from)) + ' sent you ' + nb(m.amount) + ' $SWOGE', 'ok');
        if (m.unread !== undefined) NON_LUS = m.unread;
        else NON_LUS++;
        pastilleAmis();
      }
      rafraichitSolde();
      /* Un virement change le solde ET l'historique : on redemande la page
         courante plutot que de deviner ou inserer la ligne. */
      if (profOuvert) profVa(profOnglet);
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send('{"type":"profile"}');
    }
    if (m.type === 'auth') { etat.socket = ev.target; profBtnVisible(true); accrocheParrain(); }
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

  /* ------------------------------------------------ le solde qui ne suit pas
   *
   * « Parfois il faut recharger la page pour que le solde se mette a jour. »
   * Deux causes, et il faut les deux reponses :
   *
   *  1. le depot arrive quand l'onglet est en arriere-plan, ou juste apres un
   *     changement de page : le message est parti vers une socket qui n'est
   *     plus celle qu'on regarde. On redemande donc le solde au retour de
   *     l'onglet — le serveur repond `balance`, que CHAQUE page sait deja
   *     lire, donc rien a changer dans les onze pages ;
   *
   *  2. la socket est morte sans le dire. Le navigateur la croit ouverte, la
   *     page n'essaie donc jamais de se reconnecter, et plus rien n'arrive :
   *     ni depot, ni gain, ni solde. Recharger « repare », d'ou la plainte.
   *     On surveille l'arrivee des messages : au-dela d'une minute de silence
   *     alors qu'on vient de parler, on FERME — la page se reconnecte toute
   *     seule et l'authentification rapporte le solde a jour.
   */
  var dernierRecu = 0, dernierAppel = 0;
  function rafraichitSolde() {
    try {
      if (etat.socket && etat.socket.readyState === 1) {
        dernierAppel = Date.now();
        etat.socket.send('{"type":"balance"}');
      }
    } catch (e) {}
  }
  function veilleSolde() {
    if (!etat.socket || etat.socket.readyState !== 1) return;
    /* Onglet en arriere-plan : on ne parle pas, et surtout on ne coupe rien —
       une partie de Crash ou de Connect 4 continue derriere. Le controle
       reprend au retour de l'onglet. */
    if (document.visibilityState === 'hidden') return;
    var t = Date.now();
    if (dernierAppel && t - dernierRecu > 60000 && t - dernierAppel > 20000) {
      try { etat.socket.close(); } catch (e) {}   // la page se reconnecte seule
      etat.socket = null;
      return;
    }
    rafraichitSolde();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') rafraichitSolde();
  });
  window.addEventListener('focus', rafraichitSolde);
  window.addEventListener('online', rafraichitSolde);
  setInterval(veilleSolde, 20000);

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
               three:'Three Card', p4:'Connect 4', pusher:'Coin Pusher',
               mp:'Tic-Tac-Toe', dm:'Checkers' };
  var ONGLETS = [['r','Rounds'],['dep','Deposits'],['wd','Withdrawals'],
                 ['st','Staking'],['tr','Transfers'],['am','Friends'],['in','Invite'],
                 ['lb','Ranking']];
  var VISAGES = [], MOI = { name: null, visage: null, address: null };
  var AMIS = { amis: [], recues: [], envoyees: [] }, EN_ATTENTE = 0, RECHERCHE = [];
  var NON_LUS = 0, PARRAIN = null, STATS = null, CLASSEMENT = null;
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
      /* Quand il a une medaille ou une photo, le bouton EST son visage. */
      '.swpb.img{background-size:cover;background-position:center;background-repeat:no-repeat;' +
      'background-color:rgba(10,6,2,.9);}' +
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
      '.swp-t{display:grid;gap:6px;padding:10px 13px 0;' +
      'grid-template-columns:repeat(auto-fit,minmax(106px,1fr));}' +
      '.swp-t button{padding:8px 6px;border-radius:9px 9px 0 0;cursor:pointer;' +
      'min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
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
      /* L adresse en entier : c est elle qu on relit avant d envoyer. */
      '.swp-r .w span.ad{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:9.5px;letter-spacing:.15px;color:#7E92B6;word-break:break-all;cursor:pointer;}' +
      '.swp-r .w span.ad:hover{color:#FFC53D;}' +
      '.swp-r .w span.su{color:#8DA0C4;font-size:10.5px;}' +
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
      '.swp-t{grid-template-columns:repeat(auto-fit,minmax(88px,1fr));}' +
      '.swp-t button{font-size:11px;letter-spacing:.2px;padding:8px 4px;}' +
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
      /* Les medailles sont dessinees : plus grandes que les frimousses, et
         posees en tete de liste, ce sont elles qu on choisit. */
      '.swp-avs button.bg{width:46px;height:46px;background-size:contain;' +
      'background-repeat:no-repeat;background-position:center;background-color:transparent;' +
      'border-color:rgba(255,255,255,.10);}' +
      '.swp-avs button.bg.on{background-color:rgba(255,197,61,.20);border-color:#FFC53D;' +
      'box-shadow:0 0 0 2px rgba(255,197,61,.35);}' +
      '.swp-in{display:flex;gap:7px;flex-wrap:wrap;}' +
      '.swp-in input{flex:1 1 150px;min-width:0;padding:9px 11px;border-radius:9px;' +
      'font-family:inherit;font-size:13px;color:#EAF2FF;background:rgba(0,0,0,.4);' +
      'border:1px solid rgba(255,255,255,.16);}' +
      '.swp-in button{flex:0 0 auto;padding:9px 14px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12.5px;font-weight:800;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);border:0;}' +
      '.swpn{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;' +
      'border-radius:999px;display:flex;align-items:center;justify-content:center;' +
      'font-size:10px;font-weight:900;color:#07101F;background:#16D97F;' +
      'box-shadow:0 0 0 2px rgba(7,16,31,.9);}' +
      '.swtoast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);z-index:100000;' +
      'padding:11px 16px;border-radius:999px;font-family:inherit;font-size:13px;font-weight:700;' +
      'color:#07101F;background:linear-gradient(180deg,#8CFFC0,#16D97F);opacity:0;' +
      'transition:opacity .25s,transform .25s;box-shadow:0 8px 24px rgba(0,0,0,.5);}' +
      '.swtoast.go{opacity:1;transform:translate(-50%,0);}' +
      '.swp-res:not(:empty){margin-bottom:9px;padding-bottom:7px;' +
      'border-bottom:1px solid rgba(255,255,255,.09);}' +
      '.swp-up{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px;}' +
      '.swp-up button{flex:1 1 auto;padding:9px 12px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#EAF2FF;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);}' +
      '.swp-up button:hover{border-color:#FFC53D;}' +
      '.swp-up .swp-drop{flex:0 0 auto;}' +
      /* Le parrainage et les chiffres. Une grille qui se replie toute seule :
         deux colonnes sur telephone, quatre sur un ecran large. */
      '.swp-ex{font-size:11.5px;line-height:1.6;color:#A9BBD8;margin-bottom:9px;' +
      'padding:9px 11px;border-radius:10px;background:rgba(255,197,61,.07);' +
      'border:1px solid rgba(255,197,61,.20);}' +
      '.swp-ex b{color:#FFD97A;}' +
      '.swp-lien{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;}' +
      '.swp-st{margin-bottom:10px;padding:10px 11px;border-radius:12px;' +
      'background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);}' +
      '.swp-st-h{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;' +
      'color:#8DA0C4;margin-bottom:9px;}' +
      '.swp-st-g{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));}' +
      '.swp-st-g>div{min-width:0;}' +
      '.swp-st-g span{display:block;font-size:10px;color:#8DA0C4;margin-bottom:2px;}' +
      '.swp-st-g b{display:block;font-size:13.5px;font-weight:800;color:#EAF2FF;' +
      'font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;}' +
      '.swp-st-g b.g{color:#7CFF9B;} .swp-st-g b.p{color:#F2685E;}' +
      '.swp-st-f{margin-top:9px;padding-top:8px;font-size:10.5px;color:#8DA0C4;' +
      'border-top:1px solid rgba(255,255,255,.07);}' +
      '.swp-r .rg{flex:0 0 auto;min-width:30px;font-size:12px;font-weight:800;color:#C9A24A;' +
      'text-align:center;font-variant-numeric:tabular-nums;}' +
      '.swp-r.moi{border-color:rgba(255,197,61,.55);background:rgba(255,197,61,.09);}' +
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

  /* ---------------------------------------------------------- parrainage
   *
   * Le code arrive dans l'adresse — swoleeswoge.dog/?ref=LeCostaud — et le
   * joueur n'est pas encore connecte a ce moment-la : on le met de cote, et
   * on l'accroche a la premiere authentification, quelle que soit la page ou
   * elle a lieu. Il n'y a donc rien a modifier dans les douze pages.
   */
  (function ramasseCode() {
    try {
      var c = new URLSearchParams(location.search).get('ref');
      if (c && String(c).trim()) localStorage.setItem('swogeRef', String(c).trim().slice(0, 32));
    } catch (e) {}
  })();
  function accrocheParrain() {
    if (!etat.socket || etat.socket.readyState !== 1) return;
    var c = null;
    try { c = localStorage.getItem('swogeRef'); } catch (e) {}
    try { etat.socket.send(JSON.stringify(c ? { type: 'referral', bind: c } : { type: 'referral' })); }
    catch (e) {}
  }
  function lienInvitation() {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base + '?ref=' + encodeURIComponent((PARRAIN && PARRAIN.code) || '');
  }
  function rendInvite() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    if (!PARRAIN) {
      var att = document.createElement('div');
      att.className = 'swp-v'; att.textContent = 'Loading…';
      l.appendChild(att);
      if (etat.socket && etat.socket.readyState === 1) etat.socket.send('{"type":"referral"}');
      return;
    }
    var P = PARRAIN;

    // ---- ce que ca rapporte, dit en une phrase
    var expl = document.createElement('div');
    expl.className = 'swp-ex';
    expl.innerHTML = 'Invite your friends and earn <b>' + P.part + '%</b> of what they lose to the ' +
      'house — for life. In 1v1 games you earn on the rake instead. They get <b>' +
      nb(P.bienvenue, 0) + ' $SWOGE</b> on their first deposit.';
    l.appendChild(expl);

    // ---- le lien, et le bouton qui le copie
    var boite = document.createElement('div');
    boite.className = 'swp-in';
    boite.innerHTML = '<input class="swp-lien" readonly><button type="button">Copy</button>';
    var champ = boite.querySelector('.swp-lien');
    champ.value = lienInvitation();
    champ.addEventListener('focus', function () { champ.select(); });
    boite.querySelector('button').addEventListener('click', function () {
      var b = boite.querySelector('button');
      champ.select();
      try { navigator.clipboard.writeText(champ.value); } catch (e) { try { document.execCommand('copy'); } catch (e2) {} }
      b.textContent = 'Copied ✓';
      setTimeout(function () { b.textContent = 'Copy'; }, 1400);
    });
    l.appendChild(boite);

    // ---- ce qui est du, et le bouton qui l encaisse
    var du = parseFloat(P.du || 0);
    var gains = document.createElement('div');
    gains.className = 'swp-r';
    gains.innerHTML = '<div class="w"><b>' + nb(du) + ' $SWOGE</b>' +
                      '<span class="su">ready to claim · ' + nb(P.total) + ' earned in total</span></div>';
    var bt = document.createElement('button');
    bt.className = 'mini'; bt.type = 'button'; bt.textContent = 'Claim';
    bt.disabled = !(du > 0);
    bt.addEventListener('click', function () {
      if (etat.socket && etat.socket.readyState === 1) etat.socket.send('{"type":"referralClaim"}');
    });
    gains.appendChild(bt);
    l.appendChild(gains);

    // ---- qui on a fait venir
    var t = document.createElement('div');
    t.className = 'swp-mo'; t.style.cursor = 'default';
    t.innerHTML = 'Friends you brought in<i>' + P.filleuls.length + '</i>';
    l.appendChild(t);
    if (!P.filleuls.length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.innerHTML = 'Nobody yet.<br>Share your link — you earn on every round they play, for good.';
      l.appendChild(v);
    } else P.filleuls.forEach(function (f) {
      var d = document.createElement('div');
      d.className = 'swp-r';
      d.innerHTML = corpsAmi(f, f.depose ? '' : 'has not deposited yet — you earn nothing until then') +
        '<div class="v"><b class="g">' + nb(f.rapporte) + '</b><span>earned</span></div>';
      peintVisage(d.querySelector('.av'), f);
      copiable(d);
      l.appendChild(d);
    });

    if (P.parrain) {
      var q = document.createElement('div');
      q.className = 'swp-ex';
      q.style.marginTop = '10px';
      q.textContent = 'You were invited by ' + (P.parrain.name || court(P.parrain.address)) + '.';
      l.appendChild(q);
    }
  }

  /* -------------------------------------------------------- le classement
   *
   * Au VOLUME MISE du mois, et pas au gain : classer sur les gains, c'est
   * classer sur la chance — le meme joueur y monte et descend sans rien
   * changer a sa facon de jouer. Le volume ne depend que de ce qu'on a fait.
   */
  function ligneRang(r, moi) {
    var d = document.createElement('div');
    d.className = 'swp-r' + (moi ? ' moi' : '');
    var med = r.rang === 1 ? '🥇' : r.rang === 2 ? '🥈' : r.rang === 3 ? '🥉' : '#' + r.rang;
    d.innerHTML = '<span class="rg">' + med + '</span><div class="av"></div>' +
      '<div class="w"><b>' + ech(r.name || court(r.address)) + (moi ? ' — you' : '') + '</b></div>' +
      '<div class="v"><b>' + nb(r.mise, 0) + '</b><span>$SWOGE played</span></div>';
    peintVisage(d.querySelector('.av'), r);
    return d;
  }
  function rendClassement() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    if (!CLASSEMENT) {
      var a = document.createElement('div');
      a.className = 'swp-v'; a.textContent = 'Loading…';
      l.appendChild(a);
      if (etat.socket && etat.socket.readyState === 1) etat.socket.send('{"type":"leaderboard"}');
      return;
    }
    var C = CLASSEMENT;
    var mois = C.mois ? new Date(C.mois + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
    var t = document.createElement('div');
    t.className = 'swp-mo'; t.style.cursor = 'default';
    t.innerHTML = mois + '<i>' + nb(C.joueurs, 0) + ' player' + (C.joueurs === 1 ? '' : 's') + '</i>';
    l.appendChild(t);

    var e = document.createElement('div');
    e.className = 'swp-ex';
    e.innerHTML = 'Ranked on <b>volume played this month</b>, not on winnings — luck moves winnings, ' +
                  'volume is what you actually did. It resets when the month does.';
    l.appendChild(e);

    if (!C.top.length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.innerHTML = 'Nobody has played yet this month.<br>Play one round and you are first.';
      l.appendChild(v);
      return;
    }
    var moi = MOI && MOI.address ? String(MOI.address).toLowerCase() : null;
    C.top.forEach(function (r) { l.appendChild(ligneRang(r, moi && r.address === moi)); });

    /* Celui qui n'est pas dans les cinquante premiers doit quand meme se
       trouver : un classement ou l'on ne se voit pas ne sert a personne. */
    if (C.moi && C.moi.rang > C.top.length) {
      var s2 = document.createElement('div');
      s2.className = 'swp-mo'; s2.style.cursor = 'default';
      s2.innerHTML = 'Your place<i>of ' + nb(C.joueurs, 0) + '</i>';
      l.appendChild(s2);
      l.appendChild(ligneRang(C.moi, true));
    } else if (!C.moi) {
      var r0 = document.createElement('div');
      r0.className = 'swp-v';
      r0.innerHTML = 'You have not played yet this month.';
      l.appendChild(r0);
    }
  }

  /* ------------------------------------------------------ les statistiques
   * Tout vient de ce qui est deja compte ailleurs. Une statistique avec sa
   * propre source finirait par contredire l'historique affiche juste en
   * dessous — et c'est l'historique qu'on croit. */
  function blocStats() {
    if (!STATS) return null;
    var s = STATS;
    var cases = [
      ['Total wagered', nb(s.mise, 0) + ' $SWOGE'],
      ['Rounds played', nb(s.manches, 0)],
      ['All-time result', (s.net >= 0 ? '+' : '') + nb(s.net, 0) + ' $SWOGE', s.net >= 0 ? 'g' : 'p'],
      ['Biggest win', s.record ? '+' + nb(s.record.g, 0) + ' $SWOGE' : '—',
        s.record ? 'g' : ''],
      ['Best multiplier', s.record && s.record.x ? s.record.x + '×' : '—'],
      ['Best day', s.meilleurJour ? '+' + nb(s.meilleurJour.net, 0) : '—', s.meilleurJour ? 'g' : ''],
      ['Staking claimed', nb(s.stakeReclame, 0)],
      ['Friends invited', nb(s.filleuls, 0) + (Number(s.parrainGagne) > 0 ? ' · ' + nb(s.parrainGagne, 0) + ' earned' : '')],
    ];
    var box = document.createElement('div');
    box.className = 'swp-st';
    var haut = document.createElement('div');
    haut.className = 'swp-st-h';
    haut.textContent = s.depuis
      ? 'Member since ' + new Date(s.depuis).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Your numbers';
    box.appendChild(haut);
    var g = document.createElement('div');
    g.className = 'swp-st-g';
    cases.forEach(function (c) {
      var d = document.createElement('div');
      d.innerHTML = '<span>' + c[0] + '</span><b class="' + (c[2] || '') + '">' + ech(c[1]) + '</b>';
      g.appendChild(d);
    });
    box.appendChild(g);
    if (s.favoris && s.favoris.length) {
      var f = document.createElement('div');
      f.className = 'swp-st-f';
      f.textContent = 'Most played: ' + s.favoris.map(function (x) {
        return (JEUX[x.jeu] || x.jeu) + ' (' + nb(x.n, 0) + ')';
      }).join(' · ');
      box.appendChild(f);
    }
    return box;
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
    /* Ouvrir l'onglet des envois, c'est les avoir vus : la pastille tombe. */
    if (k === 'in' && etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"referral"}'); } catch (e) {}
    }
    if (k === 'lb' && etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"leaderboard"}'); } catch (e) {}
    }
    if (k === 'tr' && NON_LUS && etat.socket && etat.socket.readyState === 1) {
      NON_LUS = 0; pastilleAmis();
      try { etat.socket.send('{"type":"seenTransfers"}'); } catch (e) {}
    }
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
  /* Une frimousse, une medaille peinte ou une photo. Le serveur ne connait
     que le CODE de la medaille (« b3 ») ; l'image vit ici, avec le reste du
     site — on peut la redessiner sans toucher au serveur. */
  function estBadge(v) { return /^b[0-9]{1,2}$/.test(String(v || '')); }
  function urlBadge(v) { return 'media/badge-' + String(v).slice(1) + '.webp'; }
  function peintVisage(el, p) {
    if (p && p.photo) {
      el.style.backgroundImage = 'url("' + urlPhoto(p.address) + '")';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else if (p && estBadge(p.visage)) {
      el.style.backgroundImage = 'url("' + urlBadge(p.visage) + '")';
      el.style.backgroundSize = 'contain';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = (p && p.visage) || '👤';
    }
  }

  /* Le bouton de la barre porte SA medaille ou SA photo, pas une silhouette.
     C'est la seule chose de lui qu'il voit sur chaque page, et c'est ce qui
     donne envie d'en choisir une. */
  function peintBouton() {
    if (!profBtn) return;
    var pastille = profBtn.querySelector('.swpn');
    if (MOI && (MOI.photo || estBadge(MOI.visage))) {
      profBtn.textContent = '';
      profBtn.classList.add('img');
      profBtn.style.backgroundImage = 'url("' +
        (MOI.photo ? urlPhoto(MOI.address) : urlBadge(MOI.visage)) + '")';
    } else {
      profBtn.classList.remove('img');
      profBtn.style.backgroundImage = '';
      profBtn.textContent = (MOI && MOI.visage) || '👤';
    }
    if (pastille) profBtn.appendChild(pastille);
  }
  function profEnTete() {
    if (!profBoite) return;
    peintBouton();
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
      b.type = 'button';
      if (estBadge(v)) {
        b.className = 'bg';
        b.style.backgroundImage = 'url("' + urlBadge(v) + '")';
        b.title = 'Badge ' + String(v).slice(1);
      } else b.textContent = v;
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
  /* Un ami, c'est un NOM et un PORTEFEUILLE. Le nom, chacun le choisit et
     peut le changer ; l'adresse, non — c'est elle qu'on relit avant
     d'envoyer de l'argent, et deux joueurs peuvent tres bien se ressembler
     de nom. Elle est donc ecrite EN ENTIER, et un clic la copie. */
  function corpsAmi(a, suffixe) {
    return '<div class="av"></div><div class="w"><b>' + ech(a.name || court(a.address)) + '</b>' +
      '<span class="ad" title="Click to copy">' + ech(a.address || '') + '</span>' +
      (suffixe ? '<span class="su">' + ech(suffixe) + '</span>' : '') + '</div>';
  }
  function copiable(d) {
    var s = d.querySelector('.ad');
    if (!s) return d;
    s.addEventListener('click', function (e) {
      e.stopPropagation();
      var v = s.textContent;
      try { navigator.clipboard.writeText(v); } catch (err) {}
      s.textContent = 'copied ✓';
      setTimeout(function () { s.textContent = v; }, 1100);
    });
    return d;
  }
  function ligneAmi(a) {
    var d = document.createElement('div');
    d.className = 'swp-r';
    d.innerHTML = corpsAmi(a, a.connu ? '' : 'never played here');
    peintVisage(d.querySelector('.av'), a);
    copiable(d);
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
  /* La pastille « +1 » sur le bouton du profil. Une demande qui n'a pas de
     marque visible n'existe pas : le joueur n'ouvre pas un panneau pour
     verifier s'il s'y est passe quelque chose. */
  function pastilleAmis() {
    if (!profBtn) return;
    var p = profBtn.querySelector('.swpn');
    var total = (EN_ATTENTE || 0) + (NON_LUS || 0);
    if (!total) { if (p) p.remove(); profBtn.title = 'Your profile'; return; }
    if (!p) {
      p = document.createElement('span');
      p.className = 'swpn';
      profBtn.style.position = 'relative';
      profBtn.appendChild(p);
    }
    p.textContent = total > 9 ? '9+' : String(total);
    var t = [];
    if (EN_ATTENTE) t.push(EN_ATTENTE + ' friend request' + (EN_ATTENTE === 1 ? '' : 's') + ' waiting');
    if (NON_LUS) t.push(NON_LUS + ' $SWOGE transfer' + (NON_LUS === 1 ? '' : 's') + ' received');
    profBtn.title = t.join(' · ');
  }
  function toast(t, cl) {
    var e = document.createElement('div');
    e.className = 'swtoast' + (cl ? ' ' + cl : '');
    e.textContent = t;
    /* Deux messages au meme endroit n'en font qu'un de lisible : on empile. */
    var deja = document.querySelectorAll('.swtoast').length;
    if (deja) e.style.bottom = (26 + deja * 48) + 'px';
    document.body.appendChild(e);
    setTimeout(function () { e.classList.add('go'); }, 30);
    setTimeout(function () { try { e.remove(); } catch (err) {} }, 5200);
  }
  function toastAmi(t) { toast('👋 ' + t); }

  // -------------------------------------------------- la recherche par nom
  var chercheT = null;
  function rendRecherche() {
    var box = profBoite && profBoite.querySelector('.swp-res');
    if (!box) return;
    box.innerHTML = '';
    if (!RECHERCHE.length) return;
    RECHERCHE.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'swp-r';
      d.innerHTML = corpsAmi(r, '');
      peintVisage(d.querySelector('.av'), r);
      copiable(d);
      var b = document.createElement('button');
      b.className = 'mini'; b.type = 'button'; b.textContent = 'Add';
      b.addEventListener('click', function () {
        if (etat.socket && etat.socket.readyState === 1)
          etat.socket.send(JSON.stringify({ type: 'friendRequest', address: r.address }));
        b.disabled = true; b.textContent = 'Sent';
      });
      d.appendChild(b);
      box.appendChild(d);
    });
  }

  function rendAmis() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';

    /* On cherche par NOM autant que par adresse : personne ne retient une
       adresse, et c'est justement pour ca que les joueurs se donnent des
       noms. La recherche part apres une petite pause de frappe — sinon on
       envoie une demande par lettre tapee. */
    var form = document.createElement('div');
    form.className = 'swp-in';
    form.style.marginBottom = '8px';
    form.innerHTML = '<input class="swp-ami" placeholder="Search a name, or paste a 0x… address">' +
                     '<button type="button">Add</button>';
    var champ = form.querySelector('.swp-ami');
    function envoie() {
      var a = (champ.value || '').trim();
      if (!a) return;
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'friendRequest', address: a }));
      champ.value = ''; RECHERCHE = []; rendRecherche();
    }
    form.querySelector('button').addEventListener('click', envoie);
    champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') envoie(); });
    champ.addEventListener('input', function () {
      clearTimeout(chercheT);
      var q = (champ.value || '').trim();
      if (q.length < 2 || /^0x/i.test(q)) { RECHERCHE = []; return rendRecherche(); }
      chercheT = setTimeout(function () {
        if (etat.socket && etat.socket.readyState === 1)
          etat.socket.send(JSON.stringify({ type: 'friendSearch', q: q }));
      }, 260);
    });
    l.appendChild(form);

    var res = document.createElement('div');
    res.className = 'swp-res';
    l.appendChild(res);
    rendRecherche();

    // les demandes RECUES en premier : c'est ce qui attend une reponse
    if ((AMIS.recues || []).length) {
      var t = document.createElement('div');
      t.className = 'swp-mo';
      t.style.cursor = 'default';
      t.innerHTML = 'Friend requests<i>' + AMIS.recues.length + ' waiting</i>';
      l.appendChild(t);
      AMIS.recues.forEach(function (a) { l.appendChild(ligneDemande(a)); });
    }

    if ((AMIS.amis || []).length) {
      var t2 = document.createElement('div');
      t2.className = 'swp-mo';
      t2.style.cursor = 'default';
      t2.innerHTML = 'Friends<i>' + AMIS.amis.length + '</i>';
      l.appendChild(t2);
      AMIS.amis.forEach(function (a) { l.appendChild(ligneAmi(a)); });
    }

    if ((AMIS.envoyees || []).length) {
      var t3 = document.createElement('div');
      t3.className = 'swp-mo';
      t3.style.cursor = 'default';
      t3.innerHTML = 'Sent, waiting for an answer<i>' + AMIS.envoyees.length + '</i>';
      l.appendChild(t3);
      AMIS.envoyees.forEach(function (a) {
        var d = document.createElement('div');
        d.className = 'swp-r';
        d.innerHTML = corpsAmi(a, 'waiting for an answer');
        peintVisage(d.querySelector('.av'), a);
        copiable(d);
        l.appendChild(d);
      });
    }

    if (!(AMIS.amis || []).length && !(AMIS.recues || []).length && !(AMIS.envoyees || []).length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.innerHTML = 'No friends yet.<br>Search a name above, send a request, and once they accept ' +
                    'you can send them $SWOGE in one tap.';
      l.appendChild(v);
    }
  }

  function ligneDemande(a) {
    var d = document.createElement('div');
    d.className = 'swp-r c4-invite';
    d.style.borderColor = 'rgba(22,217,127,.45)';
    d.innerHTML = corpsAmi(a, 'wants to be your friend');
    peintVisage(d.querySelector('.av'), a);
    copiable(d);
    var oui = document.createElement('button');
    oui.className = 'mini'; oui.type = 'button'; oui.textContent = 'Accept';
    oui.addEventListener('click', function () {
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'friendAccept', address: a.address }));
    });
    var non = document.createElement('button');
    non.className = 'mini gh'; non.type = 'button'; non.textContent = '✕';
    non.title = 'Decline';
    non.addEventListener('click', function () {
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'friendDecline', address: a.address }));
    });
    d.appendChild(oui); d.appendChild(non);
    return d;
  }

  function profRend() {
    if (!profBoite) return;
    if (profOnglet === 'am') { profEnTete(); return rendAmis(); }
    if (profOnglet === 'in') { profEnTete(); return rendInvite(); }
    if (profOnglet === 'lb') { profEnTete(); return rendClassement(); }
    var l = profBoite.querySelector('.swp-l');
    var sous = profBoite.querySelector('.swp-sub');
    if (profResume) {
      sous.textContent = nb(profResume.lignes, 0) + ' event' + (profResume.lignes === 1 ? '' : 's') +
        (profResume.depuis ? ' since ' + new Date(profResume.depuis).toLocaleDateString('en-US',
          { day: '2-digit', month: 'short', year: 'numeric' }) : '');
    }
    l.innerHTML = '';
    if (profOnglet === 'r') { var st = blocStats(); if (st) l.appendChild(st); }
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
