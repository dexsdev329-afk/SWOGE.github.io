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
  /* La socket du VISITEUR : elle ne s'identifie jamais et ne sert qu'a
     regarder. Tenue a l'ecart de `etat.socket`, qui est celle de l'argent. */
  var SOCKET_PUBLIC = null;
  var bulle = null, chiffre = null, occupe = false;
  var pastille = null, gens = null;
  var profBtn = null, profBoite = null, profOnglet = 'ap', profItems = [], profFin = null,
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
  /* Le visiteur qui n'a jamais rien branche.
   *
   * Sans jeton on ne peut rien AFFICHER de personnel — mais ce qui se joue
   * sur le site est public, et c'est justement a lui qu'il faut le montrer :
   * une page qui ne dit rien parait morte, et il repart. On ouvre donc une
   * socket qui ECOUTE sans jamais s'identifier. Elle est tenue a part de
   * `etat.socket` : celle-la sert a l'argent, et rien de ce qui touche a
   * l'argent ne doit pouvoir partir d'un socket anonyme.
   */
  function ecouteAnonyme() {
    if (SOCKET_PUBLIC && SOCKET_PUBLIC.readyState <= 1) return;
    var w;
    try { w = new window.WebSocket(adresseServeur()); } catch (e) { return; }
    SOCKET_PUBLIC = w;
    w.addEventListener('message', surMessage);
    w.addEventListener('close', function () {
      if (SOCKET_PUBLIC === w) SOCKET_PUBLIC = null;
      setTimeout(function () { if (!jetonRange()) ecouteAnonyme(); }, 5000);
    });
  }
  /* Le socket par lequel on parle des DUELS : celui du joueur s'il en a un,
     sinon celui du visiteur. Regarder ne demande pas de compte. */
  function sockDuel() {
    if (etat.socket && etat.socket.readyState === 1) return etat.socket;
    if (SOCKET_PUBLIC && SOCKET_PUBLIC.readyState === 1) return SOCKET_PUBLIC;
    return null;
  }

  function connecteSeul() {
    if (document.getElementById('bal')) return;      // la page a deja sa socket
    var jeton = jetonRange();
    if (!jeton) { poseConnexion(); return ecouteAnonyme(); }   // jamais connecte
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

  /* ===================== SE CONNECTER DEPUIS UNE PAGE SANS FORMULAIRE
   *
   * Le catalogue et l'accueil n'ont pas de socket a eux, donc pas de bouton de
   * connexion : on n'y voyait ni « Connect wallet » ni l'entree par e-mail. Un
   * joueur qui arrive par la — c'est la page d'entree du site — n'avait
   * AUCUNE facon de se connecter sans deviner qu'il faut d'abord ouvrir un
   * jeu. Le bouton est donc pose ici, une fois, pour toutes les pages qui n'en
   * ont pas.
   *
   * Il ne recopie pas le formulaire des pages de jeu : il fait le strict
   * necessaire — signer le nonce, echanger une session, la ranger — et
   * recharge. La page se retrouve alors dans l'etat d'un retour de joueur
   * connu, chemin deja parcouru mille fois.
   */
  var PRIVY_APP_ID = 'cmsga0yzp00a50biaf9vlzzd2';
  var conBoite = null;

  function styleConnexion() {
    if (document.getElementById('swcon-css')) return;
    var c = document.createElement('style');
    c.id = 'swcon-css';
    c.textContent =
      '.swcon{display:inline-flex;align-items:center;gap:6px;vertical-align:middle;' +
      'margin-left:8px;padding:7px 13px;border-radius:999px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#231a06;' +
      'border:0;background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swcon-ov{position:fixed;inset:0;z-index:9999;display:none;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(4,6,12,.72);}' +
      '.swcon-ov.on{display:flex;}' +
      '.swcon-b{width:min(360px,100%);border-radius:16px;padding:18px;' +
      'background:#0E1422;border:1px solid rgba(255,197,61,.28);color:#EAF2FF;' +
      'font-family:inherit;box-shadow:0 24px 60px rgba(0,0,0,.6);}' +
      '.swcon-b h4{margin:0 0 4px;font-size:15px;}' +
      '.swcon-b p{margin:0 0 14px;font-size:11.5px;line-height:1.5;color:#8DA0C4;}' +
      '.swcon-b button{width:100%;margin-top:8px;padding:11px;border-radius:11px;' +
      'cursor:pointer;font-family:inherit;font-size:13px;font-weight:800;border:0;}' +
      '.swcon-b .w{color:#231a06;background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swcon-b .e{color:#EAF2FF;background:rgba(255,255,255,.08);' +
      'border:1px solid rgba(255,255,255,.16);}' +
      '.swcon-b input{width:100%;margin-top:8px;padding:11px;border-radius:11px;' +
      'font-family:inherit;font-size:13px;color:#EAF2FF;background:rgba(0,0,0,.35);' +
      'border:1px solid rgba(255,255,255,.16);}' +
      '.swcon-b .m{margin-top:10px;font-size:11.5px;line-height:1.45;color:#F2C868;}' +
      '.swcon-b .x{margin-top:12px;background:transparent;color:#8DA0C4;font-weight:600;' +
      'font-size:11.5px;}';
    document.head.appendChild(c);
  }

  function poseConnexion() {
    if (document.querySelector('.swcon') || document.getElementById('bal')) return;
    var barre = document.querySelector('nav');
    if (!barre) return;
    styleConnexion();
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'swcon'; b.textContent = '🔑 Sign in';
    b.onclick = ouvreConnexion;
    barre.appendChild(b);
  }

  function dialogue() {
    if (conBoite) return conBoite;
    conBoite = document.createElement('div');
    conBoite.className = 'swcon-ov';
    conBoite.innerHTML =
      '<div class="swcon-b">' +
        '<h4>Sign in</h4>' +
        '<p>Your balance, your level and your friends follow you across every game.</p>' +
        '<button class="w" data-a="w">Connect wallet</button>' +
        '<button class="e" data-a="e">✉️ Continue with email</button>' +
        '<div class="mail" style="display:none">' +
          '<input class="em" type="email" inputmode="email" placeholder="you@example.com">' +
          '<button class="e" data-a="send">Send me a code</button>' +
          '<input class="cd" inputmode="numeric" placeholder="6-digit code" style="display:none">' +
          '<button class="e cdb" data-a="check" style="display:none">Sign in</button>' +
        '</div>' +
        '<div class="m"></div>' +
        '<button class="x" data-a="x">Cancel</button>' +
      '</div>';
    document.body.appendChild(conBoite);
    conBoite.addEventListener('click', function (e) {
      if (e.target === conBoite) return fermeConnexion();
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'x') return fermeConnexion();
      if (a === 'w') return parPortefeuille();
      if (a === 'e') { conBoite.querySelector('.mail').style.display = ''; conBoite.querySelector('.em').focus(); }
      if (a === 'send') return envoieCode();
      if (a === 'check') return verifieCode();
    });
    return conBoite;
  }
  function ouvreConnexion() { dialogue().classList.add('on'); }
  function fermeConnexion() { if (conBoite) conBoite.classList.remove('on'); }
  function conDit(t) { if (conBoite) conBoite.querySelector('.m').textContent = t; }

  /* Le nonce, la signature, la session. Le serveur n'a pas d'autre porte : la
     meme que celle des pages de jeu, exactement le meme message signe. */
  function ouvreSession(signe, adresse) {
    conDit('Opening your session…');
    var w;
    try { w = new window.WebSocket(adresseServeur()); } catch (e) { return conDit('Cannot reach the server.'); }
    var fait = false;
    w.addEventListener('message', function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'hello') {
        var texte = 'SWOGE Pusher login\nnonce: ' + m.loginNonce;
        signe(texte).then(function (sig) {
          w.send(JSON.stringify({ type: 'login', message: texte, signature: sig,
                                  name: String(adresse).slice(0, 6) }));
        }).catch(function (e) { conDit(String(e && e.message || e).slice(0, 90)); try { w.close(); } catch (x) {} });
      } else if (m.session) {
        fait = true;
        try { localStorage.setItem('swogeSession', m.session); } catch (e) {}
        try { localStorage.setItem('swogeAuth', signe.mode || 'wallet'); } catch (e) {}
        conDit('Signed in. Reloading…');
        setTimeout(function () { location.reload(); }, 400);
      } else if (m.type === 'error') { conDit(String(m.error).slice(0, 110)); }
    });
    w.addEventListener('close', function () { if (!fait) conDit('Connection closed before signing in.'); });
  }

  function parPortefeuille() {
    var eth = window.ethereum;
    if (!eth) return conDit('No wallet found in this browser — use the email option.');
    conDit('Check your wallet…');
    eth.request({ method: 'eth_requestAccounts' }).then(function (cs) {
      var a = cs && cs[0];
      if (!a) throw new Error('no account');
      var f = function (texte) {
        return eth.request({ method: 'personal_sign', params: [texte, a] });
      };
      f.mode = 'wallet';
      ouvreSession(f, a);
    }).catch(function (e) { conDit(String(e && e.message || e).slice(0, 100)); });
  }

  function chargePrivy() {
    if (window.SwogePrivy) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'privy-swoge.js';
      s.onload = function () { try { SwogePrivy.init(PRIVY_APP_ID); } catch (e) {} res(); };
      s.onerror = function () { rej(new Error('cannot load the email sign-in')); };
      document.head.appendChild(s);
    });
  }

  function envoieCode() {
    var e = (conBoite.querySelector('.em').value || '').trim();
    if (!/.+@.+\..+/.test(e)) return conDit('Enter a valid email address.');
    conDit('Sending a code…');
    chargePrivy().then(function () { return SwogePrivy.sendCode(e); }).then(function () {
      conBoite.querySelector('.cd').style.display = '';
      conBoite.querySelector('.cdb').style.display = '';
      conBoite.querySelector('.cd').focus();
      conDit('Code sent — check your inbox.');
    }).catch(function (x) { conDit(String(x && x.message || x).slice(0, 100)); });
  }

  function verifieCode() {
    var e = (conBoite.querySelector('.em').value || '').trim();
    var c = (conBoite.querySelector('.cd').value || '').trim();
    if (!c) return conDit('Enter the code you received.');
    conDit('Checking…');
    SwogePrivy.verifyCode(e, c).then(function (adresse) {
      var p = SwogePrivy.getProvider();
      var f = function (texte) { return p.request({ method: 'personal_sign', params: [texte, adresse] }); };
      f.mode = 'email';
      ouvreSession(f, adresse);
    }).catch(function (x) { conDit(String(x && x.message || x).slice(0, 100)); });
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
      if (m.prixNom) { PRIX_NOM = m.prixNom; posePrixNom(); }
      if (m.friends) AMIS = m.friends;
      if (m.pending !== undefined) EN_ATTENTE = m.pending;
      if (m.unread !== undefined) NON_LUS = m.unread;
      if (m.stats) { STATS = m.stats; noteFrais(); }
      if (m.niveau) NIVEAU = m.niveau;
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
    /* Les missions du jour arrivent avec les quetes, sur trois messages
       differents selon la page. On les garde ici, et on decore ensuite. */
    if (m.quests) { MISSIONS = m.quests; surveilleMissions(); }
    /* Le « hello » prouve que cette socket-la parle a notre serveur : sur une
       page de jeu ouverte par un visiteur, c'est la seule qu'on ait, et c'est
       par elle qu'il pourra regarder. */
    if (m.type === 'hello' && (!SOCKET_PUBLIC || SOCKET_PUBLIC.readyState > 1)) SOCKET_PUBLIC = ev.target;
    /* La liste des phrases vient du serveur : c'est lui qui les accepte, il
       n'y a donc qu'une seule liste et elle ne peut pas diverger. */
    if (m.type === 'hello' && m.phrases) { PHRASES = m.phrases; PHRASE_MAX = m.phraseMax || 0; poseBarre(); }
    if (m.type === 'auth' && m.address) { MON_ADRESSE = String(m.address).toLowerCase(); poseBarre(); }
    if (m.type === 'duelMatch' || m.type === 'p4Match') {
      /* Une nouvelle partie, c'est un nouveau quota : sans cette remise a
         zero, la revanche s'ouvrirait sur « no more this match ». */
      if (!MA_PARTIE || !m.match || MA_PARTIE.id !== m.match.id) PHRASE_RESTE = null;
      MA_PARTIE = m.match || null; poseBarre(); poseHudDuel(m.match);
    }
    if (m.type === 'duelDit') montrePhrase(m);
    if (m.type === 'duelMute') { MUET = !!m.on; poseBarre(); }
    if (m.type === 'duelSayLeft') { PHRASE_RESTE = m.reste; poseBarre(); }
    if (m.type === 'duelsTous') { DUELS = m.tables || []; EN_COURS = m.enCours || []; rendDuels(); }
    if (m.type === 'hello' && m.duels) { DUELS = m.duels; EN_COURS = m.duelsEnCours || []; rendDuels(); }
    if (m.type === 'duelWatch') { REGARDE = m.match || null; REGARDE_FINI = !!m.fini; rendRegarde(); }
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
    if (m.type === 'levelUp') {
      NIVEAU = m.profil;
      toast((m.nouveauPalier ? '🏆 ' : '⬆️ ') + 'Level ' + m.niveau +
            (m.nouveauPalier ? ' — welcome to ' + m.palier + '!' : ''), 'ok');
      peintBouton();
      if (profOuvert) profRend();
    }
    if (m.type === 'auth') {
      etat.socket = ev.target; profBtnVisible(true); accrocheParrain();
      if (m.niveau) { NIVEAU = m.niveau; peintBouton(); }
      duelsAutoRejoint();
    }
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
  /* ------------------------------------------- le frais de retrait, annonce
   *
   * Le frais ne tombe que sur l'argent qui n'a pas ete joue. Un joueur qui le
   * decouvre APRES avoir valide se sent pris ; annonce sous le champ, avec le
   * chiffre qui l'annule, il se comprend et se choisit.
   *
   * La note se pose sur la page quelle qu'elle soit : les douze fenetres de
   * retrait partagent le meme champ `#wdAmt`, il n'y a donc rien a modifier
   * dans chacune.
   */
  function noteFrais() {
    var champ = document.getElementById('wdAmt');
    if (!champ || !STATS || !STATS.frais) return;
    var f = STATS.frais;
    var note = document.getElementById('swfrais');
    if (!f.du) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement('div');
      note.id = 'swfrais';
      note.style.cssText = 'margin-top:7px;padding:8px 10px;border-radius:9px;font-size:11.5px;' +
        'line-height:1.5;color:#FFD97A;background:rgba(255,197,61,.08);' +
        'border:1px solid rgba(255,197,61,.28);';
      (champ.parentElement || champ).appendChild(note);
    }
    note.innerHTML = '🔥 <b>' + f.taux + '% of every withdrawal is burned</b> — it is not a fee ' +
      'the house keeps, it leaves circulation for good and makes every $SWOGE scarcer. ' +
      'Minimum withdrawal ' + nb(f.mini, 0) + ' $SWOGE.';
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
  /* Un duel n'a pas de match nul : la meme case « N » n'existe pas, et
     « Home / Away » ne veut rien dire quand les deux joueurs sont assis a la
     meme table. D'ou deux tables de libelles, choisies sur le NOMBRE
     d'issues du match. */
  var ISSUE = { '1': 'Home', 'N': 'Draw', '2': 'Away' };
  var ISSUE_2 = { '1': 'Player 1', '2': 'Player 2' };
  /* Le libelle depend du SPORT, pas du nombre d'issues : la NFL, la NBA et le
     cricket n'en ont que deux eux aussi, mais leurs deux cotes sont des
     EQUIPES. Seul le tennis oppose deux personnes. */
  var DUEL = { tennis: 1 };
  function nomIssue(sport, issues, choix) {
    var duel = DUEL[sport] && (issues || []).length === 2;
    return (duel ? ISSUE_2 : ISSUE)[choix] || choix;
  }
  /* Huit onglets sur une ligne, c'etait huit choses de meme rang — alors
     qu'un depot, un retrait, un transfert et une manche racontent tous la
     meme chose : ce qui s'est PASSE. Les amis et les invitations sont un
     autre sujet, le classement un troisieme. Trois familles a gauche, et le
     joueur sait ou chercher avant de lire les libelles. */
  var FAMILLES = [
    ['You', [['ap', 'Overview']]],
    /* « Withdraw » et « Staking » tout court ne peuvent plus rester : le
       tiroir porte aussi les entrees du menu de la page, ou les memes mots
       designent l'ACTION — retirer, miser au staking. Deux rangees du meme
       nom a six lignes d'ecart, l'une qui ouvre un formulaire et l'autre
       une liste, on en essaie une sur deux. Le pluriel et le mot
       « history » les separent, et la place est la depuis que le rail a
       laisse sa largeur a la liste. */
    ['History', [['r', 'Rounds'], ['dep', 'Deposits'], ['wd', 'Withdrawals'],
                 ['st', 'Staking history'], ['tr', 'Transfers']]],
    /* Un pari pose disparaissait de la vue des qu'on quittait SWOGE Bet : on
       ne savait plus ce qu'on avait en cours, ni depuis quand. Les deux
       onglets separent ce qui est ENCORE EN JEU de ce qui est solde — ce ne
       sont pas les memes questions, et les melanger noie la premiere. */
    ['Bets', [['bo', 'Open bets'], ['bs', 'Settled bets']]],
    ['People',  [['am', 'Friends'], ['in', 'Invite']]],
    ['Standing', [['lb', 'Ranking']]],
  ];
  var ONGLETS = FAMILLES.reduce(function (t, f) { return t.concat(f[1]); }, []);
  var VISAGES = [], MOI = { name: null, visage: null, address: null };
  var AMIS = { amis: [], recues: [], envoyees: [] }, EN_ATTENTE = 0, RECHERCHE = [];
  var NON_LUS = 0, PARRAIN = null, STATS = null, CLASSEMENT = null, NIVEAU = null;
  var PRIX_NOM = null;                    // { prix, du, brule, solde }
  /* Les dix paliers. La couleur fait tout le travail : « Diamond » se
     reconnait a l'oeil bien avant qu'on lise « niveau 47 ». */
  var PALIERS = { Bronze:'#C08457', Silver:'#C8D2DE', Gold:'#FFC53D', Platinum:'#9FE7F5',
                  Diamond:'#5BE3D8', Master:'#B48CFF', Champion:'#5BE38A',
                  Legend:'#FF9A3D', Mythic:'#E36BFF', SWOLE:'#FFE08A' };
  function couleurPalier(p) { return PALIERS[p] || '#8DA0C4'; }
  /* La pastille de niveau, telle qu'elle apparait partout : a cote d'un nom,
     dans une liste d'amis, au vestibule d'un duel. */
  function pastilleNiveau(p) {
    if (!p || !p.niveau) return '';
    return '<span class="swlv" style="color:' + couleurPalier(p.palier) + ';border-color:' +
           couleurPalier(p.palier) + '55">' + p.niveau + '</span>';
  }
  /* ============== LE VISAGE ET LE NIVEAU, PENDANT LA PARTIE ==============
   *
   * La table ne montrait que deux noms. On jouait donc contre une chaine de
   * caracteres — alors que la photo et le niveau existent, sont deja publics,
   * et s'affichent partout ailleurs : au vestibule, chez les amis, au
   * classement, sur la page publique. Les cacher au seul endroit ou l'on est
   * reellement face a quelqu'un etait le pire endroit possible.
   *
   * Comme la barre de phrases, c'est pose ICI : les trois pages de duel ont
   * le meme squelette (`c4J1`, `c4J2`), et la page ne reecrit que le TEXTE du
   * nom — ce qu'on ajoute a cote survit donc a ses redessins.
   */
  function poseHudDuel(match) {
    var hote1 = document.getElementById('c4J1');
    if (!hote1) return;                       // on n'est pas sur une page de duel
    var profils = (match && match.profils) || [];
    for (var i = 0; i < 2; i++) {
      var hote = document.getElementById(i === 0 ? 'c4J1' : 'c4J2');
      if (!hote) continue;
      var p = profils[i];
      var av = hote.querySelector('.swhav');
      /* Personne en face : pas de visage a montrer, et surtout pas celui
         d'avant — la table doit dire qu'elle attend. */
      if (!p) { if (av) av.remove(); var v0 = hote.querySelector('.swhlv'); if (v0) v0.remove(); continue; }

      /* Dans la RANGEE que la page a deja — `.nm` est un flex avec son pion et
         son nom. Poser le visage a cote plutot que par-dessus evite de se
         battre avec une mise en page qui marche. */
      var nm = hote.querySelector('.nm') || hote;
      if (!av) {
        av = document.createElement('span');
        av.className = 'swhav';
        nm.insertBefore(av, nm.firstChild);
      }
      var img = p.photo ? urlPhoto(p.address) : urlBadge(p.visage || 'b1');
      if (av.getAttribute('data-src') !== img) {
        av.setAttribute('data-src', img);
        av.style.backgroundImage = 'url("' + img + '")';
      }
      /* Le cadre du palier, par-dessus : c'est la meme regle qu'ailleurs, un
         cadre seulement a partir du niveau 1. */
      av.className = 'swhav' + (p.niveau > 0 ? ' swcad' : '');
      if (p.niveau > 0) av.style.setProperty('--cadre', 'url("' + urlCadre(p.palierNo) + '")');

      /* Le niveau va SOUS le nom, pas a cote. Sur un telephone, le bloc d'un
         joueur fait une centaine de pixels : visage, pastille et nom sur la
         meme ligne, et c'est le nom qui disparait — or le nom est ce qu'on
         est venu lire. La page reecrit le texte de `.sub` a chaque rendu, on
         pose donc la pastille dans le bloc lui-meme, qu'elle ne touche pas. */
      var lv = hote.querySelector('.swhlv');
      if (!lv) {
        lv = document.createElement('span');
        lv.className = 'swhlv';
        hote.appendChild(lv);
      }
      lv.textContent = 'LVL ' + p.niveau;
      lv.title = 'Level ' + p.niveau + ' · ' + p.palier;
      lv.style.color = couleurPalier(p.palier);
      lv.style.borderColor = couleurPalier(p.palier) + '66';
    }
  }
  function cssHudDuel() {
    if (document.getElementById('swhud-css')) return;
    var c = document.createElement('style');
    c.id = 'swhud-css';
    c.textContent =
      '.swhav{flex:0 0 auto;display:inline-block;width:26px;height:26px;border-radius:50%;' +
      'background-size:cover;background-position:center;vertical-align:middle;' +
      'background-color:rgba(255,255,255,.07);position:relative;}' +
      /* Le visage REMPLACE la pastille de couleur : elle disait qui etait
         rouge et qui etait bleu, le cadre de palier le dit mieux, et sur un
         telephone les deux ensemble ne laissaient plus de place au nom. La
         couleur revient en anneau, donc rien n'est perdu. */
      '.c4-joueur .nm .swhav ~ .pion{display:none;}' +
      '.c4-joueur.j1 .swhav{box-shadow:0 0 0 2px #FF4655;}' +
      '.c4-joueur.j2 .swhav{box-shadow:0 0 0 2px #2E7BFF;}' +
      '.swhav.swcad::after{content:"";position:absolute;left:-24%;top:-24%;width:148%;height:148%;' +
      'background:var(--cadre) center/contain no-repeat;pointer-events:none;}' +
      '.swhlv{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:999px;' +
      'font-family:inherit;font-size:9.5px;font-weight:900;letter-spacing:.5px;' +
      'border:1px solid;background:rgba(255,255,255,.05);white-space:nowrap;}' +
      /* On ne touche PAS a la disposition du bloc joueur : la page l'a deja
         reglee, et la refaire ici deplacait le X sur la meme ligne que le nom
         en recouvrant celui-ci. */
      /* Sur un telephone, le bloc d'un joueur fait une centaine de pixels. Le
         visage y prend la place du NOM, et le nom est ce qu'on est venu lire.
         On le ramene donc a la taille de la pastille qu'il remplace, et on
         retire le cadre — le palier reste lisible a la couleur de la
         pastille de niveau juste en dessous. Mesure : sans ca, « betaiikr »
         se coupait a « beta… ». */
      '@media (max-width:520px){' +
      '.swhav{width:18px;height:18px}' +
      '.swhav.swcad::after{display:none}' +
      '.c4-joueur .nm{gap:5px}' +
      '.swhlv{font-size:9px;padding:0 5px}}';
    document.head.appendChild(c);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', cssHudDuel);
  else cssHudDuel();

  /* ================= PARLER A LA TABLE, EN PHRASES TOUTES FAITES =========
   *
   * Douze phrases, pas une de plus, et aucune facon d'en ecrire une treizieme :
   * ce qui part d'ici est un identifiant, jamais un texte. Le texte libre
   * demanderait une equipe de moderation que le projet n'a pas — et il suffit
   * d'un message pour qu'une table devienne un endroit ou l'on ne revient pas.
   *
   * La barre se pose ICI, dans le module partage, parce que les trois pages de
   * duel ont exactement le meme squelette (`c4Jeu`, `c4J1`, `c4J2`) : une
   * implementation, trois jeux, et aucune chirurgie sur des pages qui marchent.
   */
  var PHRASES = [], PHRASE_MAX = 0, PHRASE_RESTE = null;
  var MON_ADRESSE = null, MA_PARTIE = null, MUET = false;

  function maPlace() {
    if (!MA_PARTIE || !MON_ADRESSE) return 0;
    var j = MA_PARTIE.joueurs || [];
    for (var i = 0; i < j.length; i++)
      if (j[i] && String(j[i]).toLowerCase() === MON_ADRESSE) return i + 1;
    return 0;
  }
  function dire(id) {
    var s = sockDuel();
    if (!s || !MA_PARTIE) return;
    try { s.send(JSON.stringify({ type: 'duelSay', id: MA_PARTIE.id, phrase: id })); } catch (e) {}
  }
  function basculeMuet() {
    var s = sockDuel();
    if (s) { try { s.send(JSON.stringify({ type: 'duelMute', on: !MUET })); } catch (e) {} }
  }

  /* La barre n'existe que pendant SA partie. Un spectateur entend la table,
     mais n'y parle pas : il n'a rien mise, et lui ouvrir la parole rouvrirait
     a tout le monde la surface qu'on vient de fermer. */
  function poseBarre() {
    var jeu = document.getElementById('c4Jeu');
    if (!jeu) return;
    var barre = document.getElementById('swdire');
    var actif = PHRASES.length && MA_PARTIE && MA_PARTIE.phase === 'en_cours' && maPlace() > 0;
    if (!actif) { if (barre) barre.remove(); return; }
    if (!barre) {
      barre = document.createElement('div');
      barre.id = 'swdire';
      barre.className = 'swdire';
      jeu.appendChild(barre);
    }
    var h = '';
    for (var i = 0; i < PHRASES.length; i++)
      h += '<button type="button" data-p="' + ech(PHRASES[i][0]) + '" title="' +
           ech(PHRASES[i][2]) + '">' + ech(PHRASES[i][1]) + '</button>';
    h += '<button type="button" class="mu" data-mute="1" title="' +
         (MUET ? 'Turn the table back on' : 'Mute the table') + '">' + (MUET ? '🔇' : '🔊') + '</button>';
    /* Le plafond qui approche se dit AVANT de tomber : un bouton qui cesse
       soudain de repondre se lit comme une panne. */
    if (PHRASE_RESTE !== null && PHRASE_RESTE <= 3)
      h += '<i class="rst">' + (PHRASE_RESTE > 0 ? PHRASE_RESTE + ' left' : 'no more this match') + '</i>';
    if (barre.innerHTML === h) return;          // rien n a change : on ne redessine pas
    barre.innerHTML = h;
    var b = barre.querySelectorAll('button');
    for (var k = 0; k < b.length; k++)
      b[k].addEventListener('click', (function (el) {
        return function () {
          if (el.getAttribute('data-mute')) return basculeMuet();
          dire(el.getAttribute('data-p'));
        };
      })(b[k]));
  }

  /* La phrase s'affiche AU-DESSUS de celui qui l'a dite, et disparait seule.
     Elle ne s'empile pas : la derniere remplace la precedente, sinon deux
     joueurs bavards couvriraient le plateau. */
  function montrePhrase(m) {
    var hote = document.getElementById(m.joueur === 2 ? 'c4J2' : 'c4J1');
    /* Quand on REGARDE, il n'y a pas de HUD de partie : la phrase se pose
       alors sur le plateau du spectateur. */
    if (!hote && REGARDE && REGARDE.id === m.match) hote = duelsPan && duelsPan.querySelector('.swdw .hd');
    if (!hote) return;
    var v = hote.querySelector('.swdit');
    if (v) v.remove();
    var d = document.createElement('span');
    d.className = 'swdit';
    d.innerHTML = '<b>' + ech(m.emote || '') + '</b> ' + ech(m.texte || '');
    hote.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.remove(); }, 4200);
  }

  function cssDire() {
    if (document.getElementById('swdire-css')) return;
    var c = document.createElement('style');
    c.id = 'swdire-css';
    c.textContent =
      '.swdire{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin:10px auto 0;' +
      'max-width:560px;}' +
      '.swdire button{width:36px;height:34px;border-radius:9px;cursor:pointer;font-size:16px;' +
      'line-height:1;padding:0;font-family:inherit;color:#EAF2FF;' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);}' +
      '.swdire button:hover{background:rgba(255,197,61,.16);border-color:rgba(255,197,61,.45);}' +
      '.swdire button:active{transform:translateY(1px);}' +
      '.swdire button.mu{margin-left:8px;font-size:14px;}' +
      '.swdire .rst{align-self:center;margin-left:8px;font-style:normal;font-size:10.5px;' +
      'font-weight:800;letter-spacing:.4px;color:#F2A65E;}' +
      /* La bulle : posee en absolu au-dessus du joueur, donc le bloc qui la
         porte doit devenir un repere — sans quoi elle irait se placer par
         rapport a la page entiere. */
      '#c4J1,#c4J2,.swdw .hd{position:relative;}' +
      '.swdit{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);' +
      'margin-bottom:7px;padding:6px 11px;border-radius:11px;white-space:nowrap;' +
      'font-family:inherit;font-size:12px;font-weight:700;color:#07101F;z-index:9;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);box-shadow:0 6px 18px rgba(0,0,0,.45);' +
      'animation:swditIn .18s ease-out;}' +
      '.swdit b{font-size:14px;}' +
      '@keyframes swditIn{from{opacity:0;transform:translateX(-50%) translateY(5px);}' +
      'to{opacity:1;transform:translateX(-50%) translateY(0);}}' +
      /* Chez le spectateur, le plateau est une boite a debordement masque :
         une bulle posee AU-DESSUS de son entete serait coupee net. Elle
         descend donc a l interieur, sur le plateau. */
      '.swdw .hd .swdit{bottom:auto;top:100%;margin:6px 0 0;max-width:92%;' +
      'white-space:normal;text-align:center;}' +
      '@media (max-width:520px){.swdire button{width:32px;height:31px;font-size:15px;}}';
    document.head.appendChild(c);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', cssDire);
  else cssDire();

  /* ====================== LES MISSIONS DU JOUR ======================
   *
   * Le serveur nomme un jeu et dit ou il se trouve. Encore faut-il pouvoir y
   * ALLER : une mission qui dit « misez sur Mines » sans emmener nulle part
   * demande au joueur de retrouver la page tout seul, et il ne le fait pas.
   *
   * Le lien se pose ICI plutot que dans les douze panneaux de quetes : ils
   * existent en trois versions differentes selon la page, et il n'y a aucune
   * raison d'ecrire trois fois la meme chose — ni de toucher a douze pages qui
   * marchent. On accroche la liste rendue par la page, quelle qu'elle soit.
   */
  var MISSIONS = [], missionsObs = null;
  function surveilleMissions() {
    var box = document.getElementById('questrows');
    if (!box) return;
    poseMissions();
    if (missionsObs) return;
    /* La page redessine sa liste a chaque message : on redecore apres elle,
       sans avoir a savoir quand elle le fait. */
    try {
      missionsObs = new MutationObserver(function () { poseMissions(); });
      missionsObs.observe(box, { childList: true });
    } catch (e) {}
  }
  function poseMissions() {
    var box = document.getElementById('questrows');
    if (!box || !MISSIONS.length) return;
    var ici = location.pathname.split('/').pop();
    var lignes = box.querySelectorAll('.quest');
    for (var i = 0; i < lignes.length; i++) {
      var ligne = lignes[i];
      if (ligne.querySelector('.swgo')) continue;
      /* On retrouve la mission par son intitule : c'est la seule chose que
         les trois versions du panneau ecrivent toutes de la meme facon. */
      var titre = ligne.querySelector('.qh span') || ligne.querySelector('.qh');
      var texte = titre ? titre.textContent.trim() : '';
      var q = null;
      for (var j = 0; j < MISSIONS.length; j++)
        if (MISSIONS[j].page && String(MISSIONS[j].label).trim() === texte) { q = MISSIONS[j]; break; }
      /* Rien a proposer si elle est faite, si elle est verrouillee, ou si on
         est deja sur la page du jeu : le lien n'aurait nulle part ou mener. */
      if (!q || q.done || q.claimed || q.locked) continue;
      if (q.page.split('?')[0] === ici) continue;
      var a = document.createElement('a');
      a.className = 'swgo';
      a.href = q.page;
      a.textContent = '▶ Play ' + q.nom;
      ligne.appendChild(a);
    }
  }
  function cssMissions() {
    if (document.getElementById('swgo-css')) return;
    var c = document.createElement('style');
    c.id = 'swgo-css';
    c.textContent =
      '.swgo{display:block;margin-top:7px;padding:7px 10px;border-radius:9px;text-align:center;' +
      'font-family:inherit;font-size:11.5px;font-weight:800;text-decoration:none;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);}' +
      '.swgo:hover{filter:brightness(1.06);}';
    document.head.appendChild(c);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', cssMissions);
  else cssMissions();

  /* Les tables 1v1 qui attendent un adversaire, tous jeux confondus. */
  var DUELS = [], duelsBtn = null, duelsPan = null, duelsOuvert = false;
  var EN_COURS = [], REGARDE = null, REGARDE_FINI = false;  // ce qui se joue, et ce qu on regarde
  var JEU_NOM = { p4: 'Connect 4', mp: 'Tic-Tac-Toe', dm: 'Checkers' };
  var JEU_PAGE = { p4: 'connect4.html', mp: 'morpion.html', dm: 'dames.html' };
  var JEU_SIGNE = { p4: '●', mp: '✕', dm: '◆' };
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
      /* En tete de barre il n'a personne a sa gauche : la marge qui le
         decollait de la pastille de solde le decollerait du bord.
       *
         `flex:0 0 auto` n'est pas decoratif. La barre est en flex et le
         bouton n'avait aucune consigne de retrait : coince entre le bord
         et un titre de jeu long, il se faisait ecraser a 18 px — la
         poignee du tiroir, en tete de barre, devenait un point. Sa largeur
         est desormais un plancher.
         Et il ne se resserre plus avec les deux crans de repli : ceux-ci
         existent pour degager de la place A DROITE, ou se pressent le
         solde, le staking, le compte de joueurs et le menu. Il n'est plus
         de ce cote-la. */
      '.swpb.gauche{flex:0 0 auto;margin-left:0;margin-right:10px;}' +
      '@media (max-width:520px){.swpb.gauche{width:32px;height:32px;font-size:14px;' +
      'margin-left:0;margin-right:7px;}}' +
      'html.swtight .swpb.gauche,html.swnoppl .swpb.gauche{width:32px;height:32px;' +
      'font-size:14px;margin-left:0;margin-right:7px;}' +
      /* Quand il a une medaille ou une photo, le bouton EST son visage. */
      '.swpb.img{background-size:cover;background-position:center;background-repeat:no-repeat;' +
      'background-color:rgba(10,6,2,.9);}' +
      /* ---- LE PANNEAU EST UN TIROIR, PAS UNE BOITE FLOTTANTE ----
         Une boite centree avec un rail de 124 px a gauche laissait 230 px
         de liste sur un telephone de 390 : le tiers de l'ecran servait a
         naviguer et la moitie de ce qui restait etait du vide autour de la
         boite. Un tiroir ancre a gauche prend toute la hauteur, ne perd
         rien en marges, et la page reste visible a cote de lui — on ne
         quitte pas le jeu pour regarder son compte.
         Il faut `visibility` et non `display:none` : une transformation ne
         s'anime pas depuis un element qui vient d'apparaitre, le tiroir
         serait deja en place a la premiere image. */
      '.swpov{position:fixed;inset:0;z-index:99999;display:block;' +
      'background:rgba(3,6,12,.72);opacity:0;visibility:hidden;' +
      '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);' +
      'transition:opacity .22s ease,visibility .22s;}' +
      '.swpov.on{opacity:1;visibility:visible;}' +
      /* `top:0;bottom:0` et non `height:100%` : le tiroir porte une
         bordure, et sur les coquilles ou la remise a zero du navigateur
         n'a pas impose box-sizing:border-box a tout, les deux pixels
         s'ajoutaient a la hauteur — le coin bas du tiroir sortait de
         l'ecran. Ancre en haut ET en bas, il fait la hauteur qu'on lui
         demande quel que soit le modele de boite. */
      '.swp{position:absolute;left:0;top:0;bottom:0;' +
      'width:min(90vw,400px);display:flex;flex-direction:column;' +
      'transform:translateX(-102%);transition:transform .26s cubic-bezier(.22,.61,.36,1);' +
      /* ---- LA POLICE DU PANNEAU ----
         Il heritait de la page. Sur SWOGE Spin, c'est Orbitron : une display
         geometrique carree dessinee pour des titres de quarante pixels. A dix,
         ses contreformes se referment — c'est ce qui rendait « $SWOGE »
         illisible, avec un W qui partait en bouillie. Les DONNEES prennent donc
         la police du systeme, dessinee pour etre lue petit. Le titre garde
         celle de la page : lui est assez gros pour la porter. */
      'border-radius:0 18px 18px 0;overflow:hidden;color:#EAF2FF;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,' +
      '"Helvetica Neue",Arial,sans-serif;' +
      'background:linear-gradient(180deg,#141C30,#080C16);' +
      'border:1px solid rgba(255,197,61,.4);border-left:0;' +
      'box-shadow:18px 0 60px rgba(0,0,0,.72);}' +
      '.swpov.on .swp{transform:none;}' +
      /* ---- AUCUNE BARRE DE DEFILEMENT DANS LE TIROIR ----
         Trois zones defilent : le sommaire, la liste d'une section, et le
         formulaire d'edition. Chacune posait sa barre grise le long du
         bord droit du tiroir, a quelques pixels du bord arrondi — trois
         traits qui apparaissent et disparaissent selon la section ouverte.
         On defile au doigt et a la molette ; la barre ne servait qu'a
         signaler qu'il y a une suite, ce que la rangee coupee en bas dit
         deja. */
      '.swp .swp-t,.swp .swp-l,.swp .swp-form{scrollbar-width:none;' +
      '-ms-overflow-style:none;}' +
      '.swp .swp-t::-webkit-scrollbar,.swp .swp-l::-webkit-scrollbar,' +
      '.swp .swp-form::-webkit-scrollbar{width:0;height:0;display:none;}' +
      '@media (min-width:900px){.swp{width:min(46vw,440px);}}' +
      '.swp-h{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 15px;' +
      'border-bottom:1px solid rgba(255,197,61,.26);background:rgba(255,197,61,.08);}' +
      /* ---- L ECHELLE ----
         Le panneau portait HUIT tailles, de 9,5 a 13,5 px : la plus GROSSE
         faisait 13,5. Chez n'importe quelle application de compte, 13 px c'est
         la legende, pas le libelle. Quatre tailles remplacent les huit —
         16 / 14 / 12,5 / 11 — et la graisse cesse d'etre a 800 partout : quand
         tout est gras, rien ne ressort. */
      '.swp-h b{font-size:15px;letter-spacing:1.2px;text-transform:uppercase;color:#FFD97A;' +
      'font-family:inherit;}' +
      '.swp-h span{flex:1;font-size:12.5px;color:#8DA0C4;}' +
      '.swp-x{width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:15px;' +
      'color:#EAF2FF;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);}' +
      /* ---- LE CORPS : DEUX VUES, PAS DEUX COLONNES ----
         Dans un tiroir de 400 px, un rail lateral coute 124 px a la liste
         pour afficher onze mots. On empile donc : le tiroir s'ouvre sur le
         SOMMAIRE — toute la largeur, une rangee par section — et une
         section touchee remplace le sommaire par sa liste, avec un retour
         en haut. C'est le geste de n'importe quelle application de compte,
         et la liste recupere les 124 px. */
      '.swp-body{flex:1;display:flex;min-height:0;overflow:hidden;}' +
      '.swp-t{flex:1;display:flex;flex-direction:column;gap:3px;' +
      'padding:8px 10px 18px;overflow-y:auto;background:transparent;}' +
      '.swp-t .swp-g{margin:13px 0 4px;padding:0 6px;font-size:10.5px;font-weight:700;' +
      'letter-spacing:1.3px;text-transform:uppercase;color:#6C7C99;}' +
      '.swp-t .swp-g:first-child{margin-top:2px;}' +
      /* 46 px de haut : c'est la cible tactile confortable, et c'est aussi
         ce qui donne au sommaire l'air d'un menu plutot que d'une liste de
         cases a cocher serrees. */
      '.swp-t button{display:flex;align-items:center;width:100%;min-height:46px;' +
      'text-align:left;padding:0 12px;border-radius:11px;cursor:pointer;min-width:0;' +
      'font-family:inherit;font-size:14px;font-weight:600;letter-spacing:.1px;' +
      'color:#C6D3EA;background:rgba(255,255,255,.03);border:1px solid transparent;}' +
      '.swp-t button::after{content:"\\203A";margin-left:auto;padding-left:10px;' +
      'font-size:17px;line-height:1;color:#5C6C88;}' +
      '.swp-t button:hover{background:rgba(255,255,255,.08);color:#EAF2FF;}' +
      /* La derniere section ouverte se signale par un lisere, pas par un
         aplat dore : sur toute la largeur, l'aplat se lit comme un bouton
         d'action a presser, et il y en avait un par ouverture du tiroir. */
      '.swp-t button.on{color:#FFD97A;background:rgba(255,197,61,.10);' +
      'border-color:rgba(255,197,61,.34);}' +
      '.swp-t button.on::after{color:#FFD97A;}' +
      '.swp-t button.swp-mir.tog::after{content:"";padding:0;}' +
      '.swp-l{display:none;flex:1;overflow-y:auto;padding:8px 12px 18px;min-height:180px;}' +
      '.swp.detail .swp-t{display:none;}' +
      '.swp.detail .swp-l{display:block;}' +
      /* La barre de retour : elle ne sert que dans la vue detail, donc
         elle n'existe que la. Un bouton retour toujours visible sur le
         sommaire ferait croire qu'il y a un cran au-dessus. */
      '.swp-back{display:none;align-items:center;gap:9px;padding:9px 12px;' +
      'border-bottom:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.02);}' +
      '.swp.detail .swp-back{display:flex;}' +
      '.swp-back .swp-bk{width:30px;height:30px;flex:0 0 30px;border-radius:9px;cursor:pointer;' +
      'font-size:17px;line-height:1;color:#EAF2FF;font-family:inherit;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);}' +
      '.swp-back .swp-bk:hover{color:#FFD97A;border-color:rgba(255,197,61,.5);}' +
      '.swp-back b{font-size:14px;font-weight:700;letter-spacing:.2px;color:#EAF2FF;}' +
      '.swp-r{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;' +
      'margin-bottom:6px;background:rgba(255,255,255,.04);' +
      'border:1px solid rgba(255,255,255,.07);}' +
      '.swp-r .w{flex:1;min-width:0;}' +
      '.swp-r .w b{display:block;font-size:14px;font-weight:600;color:#EAF2FF;}' +
      '.swp-r .w span{display:block;font-size:12px;color:#8DA0C4;margin-top:3px;}' +
      /* L adresse en entier : c est elle qu on relit avant d envoyer. */
      '.swp-r .w span.ad{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:11px;letter-spacing:.15px;color:#7E92B6;word-break:break-all;cursor:pointer;}' +
      '.swp-r .w span.ad:hover{color:#FFC53D;}' +
      '.swp-r .w span.su{color:#8DA0C4;font-size:12px;}' +
      '.swlv{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;' +
      'font-size:10px;font-weight:900;line-height:1.5;vertical-align:middle;' +
      'border:1px solid;background:rgba(255,255,255,.05);}' +
      /* La regle des lignes, « .swp-r .w span{display:block} », est PLUS
         SPECIFIQUE que « .swlv » : la pastille s etirait sur toute la largeur
         de la ligne et ressemblait a un champ de saisie vide. Il faut donc
         redire ici, a specificite egale, ce qu elle est. */
      '.swp-r .w span.swlv,.swp-r .w b span.swlv{display:inline-block;width:auto;' +
      'margin-top:0;font-size:10px;}' +
      /* La barre de progression : un niveau sans la marche suivante ne donne
         envie de rien. */
      '.swnv{margin-bottom:10px;padding:10px 12px;border-radius:12px;' +
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);}' +
      '.swnv .h{display:flex;align-items:baseline;gap:8px;font-size:12.5px;font-weight:800;' +
      'color:#EAF2FF;}' +
      '.swnv .h i{margin-left:auto;font-style:normal;font-size:10.5px;color:#8DA0C4;}' +
      '.swnv .b{height:7px;border-radius:999px;margin-top:8px;overflow:hidden;' +
      'background:rgba(0,0,0,.45);}' +
      '.swnv .b>i{display:block;height:100%;border-radius:999px;transition:width .4s;}' +
      '.swnv .r{margin-top:6px;font-size:10.5px;color:#8DA0C4;}' +
      /* L echelle des dix paliers de parrainage : dix pastilles qui se
         replient, celle du joueur allumee. */
      '.swech{display:flex;flex-wrap:wrap;gap:4px;margin-top:9px;}' +
      '.swech span{flex:1 1 auto;min-width:52px;text-align:center;padding:5px 3px;' +
      'border-radius:8px;font-size:9px;color:#8DA0C4;line-height:1.5;' +
      'background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.09);}' +
      '.swech span b{display:block;font-size:12px;font-weight:900;color:#EAF2FF;}' +
      '.swech span.on{background:rgba(255,255,255,.07);}' +
      '.swech span.on b{color:inherit;}' +
      '.swp-r .v{flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;}' +
      '.swp-r .v b{display:block;font-size:16px;font-weight:700;}' +
      '.swp-r .v span{font-size:11px;color:#8DA0C4;}' +
      '.swp-r .g{color:#7CFF9B;} .swp-r .p{color:#F2685E;} .swp-r .n{color:#E7C97A;}' +
      '.swp-v{text-align:center;color:#8DA0C4;font-size:13.5px;padding:30px 10px;line-height:1.7;}' +
      /* L'apercu : des cartes, pas un tableau. Un tableau se lit de gauche a
         droite ; une grille de cartes se balaie, et c'est ce qu'on fait devant
         son propre profil. */
      '.swap-g{display:grid;gap:7px;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));' +
      'margin-bottom:12px;}' +
      '.swap-c{padding:10px 11px;border-radius:11px;background:rgba(255,255,255,.05);' +
      'border:1px solid rgba(255,255,255,.10);}' +
      '.swap-c span{display:block;font-size:10px;letter-spacing:.7px;text-transform:uppercase;' +
      'color:#7E8FAC;}' +
      '.swap-c b{display:block;margin-top:3px;font-size:16px;font-weight:900;color:#EAF2FF;' +
      'font-variant-numeric:tabular-nums;}' +
      '.swap-c i{display:block;margin-top:2px;font-style:normal;font-size:10.5px;color:#8DA0C4;}' +
      '.swap-t{margin:12px 0 6px;font-size:10px;letter-spacing:1px;text-transform:uppercase;' +
      'color:#7E8FAC;}' +
      '.swap-f{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.swap-f span{padding:7px 10px;border-radius:10px;font-size:11.5px;font-weight:700;' +
      'color:#EAF2FF;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);}' +
      '.swap-f span i{margin-left:6px;font-style:normal;font-weight:600;color:#8DA0C4;}' +
      /* Les pastilles de filtre : assez petites pour ne pas voler la vedette a
         la liste qu'elles trient. */
      '.swap-fl{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0 10px;}' +
      '.swap-fl button{padding:5px 9px;border-radius:999px;cursor:pointer;font-family:inherit;' +
      'font-size:10.5px;font-weight:700;color:#8DA0C4;background:rgba(255,255,255,.05);' +
      'border:1px solid rgba(255,255,255,.10);}' +
      '.swap-fl button.on{color:#07101F;background:linear-gradient(180deg,#FFE08A,#FFC53D);' +
      'border-color:transparent;}' +
      '.swp-more{display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;' +
      'cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:800;color:#EAF2FF;' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);}' +
      '.swp-more[disabled]{opacity:.5;cursor:default;}' +
      /* Sur telephone les rangees du sommaire perdent un demi-point et un
         peu de hauteur : onze rangees de 46 px demandent un coup de pouce
         pour tenir sous l'en-tete sans qu'on ait a faire defiler des la
         premiere seconde. */
      '@media (max-width:430px){' +
        '.swp-t button{font-size:13.5px;min-height:44px;}' +
        '.swp-l{padding:8px 10px 18px;}' +
      '}' +
      /* l en-tete : le visage, le nom, et de quoi les changer */
      '.swp-me{flex:0 0 auto;display:flex;align-items:center;gap:11px;padding:12px 13px;' +
      'border-bottom:1px solid rgba(255,197,61,.18);background:rgba(255,255,255,.03);}' +
      /* L'adresse partageable. Elle passe a la ligne sous le nom : la mettre
         a cote comprimerait un nom long, qui est justement ce qu'on partage. */
      '.swp-me{flex-wrap:wrap;}' +
      '.swpart{flex:1 0 100%;margin-top:9px;padding:8px 10px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:800;color:#FFD97A;' +
      'background:rgba(255,197,61,.10);border:1px solid rgba(255,197,61,.34);}' +
      '.swpart:hover{background:rgba(255,197,61,.18);}' +
      /* ---- LE CADRE DE PALIER ----
         Il se pose SANS toucher au balisage : un ::after par-dessus la photo,
         un peu plus grand qu'elle. Le trou du cadre fait 56 % de l'image, donc
         a 148 % il mord sur les 18 % exterieurs de la photo — c'est ce que
         fait un vrai cadre, et c'est ce qui empeche le lisere de flotter.
         La marge laterale rend au voisin la place que le cadre lui prend. */
      '.swcad{position:relative;overflow:visible;}' +
      '.swcad::after{content:"";position:absolute;left:-24%;top:-24%;width:148%;height:148%;' +
      'background:var(--cadre) center/contain no-repeat;pointer-events:none;z-index:2;}' +
      '.av.swcad{margin:0 5px;border-color:transparent;}' +
      /* Le bouton de la barre : le cadre deborde de 24 % de chaque cote, il
         faut donc lui rendre cette place, sinon il mord sur ses voisins. */
      '.swpb.swcad{margin-left:15px;margin-right:7px;border-color:transparent;box-shadow:none;}' +
      '.swp-av.swcad{margin:0 7px;border-color:transparent;}' +
      /* Le mur de la salle derriere les blocs du profil : le meme que la page
         d accueil, assombri pour que le texte reste lisible. */
      '.swp-me,.swnv{background-image:linear-gradient(rgba(9,13,24,.72),rgba(9,13,24,.86)),' +
      'url(media/fond-gym.webp);background-size:auto,cover;background-position:center;}' +
      /* 56 px et non 40 : le cadre de palier est ce qu'on remarque en premier
         chez les autres joueurs — c'est la seule chose du profil qui se voie
         d'un coup d'oeil et qui se merite. A 40 px il etait un detail. */
      '.swp-av{flex:0 0 auto;width:56px;height:56px;border-radius:50%;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;font-size:21px;' +
      'background:linear-gradient(180deg,rgba(46,26,10,.95),rgba(20,10,4,.98));' +
      'border:1px solid rgba(230,165,55,.5);}' +
      '.swp-me .nm{flex:1;min-width:0;}' +
      '.swp-me .nm b{display:block;font-size:17px;font-weight:700;color:#F2F6FF;' +
      'letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.swp-me .nm > span{display:block;font-size:11.5px;color:#8DA0C4;margin-top:3px;' +
      'font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      /* Le bouton d'edition devient un CHEVRON. En haut d'un tiroir, un
         bouton dore intitule « Edit » attire l'oeil avant le nom et avant
         le sommaire, alors qu'on change son nom une fois dans sa vie. Le
         chevron dit la meme chose et laisse la vedette au reste. */
      '.swp-ed{flex:0 0 auto;width:32px;height:32px;padding:0;border-radius:50%;' +
      'cursor:pointer;font-family:inherit;font-size:17px;line-height:1;color:#8DA0C4;' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);}' +
      '.swp-ed:hover{color:#FFD97A;border-color:rgba(255,197,61,.5);}' +
      '.swp-ed.on{color:#07101F;background:linear-gradient(180deg,#FFE08A,#FFC53D);' +
      'border-color:transparent;}' +
      /* Le formulaire vit maintenant dans un tiroir a hauteur FIXE, la ou
         la boite d'avant s'etirait a 86 vh. Ouvert en paysage sur un
         telephone, ses vingt frimousses plus le champ du nom depassaient
         la hauteur restante et poussaient le sommaire hors du tiroir. Il
         defile chez lui. */
      '.swp-form{flex:0 0 auto;max-height:46vh;overflow-y:auto;' +
      'padding:11px 13px;border-bottom:1px solid rgba(255,197,61,.18);' +
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
      /* z-index 3 : le cadre du palier se peint en 2, et la pastille doit
         rester lisible par-dessus — c'est elle qui appelle le clic. */
      '.swpn{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;z-index:3;' +
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
      /* Le prix d un nom, annonce AVANT la saisie. Un prix decouvert au
         moment du refus se lit comme une panne. */
      '.swp-prix{margin:7px 0 2px;font-size:11.5px;line-height:1.5;color:#8DA0C4;}' +
      '.swp-prix b{color:#FFC53D;}' +
      '.swp-prix.ko b{color:#F2685E;}' +
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
      /* Les jambes d'un pari. Un filet a gauche les rattache visiblement au
         titre : sans lui, un combine de quatre se lit comme quatre paris. */
      /* La reference du pari. Monospace : on la recopie, on la compare
         caractere par caractere, et une police proportionnelle confond le
         1 et le l. */
      '.swp-r .w span .swp-pid{display:inline;font-family:ui-monospace,SFMono-Regular,' +
      'Menlo,Consolas,monospace;font-size:11px;color:#9FB0CE;cursor:pointer;' +
      'border-bottom:1px dotted rgba(159,176,206,.45);}' +
      '.swp-r .w span .swp-pid:hover{color:#FFC53D;border-bottom-color:#FFC53D;}' +
      '.swp-r .w span .swp-pid.ok{color:#7CFF9B;border-bottom-color:#7CFF9B;}' +
      '.swp-pj{font-size:12px;color:#B9C8E4;margin-top:4px;padding-left:9px;' +
      'border-left:2px solid rgba(255,197,61,.35);line-height:1.45;}' +
      /* « .swp-r .w b » met les <b> en BLOC : sans ce selecteur plus
         specifique, le choix et sa cote partaient chacun a la ligne et une
         jambe tenait sur trois lignes. */
      '.swp-r .w .swp-pj b{display:inline;font-size:12px;font-weight:700;color:#EAF2FF;}' +
      /* Comme « .swlv », cette pastille vit DANS un <b> que la regle des
         lignes voudrait mettre en bloc pleine largeur. */
      '.swp-r .w b .swp-pe{display:inline-block;width:auto;margin-left:7px;' +
      'padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;' +
      'letter-spacing:.4px;text-transform:uppercase;vertical-align:1px;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);}' +
      /* La couleur doit etre REPOSEE ici : « .swp-r .w span » est plus
         specifique que « .swp-r .g » et la repeignait en gris. */
      '.swp-r .w b .swp-pe.g{color:#7CFF9B;background:rgba(124,255,155,.12);' +
      'border-color:rgba(124,255,155,.32);}' +
      '.swp-r .w b .swp-pe.p{color:#F2685E;background:rgba(242,104,94,.12);' +
      'border-color:rgba(242,104,94,.32);}' +
      '.swp-r .w b .swp-pe.n{color:#E7C97A;background:rgba(231,201,122,.12);' +
      'border-color:rgba(231,201,122,.32);}' +
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
    /* ---- LE BOUTON EST A GAUCHE ----
       Il vivait a droite, colle au solde et au menu, dans le coin le plus
       encombre de la barre : sur telephone il partageait 150 px avec la
       pastille de solde, la bulle de staking, le compte de joueurs et le
       hamburger. Le tiroir s'ouvre depuis la gauche ; sa poignee doit etre
       du meme cote, sinon on appuie a droite pour voir arriver quelque
       chose de gauche.
       On se pose EN TETE DE LA BARRE quand il y en a une. Sinon — une
       coquille sans <nav> — on retombe a cote du solde, la ou il a
       toujours ete : mieux vaut le mauvais cote que pas de bouton. */
    var bal2 = document.getElementById('bal');
    /* LA BARRE DU SOLDE, pas la premiere <nav> de la page. Le sommaire du
       livre blanc et la rangee de liens du launchpad sont aussi des <nav> :
       s'y poser mettrait un bouton de compte en tete d'une table des
       matieres. On remonte donc depuis le solde — s'il n'est pas dans une
       barre (page de staking), il n'y a pas de tete de barre ou aller. */
    var barre = (bal2 && bal2.closest) ? bal2.closest('nav') : null;
    /* Certaines coquilles enveloppent le contenu de la barre dans un bloc
       centre. S'y poser DEDANS : au-dessus, le bouton sortirait de la rangee
       alignee et se collerait au bord de l'ecran. */
    if (barre) {
      var dedans = null;
      try { dedans = barre.querySelector(':scope > .navin, :scope > .nav-in, :scope > .inner'); }
      catch (e) {}
      if (dedans && dedans.contains(bal2)) barre = dedans;
    }
    if (barre && barre.firstElementChild) {
      profBtn.classList.add('gauche');
      barre.insertBefore(profBtn, barre.firstElementChild);
    } else {
      var apres = pastille || bulle;
      apres.parentElement.insertBefore(profBtn, apres.nextSibling);
    }

    profBoite = document.createElement('div');
    profBoite.className = 'swpov';
    profBoite.innerHTML =
      '<div class="swp">' +
        '<div class="swp-h"><b>Your profile</b><span class="swp-sub"></span>' +
        '<button class="swp-x" type="button">&times;</button></div>' +
        '<div class="swp-me">' +
          '<div class="swp-av"></div>' +
          '<div class="nm"><b></b><span></span></div>' +
          '<button class="swp-ed" type="button" title="Edit your name and picture">&rsaquo;</button>' +
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
          '<div class="swp-prix"></div>' +
          '<div class="swp-in">' +
          '</div>' +
          '<div class="swp-msg"></div>' +
        '</div>' +
        '<div class="swp-back"><button class="swp-bk" type="button">&lsaquo;</button>' +
          '<b></b></div>' +
        '<div class="swp-body"><div class="swp-t"></div><div class="swp-l"></div></div>' +
      '</div>';
    document.body.appendChild(profBoite);
    profBoite.addEventListener('click', function (e) {
      /* La reference d'un pari se copie d'un geste. Un joueur qui doit la
         recopier a la main sur un telephone en recopie une sur deux, et une
         reference fausse ne se cherche pas — elle envoie chercher un pari
         qui n'existe pas. */
      var pid = e.target.closest && e.target.closest('.swp-pid');
      if (pid) {
        var t = pid.textContent;
        try { navigator.clipboard.writeText(t); } catch (x) {}
        pid.textContent = 'copied ✓'; pid.classList.add('ok');
        setTimeout(function () { pid.textContent = t; pid.classList.remove('ok'); }, 1000);
        return;
      }
      /* Le retour ne ferme PAS le tiroir : il remonte au sommaire. Fermer
         sur le retour obligerait a rouvrir pour changer de section, ce qui
         est exactement ce qu'on vient de demander a l'utilisateur de faire. */
      if (e.target.closest && e.target.closest('.swp-bk')) { profVue(null); return; }
      if (e.target === profBoite || e.target.classList.contains('swp-x')) profFerme();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') profFerme(); });

    var ed = profBoite.querySelector('.swp-ed');
    var form = profBoite.querySelector('.swp-form');
    ed.addEventListener('click', function () {
      var ouvert = !form.classList.contains('off');
      form.classList.toggle('off', ouvert);
      /* Le chevron pointe vers le bas quand le formulaire est ouvert : c'est
         le seul indice qu'on a de l'etat, le libelle « Edit / Close » ayant
         disparu avec le bouton. */
      ed.innerHTML = ouvert ? '&rsaquo;' : '&#9662;';
      ed.classList.toggle('on', !ouvert);
      ed.title = ouvert ? 'Edit your name and picture' : 'Close';
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
    /* Les entrees du menu de la page, decoupees en paquets par ses separateurs.
       Le PREMIER paquet — portefeuille, depot, retrait, quetes — monte en tete
       du tiroir : ce sont les gestes pour lesquels on ouvre un menu. Le reste
       (autres jeux, accueil, son, musique) descend sous les sections du profil,
       la ou on va rarement. */
    var paquets = miroirPaquets();
    miroirGroupe(t, 'Account', paquets[0]);
    FAMILLES.forEach(function (f) {
      var g = document.createElement('div');
      g.className = 'swp-g'; g.textContent = f[0];
      t.appendChild(g);
      f[1].forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = o[1]; b.dataset.k = o[0];
        b.addEventListener('click', function () { profVa(o[0]); });
        t.appendChild(b);
      });
    });
    var RESTE = ['Elsewhere', 'Settings', 'More'];
    for (var q = 1; q < paquets.length; q++)
      miroirGroupe(t, RESTE[q - 1] || 'More', paquets[q]);

    /* ---- LE MENU DEROULANT NE S'AFFICHE PLUS ----
       Ses entrees sont dans le tiroir ; deux listes identiques a deux endroits
       divergent des la premiere modification. On le LAISSE dans la page —
       c'est lui qui porte les gestionnaires, un par coquille — mais on ne le
       montre plus. Le bouton ☰ reste, et ouvre le tiroir : deux poignees, un
       seul panneau. */
    if (miroirs.length) {
      /* Le menu deroulant ET son bouton disparaissent. Deux poignees pour un
         seul panneau, une a chaque bout de la barre, obligeaient a se demander
         laquelle ouvre quoi — et la reponse etait « la meme chose ». Il ne
         reste que celle de gauche, du cote d'ou le tiroir arrive.
         Le <div id="menu"> reste dans la page, masque : c'est LUI qui porte
         les gestionnaires que les rangees du tiroir appellent. Le supprimer
         emporterait le portefeuille, le depot et le son avec lui. */
      var css2 = document.createElement('style');
      css2.textContent = '#menu{display:none!important;}#menuBtn{display:none!important;}';
      document.head.appendChild(css2);
    }
    return true;
  }

  /* ------------------------------------------------- le menu de la page
   *
   * On MIROITE, on ne reecrit pas. Chaque rangee garde un lien vers l'entree
   * d'origine et lui transmet le clic : c'est le gestionnaire de la page qui
   * travaille, quel qu'il soit. Reimplanter openPanel(), la bascule du son et
   * le changement de piste ici voudrait dire les tenir a jour dans ce fichier
   * ET dans les quinze coquilles — et le jour ou l'une d'elles change, c'est
   * le tiroir qui aurait tort.
   */
  var miroirs = [];
  function miroirPaquets() {
    var menu = document.getElementById('menu');
    if (!menu) return [];
    var paquets = [[]];
    [].forEach.call(menu.children, function (el) {
      if (el.classList && el.classList.contains('msep')) { paquets.push([]); return; }
      if (el.tagName === 'A') paquets[paquets.length - 1].push(el);
    });
    return paquets.filter(function (p) { return p.length; });
  }
  function miroirGroupe(t, titre, liste) {
    if (!liste || !liste.length) return;
    var g = document.createElement('div');
    g.className = 'swp-g'; g.textContent = titre;
    t.appendChild(g);
    liste.forEach(function (el) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swp-mir';
      /* Le son et la musique sont des INTERRUPTEURS, pas des destinations :
         leur libelle porte deja la valeur (« Sound: on »), et un chevron a
         cote promettrait une page qui n'existe pas. */
      if (el.id === 'soundItem' || el.id === 'musicItem') b.classList.add('tog');
      b.textContent = (el.textContent || '').trim();
      b.addEventListener('click', function () {
        /* Portefeuille, staking, depot, retrait, quetes s'ouvrent DANS le
           tiroir. Le reste — autres jeux, accueil, son, musique — n'a pas de
           panneau : on transmet le clic et on s'efface. */
        if (el.getAttribute('data-panel')) return emprunte(el, (b.textContent || '').trim());
        profFerme();
        try { el.click(); } catch (e) {}
      });
      t.appendChild(b);
      miroirs.push([b, el]);
    });
  }
  /* ------------------------------------ les panneaux de compte, DANS le tiroir
   *
   * Depot, retrait, staking, portefeuille et quetes vivaient dans une fenetre
   * modale a eux, avec leur cadre dore, leur titre en image et leur propre
   * bouton de fermeture. Ouvrir son compte demandait donc de fermer le tiroir
   * pour ouvrir autre chose — deux panneaux de compte, deux presentations, deux
   * facons d'en sortir.
   *
   * ---- on EMPRUNTE la boite, on ne la reecrit pas ----
   *
   * Le formulaire de depot, ses pourcentages, son bouton et la centaine de
   * lignes qui les font marcher sont dans la page, une copie par coquille. Les
   * refaire ici voudrait dire les tenir a jour a seize endroits. On DEPLACE
   * donc le noeud existant dans le tiroir : deplacer un element ne detache
   * aucun de ses gestionnaires, et le formulaire continue de marcher parce que
   * c'est LE MEME formulaire.
   *
   * Et on laisse la page l'ouvrir elle-meme d'abord : openPanel() recharge le
   * solde du portefeuille, demande les quetes, recalcule le staking. On
   * transmet le clic, la page fait son travail, et on transplante ensuite.
   */
  var PANNEAU = null, styleHote = false;

  /* ---- LA BOITE EMPRUNTEE PERD SON HABIT ----
   *
   * Elle est dessinee pour flotter au milieu de l'ecran : cadre dore en
   * border-image, largeur fixe, hauteur bornee a 88 vh, titre en image et
   * bouton de fermeture. Dans le tiroir tout ca fait double emploi — il y a
   * deja un cadre, une hauteur et un retour. On ne garde que le contenu.
   *
   * ---- pourquoi un IDENTIFIANT sur l'hote, et pas seulement une classe ----
   *
   * Premiere tentative : « .swp-l .box [data-close] { display:none !important } ».
   * Sans effet. Les coquilles habillent leurs panneaux par IDENTIFIANT —
   * « #box-dep .abtn { … !important } » — et un identifiant l'emporte sur
   * n'importe quel nombre de classes, quel que soit l'ordre des feuilles.
   * L'important n'y change rien : il ne departage que des specificites egales.
   * Le bouton « Close » restait donc affiche, en grand, sous un formulaire qui
   * a deja son retour en haut.
   * La liste du tiroir porte donc un identifiant a elle, et les regles pesent
   * un identifiant plus deux classes — au-dessus de tout ce que les pages
   * ecrivent. La feuille est posee en fin de body par-dessus le marche, pour
   * les egalites qui resteraient.
   */
  function styleEmprunt() {
    if (styleHote) return;
    styleHote = true;
    var css = document.createElement('style');
    css.textContent =
      '#swpHote .box{position:static!important;display:block!important;' +
      'width:auto!important;max-width:none!important;max-height:none!important;' +
      'margin:0!important;padding:0!important;border:0!important;' +
      'border-image:none!important;border-radius:0!important;' +
      'background:none!important;box-shadow:none!important;}' +
      '#swpHote .box .pscroll,#swpHote .box .qscroll{max-height:none!important;' +
      'overflow:visible!important;padding:0!important;}' +
      /* Le titre en image et la fermeture : la barre de retour dit deja ou
         l'on est et comment en sortir. */
      '#swpHote .box .ptitle,#swpHote .box .qtitle,#swpHote .box .wtitle-plate{display:none!important;}' +
      '#swpHote .box [data-close],#swpHote .box .closeimg{display:none!important;}' +
      /* Une rangee qui ne contenait que la fermeture n'a plus rien a montrer :
         sans ca elle laisse sa marge, et le formulaire finit sur un blanc. */
      '#swpHote .box .brow:has(> [data-close]:only-child){display:none!important;}' +
      '#swpHote .box input,#swpHote .box select,#swpHote .box textarea{max-width:100%;}';
    (document.body || document.documentElement).appendChild(css);
  }

  function emprunte(el, titre) {
    if (!profBoite) return;
    try { el.click(); } catch (e) { return; }
    /* Au tour SUIVANT : openPanel() pose la classe `show` de facon synchrone,
       mais elle peut aussi refuser (pas connecte) en n'ouvrant rien du tout.
       On regarde ce qui est reellement ouvert plutot que de le supposer. */
    setTimeout(function () {
      var ovl = document.getElementById('ovl');
      var boite = ovl && ovl.querySelector('.box.show');
      if (!boite) return;                    // la page a refuse : on ne bouge pas
      rendPanneau();
      styleEmprunt();
      PANNEAU = { el: boite, parent: boite.parentNode, suivant: boite.nextSibling };
      var l = profBoite.querySelector('.swp-l');
      l.id = 'swpHote';
      l.innerHTML = '';
      l.appendChild(boite);
      ovl.classList.remove('show');
      profVue('__hote', titre);
    }, 0);
  }

  /* Remet la boite exactement d'ou elle vient — meme parent, meme voisin. La
     reposer a la fin de #ovl marcherait aussi, mais l'ordre des panneaux dans
     le balisage est celui dans lequel une coquille les a ecrits, et rien ne dit
     qu'aucune ne s'en sert. */
  function rendPanneau() {
    if (!PANNEAU) return;
    var p = PANNEAU; PANNEAU = null;
    p.el.classList.remove('show');
    if (p.parent) p.parent.insertBefore(p.el, p.suivant || null);
  }

  /* Les libelles bougent — « Sound: on » devient « Sound: off », « Sign in »
     disparait une fois connecte. On resynchronise a l'ouverture du tiroir :
     c'est le seul instant ou ca se voit. */
  function miroirSync() {
    for (var i = 0; i < miroirs.length; i++) {
      var b = miroirs[i][0], el = miroirs[i][1];
      b.textContent = (el.textContent || '').trim();
      /* Le style EN LIGNE, et lui seul : « #menu{display:none} » cache tout le
         menu, donc le style calcule dirait « cache » pour chaque entree. La
         page, elle, cache « Sign in » en posant el.style.display. */
      b.style.display = (el.style.display === 'none') ? 'none' : '';
    }
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
      nb(P.bienvenue, 0) + ' $SWOGE</b> once they deposit <b>' + nb(P.depotMini, 0) + ' $SWOGE</b> or more.';
    l.appendChild(expl);

    /* L'echelle des paliers. C'est le seul avantage chiffre des niveaux, donc
       c'est le seul endroit ou l'on peut montrer, noir sur blanc, ce que jouer
       rapporte plus tard — et voir SA ligne surlignee vaut mieux qu'une
       promesse. */
    if (P.partPalier && P.partPalier.length) {
      var ech = document.createElement('div');
      ech.className = 'swnv';
      var ici = (NIVEAU && NIVEAU.palierNo) || 1;
      ech.innerHTML = '<div class="h">Your share grows with your level' +
        '<i>up to ' + P.partMax + '% at SWOLE</i></div>' +
        '<div class="swech">' + P.partPalier.map(function (x, i) {
          var moi = (i + 1) === ici;
          return '<span class="' + (moi ? 'on' : '') + '" style="' +
            (moi ? 'border-color:' + couleurPalier(x.palier) + ';color:' + couleurPalier(x.palier) : '') +
            '" title="' + x.palier + '"><b>' + x.part + '%</b>' + x.palier + '</span>';
        }).join('') + '</div>';
      l.appendChild(ech);
    }

    /* Le cadeau recu et pas encore debloque. Un montant retenu sans
       explication fait ecrire au support ; avec la raison et le chiffre qui
       reste, le joueur joue. */
    if (parseFloat(P.bloque || 0) > 0) {
      var bl = document.createElement('div');
      bl.className = 'swp-ex';
      bl.style.borderColor = 'rgba(255,197,61,.45)';
      bl.innerHTML = '🔒 <b>' + nb(P.bloque) + ' $SWOGE</b> of welcome gift is still locked. ' +
        'It unlocks as you play — the rest of your balance withdraws normally.';
      l.appendChild(bl);
    }

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
    var du = parseFloat(P.du || 0), att = parseFloat(P.attente || 0);
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

    /* Ce qui mûrit encore. Une somme « en attente » sans date fait croire a un
       blocage ; avec la date et la raison, elle se comprend en une seconde. */
    if (att > 0) {
      var mur = document.createElement('div');
      mur.className = 'swp-r';
      mur.style.opacity = '.8';
      mur.innerHTML = '<div class="w"><b>' + nb(att) + ' $SWOGE</b>' +
        '<span class="su">maturing — first part unlocks ' +
        (P.attenteLe ? new Date(P.attenteLe).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short' }) : 'soon') + '</span></div>';
      l.appendChild(mur);
      var pq = document.createElement('div');
      pq.className = 'swp-ex';
      pq.style.marginTop = '0';
      pq.innerHTML = 'Earnings sit for <b>' + nb(P.delaiJours, 0) + ' days</b> before you can ' +
        'claim them: if your friend wins their losses back in that time, the pending amount ' +
        'goes down with it. Once matured, it is yours for good.';
      l.appendChild(pq);
    }

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
    /* Le prix qui revient a cette place, s'il y en a un. Un classement sans
       enjeu se regarde une fois ; avec le montant en face, on y revient. */
    var gagne = ((CLASSEMENT && CLASSEMENT.prix && CLASSEMENT.prix.gagnants) || [])
      .filter(function (g) { return g.rang === r.rang; })[0];
    d.innerHTML = '<span class="rg">' + med + '</span><div class="av"></div>' +
      '<div class="w"><b>' + ech(r.name || court(r.address)) + pastilleNiveau(r) + (moi ? ' — you' : '') + '</b>' +
      (gagne && gagne.prix > 0 ? '<span class="su">🏆 ' + nb(gagne.prix, 0) + ' $SWOGE if the month ended now</span>' : '') +
      '</div>' +
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
    var pr = C.prix || {};
    e.innerHTML = 'Ranked on <b>volume played this month</b>, not on winnings — luck moves winnings, ' +
      'volume is what you actually did. It resets when the month does.' +
      (pr.cagnotte > 0
        ? '<br><br>🏆 <b>' + nb(pr.cagnotte, 0) + ' $SWOGE</b> in the pot right now — ' +
          pr.part + '% of everything the house makes this month, shared between the top ' +
          (pr.gagnants || []).length + ' when it ends. It grows with every round played.'
        : '');
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
  /* Le niveau, avec la marche suivante. Sans le « encore X », un niveau est
     un chiffre mort. */
  function blocNiveau() {
    /* On montre la barre MEME a zero. Le joueur qui vient d'arriver est
       precisement celui a qui elle sert : cachee, il ne sait pas qu'il y a
       cent niveaux a gravir ni ce qui les fait monter. */
    if (!NIVEAU) return null;
    var c = couleurPalier(NIVEAU.palier);
    var d = document.createElement('div');
    d.className = 'swnv';
    d.innerHTML = '<div class="h"><span style="color:' + c + '">' + NIVEAU.palier +
      '</span> · Level <b>' + NIVEAU.niveau + '</b><i>' + nb(NIVEAU.volume, 0) + ' $SWOGE wagered</i></div>' +
      '<div class="b"><i style="width:' + NIVEAU.progression + '%;background:' + c + '"></i></div>' +
      '<div class="r">' + (NIVEAU.max
        ? 'Maximum level. Almost nobody gets here.'
        : nb(NIVEAU.restant, 0) + ' $SWOGE more to reach level ' + (NIVEAU.niveau + 1)) + '</div>';
    return d;
  }

  /* ======================= L'APERCU =======================
   *
   * Le profil s'ouvrait sur la liste des manches — un journal, alors que la
   * premiere question d'un joueur qui ouvre son profil est « qui suis-je
   * ici ». Pire : la page PUBLIQUE `/j/<nom>` montrait deja le niveau, le
   * volume, le meilleur gain, les jeux favoris, les duels et les rivaux. Son
   * propre profil en montrait moins que celui que voient les inconnus.
   *
   * On demande donc la MEME chose que la page publique, a la meme adresse. Une
   * seule construction, une seule verite : si les deux divergent un jour, ce
   * sera parce qu'on l'aura voulu. */
  var APERCU = null, apercuCharge = false;
  var filtreJeu = null;

  function demandeApercu() {
    var a = MOI.address;
    if (!a || apercuCharge) return;
    apercuCharge = true;
    fetch(base() + '/api/j/' + a).then(function (r) { return r.json(); })
      .then(function (j) { if (!j.error) { APERCU = j; if (profOnglet === 'ap') profRend(); } })
      .catch(function () {});
  }
  function base() {
    return adresseServeur().replace(/^ws/, 'http').replace(/\/+$/, '');
  }

  function carte(titre, valeur, note) {
    return '<div class="swap-c"><span>' + titre + '</span><b>' + valeur + '</b>' +
           (note ? '<i>' + note + '</i>' : '') + '</div>';
  }

  function rendApercu() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    var bn = blocNiveau(); if (bn) l.appendChild(bn);
    if (!APERCU) {
      demandeApercu();
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.textContent = 'Loading…';
      l.appendChild(v);
      return;
    }
    var A = APERCU, h = '';
    h += '<div class="swap-g">' +
      carte('Wagered', nb(A.volume || 0, 0), 'all time') +
      carte('Rounds', nb(A.manches || 0, 0), null) +
      (A.record ? carte('Best win', nb(A.record.gain || 0, 0),
                        (A.record.multi ? A.record.multi + '× · ' : '') +
                        (JEUX[A.record.jeu] || A.record.jeu || '')) : '') +
      (A.duels && A.duels.joues
        ? carte('Duels', A.duels.gagnes + ' / ' + A.duels.joues,
                Math.round(A.duels.gagnes / A.duels.joues * 100) + '% won') : '') +
      carte('Friends', nb(A.amis || 0, 0), null) +
      (A.depuis ? carte('Member since',
        new Date(A.depuis).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), null) : '') +
      '</div>';

    if (A.favoris && A.favoris.length) {
      h += '<div class="swap-t">Most played</div><div class="swap-f">';
      A.favoris.forEach(function (f) {
        h += '<span>' + (JEUX[f.jeu] || f.jeu) + '<i>' + nb(f.n, 0) + '</i></span>';
      });
      h += '</div>';
    }
    if (A.duels && A.duels.rivaux && A.duels.rivaux.length) {
      h += '<div class="swap-t">Rivals</div><div class="swap-f">';
      A.duels.rivaux.forEach(function (r) {
        h += '<span>' + (r.nom || String(r.adresse || '').slice(0, 6)) +
             '<i>' + r.v + 'W · ' + r.d + 'L</i></span>';
      });
      h += '</div>';
    }
    var d = document.createElement('div');
    d.innerHTML = h;
    l.appendChild(d);
  }

  /* Les pastilles de jeu au-dessus des manches. On ne les invente pas : on
     prend les jeux PRESENTS dans ce qui est charge, donc aucune pastille ne
     rend jamais une liste vide au premier clic. */
  function blocFiltre() {
    var vus = {};
    profItems.forEach(function (e) { var j = e.j || e.jeu; if (j) vus[j] = (vus[j] || 0) + 1; });
    var cles = Object.keys(vus);
    if (cles.length < 2) return null;
    cles.sort(function (a, b) { return vus[b] - vus[a]; });
    var d = document.createElement('div');
    d.className = 'swap-fl';
    var h = '<button type="button" data-j="" class="' + (filtreJeu ? '' : 'on') + '">All</button>';
    cles.forEach(function (j) {
      h += '<button type="button" data-j="' + j + '" class="' + (filtreJeu === j ? 'on' : '') + '">' +
           (JEUX[j] || j) + '</button>';
    });
    d.innerHTML = h;
    d.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-j]') : null;
      if (!b) return;
      filtreJeu = b.getAttribute('data-j') || null;
      profRend();
    });
    return d;
  }

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

  /* Passe de la vue sommaire a la vue detail, et retour. Le titre de la
     barre de retour reprend le libelle EXACT de la rangee touchee : un
     titre reecrit a la main finit par ne plus dire la meme chose que le
     sommaire, et on ne sait plus ou on est. */
  function profVue(k, libelle) {
    if (!profBoite) return;
    var boite = profBoite.querySelector('.swp');
    var titre = profBoite.querySelector('.swp-back b');
    /* Toute sortie de la vue detail rend d'abord la boite empruntee a la page.
       Sans ca, changer de section pendant qu'un panneau de compte est affiche
       le detruirait avec le reste du contenu — et la page ne le retrouverait
       jamais, avec ses champs et ses gestionnaires. */
    if (k !== '__hote') rendPanneau();
    if (!k) { boite.classList.remove('detail'); return; }
    var nom = libelle || '';
    if (!nom) for (var i = 0; i < ONGLETS.length; i++) if (ONGLETS[i][0] === k) nom = ONGLETS[i][1];
    titre.textContent = nom;
    boite.classList.add('detail');
    /* Chaque section repart du haut. Sans ca, on ouvrait « Deposits » deja
       defile a la hauteur ou l'on avait laisse « Rounds ». */
    profBoite.querySelector('.swp-l').scrollTop = 0;
  }

  function profOuvre() {
    if (!profMonte()) return;
    profOuvert = true;
    profBoite.classList.add('on');
    /* LE TIROIR S'OUVRE SUR LE SOMMAIRE, jamais sur la derniere section
       consultee. C'est un tiroir de navigation : on l'ouvre pour choisir. Y
       retrouver « Settled bets » parce qu'on l'avait regarde la veille donne
       l'impression d'avoir appuye sur autre chose. */
    profVue(null);
    miroirSync();
    profEnTete();
    /* Le prix a pu arriver AVANT que le panneau existe : il n'y avait alors
       aucun endroit ou l'ecrire. On le repose a l'ouverture. */
    posePrixNom();
    // on rafraichit le profil a chaque ouverture : il a pu changer ailleurs
    if (etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"profile"}'); } catch (e) {}
    }
    /* On marque la derniere section sans y aller : la rangee reste reperable
       dans le sommaire, et rien n'est demande au serveur tant qu'on n'a pas
       choisi. */
    [].forEach.call(profBoite.querySelectorAll('.swp-t button'), function (b) {
      b.classList.toggle('on', b.dataset.k === profOnglet);
    });
  }
  function profFerme() {
    profOuvert = false;
    if (!profBoite) return;
    rendPanneau();
    profBoite.classList.remove('on');
    /* On revient au sommaire APRES la fermeture, pas pendant : le faire tout
       de suite montrerait le sommaire pendant les 260 ms ou le tiroir glisse
       encore vers la gauche. */
    setTimeout(function () { if (!profOuvert) profVue(null); }, 280);
  }

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
    profVue(k);
    profRend();
    profDemande();
  }

  function profDemande() {
    /* L'apercu ne lit aucune manche : il demande le niveau — que le serveur
       envoie sur `stats` — et le reste par la meme adresse que la page
       publique. Sans cette demande, un joueur qui ouvre son profil sur
       l'apercu voyait ses cartes sans sa barre de niveau, parce que rien ne
       l'avait reclamee. */
    if (profOnglet === 'ap') {
      demandeApercu();
      return;
    }
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
    } else if (e.k === 'pa') {
      /* Un combine porte ses jambes ; un simple pose avant les combines n'a
         que ses deux champs. On retombe dessus plutot que d'afficher un
         pari vide. */
      var jbs = (e.jambes && e.jambes.length) ? e.jambes
              : [{ match: e.match, choix: e.choix, cote: e.cote,
                   domicile: e.domicile, exterieur: e.exterieur }];
      var det = jbs.map(function (j) {
        var nom = nomIssue(j.sport || e.sport, j.issues, j.choix);
        return '<div class="swp-pj">' + ech(j.domicile || '?') + ' – ' + ech(j.exterieur || '?') +
               ' · <b>' + ech(nom) + '</b> @ ' + Number(j.cote || 1).toFixed(2) + '</div>';
      }).join('');
      /* `gagne` vaut null sur un pari rembourse : un match annule rend la
         mise, ce n'est ni une perte ni un gain. Le test doit donc porter sur
         null AVANT de porter sur vrai/faux. */
      var etat = !e.regle ? 'Running' : e.gagne === null ? 'Refunded' : e.gagne ? 'Won' : 'Lost';
      var teinte = !e.regle ? 'n' : e.gagne === null ? 'n' : e.gagne ? 'g' : 'p';
      var somme = !e.regle ? nb(e.rapport) : e.gagne === null ? nb(e.mise) : e.gagne ? nb(e.rapport) : '−' + nb(e.mise);
      var pied = !e.regle ? 'to return' : e.gagne === null ? 'refunded' : e.gagne ? 'returned' : 'stake lost';
      d.innerHTML = '<div class="w"><b>' +
                    (jbs.length > 1 ? jbs.length + '-fold' : 'Single') +
                    ' @ ' + Number(e.cote || 1).toFixed(2) +
                    ' <span class="swp-pe ' + teinte + '">' + etat + '</span></b>' +
                    '<span>' + quand(e.t) + ' · stake ' + nb(e.mise) +
                    /* L'identifiant du pari, en clair et copiable. C'est ce
                       qu'un joueur donne quand il ecrit « mon pari n'a pas
                       ete paye » : sans lui, retrouver de quel pari on parle
                       demande de croiser une heure et un montant, et deux
                       paris poses dans la meme minute ne se distinguent
                       plus. Le meme identifiant apparait au panneau
                       d'administration, ou il se cherche. */
                    (e.id ? ' · <span class="swp-pid" title="Bet reference — tap to copy">' +
                            ech(e.id) + '</span>' : '') + '</span>' + det + '</div>' +
                    '<div class="v"><b class="' + teinte + '">' + somme + '</b>' +
                    '<span>' + pied + '</span></div>';
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
  /* Le cadre du palier, s'il y en a un. Le numero vient du profil public, donc
     il arrive tout seul chez les amis, aux duels et au classement — aucun de
     ces endroits n'a a savoir ce qu'est un palier. */
  function urlCadre(n) {
    var i = Number(n) || 0;
    return (i >= 1 && i <= 10) ? 'media/cadre-' + i + '.webp' : null;
  }
  function poseCadre(el, p) {
    if (!el) return;
    /* Le cadre se GAGNE : celui qui n'a jamais mise n'en a pas. Il apparait a
       la premiere manche, et c'est ce qui en fait autre chose qu'une
       decoration livree avec le compte. */
    var u = (p && p.niveau > 0) ? urlCadre(p.palierNo) : null;
    if (u) { el.style.setProperty('--cadre', 'url("' + u + '")'); el.classList.add('swcad'); }
    else { el.classList.remove('swcad'); el.style.removeProperty('--cadre'); }
  }
  function peintVisage(el, p) {
    poseCadre(el, p);
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
    /* LE CADRE DU PALIER autour de la photo. C'est la seule chose de son
       niveau qu'un joueur voit en permanence, sur les douze pages — et c'est
       donc la qu'il compte le plus.
       MOI porte le palier ; s'il n'est pas encore arrive, NIVEAU l'a. */
    poseCadre(profBtn, (MOI && MOI.niveau !== undefined) ? MOI
      : (NIVEAU ? { niveau: NIVEAU.niveau, palierNo: NIVEAU.palierNo } : null));
    /* Sans cadre — donc avant la premiere mise — on garde l'anneau de couleur :
       un bouton totalement nu n'apprend rien. */
    if (!profBtn.classList.contains('swcad') && NIVEAU && NIVEAU.niveau > 0) {
      profBtn.style.borderColor = couleurPalier(NIVEAU.palier);
      profBtn.style.boxShadow = '0 0 0 1px ' + couleurPalier(NIVEAU.palier) + '66';
    }
    titreBouton();
    if (pastille) profBtn.appendChild(pastille);
  }
  /* UN SEUL endroit qui ecrit l'infobulle du bouton. Deux fonctions
     l'ecrivaient chacune de leur cote : celle des amis passait apres et
     effacait le niveau a chaque fois qu'il n'y avait aucune notification —
     c'est-a-dire presque toujours. */
  function titreBouton() {
    if (!profBtn) return;
    var t = [];
    if (EN_ATTENTE) t.push(EN_ATTENTE + ' friend request' + (EN_ATTENTE === 1 ? '' : 's') + ' waiting');
    if (NON_LUS) t.push(NON_LUS + ' $SWOGE transfer' + (NON_LUS === 1 ? '' : 's') + ' received');
    if (NIVEAU && NIVEAU.niveau > 0) t.push('Level ' + NIVEAU.niveau + ' · ' + NIVEAU.palier);
    profBtn.title = t.length ? t.join(' · ') : 'Your profile';
  }
  function profEnTete() {
    if (!profBoite) return;
    peintBouton();
    /* Le meme anneau de palier autour de la grande photo. Il n'est sur le
       petit bouton que d'un cheveu ; c'est ici qu'on le regarde. */
    var av = profBoite.querySelector('.swp-av');
    /* MOI vient du serveur avec son palier ; si la page n'a que NIVEAU sous la
       main (elle arrive parfois avant le profil), on le lui prete. */
    peintVisage(av, (MOI && MOI.niveau !== undefined) ? MOI
      : (NIVEAU ? { photo: MOI && MOI.photo, address: MOI && MOI.address,
                    visage: MOI && MOI.visage,
                    niveau: NIVEAU.niveau, palierNo: NIVEAU.palierNo } : MOI));
    if (av && NIVEAU && NIVEAU.niveau > 0) {
      var c = couleurPalier(NIVEAU.palier);
      av.style.borderColor = c;
      av.style.boxShadow = '0 0 0 2px ' + c + '44';
      av.title = 'Level ' + NIVEAU.niveau + ' · ' + NIVEAU.palier;
    }
    profBoite.querySelector('.swp-me .nm b').innerHTML =
      ech(MOI.name || 'no name yet') + pastilleNiveau(NIVEAU || MOI);
    /* « .nm span » PRENAIT LA PASTILLE DE NIVEAU. Le combinateur est un
       descendant, et la pastille — un <span class="swlv"> pose a l'interieur
       du <b> par la ligne du dessus — arrive avant l'adresse dans l'ordre du
       document. On ecrivait donc l'adresse par-dessus le palier : le joueur
       ne voyait jamais son niveau, et son adresse s'affichait dans une
       gelule doree qui n'etait pas faite pour elle. Enfant DIRECT. */
    var adr = profBoite.querySelector('.swp-me .nm > span');
    adr.textContent = MOI.address || '';
    if (MOI.address) adr.title = MOI.address;
    poseLienProfil();
  }

  /* ---------------------------------------------- l'adresse qu'on partage
   *
   * Une page publique que son proprietaire ne sait pas trouver ne se partage
   * pas. Le bouton n'apparait donc qu'a partir du moment ou il y a quelque
   * chose a partager : un NOM choisi. Tant que le joueur s'appelle « 0xab12 »,
   * l'adresse ne lui appartient pas vraiment et ne dit rien de lui.
   */
  function lienProfil() {
    if (!MOI || !MOI.name || !MOI.nomChoisi) return null;
    var base = adresseServeur().replace(/^ws/, 'http').replace(/\/+$/, '');
    return base + '/j/' + encodeURIComponent(MOI.name);
  }
  function poseLienProfil() {
    if (!profBoite) return;
    var hote = profBoite.querySelector('.swp-me');
    if (!hote) return;
    var b = hote.querySelector('.swpart');
    var url = lienProfil();
    if (!url) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'swpart';
      b.title = 'Copy your public profile link';
      hote.appendChild(b);
      b.addEventListener('click', function () {
        var u = lienProfil();
        if (!u) return;
        /* On ouvre AUSSI la page : copier sans rien montrer laisse le doute
           sur ce qu'on vient de mettre dans le presse-papiers. */
        try {
          navigator.clipboard.writeText(u).then(function () {
            b.textContent = '✓ Link copied';
            setTimeout(function () { b.textContent = '🔗 Share my profile'; }, 1800);
          }, function () { window.open(u, '_blank'); });
        } catch (e) { window.open(u, '_blank'); }
      });
    }
    if (b.textContent.indexOf('copied') < 0) b.textContent = '🔗 Share my profile';
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
  /* Le prix du nom, ecrit dans le formulaire AVANT que le joueur tape quoi que
     ce soit. Decouvrir un prix au moment du refus se lit comme une panne ;
     annonce d'avance, il se lit comme une regle. */
  function posePrixNom() {
    if (!profBoite) return;
    var e = profBoite.querySelector('.swp-prix');
    if (!e) return;
    if (!PRIX_NOM || !PRIX_NOM.du) {
      e.className = 'swp-prix';
      e.innerHTML = PRIX_NOM && PRIX_NOM.prix
        ? 'Your name is yours — changing it again is free.'
        : '';
      return;
    }
    var assez = !(PRIX_NOM.solde < PRIX_NOM.du);
    e.className = 'swp-prix' + (assez ? '' : ' ko');
    e.innerHTML = 'A unique name costs <b>' + nb(PRIX_NOM.du, 0) + ' $SWOGE</b>, ' +
      'paid once and <b>burned</b> — nobody else can ever take it.' +
      (assez ? '' : ' You have ' + nb(PRIX_NOM.solde, 0) + '.');
  }

  function enregistre() {
    if (!etat.socket || etat.socket.readyState !== 1) return dit('Not connected.', 'ko');
    var nom = (profBoite.querySelector('.swp-nom').value || '').trim();
    var q = { type: 'setProfile' };
    if (nom && nom !== MOI.name) q.name = nom;
    /* On demande confirmation UNE FOIS, et seulement quand ca coute vraiment.
       Un joueur qui change sa photo ne doit pas voir de fenetre parlant
       d'argent. */
    if (q.name !== undefined && PRIX_NOM && PRIX_NOM.du) {
      if (PRIX_NOM.solde < PRIX_NOM.du)
        return dit('You need ' + nb(PRIX_NOM.du, 0) + ' $SWOGE to claim a unique name — you have ' +
                   nb(PRIX_NOM.solde, 0) + '.', 'ko');
      if (!window.confirm('Claim "' + nom + '" for ' + nb(PRIX_NOM.du, 0) + ' $SWOGE?\n\n' +
                          'Paid once. The tokens are burned, not collected.\n' +
                          'After this, changing your name again is free.')) return;
    }
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
    return '<div class="av"></div><div class="w"><b>' + ech(a.name || court(a.address)) +
      pastilleNiveau(a) + '</b>' +
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
    if (!total) { if (p) p.remove(); titreBouton(); return; }
    if (!p) {
      p = document.createElement('span');
      p.className = 'swpn';
      profBtn.style.position = 'relative';
      profBtn.appendChild(p);
    }
    p.textContent = total > 9 ? '9+' : String(total);
    titreBouton();
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
    if (profOnglet === 'ap') { profEnTete(); return rendApercu(); }
    if (profOnglet === 'am') { profEnTete(); return rendAmis(); }
    if (profOnglet === 'in') { profEnTete(); return rendInvite(); }
    if (profOnglet === 'lb') { profEnTete(); return rendClassement(); }
    var l = profBoite.querySelector('.swp-l');
    var sous = profBoite.querySelector('.swp-sub');
    if (profResume) {
      var mot = profResume.mot || 'event';
      sous.textContent = nb(profResume.lignes, 0) + ' ' + mot + (profResume.lignes === 1 ? '' : 's') +
        (profResume.depuis ? ' since ' + new Date(profResume.depuis).toLocaleDateString('en-US',
          { day: '2-digit', month: 'short', year: 'numeric' }) : '');
    }
    l.innerHTML = '';
    if (profOnglet === 'r') {
      var bn = blocNiveau(); if (bn) l.appendChild(bn);
      var st = blocStats(); if (st) l.appendChild(st);
      var fj = blocFiltre(); if (fj) l.appendChild(fj);
    }
    /* Regroupe par MOIS. Les evenements arrivent du plus recent au plus
       ancien, donc il suffit de poser un bandeau quand le mois change : rien
       a trier, rien a recompter, et ca marche aussi bien sur une page que sur
       dix. Chaque mois se replie — un joueur qui cherche aout n'a pas a
       derouler septembre. */
    var moisCourant = null, corps = null;
    var motItem = (profOnglet === 'bo' || profOnglet === 'bs') ? 'bet' : 'event';
    /* Le filtre par jeu ne touche pas a ce qui est CHARGE — seulement a ce qui
       est montre. Recharger depuis le serveur a chaque pastille ferait un
       aller-retour pour un tri qu'on peut faire ici, et ferait clignoter la
       liste a chaque clic. */
    var montres = (profOnglet === 'r' && filtreJeu)
      ? profItems.filter(function (e) { return (e.j || e.jeu) === filtreJeu; })
      : profItems;
    /* Les deux onglets de paris ne montrent QUE des paris, et chacun ne montre
       que le sien. Le serveur filtre deja — mais un serveur d'une version
       precedente ne connait pas ces `kind` : il tombe alors sur « aucun
       filtre » et rend le journal ENTIER. « Open bets » se remplissait de
       manches de blackjack et de rendements encaisses. Une page mise a jour
       avant le serveur, ou un onglet laisse ouvert pendant un deploiement,
       suffit a produire ca. On refiltre donc ici : c'est peu cher, et ca ne
       peut plus mentir.
       Ce filtre passe AVANT le message « rien ici » — sinon un journal plein
       de manches, filtre a zero pari, dessinerait des bandeaux de mois vides. */
    if (profOnglet === 'bo' || profOnglet === 'bs') {
      var veutRegle = profOnglet === 'bs';
      montres = montres.filter(function (e) {
        return e.k === 'pa' && e.jambes && !!e.regle === veutRegle;
      });
    }
    if (!montres.length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.innerHTML = profCharge ? 'Loading…'
        : !(etat.socket && etat.socket.readyState === 1) ? 'Sign in to see your history.'
        : profOnglet === 'bo' ? 'No bet running.<br>Pick a match on SWOGE Bet.'
        : profOnglet === 'bs' ? 'No settled bet yet.<br>Everything you place lands here once the match is over.'
        : (profOnglet === 'r' && filtreJeu) ? 'No ' + (JEUX[filtreJeu] || filtreJeu) + ' round on this page.'
        : 'Nothing here yet.<br>Everything you play is kept — for good.';
      l.appendChild(v);
      return;
    }
    montres.forEach(function (e) {
      var d = new Date(Number(e.t) || 0);
      var cle = d.getFullYear() + '-' + d.getMonth();
      if (cle !== moisCourant) {
        moisCourant = cle;
        var titre = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        var n = montres.filter(function (x) {
          var y = new Date(Number(x.t) || 0);
          return y.getFullYear() + '-' + y.getMonth() === cle;
        }).length;
        var tete = document.createElement('button');
        tete.className = 'swp-mo'; tete.type = 'button';
        tete.innerHTML = '<span class="ch">▾</span>' + titre +
                         '<i>' + n + ' ' + motItem + (n === 1 ? '' : 's') + '</i>';
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


  /* ==================================================================
   * LES DUELS QUI ATTENDENT — la bulle en bas a droite
   *
   * Une table ouverte au morpion n'est vue par personne tant que quelqu'un
   * n'ouvre pas la page du morpion. Un joueur qui attend un adversaire ne le
   * trouve donc pas, ferme la table, et ne recommence pas. Cette bulle est la
   * pour ca : elle est sur les douze pages, elle porte le NOMBRE de tables qui
   * attendent, et un clic ouvre le panneau — d'ou l'on rejoint directement.
   *
   * Le panneau vient de la GAUCHE alors que le bouton est a droite : la main
   * qui clique ne recouvre pas ce qu'elle vient d'ouvrir.
   * ================================================================== */
  function duelsStyle() {
    if (document.getElementById('swduels-css')) return;
    var c = document.createElement('style');
    c.id = 'swduels-css';
    c.textContent =
      '.swdb{position:fixed;right:16px;bottom:16px;z-index:99998;width:56px;height:56px;' +
      'border-radius:50%;cursor:pointer;border:1px solid rgba(230,165,55,.55);' +
      'background:linear-gradient(180deg,rgba(46,26,10,.96),rgba(20,10,4,.98));' +
      'color:#FFD97A;font-family:inherit;font-size:17px;font-weight:900;letter-spacing:.5px;' +
      'line-height:1;display:flex;align-items:center;' +
      'justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.55);' +
      'transition:transform .15s,border-color .15s;}' +
      '.swdb:hover{transform:translateY(-2px);border-color:#FFC53D;}' +
      '.swdb .swdn{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;' +
      'border-radius:999px;display:flex;align-items:center;justify-content:center;' +
      'font-family:inherit;font-size:11px;font-weight:900;color:#07101F;background:#16D97F;' +
      'box-shadow:0 0 0 2px rgba(7,16,31,.9);animation:swdPop .3s ease-out;}' +
      '@keyframes swdPop{from{transform:scale(.3);}to{transform:scale(1);}}' +
      '.swdp{position:fixed;left:0;top:0;bottom:0;z-index:99999;width:min(340px,86vw);' +
      'transform:translateX(-102%);transition:transform .22s ease-out;' +
      'background:linear-gradient(180deg,rgba(12,16,26,.99),rgba(6,9,16,.99));' +
      'border-right:1px solid rgba(230,165,55,.35);box-shadow:14px 0 40px rgba(0,0,0,.6);' +
      'display:flex;flex-direction:column;font-family:inherit;}' +
      '.swdp.on{transform:translateX(0);}' +
      '.swdp h4{margin:0;padding:15px 46px 11px 14px;font-size:12px;letter-spacing:1px;' +
      'text-transform:uppercase;color:#FFD97A;display:flex;align-items:center;gap:8px;}' +
      '.swdp h4 i{margin-left:auto;font-style:normal;font-size:11px;color:#8DA0C4;}' +
      '.swdp .x{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:8px;' +
      'cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);' +
      'color:#EAF2FF;font-size:15px;line-height:1;}' +
      '.swdl{flex:1;overflow-y:auto;padding:0 12px 14px;}' +
      '.swdt{display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:8px;' +
      'border-radius:11px;background:rgba(255,255,255,.045);' +
      'border:1px solid rgba(255,255,255,.10);}' +
      '.swdt .ic{flex:0 0 auto;width:34px;height:34px;border-radius:9px;display:flex;' +
      'align-items:center;justify-content:center;font-size:16px;' +
      'background:rgba(255,197,61,.12);border:1px solid rgba(255,197,61,.28);}' +
      '.swdt .w{flex:1;min-width:0;}' +
      '.swdt .w b{display:block;font-size:12.5px;font-weight:800;color:#EAF2FF;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swdt .w span{display:block;font-size:10.5px;color:#8DA0C4;margin-top:2px;}' +
      /* Meme piege que dans les lignes du profil : « .swdt .w span » l emporte
         sur « .swlv », et la pastille de niveau tombait a la ligne toute seule
         sous le nom. On redit donc ici, a specificite egale, ce qu elle est. */
      '.swdt .w span.swlv,.swdt .w b span.swlv{display:inline-block;width:auto;' +
      'margin-top:0;font-size:10px;}' +
      '.swdt button{flex:0 0 auto;padding:7px 12px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#07101F;border:0;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);}' +
      '.swdt.mienne{border-color:rgba(255,197,61,.45);background:rgba(255,197,61,.07);}' +
      '.swdt.mienne button{background:rgba(255,255,255,.10);color:#8DA0C4;cursor:default;}' +
      '.swdt button.gh{background:linear-gradient(180deg,#8FD3FF,#3FA9F5);}' +
      /* Le titre de section : les parties en cours ne sont pas des defis a
         relever, il ne faut pas melanger les deux listes. */
      '.swdh{margin:14px 0 8px;font-size:10.5px;letter-spacing:1.1px;font-weight:800;' +
      'text-transform:uppercase;color:#8DA0C4;}' +
      /* Le plateau du spectateur. */
      '.swdw{margin:0 0 12px;border-radius:12px;overflow:hidden;' +
      'background:rgba(63,169,245,.07);border:1px solid rgba(63,169,245,.34);}' +
      '.swdw .hd{display:flex;align-items:center;gap:8px;padding:9px 10px;' +
      'border-bottom:1px solid rgba(255,255,255,.08);}' +
      '.swdw .hd b{flex:1;min-width:0;font-size:12px;font-weight:800;color:#EAF2FF;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swdw .hd .x{position:relative;width:24px;height:24px;font-size:13px;flex:0 0 auto;touch-action:manipulation;}' +
      /* La croix mesurait 24 px de cote : on agrandit la ZONE SENSIBLE a 44 sans toucher au dessin, avec un pseudo-element centre. Grossir le bouton lui-meme aurait pousse le titre du tiroir. */
      '.x::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%);}' +
      '.swdw .gr{display:grid;gap:3px;padding:8px;}' +
      '.swdw .c{display:block;width:100%;aspect-ratio:1/1;border-radius:50%;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);}' +
      '.swdw .gr.jmp .c{border-radius:5px;}' +
      '.swdw .c.sq{background:rgba(0,0,0,.34);}' +
      '.swdw .c.p1{background:linear-gradient(180deg,#FFE08A,#FFC53D);border-color:#FFC53D;}' +
      '.swdw .c.p2{background:linear-gradient(180deg,#8FD3FF,#3FA9F5);border-color:#3FA9F5;}' +
      '.swdw .c.dame{box-shadow:inset 0 0 0 3px rgba(7,16,31,.55);}' +
      '.swdw .c.win{box-shadow:0 0 0 2px #7CE3A0;}' +
      '.swdw .st{padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);' +
      'font-size:11px;font-weight:700;color:#8DA0C4;}' +
      '.swdw .st.fin{color:#7CE3A0;}' +
      '.swdv{padding:22px 14px;text-align:center;font-size:12px;line-height:1.7;color:#8DA0C4;}' +
      '.swdp .pied{padding:11px 14px;border-top:1px solid rgba(255,255,255,.08);' +
      'font-size:11px;line-height:1.6;color:#8DA0C4;}' +
      '.swdp .pied a{color:#FFD97A;text-decoration:none;}' +
      '@media (max-width:520px){.swdb{width:48px;height:48px;font-size:20px;right:12px;bottom:12px;}}';
    document.head.appendChild(c);
  }

  function duelsMonte() {
    if (duelsBtn) return true;
    if (!document.body) return false;
    duelsStyle();
    duelsBtn = document.createElement('button');
    duelsBtn.className = 'swdb';
    duelsBtn.type = 'button';
    duelsBtn.title = 'Open 1v1 matches';
    duelsBtn.innerHTML = 'VS';
    duelsBtn.addEventListener('click', function () { duelsBascule(); });
    document.body.appendChild(duelsBtn);
    /* Elle reste visible meme quand personne n'attend. Une bulle qui
       n'apparait qu'en cas de table ouverte, personne ne sait qu'elle
       existe — et personne n'ouvre donc de table. */

    duelsPan = document.createElement('div');
    duelsPan.className = 'swdp';
    duelsPan.innerHTML = '<h4>1v1 matches<i></i></h4>' +
      '<button class="x" type="button">&times;</button>' +
      '<div class="swdl"></div>' +
      '<div class="pied">Anyone can open a table from a game page. ' +
      'Your stake comes straight back if nobody sits down.</div>';
    duelsPan.querySelector('.x').addEventListener('click', function () { duelsBascule(false); });
    document.body.appendChild(duelsPan);
    return true;
  }

  function duelsBascule(v) {
    if (!duelsMonte()) return;
    duelsOuvert = v === undefined ? !duelsOuvert : !!v;
    duelsPan.classList.toggle('on', duelsOuvert);
    var s = duelsOuvert && sockDuel();
    if (s) { try { s.send('{"type":"duelsTous"}'); } catch (e) {} }
  }

  /* Rejoindre depuis n'importe quelle page : on va sur celle du jeu avec
     l'identifiant de la table, et c'est la que la demande part. Aucune des
     douze pages n'a besoin de savoir que ce panneau existe. */
  function duelsRejoint(t) {
    var page = JEU_PAGE[t.jeu] || JEU_PAGE.p4;
    var ici = location.pathname.split('/').pop();
    if (ici === page) { envoieRejoint(t); duelsBascule(false); return; }
    var q = new URLSearchParams(location.search);
    q.set('join', t.id);
    location.href = page + '?' + q.toString();
  }
  function envoieRejoint(t) {
    if (!etat.socket || etat.socket.readyState !== 1) return;
    try {
      etat.socket.send(JSON.stringify(
        (t.jeu || 'p4') === 'p4' ? { type: 'p4Join', id: t.id } : { type: 'duelJoin', id: t.id }));
    } catch (e) {}
  }
  /* On arrive avec ?join= : la page vient de s'authentifier, on s'assied. Le
     jeu se peint tout seul — sa propre page ecoute deja l'arrivee d'une
     partie, il n'y a donc rien a lui apprendre. */
  function duelsAutoRejoint() {
    var id = null;
    try { id = new URLSearchParams(location.search).get('join'); } catch (e) {}
    if (!id) return;
    try {
      var u = new URL(location.href);
      u.searchParams.delete('join');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
    var t = DUELS.filter(function (x) { return x.id === id; })[0];
    envoieRejoint(t || { id: id, jeu: id.slice(0, 2) });
  }

  function rendDuels() {
    if (!duelsMonte()) return;
    var moi = MOI && MOI.address ? String(MOI.address).toLowerCase() : null;
    var libres = DUELS.filter(function (t) { return !moi || String(t.createur).toLowerCase() !== moi; });

    var p = duelsBtn.querySelector('.swdn');
    if (libres.length) {
      if (!p) { p = document.createElement('span'); p.className = 'swdn'; duelsBtn.appendChild(p); }
      p.textContent = libres.length > 9 ? '9+' : String(libres.length);
      duelsBtn.title = libres.length + ' player' + (libres.length === 1 ? '' : 's') + ' waiting for an opponent';
    } else if (p) { p.remove(); duelsBtn.title = 'Open 1v1 matches'; }
    if (!libres.length && EN_COURS.length)
      duelsBtn.title = EN_COURS.length + ' match' + (EN_COURS.length === 1 ? '' : 'es') + ' being played';

    duelsPan.querySelector('h4 i').textContent = DUELS.length ? DUELS.length + ' open' : '';
    var l = duelsPan.querySelector('.swdl');
    l.innerHTML = '';
    /* Personne n'attend n'est pas la meme chose que rien ne se passe : le mot
       « vide » ne se met que si RIEN ne se joue non plus, sinon on annoncerait
       un site mort au-dessus d'une partie en cours. */
    if (!DUELS.length && !EN_COURS.length) {
      var v = document.createElement('div');
      v.className = 'swdv';
      v.innerHTML = 'Nobody is waiting right now.<br>Open a table and it shows up here, ' +
                    'on every page of the site.';
      l.appendChild(v);
      return;
    }
    DUELS.forEach(function (t) {
      var mienne = moi && String(t.createur).toLowerCase() === moi;
      var d = document.createElement('div');
      d.className = 'swdt' + (mienne ? ' mienne' : '');
      /* Le niveau de l'adversaire, ici, n'est pas decoratif : on ne s'assied
         pas de la meme facon face a un niveau 8 et face a un niveau 62. */
      d.innerHTML = '<div class="ic">' + (JEU_SIGNE[t.jeu] || '⚔️') + '</div>' +
        '<div class="w"><b>' + ech(t.nom || court(t.createur)) + pastilleNiveau(t) + '</b>' +
        '<span>' + (JEU_NOM[t.jeu] || t.jeu) + ' · ' + nb(t.mise, 0) + ' $SWOGE</span></div>';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = mienne ? 'Yours' : 'Join';
      if (!mienne) b.addEventListener('click', function () { duelsRejoint(t); });
      d.appendChild(b);
      l.appendChild(d);
    });
    rendEnCours(l);
    /* La liste vient d'etre reconstruite : si on regardait une partie, le
       plateau est parti avec le reste, il faut le remettre. Sans ca il
       disparaitrait au premier rafraichissement du vestibule. */
    if (REGARDE) rendRegarde();
  }

  /* ------------------------------------------------- regarder une partie
   * Un vestibule qui ne montre que l'ATTENTE parait mort a quatre heures du
   * matin, alors qu'une partie peut tres bien etre en train de se jouer. Les
   * parties en cours se listent donc juste en dessous, et se regardent.
   *
   * Le plateau se dessine ICI, dans la bulle partagee par les douze pages, et
   * non dans chaque page de jeu : une seule implementation, disponible partout,
   * et aucune chirurgie sur des pages de jeu qui fonctionnent.
   */
  var COTE_JEU = { p4: 7, mp: 3, dm: 8 };
  function rendEnCours(l) {
    if (!EN_COURS.length) return;
    var t = document.createElement('div');
    t.className = 'swdh';
    t.textContent = EN_COURS.length + ' match' + (EN_COURS.length === 1 ? '' : 'es') + ' being played';
    l.appendChild(t);
    EN_COURS.forEach(function (m) {
      var j = m.joueurs || [];
      var d = document.createElement('div');
      d.className = 'swdt';
      d.innerHTML = '<div class="ic">' + (JEU_SIGNE[m.jeu] || '⚔️') + '</div>' +
        '<div class="w"><b>' + ech((j[0] && j[0].nom) || '?') + pastilleNiveau(j[0] || {}) +
        ' <i>vs</i> ' + ech((j[1] && j[1].nom) || '?') + pastilleNiveau(j[1] || {}) + '</b>' +
        '<span>' + (JEU_NOM[m.jeu] || m.jeu) + ' · ' + nb(m.mise * 2, 0) + ' $SWOGE in the pot</span></div>';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'gh';
      b.textContent = 'Watch';
      b.addEventListener('click', function () { regarde(m.id); });
      d.appendChild(b);
      l.appendChild(d);
    });
  }

  function regarde(id) {
    var s = sockDuel();
    if (!s) return;
    try { s.send(JSON.stringify({ type: 'duelWatch', id: id })); } catch (e) {}
  }
  function cesseRegarder() {
    REGARDE = null; REGARDE_FINI = false;
    var b = duelsPan && duelsPan.querySelector('.swdw');
    if (b) b.remove();
    var s = sockDuel();
    if (s) { try { s.send('{"type":"duelUnwatch"}'); } catch (e) {} }
  }

  /* Le plateau, en lecture seule. Les trois jeux partagent la meme forme
     d'etat — une grille a plat, un tour, un gagnant — donc un seul dessin les
     couvre tous les trois. Le cote vient de la TABLE, pas de la racine carree
     du nombre de cases : le Connect 4 fait 7 x 6, et sept colonnes deduites
     d'une racine carree en donneraient six. */
  function rendRegarde() {
    if (!duelsMonte() || !REGARDE) return;
    var fini = REGARDE_FINI;
    var m = REGARDE;
    var cote = COTE_JEU[m.jeu] || Math.round(Math.sqrt((m.grille || []).length)) || 3;
    var boite = duelsPan.querySelector('.swdw');
    if (!boite) {
      boite = document.createElement('div');
      boite.className = 'swdw';
      duelsPan.querySelector('.swdl').insertBefore(boite, duelsPan.querySelector('.swdl').firstChild);
    }
    var n = m.noms || [];
    var qui = m.gagnant ? (m.gagnant === 3 ? 'Draw' : ech(n[m.gagnant - 1] || '?') + ' wins')
                        : ech(n[(m.tour || 1) - 1] || '?') + ' to play';
    boite.innerHTML =
      '<div class="hd"><b>' + ech(n[0] || '?') + ' vs ' + ech(n[1] || '?') + '</b>' +
      '<button type="button" class="x">✕</button></div>' +
      '<div class="gr j' + ech(m.jeu || '') + '" style="grid-template-columns:repeat(' + cote + ',1fr)"></div>' +
      '<div class="st' + (m.gagnant ? ' fin' : '') + '">' + qui +
      ' · ' + nb((m.mise || 0) * 2, 0) + ' $SWOGE' + (fini ? ' · finished' : '') + '</div>';
    var gr = boite.querySelector('.gr');
    (m.grille || []).forEach(function (v, i) {
      var c = document.createElement('i');
      /* Aux dames une dame vaut 3 ou 4, un pion 1 ou 2 : on ramene au
         proprietaire et on marque la dame d'un point. */
      var proprio = (v === 3 || v === 1) ? 1 : (v === 4 || v === 2) ? 2 : 0;
      /* Aux dames une case sur deux est sombre : sans ce damier on ne lit plus
         la diagonale sur laquelle les pions avancent. */
      var noire = m.jeu === 'dm' && ((Math.floor(i / cote) + (i % cote)) % 2 === 1);
      c.className = 'c' + (proprio ? ' p' + proprio : '') + ((v === 3 || v === 4) ? ' dame' : '') +
                    (noire ? ' sq' : '') +
                    ((m.ligne || []).indexOf(i) >= 0 ? ' win' : '');
      gr.appendChild(c);
    });
    boite.querySelector('.x').addEventListener('click', cesseRegarder);
  }

  // Dix fois par seconde : le dernier chiffre coule sans que ca coute rien.
  /* On tente la connexion autonome apres le chargement : la barre doit exister
     pour y poser la pastille. */
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { connecteSeul(); rendDuels(); });
  else { connecteSeul(); rendDuels(); }

  setInterval(rend, 100);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { rend(); });
  else rend();
})();
