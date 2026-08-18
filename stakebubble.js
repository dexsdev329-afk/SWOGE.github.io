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

  /* Est-ce que la PAGE possede sa propre socket ? On tranche UNE SEULE FOIS,
   * au premier passage, et on s'en tient a cette reponse.
   *
   * Relire `#bal` a chaque reconnexion etait un piege qui se refermait tout
   * seul : le badge de solde que `poseSolde` ajoute porte lui-meme cet
   * identifiant. Des la premiere authentification, une page sans socket a elle
   * — le hall des jeux, l'accueil — se mettait donc a ressembler a une page de
   * jeu, et la reconnexion s'arretait la. La socket tombait (mise en veille de
   * l'onglet, coupure de reseau, ou la veille du solde qui la ferme elle-meme
   * quand elle est muette), plus rien ne la relevait : le solde gelait, et le
   * profil repondait « Not connected. » a chaque enregistrement jusqu'a ce que
   * le joueur pense a recharger la page.
   */
  var pageSocketPropre = null;
  var socketSeul = null;
  function connecteSeul() {
    if (pageSocketPropre === null) pageSocketPropre = !!document.getElementById('bal');
    if (pageSocketPropre) return;                    // la page a deja sa socket
    /* Une seule socket autonome a la fois : deux reconnexions declenchees
       ensemble (la fermeture et le retour d'onglet) en ouvriraient deux, et la
       plus ancienne finirait par effacer `etat.socket` en se fermant. */
    if (socketSeul && socketSeul.readyState <= 1) return;
    var jeton = jetonRange();
    if (!jeton) { poseConnexion(); return ecouteAnonyme(); }   // jamais connecte
    var w;
    try { w = new window.WebSocket(adresseServeur()); } catch (e) { return; }
    socketSeul = w;
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
    w.addEventListener('close', function () {
      if (socketSeul === w) socketSeul = null;
      /* Une socket fermee ne doit plus passer pour vivante. `etat.socket` est
         celle par laquelle partent un virement et un nom paye : un envoi sur
         une socket morte est perdu sans un mot, et le formulaire croit avoir
         enregistre. */
      if (etat.socket === w) etat.socket = null;
      setTimeout(connecteSeul, 3000);
    });
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
  /* Le solde n'etait nulle part : il etait PEINT dans la barre et jamais
     retenu. Impossible de l'afficher ailleurs sans le relire dans le DOM —
     ce qui aurait fait dependre l'en-tete du profil du format d'affichage de
     la barre (« 1.28M » et non 1284500). On garde donc le nombre. */
  var SOLDE = null;
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
        '@media (max-width:520px){.swbal{font-size:11px;padding:5px 10px;}}' +
        /* Le mot « $SWOGE » colle au solde s'efface sur telephone, comme sur les
           pages de jeu — swogebuy.js y fait la meme chose depuis longtemps, mais
           par un selecteur qui ne peut pas atteindre ce badge-ci : il cherche un
           noeud de TEXTE nu, et celui-la est dans un <em>. Le hall etait donc la
           seule barre a le garder. La pastille doree est seule de sa couleur, et
           celle d'a cote commence par un dollar : le mot n'apprend rien, et il
           prend la place de la valeur en dollars. */
        '@media (max-width:640px){.swbal em{display:none;}}';
      document.head.appendChild(css);
      soldeSeul = document.createElement('span');
      soldeSeul.className = 'swbal';
      soldeSeul.innerHTML = '<span class="pt"></span><b id="bal">—</b><em>$SWOGE</em>';
      var avant = barre.querySelector('.menubtn, .buy') || null;
      if (avant) barre.insertBefore(soldeSeul, avant); else barre.appendChild(soldeSeul);
    }
    var n = parseFloat(v || 0);
    SOLDE = isNaN(n) ? SOLDE : n;
    if (profOuvert) peintChiffres();
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
    /* ---- LU SUR TOUS LES MESSAGES, SANS LISTE ----
     *
     * La serie, la pastille et le coffre du jour arrivent sur `auth`, sur
     * `bonus`, sur `shop`, sur `questClaimed`… Ma premiere version enumerait
     * les types qui les portent : `auth` n'y etait pas, et la pastille restait
     * eteinte a l'ouverture de la page — c'est-a-dire au seul moment ou elle
     * sert. Une liste de types est une liste qu'on oublie de tenir a jour.
     *
     * `recoitAttente` ne touche que les champs PRESENTS, donc le lire partout
     * ne coute rien et ne peut rien effacer. */
    if (m && typeof m === 'object' &&
        (m.attente || m.offert || (m.bonus && m.bonus.streak) || m.type === 'streakClaimed')) {
      recoitAttente(m);
      if (m.niveau) NIVEAU = m.niveau;
      pastilleAmis();
      if (profOuvert) profEnTete();
    }
    if (m.type === 'profile') {
      etat.socket = ev.target;
      if (m.avatars) VISAGES = m.avatars;
      if (m.uploaded) { versionPhoto++; dit('Photo saved — other players see it now.', 'ok'); }
      if (m.profile) MOI = m.profile;
      if (m.prixNom) { PRIX_NOM = m.prixNom; posePrixNom(); }
      /* Un nom unique retire 1000 $SWOGE du solde, sur-le-champ. Le serveur
         renvoie le solde a jour avec la reponse, mais chaque page lit le sien
         sur un message `balance` a elle : on le REDEMANDE plutot que
         d'apprendre a douze pages a lire ce champ-ci. Sans ca, le joueur voit
         son ancien solde jusqu'a la manche suivante et croit n'avoir rien
         paye. */
      if (m.balance != null) rafraichitSolde();
      if (m.friends) AMIS = m.friends;
      if (m.pending !== undefined) EN_ATTENTE = m.pending;
      if (m.unread !== undefined) NON_LUS = m.unread;
      if (m.stats) { STATS = m.stats; noteFrais(); }
      if (m.niveau) NIVEAU = m.niveau;
      recoitAttente(m);
      pastilleAmis();
      profEnTete(); if (profOnglet === 'am' || profOnglet === 'in') profRend();
    }
    if (m.type === 'unread') { NON_LUS = m.unread || 0; pastilleAmis(); }
    /* Un seul lecteur pour tous les messages qui portent ces champs. Ecrit a
       chaque endroit, il aurait fini par en oublier un — et c'est la pastille
       qui serait restee allumee sur une recompense deja prise. */
    if (m.type === 'streakClaimed') {
      toast('🔥 Day ' + m.day + ' — ' + nb(m.reward, 0) + ' $SWOGE' +
            (m.xp ? ' · +' + m.xp + ' XP' : ''), 'good');
    }
    if (m.type === 'referral' || m.type === 'referralClaimed') {
      PARRAIN = m;
      if (m.type === 'referralClaimed') { toast('✅ Claimed ' + nb(m.montant) + ' $SWOGE from your invites', 'ok'); rafraichitSolde(); }
      if (m.nouveau) toast('🎉 ' + m.nouveau + ' joined with your invite link', 'ok');
      /* ---- LE SEUL RAPPEL QU'INVITER PAIE ----
       *
       * Le lien accroche se fetait deja, mais c'est le seul evenement qui se
       * voyait : ensuite les gains murissaient en silence, et l'onglet
       * « Invite » se consultait une fois puis s'oubliait. Le serveur previent
       * maintenant au PREMIER gain de la journee d'un filleul — pas a chaque
       * manche, sinon un joueur actif noierait tout le reste. */
      if (m.rapporte) toast('🤝 ' + m.rapporte + ' is earning you a share', 'ok');
      /* Le lien accroche : on efface le code garde de cote, sinon on
         retenterait a chaque page pour rien. */
      if (m.parrain) { try { localStorage.removeItem('swogeRef'); } catch (e) {} }
      if (profOnglet === 'in') profRend();
    }
    if (m.type === 'leaderboard') { CLASSEMENT = m; if (profOnglet === 'lb') profRend(); }
    /* La boutique. Le serveur repond toujours l'etat COMPLET — catalogue et
       inventaire —, et y ajoute `gagne` quand la reponse suit une ouverture.
       La page n'a donc rien a recoller elle-meme. */
    if (m.type === 'shop') {
      if (m.error) { toast(m.error, 'bad'); sceneFerme(); }
      BOUTIQUE = m;
      if (m.saison) SAISON = m.saison;      // c'est le serveur qui tranche
      if (m.gagne && m.catalogue) {
        var rr = (m.catalogue.raretes || []).filter(function (x) { return x.cle === m.gagne.rarete; })[0];
        sceneRevele(m.gagne, rr && rr.couleur, rr && rr.nom);
      }
      if (profOnglet === 'sh' || profOnglet === 'cl') profRend();
    }
    /* Les missions du jour arrivent avec les quetes, sur trois messages
       differents selon la page. On les garde ici, et on decore ensuite. */
    if (m.quests) { MISSIONS = m.quests; surveilleMissions(); if (profOuvert) peintChiffres(); }
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
    ['You', [['ap', 'Overview'], ['hi', 'History']]],
    /* « Withdraw » et « Staking » tout court ne peuvent plus rester : le
       tiroir porte aussi les entrees du menu de la page, ou les memes mots
       designent l'ACTION — retirer, miser au staking. Deux rangees du meme
       nom a six lignes d'ecart, l'une qui ouvre un formulaire et l'autre
       une liste, on en essaie une sur deux. Le pluriel et le mot
       « history » les separent, et la place est la depuis que le rail a
       laisse sa largeur a la liste. */
    /* ---- CINQ RANGEES POUR UNE ----
     *
     * Manches, depots, retraits, staking et transferts occupaient cinq des
     * dix-neuf rangees du tiroir — vingt-six pour cent du menu pour la
     * categorie qu'on consulte le moins. Ils racontent tous la meme chose :
     * ce qui s'est PASSE. Une seule porte, et le choix se fait a l'interieur,
     * la ou il ne coute plus une place dans la liste.
     *
     * Le groupe « History » disparait avec eux : un titre de groupe au-dessus
     * d'une rangee unique qui porte le meme mot ne dit rien deux fois. */

    /* Un pari pose disparaissait de la vue des qu'on quittait SWOGE Bet : on
       ne savait plus ce qu'on avait en cours, ni depuis quand. Les deux
       onglets separent ce qui est ENCORE EN JEU de ce qui est solde — ce ne
       sont pas les memes questions, et les melanger noie la premiere. */
    ['Bets', [['bo', 'Open bets'], ['bs', 'Settled bets']]],
    ['People',  [['am', 'Friends'], ['in', 'Invite']]],
    /* « Ranking » tout court ne peut plus rester : la boutique en a un aussi,
       douze rangees plus haut, et il designe la collection. Deux entrees du
       meme nom a deux endroits, on en ouvre une sur deux — et jamais la
       bonne du premier coup. */
    ['Standing', [['lb', 'Leaderboard']]],
  ];
  var ONGLETS = FAMILLES.reduce(function (t, f) { return t.concat(f[1]); }, []);
  var VISAGES = [], MOI = { name: null, visage: null, address: null };
  var AMIS = { amis: [], recues: [], envoyees: [] }, EN_ATTENTE = 0, RECHERCHE = [];
  var NON_LUS = 0, PARRAIN = null, STATS = null, CLASSEMENT = null, NIVEAU = null;
  /* La serie du jour, ce qui attend le joueur, et le coffre offert. Les trois
     arrivent avec l'authentification et non sur demande : une pastille qui
     s'allume seulement quand on pense a regarder ne ramene personne. */
  var SERIE = null, ATTENTE = null, OFFERT = null;
  /* Le SOUS-ONGLET de l'historique. Le serveur ne connait pas « hi » : il
     attend un genre precis. C'est donc cette variable, et non `profOnglet`,
     qui part dans la demande et qui filtre la reponse. */
  var HISTO = 'r';
  var HISTO_ONGLETS = [['r', 'Rounds'], ['dep', 'Deposits'], ['wd', 'Withdrawals'],
                       ['st', 'Staking'], ['tr', 'Transfers']];
  var PRIX_NOM = null;                    // { prix, du, brule, solde }
  var BOUTIQUE = null;                    // { catalogue, inventaire, saisons, gagne? }
  /* La saison REGARDEE. Ce n'est qu'un souhait : le serveur decide, et si elle
     est fermee il renvoie la premiere. On reprend donc toujours le numero de
     sa reponse plutot que de garder le notre — deux endroits qui croient
     savoir quelle saison est affichee finiraient par ne plus etre d'accord,
     et c'est la planche qui montrerait les mauvais objets. */
  var SAISON = 1;
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
      /* ---- LE TIROIR S'ELARGIT SUR GRAND ECRAN ----
       *
       * Il plafonnait a 440 px : quarante de plus que sur telephone, pour un
       * ecran trois fois plus large. Tout le monde lisait la version
       * telephone, y compris sur un 27 pouces, et la planche de collection y
       * tenait des cases de 78 px alors qu'il y avait la place pour le double.
       *
       * Deux paliers plutot qu'un seul saut : a 900 px on a la place d'un
       * vrai panneau, a 1280 celle d'un panneau confortable. Le `vw` garde la
       * main sur les fenetres etroites — un navigateur a 950 px de large ne
       * doit pas se faire manger les deux tiers par un tiroir. */
      '@media (min-width:900px){.swp{width:min(58vw,600px);}}' +
      '@media (min-width:1280px){.swp{width:min(46vw,760px);}}' +
      /* Le nom de l'objet suit la case : a 9,5 px sur une vignette de 123, il
         se lisait comme une note de bas de page sous un poster. */
      '@media (min-width:900px){.swb-o{font-size:11px;padding:6px 6px 3px;}' +
        '.swb-r{gap:7px;}}' +
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
      /* La rangee en attente : meme forme que les autres pour qu'elle tienne
         dans la colonne, mais eteinte, sans chevron et sans curseur — rien
         n'invite a appuyer. */
      '.swp-t .swp-att{opacity:.42;cursor:default;font-style:italic;}' +
      '.swp-t .swp-att::after{content:"";padding:0;}' +
      /* ---- LA BOUTIQUE ----
         Les coffres en rangee, l'inventaire en grille. La rarete est portee
         par la COULEUR de la bordure et rien d'autre : un objet se reconnait
         de loin a sa teinte, sans lire une etiquette. */
      '.swb-off{display:flex;align-items:center;gap:11px;text-align:left;width:100%;' +
        'margin:0 0 13px;padding:11px 13px;border-radius:14px;font:inherit;cursor:pointer;' +
        'border:1px solid rgba(124,255,155,.45);background:rgba(124,255,155,.10);' +
        'color:#DFF6E4;transition:background .15s,border-color .15s;}' +
      '.swb-off:hover:not(:disabled){background:rgba(124,255,155,.16);border-color:rgba(124,255,155,.7);}' +
      '.swb-off .cf{flex:0 0 auto;width:52px;height:52px;object-fit:contain;}' +
      '.swb-off .n{display:block;font-weight:800;font-size:13.5px;color:#C8FFD6;}' +
      '.swb-off .o{display:block;font-size:10.5px;color:#8DA0C4;margin-top:2px;}' +
      '.swb-off .p{margin-left:auto;font-weight:800;font-size:12px;letter-spacing:.1em;color:#7CFF9B;}' +
      /* Pris : la carte reste, elle ne disparait pas. Un panneau qui change de
         forme selon l heure fait douter de ce qu on y a vu la veille. */
      '.swb-off.pris{opacity:.5;cursor:default;border-color:rgba(255,255,255,.12);' +
        'background:rgba(255,255,255,.04);}' +
      '.swb-off.pris .n,.swb-off.pris .p{color:#8DA0C4;}' +
      '.swb-c{display:grid;gap:9px;margin:2px 0 14px;}' +
      '.swb-cof{display:flex;align-items:center;gap:11px;text-align:left;width:100%;' +
        'padding:10px 12px;border-radius:13px;cursor:pointer;' +
        'background:linear-gradient(180deg,rgba(24,34,62,.95),rgba(10,15,30,.96));' +
        'border:1px solid rgba(255,197,61,.28);color:#E8EEFA;font:inherit;}' +
      '.swb-cof:disabled{opacity:.42;cursor:not-allowed;}' +
      /* LE COFFRE SUR LE BOUTON. Un prix et cinq pourcentages ne donnent pas
         envie d'appuyer ; un coffre, si. Il se retire tout seul si le dessin
         manque, et le bouton retombe alors sur sa mise en page d'origine. */
      '.swb-cof .cf{flex:0 0 auto;width:52px;height:52px;object-fit:contain;' +
        'margin:-4px 0 -4px -2px;filter:drop-shadow(0 3px 7px rgba(0,0,0,.5));}' +
      '.swb-gain .cf.ouv{flex:0 0 auto;width:46px;height:46px;object-fit:contain;' +
        'margin-right:-3px;filter:drop-shadow(0 0 10px rgba(255,200,90,.35));}' +
      '@media (min-width:900px){.swb-cof .cf{width:64px;height:64px;}}' +
      '.swb-cof .n{font-weight:800;font-size:13.5px;}' +
      '.swb-cof .p{margin-left:auto;color:#FFD97A;font-weight:800;white-space:nowrap;}' +
      '.swb-cof .o{display:block;font-size:10.5px;color:#8DA0C4;margin-top:2px;}' +
      '.swb-ch{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;margin:-8px 2px 14px;}' +
      '.swb-ch span{color:#8DA0C4;}' +
      '.swb-ch b{font-weight:800;}' +
      '.swb-fam{display:flex;align-items:baseline;gap:7px;margin:13px 2px 5px;}' +
      '.swb-fam b{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#E7C97A;}' +
      '.swb-fam i{font-style:normal;font-size:11px;color:#8DA0C4;margin-left:auto;}' +
      '.swb-fam.plein i{color:#7CFF9B;font-weight:800;}' +
      '.swb-mention{font-size:10.5px;color:#8DA0C4;line-height:1.5;margin:-2px 2px 4px;font-style:italic;}' +
      '.swb-gain .pv{font-style:italic;margin-top:2px;line-height:1.35;}' +
      '.swb-gain .num{font-weight:800;letter-spacing:.4px;margin-top:3px;}' +
      '.swb-ed{font-style:normal;margin-top:-2px;}' +
      '.swb-ed b{color:#E7C97A;}' +
      '.swb-course{margin:2px 0 13px;padding:11px 13px;border-radius:13px;' +
        'background:linear-gradient(180deg,rgba(46,36,10,.92),rgba(14,11,4,.95));' +
        'border:1px solid rgba(255,197,61,.34);}' +
      '.swb-course .t{font-size:11px;letter-spacing:1.3px;text-transform:uppercase;' +
        'color:#FFD97A;font-weight:800;margin-bottom:7px;}' +
      '.swb-course .l{font-size:12.5px;line-height:1.75;}' +
      '.swb-course .l b{color:#FFE9A8;}' +
      '.swb-course .l span{color:#8DA0C4;}' +
      '.swb-course .l.pris{opacity:.55;}' +
      '.swb-course .l.pris span{color:#7CFF9B;}' +
      '.swb-course .s{font-size:10.5px;color:#8DA0C4;margin-top:6px;font-style:italic;}' +
      '.swb-course.finie{opacity:.6;}' +
      '.swb-course.gagne{border-color:#7CFF9B;' +
        'background:linear-gradient(180deg,rgba(12,46,26,.94),rgba(4,16,10,.96));}' +
      '.swb-course.gagne .t{color:#7CFF9B;}' +
      /* ---- LA SCENE D'OUVERTURE ----
         Elle est au-dessus du tiroir ET du voile de la page : c'est le seul
         moment ou plus rien d'autre ne compte. */
      /* Le voile monte a .96 avec un flou : a .88 les panneaux du tiroir
         restaient lisibles derriere et se battaient avec le nom du fruit —
         on lisait « 45% Common » a travers « Miracle Fruit ». Le flou fait
         le reste du travail sans rendre l'ecran opaque. */
      '.swb-scene{position:fixed;inset:0;z-index:2147483100;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'background:rgba(3,5,12,.96);-webkit-backdrop-filter:blur(7px);' +
        'backdrop-filter:blur(7px);opacity:0;pointer-events:none;' +
        'transition:opacity .25s;--teinte:#8DA0C4;' +
        /* La scene est posee sur le body, elle heritait donc de la police de
           la PAGE — Space Mono sur les tables, Orbitron sur la roue. Un nom
           de fruit en machine a ecrire n'a pas l'air d'une recompense. */
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,' +
        '"Helvetica Neue",Arial,sans-serif;}' +
      '.swb-scene.on{opacity:1;pointer-events:auto;}' +
      /* Le halo prend la couleur de la rarete AVANT que le nom s ecrive. */
      '.swb-scene .halo{position:absolute;width:min(86vw,520px);aspect-ratio:1;' +
        'border-radius:50%;background:radial-gradient(circle,var(--teinte),transparent 62%);' +
        'opacity:0;transition:opacity .5s;filter:blur(28px);}' +
      '.swb-scene.ouvert .halo{opacity:.5;animation:swbPulse 2.4s ease-out infinite;}' +
      '@keyframes swbPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}' +
      '.swb-scene .boite{position:relative;width:min(74vw,360px);aspect-ratio:1;' +
        'display:flex;align-items:center;justify-content:center;}' +
      /* Le fruit finit PLUS HAUT et PLUS GRAND que la boite : sans marge, il
         serait rogne en haut sur un ecran court. */
      '.swb-scene .boite{margin-top:6vh;}' +
      '.swb-scene .cof{width:100%;height:100%;object-fit:contain;' +
        'filter:drop-shadow(0 14px 30px rgba(0,0,0,.7));}' +
      /* Le tremblement dit « il se passe quelque chose » pendant l attente
         reseau. Il s arrete net a l ouverture — un coffre ouvert qui tremble
         encore se lirait comme un defaut. */
      '.swb-scene.on:not(.ouvert) .cof{animation:swbTremble .42s ease-in-out infinite;}' +
      '@keyframes swbTremble{0%,100%{transform:translate3d(0,0,0) rotate(0);}' +
        '25%{transform:translate3d(-4px,1px,0) rotate(-1.6deg);}' +
        '75%{transform:translate3d(4px,-1px,0) rotate(1.6deg);}}' +
      /* ---- LE COFFRE S'EFFACE DEVANT LE FRUIT ----
         Il rebondit a l'ouverture, puis RECULE : il retrecit un peu et
         s'assombrit pendant que le fruit monte. Sans ce retrait, deux objets
         de meme taille se disputent le centre et l'oeil ne sait pas lequel
         regarder — c'est ce qui rendait le fruit minuscule alors qu'il ne
         l'etait pas. */
      '.swb-scene.ouvert .cof{animation:swbBond 1.5s cubic-bezier(.2,1.6,.4,1) forwards;}' +
      '@keyframes swbBond{0%{transform:scale(.86);filter:brightness(1);}' +
        '18%{transform:scale(1.08);}' +
        '34%{transform:scale(1);filter:brightness(1.25);}' +
        '100%{transform:scale(.84) translateY(9%);filter:brightness(.62);}}' +
      /* ---- LE FRUIT SORT, ET IL GRANDIT SANS S'ARRETER ----
       *
       * Il partait a 30 % pour finir a 100 % d'une boite qui n'en faisait que
       * la moitie : a l'arrivee il etait plus petit que le coffre, ce qui se
       * lisait comme une deception. Il part maintenant de tout au fond —
       * 12 %, enfonce dans le coffre — et finit PLUS GRAND que lui.
       *
       * La montee est en deux temps et c'est ce qui la rend satisfaisante :
       * une sortie franche jusqu'aux trois quarts, puis un dernier quart
       * lent qui laisse le temps de regarder. Une courbe uniforme donne un
       * mouvement de machine. */
      '.swb-scene .fr{position:absolute;width:100%;height:100%;object-fit:contain;' +
        'opacity:0;transform:translateY(16%) scale(.12);will-change:transform,opacity;}' +
      '.swb-scene.ouvert .fr{animation:swbSort 1.35s .1s cubic-bezier(.12,.72,.18,1) forwards;}' +
      '@keyframes swbSort{' +
        '0%{opacity:0;transform:translateY(16%) scale(.12);' +
          'filter:drop-shadow(0 0 0 var(--teinte));}' +
        '14%{opacity:1;}' +
        '62%{transform:translateY(-16%) scale(.78);' +
          'filter:drop-shadow(0 0 26px var(--teinte));}' +
        '100%{opacity:1;transform:translateY(-30%) scale(1.06);' +
          'filter:drop-shadow(0 0 34px var(--teinte));}}' +
      /* Une fois pose, il respire. Un objet parfaitement immobile a l'air
         d'une image ; celui-la a l'air de flotter. */
      '.swb-scene.ouvert .fr{animation:swbSort 1.35s .1s cubic-bezier(.12,.72,.18,1) forwards,' +
        'swbFlotte 3.4s 1.5s ease-in-out infinite;}' +
      '@keyframes swbFlotte{0%,100%{margin-top:0;}50%{margin-top:-10px;}}' +
      /* L'eclair au moment ou le couvercle cede. */
      '.swb-cl{margin:2px 0 6px;}' +
      '.swb-cl .r{padding:6px 9px 7px;border-radius:9px;font-size:12.5px;}' +
      '.swb-cl .r .h{display:flex;align-items:center;gap:9px;}' +
      /* LA RANGEE DE TRENTE. Une grille de trente colonnes egales : elle
         occupe toute la largeur quelle que soit la taille du tiroir, et les
         cases restent alignees d'une ligne a l'autre — c'est cet alignement
         qui permet de comparer deux joueurs d'un regard. */
      '.swb-cl .bar{display:grid;grid-template-columns:repeat(30,1fr);gap:1px;' +
        'margin:5px 0 0 33px;}' +
      '.swb-cl .bar span{position:relative;aspect-ratio:1;border-radius:3px;' +
        'background:rgba(255,255,255,.05);}' +
      '.swb-cl .bar span.a{background:rgba(0,0,0,.35);' +
        'box-shadow:inset 0 0 0 1px var(--t),0 0 5px -1px var(--t);}' +
      '.swb-cl .bar img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}' +
      '.swb-cl .r:nth-child(odd){background:rgba(255,255,255,.035);}' +
      '.swb-cl .r.moi{background:rgba(255,197,61,.13);' +
        'box-shadow:inset 0 0 0 1px rgba(255,197,61,.32);}' +
      '.swb-cl .rg{flex:0 0 24px;text-align:center;font-weight:800;color:#8DA0C4;}' +
      '.swb-cl .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swb-cl .fp{flex:0 0 auto;font-size:10px;font-weight:800;color:#7CFF9B;' +
        'background:rgba(124,255,155,.12);padding:2px 6px;border-radius:6px;}' +
      '.swb-cl .sc{flex:0 0 auto;font-weight:800;}' +
      '.swb-cl .sc i{font-style:normal;font-weight:600;color:#5C6B85;font-size:10.5px;}' +
      '.swb-cl .sep{height:1px;background:rgba(255,255,255,.1);margin:5px 9px;}' +
      /* Le bandeau des saisons. Deux onglets pleine largeur : a deux, une
         rangee qui se partage l'espace se lit mieux qu'une barre de defilement
         horizontale — et le jour ou il y en a quatre, le `flex-wrap` les met
         sur deux lignes au lieu d'en cacher deux. */
      '.swb-sai{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 13px;}' +
      '.swb-s{flex:1 1 130px;display:flex;align-items:baseline;gap:6px;' +
        'padding:9px 11px;border-radius:11px;font:inherit;font-size:12px;cursor:pointer;' +
        'border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.04);' +
        'color:#8DA0C4;transition:background .15s,border-color .15s,color .15s;}' +
      '.swb-s b{font-size:12.5px;font-weight:800;letter-spacing:.4px;color:#C9D6EE;}' +
      '.swb-s:hover:not(:disabled){background:rgba(255,255,255,.08);' +
        'border-color:rgba(255,255,255,.24);}' +
      '.swb-s.on{background:rgba(255,197,61,.13);border-color:rgba(255,197,61,.55);color:#FFE9A8;}' +
      '.swb-s.on b{color:#FFC53D;}' +
      /* Verrouillee : grisee, mais PAS cachee, et le curseur dit qu'il n'y a
         rien a cliquer plutot que de laisser essayer. */
      '.swb-s.clos{opacity:.55;cursor:not-allowed;}' +
      '.swb-s i{font-style:normal;margin-left:auto;font-size:10px;font-weight:800;' +
        'letter-spacing:.5px;text-transform:uppercase;white-space:nowrap;}' +
      '.swb-s i.cl{color:#8DA0C4;}' +
      '.swb-s i.av{color:#7CFF9B;}' +
      /* Le renvoi vers la boutique, au bas du classement. Discret — c'est une
         sortie, pas un appel : le bouton d'achat est dans l'autre section et
         il n'y a rien a gagner a en poser un faux ici. */
      '.swb-vers{display:block;width:100%;margin:14px 0 4px;padding:11px;' +
        'border-radius:12px;border:1px solid rgba(255,255,255,.14);' +
        'background:rgba(255,255,255,.05);color:#C9D6EE;font:inherit;font-weight:700;' +
        'font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s;}' +
      '.swb-vers:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.26);}' +
      '.swb-scene .halo::after{content:"";position:absolute;inset:0;border-radius:50%;' +
        'background:radial-gradient(circle,#fff,transparent 45%);opacity:0;}' +
      '.swb-scene.ouvert .halo::after{animation:swbEclair .55s ease-out forwards;}' +
      '@keyframes swbEclair{0%{opacity:0;transform:scale(.2);}' +
        '22%{opacity:.85;}100%{opacity:0;transform:scale(1.5);}}' +
      '.swb-scene .txt{text-align:center;margin-top:-4px;padding:0 18px;max-width:520px;' +
        'opacity:0;transform:translateY(8px);transition:opacity .4s .55s,transform .4s .55s;}' +
      '.swb-scene.ouvert .txt{opacity:1;transform:none;}' +
      '.swb-scene .rar{font-size:12px;letter-spacing:2.4px;text-transform:uppercase;' +
        'font-weight:800;color:var(--teinte);}' +
      '.swb-scene .nom{font-size:26px;font-weight:800;margin:3px 0 5px;color:#F2F7FF;}' +
      '.swb-scene .num{font-size:13px;font-weight:800;color:#E7C97A;letter-spacing:.6px;}' +
      '.swb-scene .pv{font-size:12.5px;font-style:italic;color:#8DA0C4;margin-top:7px;line-height:1.5;}' +
      '.swb-scene .tap{position:absolute;bottom:34px;font-size:11px;letter-spacing:1.6px;' +
        'text-transform:uppercase;color:#5C6B85;opacity:0;transition:opacity .4s 1s;}' +
      '.swb-scene.ouvert .tap{opacity:1;}' +
      /* Un joueur qui a demande moins d animations n en recoit pas. */
      '@media (prefers-reduced-motion:reduce){.swb-scene *{animation:none!important;' +
        'transition:none!important;}.swb-scene .fr{opacity:1;' +
        'transform:translateY(-30%) scale(1.06);}}' +
      '.swb-r{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;}' +
      /* La case MANQUANTE garde la couleur de sa rarete, en pointille et
         eteinte : c'est elle qui dit ce qu'on cherche. Une case grise
         indifferenciee ne dirait pas s'il manque un commun ou le mythique. */
      '.swb-o.vide{border-style:dashed;opacity:.26;}' +
      '.swb-o.vide .t{font-size:8.5px;}' +
      '.swb-o{position:relative;aspect-ratio:1/1;border-radius:12px;overflow:hidden;' +
        'background:radial-gradient(120% 120% at 30% 20%,rgba(255,255,255,.07),rgba(0,0,0,.5));' +
        'border:1px solid;display:flex;align-items:flex-end;justify-content:center;' +
        /* Le nom descend de trois pixels. Cale a cinq de chaque cote il
           flottait au milieu du bas du dessin ; pose plus bas il se lit
           comme une legende sous l'image, ce qu'il est. */
        'padding:5px 5px 2px;font-size:9.5px;line-height:1.15;text-align:center;}' +
      '.swb-o img{position:absolute;inset:9%;width:82%;height:82%;object-fit:contain;}' +
      '.swb-o .q{position:absolute;top:4px;right:5px;font-weight:800;font-size:10px;' +
        'background:rgba(0,0,0,.6);border-radius:6px;padding:1px 4px;}' +
      '.swb-o .t{position:relative;z-index:2;text-shadow:0 1px 3px #000,0 0 6px #000;}' +
      /* UN VOILE SOUS LE NOM. Tant que les dessins manquaient, le nom flottait
         sur un fond uni et se lisait tout seul. Pose sur un fruit clair, il se
         battait avec lui : l'ombre portee suffisait a le rendre lisible, pas a
         le rendre propre. Le degrade ne couvre que le tiers bas et n'existe
         que sur les cases qui ont une image. */
      '.swb-o:has(img) .t::before{content:"";position:absolute;inset:-4px -8px -6px -8px;' +
        'z-index:-1;background:linear-gradient(to top,rgba(4,7,16,.92),rgba(4,7,16,0));}' +
      '.swb-vide{color:#8DA0C4;font-size:12px;text-align:center;padding:16px 8px;line-height:1.55;}' +
      '.swb-gain{margin:2px 0 12px;padding:11px 12px;border-radius:13px;border:1px solid;' +
        'display:flex;align-items:center;gap:11px;}' +
      '.swb-gain .l{font-size:11px;color:#8DA0C4;}' +
      '.swb-gain .n{font-weight:800;font-size:14px;}' +
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
      '.swnv .r .sr{color:#7CFF9B;opacity:.85;}' +
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
      '.swp-adr{cursor:pointer;-webkit-user-select:all;user-select:all;' +
      'border-bottom:1px dashed #46557d;padding-bottom:1px;}' +
      '.swp-adr:hover{color:#CFE0FF;border-bottom-color:#7d92cc;}' +
      '.swp-adr-ok{color:#7BE3A0!important;border-bottom-color:#7BE3A0!important;}' +
      '.swp-ch{display:flex;gap:7px;padding:0 13px 12px;flex-wrap:wrap;}' +
      /* Des <span>, jamais des <button> : rien ici ne se clique, et un survol
         qui reagit apprend le contraire. */
      '.swp-ho{display:flex;gap:5px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px;' +
        '-webkit-overflow-scrolling:touch;scrollbar-width:none;}' +
      '.swp-ho::-webkit-scrollbar{display:none;}' +
      '.swp-ho button{flex:0 0 auto;padding:7px 13px;border-radius:999px;font:inherit;' +
        'font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;' +
        'border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.04);' +
        'color:#8DA0C4;transition:background .14s,border-color .14s,color .14s;}' +
      '.swp-ho button:hover{color:#C9D6EE;border-color:rgba(255,255,255,.26);}' +
      '.swp-ho button.on{background:rgba(255,197,61,.14);border-color:rgba(255,197,61,.55);' +
        'color:#FFD97A;}' +
      '.swp-ch span{flex:1 1 92px;display:flex;flex-direction:column;gap:1px;' +
        'padding:8px 10px;border-radius:11px;border:1px solid rgba(255,255,255,.12);' +
        'background:rgba(255,255,255,.05);font:inherit;text-align:left;color:#C9D6EE;}' +
      '.swp-ch b{font-size:15px;font-weight:800;color:#F2F6FF;line-height:1.15;' +
        'font-variant-numeric:tabular-nums;}' +
      '.swp-ch i{font-style:normal;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;' +
        'color:#8DA0C4;font-weight:700;}' +
      /* Le seul accent dore de l'en-tete : ce qui est A PRENDRE. Un accent
         qui est partout n'accentue rien. */
      '.swp-ch .pret{border-color:rgba(255,197,61,.55);background:rgba(255,197,61,.13);}' +
      '.swp-ch .pret b{color:#FFD97A;}' +
      '.swp-ch .feu b{color:#FF9A3D;}' +
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
      /* UN REFUS NE DOIT PAS ETRE VERT. La classe `bad` etait deja passee par
         deux appels — un solde insuffisant, une erreur du serveur — mais elle
         n'avait aucun style : le message s'affichait dans le meme vert que
         « Sent 5 000 $SWOGE », et se lisait comme une reussite. */
      '.swtoast.bad{background:linear-gradient(180deg,#FF9B92,#E8483C);color:#2A0704;}' +
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

  /* La barre du haut d'une page qui n'affiche PAS de solde.
     On prend la premiere <nav> du document — sur les coquilles concernees
     c'est la barre de titre, et elles n'ont pas d'autre <nav>. Le garde-fou
     du sommaire (livre blanc, launchpad) ne s'applique pas : ces pages-la ne
     chargent pas ce fichier. */
  function barreSansSolde() {
    return document.querySelector('nav') || null;
  }

  /* ---- LE BOUTON DE PROFIL NE DEPEND PLUS DE LA BULLE DE STAKING ----
   *
   * `monte()` construit la bulle de staking, et pour ca il lui faut la
   * pastille du solde (`#bal`) : sans elle il rend `false`. Le bouton de
   * profil s'arretait donc la aussi — et le HALL DES JEUX, qui n'affiche
   * aucun solde, n'avait pas de bouton de profil du tout. La page ou l'on
   * passe le plus de temps a choisir, sans acces a son compte.
   *
   * Les deux sont maintenant independants : la bulle se monte si elle peut,
   * le bouton se pose de toute facon — dans la barre du solde quand elle
   * existe, dans la barre du haut sinon.
   */
  function profMonte() {
    if (profBtn) return true;
    var avecBulle = monte();
    if (!avecBulle && !barreSansSolde()) return false;   // vraiment aucune ancre
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
    if (!barre) barre = barreSansSolde();
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
      /* Pas de barre : on se range a cote de la bulle de staking. Elle
         n'existe que si `monte()` a reussi — sinon il n'y a plus d'ancre du
         tout, et poser le bouton dans le vide le rendrait invisible. */
      var apres = pastille || bulle;
      if (!apres || !apres.parentElement) { profBtn = null; return false; }
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
        /* LA LIGNE DES CHIFFRES. Solde, serie, collection — les trois choses
           qu'un joueur vient verifier, et dont AUCUNE n'etait dans l'en-tete.
           Le solde manquait sur un site ou chaque geste est une somme ; la
           serie existait cote serveur depuis le debut sans jamais s'afficher. */
        '<div class="swp-ch"></div>' +
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
    /* ---- ALLER AILLEURS PASSE EN PREMIER ----
       Le deuxieme paquet du menu — autres jeux, accueil — est de la
       NAVIGATION, pas du compte : c'est la seule rangee du tiroir qui fait
       quitter la page ou l'on est. Rangee sous les cinq sections du profil,
       elle demandait de defiler tout un panneau de compte pour changer de jeu,
       ce qui est pourtant ce qu'on vient chercher le plus souvent. Elle est
       donc tout en haut, avant le portefeuille. */
    miroirGroupe(t, 'Go to', paquets[1]);
    miroirGroupe(t, 'Account', paquets[0]);
    /* ---- LA BOUTIQUE, ANNONCEE AVANT D'EXISTER ----
     *
     * Vide pour l'instant, et elle le DIT. Une section qui s'ouvre sur rien
     * fait douter du reste du tiroir ; une section qui annonce sa date se lit
     * comme une promesse. Elle n'est donc pas cliquable — un bouton mort qui
     * ne reagit pas est pire qu'un libelle qui explique.
     *
     * Elle est posee ICI, entre le compte et les sections du profil : c'est la
     * place qu'elle gardera quand elle aura son contenu, et on evitera d'avoir
     * a la deplacer le jour ou elle ouvre. */
    (function boutique() {
      var g = document.createElement('div');
      g.className = 'swp-g'; g.textContent = 'Shop';
      t.appendChild(g);
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.k = 'sh';
      b.textContent = '\uD83D\uDED2 Chests & items';
      b.addEventListener('click', function () { profVa('sh'); });
      t.appendChild(b);
      /* Le classement, JUSTE EN DESSOUS et dans le meme groupe. Les deux
         lisent la meme reponse du serveur et parlent de la meme collection :
         les separer par un titre de groupe suggererait deux sujets. */
      var c = document.createElement('button');
      c.type = 'button'; c.dataset.k = 'cl';
      c.textContent = '🏅 Collection ranking';
      c.addEventListener('click', function () { profVa('cl'); });
      t.appendChild(c);
    })();
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
    /* Le premier paquet est monte en tete, le deuxieme est deja pose : on
       reprend au troisieme (le son et la musique), qui reste en bas. */
    var RESTE = ['Settings', 'More', 'More'];
    for (var q = 2; q < paquets.length; q++)
      miroirGroupe(t, RESTE[q - 2] || 'More', paquets[q]);

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
      css2.textContent = '#menu{display:none!important;}#menuBtn{display:none!important;}' +
        /* La modale du Coin Pusher : on cache la LISTE, pas la modale entiere —
           elle sert aussi de cadre au depot et au retrait, qui continuent de
           s'ouvrir par leur propre chemin quand on n'est pas passe par le
           tiroir. */
        '#menuBox{display:none!important;}';
      document.head.appendChild(css2);
    }
    cacheRetourHall();
    return true;
  }

  /* ---- LE « BACK TO THE SWOGE ARCADE » DU PIED DE PAGE, SUR TELEPHONE ----
   *
   * Les quatorze pages de jeu finissent par un pied de page qui ne contient
   * qu'une chose : un lien vers le hall. Sur telephone il coute une bande
   * pleine largeur en bas de chaque partie, pour dire ce que « Other games »
   * dit deja dans le tiroir — a portee de pouce, sans defiler jusqu'en bas.
   *
   * ---- pourquoi la regle est POSEE ICI, et pas au chargement ----
   *
   * Parce qu'elle depend de son remplacant. `profMonte()` n'aboutit que
   * lorsque le tiroir existe vraiment, c'est-a-dire pour un joueur reconnu.
   * Un visiteur qui n'a rien branche n'a pas de bouton de profil : chez lui ce
   * lien EST le seul chemin de retour, et le cacher l'enfermerait dans la
   * page. On ne retire donc la porte qu'une fois l'autre ouverte.
   *
   * Sur grand ecran il ne coute rien et il reste : la place n'y manque pas, et
   * un pied de page qui ramene au sommaire est ce qu'on y attend.
   */
  var styleRetour = false;
  function cacheRetourHall() {
    if (styleRetour) return;
    styleRetour = true;
    var css = document.createElement('style');
    /* `:only-child` est la prudence : le jour ou une page ajoute autre chose
       dans son pied — des mentions, un lien de contact — le pied reste, et
       seul le cas qu'on vise ici disparait. */
    css.textContent =
      '@media (max-width:640px){' +
      'footer:has(> a[href="games.html"]:only-child){display:none!important;}}';
    document.head.appendChild(css);
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
  /* DEUX FORMES DE MENU, une par famille de coquille.
   *
   * Les quatorze pages de jeu portent un <div id="menu"> de liens, decoupe en
   * paquets par des separateurs. Les deux pages du Coin Pusher, elles, ont une
   * modale a elles — un <div id="menuBox"> de BOUTONS, sans separateur. Elles
   * n'avaient donc rien a refleter : leur tiroir de profil s'ouvrait sans
   * portefeuille, sans depot et sans « Other games », et le vieux menu restait
   * en place a cote. Deux menus sur la meme page, ce qu'on venait justement de
   * supprimer partout ailleurs.
   *
   * Sans separateurs, les paquets se devinent au CONTENU : ce qui mene ailleurs,
   * ce qui regle quelque chose, et le compte pour tout le reste. */
  /* ---- LES PAGES QUI N'ONT AUCUN MENU A REFLETER ----
   *
   * Quatre pages portent le tiroir sans porter de menu : le hall des jeux, le
   * staking, la roue et le Coin Pusher en direct. Le tiroir n'y trouvait donc
   * rien a refleter et s'ouvrait SANS le groupe « Go to » — pas de retour au
   * hall, pas de retour a l'accueil. Sur le hall des jeux, la page ou l'on est
   * le plus susceptible de vouloir aller ailleurs, c'etait le comble.
   *
   * On fabrique donc les deux entrees minimales. Elles sont ecrites ici et pas
   * dans les quatre pages pour la meme raison que tout le reste de ce fichier :
   * une correction, un endroit. Et on saute celle de la page courante — une
   * ligne « Other games » sur le hall des jeux ne mene nulle part.
   */
  /* \u00AB Staking \u00BB et \u00AB Buy $SWOGE \u00BB ne sont plus de ce groupe.
   *
   * \u00AB Go to \u00BB est la seule rangee du tiroir qui fasse QUITTER la page ou l'on
   * joue. A quatre entrees, les deux qu'on suit vraiment \u2014 retourner au hall,
   * rentrer a l'accueil \u2014 se lisaient au milieu de deux autres qu'on ne suit
   * presque jamais, dont une qui sort carrement du site.
   *
   * Aucune des deux n'est perdue : le hall des jeux porte une vignette
   * \u00AB Staking \u00BB dans son catalogue, au meme rang que les jeux, et la cotation
   * est sur l'accueil. Elles sont a un geste de plus, ce qui est le bon prix
   * pour ce qu'on ouvre une fois par semaine.
   */
  var AILLEURS = [
    ['games.html', '\uD83C\uDFAE Other games'],
    ['index.html', '\uD83C\uDFE0 Home'],
  ];
  /* ---- LE COMPTE, SUR UNE PAGE QUI N'EN A PAS ----
   *
   * Le hall des jeux et la page de staking ne portent AUCUN panneau de compte :
   * ni portefeuille, ni depot, ni retrait, ni quetes, et pas meme la
   * bibliotheque de chaine qui les ferait marcher. Leur tiroir s'ouvrait donc
   * sans groupe « Account » — sur le hall, c'est-a-dire la page d'entree du
   * site, la ou l'on arrive avec l'intention de deposer.
   *
   * On ne REFAIT pas ces panneaux ici. Un formulaire de depot ecrit dans ce
   * fichier serait une seconde version du chemin de l'argent, a tenir a jour
   * en face de quinze autres — exactement ce que tout le reste de ce fichier
   * s'interdit.
   *
   * On utilise la porte qui existe deja : le Coin Pusher ouvre le bon panneau
   * d'apres l'adresse (#wallet, #deposit, #withdraw, #staking, #quests). C'est
   * la plus legere des pages qui ont tout, et le solde y est le meme
   * qu'ailleurs. Les cinq rangees mènent donc la-bas, panneau ouvert.
   */
  var COMPTE_AILLEURS = [
    ['swoge_pusher.html#wallet',   '👛 My Wallet'],
    ['swoge_pusher.html#staking',  '🔒 Staking'],
    ['swoge_pusher.html#deposit',  '💰 Deposit'],
    ['swoge_pusher.html#withdraw', '🏧 Withdraw'],
    ['swoge_pusher.html#quests',   '🎯 Daily Quests'],
  ];
  function SECOURS_COMPTE() {
    var ici = (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html';
    if (ici === 'swoge_pusher.html') return [];      // il a les siens, en propre
    var out = [];
    for (var i = 0; i < COMPTE_AILLEURS.length; i++) {
      var a = document.createElement('a');
      a.href = COMPTE_AILLEURS[i][0];
      a.textContent = COMPTE_AILLEURS[i][1];
      out.push(a);
    }
    return out;
  }

  function SECOURS_AILLEURS() {
    var ici = (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html';
    var out = [];
    for (var i = 0; i < AILLEURS.length; i++) {
      if (AILLEURS[i][0] === ici) continue;
      var a = document.createElement('a');
      a.href = AILLEURS[i][0];
      a.textContent = AILLEURS[i][1];
      /* Un lien qui sort du site s'ouvre a cote : la page de cotation n'est pas
         une page de nous, et y envoyer le joueur en pleine partie lui ferait
         perdre sa table. */
      if (a.href.indexOf('http') === 0 && a.href.indexOf(location.host) < 0) {
        a.target = '_blank'; a.rel = 'noopener';
      }
      out.push(a);
    }
    return out;
  }

  /* Trie une liste d'entrees SANS separateur : ce qui mene ailleurs, ce qui
     regle quelque chose, et le compte pour tout le reste. On regarde le texte,
     l'identifiant, les classes ET la cible du lien : sur la roue, les libelles
     sont des images et le mot utile n'est parfois que dans la classe
     (« mi-stakepage ») ou dans le href. */
  function trieParContenu(liste) {
    var ailleurs = [], compte = [], reglages = [];
    liste.forEach(function (el) {
      /* La fermeture n'a pas de sens dans un tiroir : il a son propre retour. */
      if (el.id === 'mnClose') return;
      var t = (el.textContent || '') + ' ' + (el.id || '') + ' ' +
              (el.className || '') + ' ' + (el.getAttribute('href') || '');
      /* « Bridge » et « Buy / Sell » quittent le site : ils ouvrent un autre
         domaine dans un nouvel onglet. Ranges sous « Account », ils se lisaient
         comme un geste sur son compte a cote du depot et du retrait — alors
         qu'ils font exactement l'inverse, ils emmenent ailleurs. Le Coin Pusher
         est la seule coquille qui les porte ; c'est aussi la seule dont le
         groupe « Account » ne ressemblait pas aux autres. */
      if (/games|home|arcade|stakepage|staking page|bridge|buy ?\/ ?sell/i.test(t)) ailleurs.push(el);
      else if (/sound|music|son|musique/i.test(t)) reglages.push(el);
      else compte.push(el);
    });
    /* On ne compacte PAS : l'appelant lit paquets[0] pour « Account » et
       paquets[1] pour « Go to ». Retirer un groupe vide decalerait les
       suivants, et les reglages se retrouveraient titres « Go to ». Un groupe
       vide ne coute rien — miroirGroupe s'arrete dessus. */
    return [compte, ailleurs, reglages];
  }

  function miroirPaquets() {
    /* TROIS FORMES DE MENU, pas deux.
     *
     * Les pages de jeu portent un <div id="menu"> de liens decoupe par des
     * separateurs ; le Coin Pusher un <div id="menuBox"> de boutons sans
     * separateur. La roue et le Coin Pusher en direct, eux, portent un
     * <div id="pmenu"> — que ce fichier ne connaissait pas. Leur tiroir
     * s'ouvrait donc sans AUCUNE rangee de compte : ni portefeuille, ni depot,
     * ni retrait, ni quetes, alors que la page a tout ce qu'il faut derriere.
     */
    var menu = document.getElementById('menu') || document.getElementById('pmenu');
    if (menu) {
      var paquets = [[]];
      [].forEach.call(menu.children, function (el) {
        if (el.classList && el.classList.contains('msep')) { paquets.push([]); return; }
        if (el.tagName === 'A' && el.id !== 'mnClose') paquets[paquets.length - 1].push(el);
      });
      paquets = paquets.filter(function (p) { return p.length; });
      if (paquets.length > 1) return paquets;
      /* Un menu sans separateur ne dit rien de ses groupes : tout tomberait
         sous « Account », « Home » et « Other games » compris. On retombe donc
         sur le tri par contenu, celui du Coin Pusher. */
      if (paquets.length === 1) return trieParContenu(paquets[0]);
    }
    var boite = document.getElementById('menuBox');
    /* Position 1, pas 0 : l'appelant lit paquets[1] pour « Go to » et
       paquets[0] pour « Account ». Un tableau a un seul element ferait donc
       apparaitre « Other games » sous le titre « Account ». */
    if (!boite) return [SECOURS_COMPTE(), SECOURS_AILLEURS()];
    return trieParContenu([].slice.call(boite.querySelectorAll('button')));
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
        /* Les pages de jeu marquent leurs panneaux d'un `data-panel`. La roue
           et le Coin Pusher en direct n'en ont pas : leurs entrees se
           reconnaissent a l'identifiant que les deux coquilles partagent. Sans
           cette seconde reconnaissance, le portefeuille et le depot y
           ouvriraient encore une fenetre par-dessus le tiroir, alors qu'ils
           s'ouvrent DEDANS partout ailleurs. */
        if (el.getAttribute('data-panel') || /^mn(Wallet|Stake|Deposit|Withdraw|Quests)$/.test(el.id || ''))
          return emprunte(el, (b.textContent || '').trim());
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
      '#swpHote .box input,#swpHote .box select,#swpHote .box textarea{max-width:100%;}' +
      habitPortefeuille();
    (document.body || document.documentElement).appendChild(css);
  }

  /* ====================== LE PORTEFEUILLE, DANS LE TIROIR ======================
   *
   * « My Wallet » arrivait ici avec l'habit de sa fenetre : quatre plaques
   * peintes de 90 px — COPY, DEPOSIT, EXPLORER, DISCONNECT — empilees dans un
   * tiroir qui est par ailleurs entierement en CSS, sobre, bleu nuit et or.
   * Trois choses n'allaient pas, et aucune n'est une affaire de gout :
   *
   *  1. LES DEUX SOLDES — ce qu'on vient lire — etaient deux lignes de texte
   *     de 13 px coincees ENTRE deux plaques. La reponse a la question posee
   *     etait la plus petite chose du panneau ;
   *  2. L'ADRESSE etait coupee au bord d'un champ trop etroit. Une adresse a
   *     moitie lisible ne sert a rien : c'est tout ou rien, on la relit en
   *     entier avant d'y envoyer de l'argent. Le tiroir sait deja faire —
   *     c'est ce que fait `.swp-r .w span.ad` pour les amis ;
   *  3. DISCONNECT, en rouge vif sur 90 px, etait l'element le plus fort de
   *     l'ecran. Le geste le plus rare et le plus regrettable criait plus fort
   *     que « Deposit ».
   *
   * On ne touche pas au balisage : la boite appartient a la page, elle y
   * retourne intacte quand on quitte la section, avec ses gestionnaires. Tout
   * se joue en CSS, sur `#swpHote` — donc UNIQUEMENT dans le tiroir. Ouvert
   * autrement (le Coin Pusher garde son propre chemin), le panneau reste
   * exactement ce qu'il etait.
   *
   * L'ordre de lecture est refait avec `order` plutot qu'en deplacant des
   * noeuds : le solde d'abord, l'adresse ensuite, les gestes en dernier —
   * du plus consulte au plus rare.
   */
  function habitPortefeuille() {
    var OR = '#FFD97A', ENCRE = '#231a06';
    /* ---- CES REGLES NE VISENT QUE LE PANNEAU DES PAGES DE JEU ----
     *
     * Le hall porte maintenant SES panneaux de compte (swogecompte.js), et ils
     * s'appellent `#box-wallet` eux aussi — c'est la convention que le tiroir
     * cherche pour emprunter une boite. Sans distinction, l'habit taille pour
     * l'un habillait l'autre : le `order:2` prevu pour glisser l'etiquette
     * « Your address » entre les soldes et le champ la renvoyait EN DERNIER
     * dans un panneau qui n'a pas les memes elements — l'etiquette se
     * retrouvait sous « Disconnect », toute seule.
     *
     * On reconnait donc le panneau des pages de jeu a ce qu'il contient :
     * `#acAddr`, le champ d'adresse qu'elles ont toutes et que le hall n'a pas.
     * Un panneau qui ne l'a pas garde son propre habit, deja ecrit dans la
     * langue du tiroir.
     */
    var W = '#swpHote #box-wallet:has(#acAddr)';
    return (
      /* La pile devient une colonne flex : c'est ce qui rend `order` possible. */
      W + ' .pscroll{display:flex;flex-direction:column;}' +

      /* ---- 1. LES SOLDES ---- */
      /* Le tronc commun des deux lignes : une carte, pas une ligne de texte. */
      W + ' .strow{display:flex!important;align-items:center;' +
      'justify-content:space-between!important;gap:10px!important;' +
      'padding:11px 13px!important;margin:0 0 7px!important;border-radius:12px;' +
      'font-size:11.5px!important;letter-spacing:.2px;color:#8DA0C4!important;' +
      'background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);}' +
      W + ' .strow b{font-size:14px!important;font-weight:800;' +
      'color:#EAF2FF!important;font-variant-numeric:tabular-nums;}' +
      /* Le $SWOGE porte l'or et le grand chiffre : c'est LUI qu'on est venu
         voir, et c'est lui qui decide si on peut deposer. On le designe par
         l'identifiant qu'il contient — `:first-of-type` viserait la plaque de
         titre, qui est un div elle aussi. */
      W + ' .strow:has(#acSwoge){order:0;padding:14px!important;' +
      'background:rgba(255,197,61,.07);border-color:rgba(255,197,61,.20);}' +
      W + ' .strow:has(#acSwoge) b{font-size:22px!important;color:' + OR + '!important;}' +
      /* Le gaz est une CONDITION, pas un avoir : on le garde lisible et petit.
         Il ne devient interessant que le jour ou il manque. */
      W + ' .strow:has(#acEth){order:1;}' +

      /* ---- 2. L'ADRESSE, EN ENTIER ---- */
      W + ' label{order:2;margin:15px 0 6px!important;' +
      'font-size:10.5px!important;letter-spacing:1px;color:#8DA0C4!important;}' +
      /* Un champ ne sait pas passer a la ligne : c'est la TAILLE qui doit
         rentrer les 42 caracteres. En chasse fixe leur largeur est previsible —
         environ 0,6 em par caractere — et le tiroir fait 92 vw tant qu'il n'a
         pas atteint ses 400 px. D'ou le plafond en vw : l'adresse tient en
         entier a 320 px comme a 430, sans jamais depasser 11,5 px la ou la
         place ne manque plus. */
      W + ' #acAddr{order:3;width:100%;box-sizing:border-box;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;' +
      'font-size:min(11.5px,2.8vw)!important;letter-spacing:.2px;' +
      'text-align:center;padding:12px 8px!important;border-radius:11px!important;' +
      'color:#C6D3EA!important;background:rgba(0,0,0,.30)!important;' +
      'border:1px solid rgba(255,255,255,.10)!important;}' +

      /* ---- 3. LES GESTES ---- */
      /* On defait la plaque peinte : plus d'image, plus de proportion imposee,
         plus de texte pousse hors du cadre a -9999 px. Le libelle est dans le
         balisage depuis toujours — il redevient simplement visible. */
      W + ' .abtn.wbtn{display:block;width:100%;box-sizing:border-box;' +
      'aspect-ratio:auto!important;min-height:0!important;height:auto!important;' +
      'padding:12px!important;margin:0 0 8px!important;border-radius:11px!important;' +
      'cursor:pointer;font-family:inherit;font-size:13px!important;font-weight:800;' +
      'letter-spacing:.2px;text-align:center;text-indent:0!important;' +
      'overflow:visible!important;white-space:normal!important;text-decoration:none;' +
      'background-image:none!important;background-color:transparent!important;' +
      'color:#EAF2FF!important;border:1px solid rgba(255,255,255,.14)!important;' +
      'box-shadow:none!important;}' +
      /* Copier suit l'adresse et lui appartient : discret, et or parce qu'il
         agit sur ce qui est juste au-dessus. */
      W + ' #acCopy{order:4;margin-top:7px!important;padding:9px!important;' +
      'font-size:12px!important;color:' + OR + '!important;' +
      'background:rgba(255,197,61,.10)!important;' +
      'border-color:rgba(255,197,61,.34)!important;}' +
      W + ' #acCopy:hover{background:rgba(255,197,61,.18)!important;}' +
      /* Deposer est LE geste du panneau — le seul qui fasse entrer de l'argent
         dans le jeu. Un seul aplat plein sur l'ecran, et c'est celui-la. */
      W + ' #acDeposit{order:5;margin-top:14px!important;padding:13px!important;' +
      'font-size:13.5px!important;color:' + ENCRE + '!important;' +
      'background:linear-gradient(180deg,#F2C868,#E6A537)!important;' +
      'border-color:transparent!important;}' +
      W + ' #acExplorer{order:6;background:rgba(255,255,255,.05)!important;' +
      'color:#C6D3EA!important;}' +
      W + ' #acExplorer::after{content:" \\2197";color:#8DA0C4;}' +
      /* Se deconnecter reste possible, et cesse d'etre le plus visible : bord
         rouge sur fond vide, en bas, apres un trait. On ne le cache pas — on le
         met a sa place, celle d'un geste rare. */
      W + ' #acLogout{order:7;margin-top:16px!important;padding:10px!important;' +
      'font-size:11.5px!important;font-weight:700!important;color:#F2685E!important;' +
      'border-color:rgba(242,104,94,.28)!important;}' +
      W + ' #acLogout:hover{background:rgba(242,104,94,.10)!important;}'
    );
  }

  function emprunte(el, titre) {
    if (!profBoite) return;
    try { el.click(); } catch (e) { return; }
    /* Au tour SUIVANT : openPanel() pose la classe `show` de facon synchrone,
       mais elle peut aussi refuser (pas connecte) en n'ouvrant rien du tout.
       On regarde ce qui est reellement ouvert plutot que de le supposer. */
    setTimeout(function () {
      /* DEUX ENVELOPPES, DEUX FACONS D'OUVRIR. Les pages de jeu posent une
         classe `show` sur la boite ; le Coin Pusher ecrit `style.display` en
         ligne. On cherche donc la boite VISIBLE, quelle que soit la maniere
         dont elle a ete rendue visible — c'est le seul critere qui vaut pour
         les deux. */
      var enveloppe = null, boite = null;
      ['ovl', 'modal'].forEach(function (id) {
        if (boite) return;
        var e = document.getElementById(id);
        if (!e) return;
        var cands = e.querySelectorAll('.box');
        for (var i = 0; i < cands.length; i++) {
          var c = cands[i];
          if (c.id === 'menuBox') continue;          // la liste, pas un panneau
          if (getComputedStyle(c).display !== 'none') { boite = c; enveloppe = e; break; }
        }
      });
      if (!boite) return;                    // la page a refuse : on ne bouge pas
      rendPanneau();
      styleEmprunt();
      /* On retient AUSSI le style en ligne : le Coin Pusher s'en sert pour
         montrer et cacher ses panneaux, et le lui rendre vide le laisserait
         affiche pour toujours derriere son voile. */
      PANNEAU = { el: boite, parent: boite.parentNode, suivant: boite.nextSibling,
                  display: boite.style.display, enveloppe: enveloppe };
      var l = profBoite.querySelector('.swp-l');
      l.id = 'swpHote';
      l.innerHTML = '';
      l.appendChild(boite);
      enveloppe.classList.remove('show');
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
    p.el.style.display = p.display || 'none';
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

  /* ==================== LA BARRE DU BAS ====================
   *
   * Atteindre les paris depuis une table demandait trois gestes : ouvrir le
   * tiroir, faire defiler 1,78 ecran, toucher. Le tiroir compte dix-neuf
   * rangees et huit titres, et tout ce qui est sous « Shop » est sous le pli.
   *
   * ---- pourquoi QUATRE et pas cinq ----
   *
   * Cinq entraine presque toujours un « More » qui devient un second menu, et
   * on retombe exactement sur le probleme qu'on repare. Quatre tient sans
   * fourre-tout.
   *
   * ---- pourquoi le portefeuille N'Y EST PAS ----
   *
   * Volontairement. Un depot merite un chemin delibere ; il ne doit pas etre
   * a un geste de distance sur un site d'argent reel.
   *
   * ---- pourquoi des dessins et pas des emojis ----
   *
   * Le menu melange deja huit emojis systeme qui ne partagent ni palette ni
   * style et changent d'apparence selon l'appareil. Ces quatre-la sont traces,
   * monochromes, et prennent la couleur de leur etat : c'est ce qui permet a
   * l'onglet actif de se distinguer sans ajouter un fond.
   *
   * ---- une seule poignee pour le tiroir ----
   *
   * Le bouton du haut disparait quand la barre est posee. Deux poignees pour
   * un seul panneau, une hors de portee du pouce et l'autre sous lui,
   * obligent a se demander laquelle ouvre quoi — et la reponse est « la meme
   * chose ». L'avatar et son cadre de palier DEMENAGENT ici : c'est la seule
   * chose de son niveau qu'un joueur voit en permanence, elle ne se perd pas.
   */
  var barreBas = null;
  var DESSINS = {
    jouer: '<path d="M7 8h10a5 5 0 0 1 4.9 5.9l-.6 3A3 3 0 0 1 16.6 18l-1.4-2H8.8l-1.4 2a3 3 0 0 1-4.7-1.1l-.6-3A5 5 0 0 1 7 8Z"/>' +
           '<path d="M7.5 11v3M6 12.5h3M16 11.6h.01M17.6 13.2h.01" stroke="#0B0F17" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
    paris: '<circle cx="12" cy="12" r="8.6"/>' +
           '<path d="m12 7.2 3.3 2.4-1.26 3.9H9.96L8.7 9.6 12 7.2Z" fill="#0B0F17"/>' +
           '<path d="M12 3.4v3.8M4.2 9.9l3.6 2.6M19.8 9.9l-3.6 2.6M7.6 20l1.4-4.3M16.4 20 15 15.7" stroke="#0B0F17" stroke-width="1.3" fill="none"/>',
    coffres: '<path d="M4 10.5A3.5 3.5 0 0 1 7.5 7h9A3.5 3.5 0 0 1 20 10.5V12H4v-1.5Z"/>' +
             '<path d="M3.6 13h16.8v4.2A2.8 2.8 0 0 1 17.6 20H6.4a2.8 2.8 0 0 1-2.8-2.8V13Z"/>' +
             '<rect x="10.6" y="10" width="2.8" height="5" rx="1.1" fill="#0B0F17"/>',
  };
  function svg(cle) {
    return '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" aria-hidden="true">' +
           DESSINS[cle] + '</svg>';
  }
  function pageCourante() {
    var f = (location.pathname.split('/').pop() || '').toLowerCase();
    if (f === 'games.html' || f === '' || f === 'index.html') return 'jouer';
    if (f === 'swogebet.html') return 'paris';
    return null;
  }
  function monteBarreBas() {
    if (barreBas) return barreBas;
    if (!document.body) return null;
    var css = document.createElement('style');
    css.textContent =
      '.swbb{position:fixed;left:0;right:0;bottom:0;z-index:2147482000;display:flex;' +
        'background:rgba(11,15,23,.94);backdrop-filter:blur(10px);' +
        'border-top:1px solid rgba(255,255,255,.10);' +
        /* La barre d'accueil de l'iPhone mange les vingt derniers pixels : sans
           cette marge, le quart des touches tombe dessus et n'arrive jamais. */
        'padding:5px 4px calc(5px + env(safe-area-inset-bottom,0px));' +
        /* Ceinture : quelle que soit la page, la hauteur vient du contenu. */
        'height:auto;min-height:0;max-height:none;margin:0;align-items:stretch;}' +
      '.swbb button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;' +
        'padding:5px 2px 3px;background:none;border:0;font:inherit;cursor:pointer;' +
        'color:#7A89A6;position:relative;transition:color .14s;-webkit-tap-highlight-color:transparent;}' +
      '.swbb button:hover,.swbb button:focus-visible{color:#C9D6EE;}' +
      '.swbb button.on{color:#FFC53D;}' +
      '.swbb span{font-size:9.5px;font-weight:700;letter-spacing:.04em;}' +
      '.swbb .av{width:23px;height:23px;border-radius:50%;border:1px solid currentColor;' +
        'display:flex;align-items:center;justify-content:center;font-size:13px;' +
        'background-size:cover;background-position:center;overflow:hidden;}' +
      /* La pastille de la barre : plus haut et plus a droite que sur le bouton
         du haut, parce que l'icone est plus petite. */
      '.swbb .swpn{position:absolute;top:1px;right:calc(50% - 17px);}' +
      /* Le contenu ne doit pas finir SOUS la barre. Une page qu'on ne peut pas
         faire defiler jusqu'au bout est un defaut qu'on ne remarque que sur le
         dernier element, donc trop tard. */
      'body{padding-bottom:var(--swbb-h)!important;}' +
      /* ---- LE TIROIR AUSSI PASSE SOUS LA BARRE ----
       *
       * La marge posee sur `body` ne protege que le flux de la page. Le tiroir
       * est un panneau FIXE : il ne la voit pas, et sa derniere rangee finit
       * derriere la barre meme defile a fond. Mesure avant correction :
       * « Leaderboard » depassait de 36 px, invisible quoi qu'on fasse.
       *
       * Les deux conteneurs qui defilent — la liste des sections et le
       * panneau de detail — prennent donc la meme marge, tiree de la MEME
       * variable que la hauteur de la barre. Deux nombres ecrits a deux
       * endroits auraient diverge au premier reglage. */
      ':root{--swbb-h:calc(62px + env(safe-area-inset-bottom,0px));}' +
      '.swp-t,.swp-l{padding-bottom:calc(var(--swbb-h) + 10px)!important;}' +
      '@media (min-width:900px){.swbb{justify-content:center;gap:34px;}' +
        '.swbb button{flex:0 0 96px;}}';
    document.head.appendChild(css);

    /* UN DIV, PAS UN <nav>. Les dix-huit pages ont chacune leurs regles pour
       `nav` — c'est l'element de leur barre du haut. Un <nav> pose ici en
       heritait : la barre est sortie a 844 px de haut, c'est-a-dire toute la
       hauteur de l'ecran, alors que ses mesures de position disaient « en bas »
       et que rien dans mon CSS ne parlait de hauteur. Le role est porte par
       l'attribut, ce qui donne la meme semantique sans la cascade. */
    barreBas = document.createElement('div');
    barreBas.className = 'swbb';
    barreBas.setAttribute('role', 'navigation');
    barreBas.setAttribute('aria-label', 'Main');
    var cour = pageCourante();
    var lot = [
      { k: 'jouer', t: 'Play', go: function () { location.href = 'games.html'; } },
      { k: 'paris', t: 'Bets', go: function () { location.href = 'swogebet.html'; } },
      /* Les coffres ouvrent le tiroir DIRECTEMENT sur la boutique : c'est le
         seul endroit du site qui produise une emotion a l'ouverture, et il
         etait a trois gestes. */
      { k: 'coffres', t: 'Chests', go: function () { profOuvre(); profVa('sh'); } },
    ];
    lot.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = (cour === o.k ? 'on' : '');
      b.dataset.tap = o.k;
      b.innerHTML = svg(o.k) + '<span>' + o.t + '</span>';
      b.addEventListener('click', o.go);
      barreBas.appendChild(b);
    });

    var bp = document.createElement('button');
    bp.type = 'button'; bp.className = 'swbb-prof'; bp.dataset.tap = 'profil';
    bp.innerHTML = '<span class="av"></span><span>Profile</span>';
    bp.addEventListener('click', profOuvre);
    barreBas.appendChild(bp);
    document.body.appendChild(barreBas);
    return barreBas;
  }

  function profBtnVisible(v) {
    if (!profMonte()) return;
    if (v) monteBarreBas();
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
  /*
   * LA BOUTIQUE.
   *
   * Trois coffres en haut, l'inventaire en dessous. Rien d'autre — c'est un
   * ecran de tiroir, pas une page.
   *
   * ---- ce qui est affiche, et pourquoi ----
   *
   * Les CHANCES sont ecrites sous chaque coffre, en clair, avant l'achat. Un
   * coffre ne rend rien de monnayable : la seule chose qu'on achete, c'est la
   * probabilite annoncee. La cacher, c'est vendre une promesse invisible —
   * et c'est aussi ce que la reglementation de plusieurs pays impose
   * d'afficher. Autant que ce soit vrai partout.
   *
   * ---- les dessins qui n'existent pas encore ----
   *
   * Chaque objet porte son nom EN TEXTE, et l'image se pose par-dessus quand
   * elle existe. Un objet dont le dessin n'est pas encore fait reste donc
   * lisible et jouable, au lieu d'afficher une icone cassee. Le fichier
   * attendu est `img/shop/<clef>.webp`, la clef etant celle du catalogue.
   */
  function rendBoutique() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    if (!BOUTIQUE || !BOUTIQUE.catalogue) {
      var att = document.createElement('div');
      att.className = 'swp-v'; att.textContent = 'Loading…';
      l.appendChild(att);
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'shop', season: SAISON }));
      return;
    }
    var C = BOUTIQUE.catalogue, inv = BOUTIQUE.inventaire || {};
    var teinte = {};
    C.raretes.forEach(function (r) { teinte[r.cle] = r.couleur; });
    var nomRarete = {};
    C.raretes.forEach(function (r) { nomRarete[r.cle] = r.nom; });

    rendSaisons(l);
    rendOffert(l);

    // ---- ce qu'on vient d'ouvrir
    if (BOUTIQUE.gagne) {
      var g = BOUTIQUE.gagne, gd = document.createElement('div');
      gd.className = 'swb-gain';
      gd.style.borderColor = teinte[g.rarete] || '#8DA0C4';
      if (g.ligne) {
        var lg = document.createElement('div');
        lg.className = 'swb-course gagne';
        lg.innerHTML = '<div class="t">\uD83C\uDFC6 ' +
          ['First', 'Second', 'Third'][g.ligne.rang - 1] + ' complete line</div>' +
          '<div class="l">You finished <b>' + ech(g.ligne.familleNom) + '</b> \u2014 ' +
          '<b>' + nb(g.ligne.prix, 0) + ' $SWOGE</b> credited</div>';
        l.appendChild(lg);
      }
      gd.innerHTML = '<div class="swb-o" style="border-color:' + (teinte[g.rarete] || '#8DA0C4') +
        ';width:56px;flex:0 0 56px;aspect-ratio:1/1;">' + vignette(g.item, true) + '</div>' +
        (g.coffre ? '<img class="cf ouv" alt="" src="img/shop/coffre_' +
           encodeURIComponent(g.coffreImage || g.coffre) + '_ouvert.webp" onerror="this.remove()">' : '') +
        '<div><div class="l" style="color:' + (teinte[g.rarete] || '#8DA0C4') + '">' +
        ech(nomRarete[g.rarete] || g.rarete) +
        (g.coffreNom ? ' \u00b7 ' + ech(g.coffreNom) : '') + '</div>' +
        '<div class="n">' + ech(g.item.nom) + '</div>' +
        (g.item.pouvoir ? '<div class="l pv">' + ech(g.item.pouvoir) + '</div>' : '') +
        (g.emis && g.plafond
           ? '<div class="l num">#' + nb(g.emis, 0) + ' of ' + nb(g.plafond, 0) + '</div>' : '') +
        (g.quantite > 1 ? '<div class="l">You now own ' + g.quantite + '</div>' : '') + '</div>';
      l.appendChild(gd);
    }

    /* ---- LA COURSE, EN HAUT ----
     *
     * Elle est posee AVANT les coffres, et c'est le seul endroit ou elle a du
     * sens : c'est elle qui donne la raison d'appuyer. Sous la collection,
     * personne ne la verrait avant d'avoir deja achete.
     *
     * Une place prise reste affichee avec le nom de celui qui l'a eue. Les
     * masquer donnerait une course a trois places qui semble n'avoir jamais
     * commence ; les montrer dit exactement ou on en est. */
    var C0 = BOUTIQUE.course;
    if (C0 && C0.prix && C0.prix.length) {
      var cr = document.createElement('div');
      cr.className = 'swb-course' + (C0.restant ? '' : ' finie');
      var med = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
      cr.innerHTML = '<div class="t">' +
        (C0.restant ? 'First three to complete a family' : 'The race is over')
        + '</div>' +
        C0.prix.map(function (px, i) {
          var g = (C0.gagnants || [])[i];
          return '<div class="l' + (g ? ' pris' : '') + '">' + med[i] +
            ' <b>' + nb(px, 0) + '</b> $SWOGE ' +
            (g ? '<span>\u2014 ' + ech(g.nom) + ' \u00b7 ' + ech(g.familleNom) + '</span>'
               : '<span>\u2014 still open</span>') + '</div>';
        }).join('') +
        (C0.restant ? '<div class="s">Any one family, all five tiers. One prize per player.</div>' : '');
      l.appendChild(cr);
    }

    // ---- les coffres
    var solde = Number(BOUTIQUE.balance || etat.balance || 0);
    var boite = document.createElement('div');
    boite.className = 'swb-c';
    C.coffres.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'swb-cof';
      b.disabled = !(solde >= c.prix);
      /* Le DESSIN suit `image`, pas `cle`. Les caisses d'armes n'ont pas
         encore le leur et empruntent celui des coffres a fruits ; le jour ou
         l'art arrive, un seul mot change cote serveur et rien ici. Et c'est
         aussi ce qui donne le SON : `image` vaut bois, or ou mythe, c'est-a-
         dire exactement le palier. */
      var dessin = c.image || c.cle;
      b.innerHTML = '<img class="cf" alt="" src="img/shop/coffre_' +
        encodeURIComponent(dessin) + '.webp" onerror="this.remove()">' +
        '<span><span class="n">' + ech(c.nom) + '</span>' +
        /* Chaque couple « chance + rarete » est insecable : sans cela la
           ligne cassait entre « 2.8% » et « Epic », et on lisait un chiffre
           qui ne se rapportait a rien. */
        '<span class="o">' + c.chances.map(function (x) {
          return '<span style="white-space:nowrap"><b style="color:' + x.couleur + '">' +
                 pc(x.pourcent) + '%</b> ' + ech(x.nom) + '</span>';
        }).join(' · ') + '</span></span>' +
        '<span class="p">' + nb(c.prix, 0) + ' $SWOGE</span>';
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        /* Le son part au CLIC, pas a la reponse du serveur. Attendre l'aller-
           retour ferait un decalage de plusieurs dixiemes entre le doigt et
           le bruit, et c'est precisement ce qui fait qu'une interface parait
           molle. Le coffre s'ouvre quand on appuie. */
        joueCoffre(dessin);
        sceneOuvre(dessin);
        if (etat.socket && etat.socket.readyState === 1)
          etat.socket.send(JSON.stringify({ type: 'shopOpen', chest: c.cle }));
      });
      boite.appendChild(b);
    });
    l.appendChild(boite);

    /* ---- LA PLANCHE DE COLLECTION ----
     *
     * Une rangee par famille, cinq cases du commun au mythique, et les cases
     * MANQUANTES sont dessinees elles aussi.
     *
     * C'est tout le sujet. Une grille qui ne montrerait que ce qu'on possede
     * se remplit et s'arrete ; celle-ci montre les trous, et un trou entre la
     * Clef de laiton et la Clef de coffre se voit de loin. La case vide est ce
     * qui fait ouvrir le coffre suivant — pas la case pleine.
     */
    var sortes = 0, combien = 0;
    C.items.forEach(function (o) { var q = inv[o.id] || 0; if (q) { sortes++; combien += q; } });

    var ttl = document.createElement('div');
    ttl.className = 'swp-g';
    ttl.textContent = 'Your collection — ' + sortes + ' of ' + C.items.length +
      (combien > sortes ? ' (' + combien + ' owned)' : '');
    l.appendChild(ttl);

    /* CE QUE LES FRUITS NE FONT PAS, ecrit avant la collection et pas apres.
       Ils portent des phrases de pouvoir — « une traction sur les chances »,
       « le tout etait ecrit ». Sur un site ou l'on joue de l'argent, laisser
       croire qu'un objet achete modifie les chances serait une affirmation
       fausse sur un produit de jeu, et le fait qu'elle soit sous-entendue
       plutot qu'ecrite n'y change rien. */
    /* Le mot vient de la SAISON. « No fruit changes the odds » sous une
       planche d'armes affaiblit la mention la plus importante de la page :
       une phrase qui parle visiblement d'autre chose se lit comme un texte
       oublie, et on ne lit pas les textes oublies. */
    var sujet = C.sujet || 'item';
    var mn = document.createElement('div');
    mn.className = 'swb-mention';
    mn.textContent = 'Powers are flavour. No ' + sujet +
      ' changes the odds, the payouts or anything else in a game.';
    l.appendChild(mn);

    /* LA TAILLE DE L'EDITION, dite en clair. C'est la seule chose qui donne
       un sens au mot « mythique » : sans elle, une rarete n'est qu'une
       difficulte d'obtention, et rien ne dit combien il en existera. Le
       nombre est calcule sur le catalogue recu, pas ecrit en dur — il suit
       les plafonds du serveur sans qu'on ait a y repenser. */
    var total = 0, capee = true;
    C.items.forEach(function (o) {
      if (!o.plafond) { capee = false; return; }
      total += o.plafond;
    });
    if (capee && total) {
      var ed = document.createElement('div');
      ed.className = 'swb-mention swb-ed';
      /* Le numero de saison et le mot viennent du catalogue, pas d'ici. Ecrits
         en dur, ils annoncaient « Season 1 — 9 600 fruits » au-dessus d'une
         planche d'armes : le seul chiffre qui donne un sens au mot
         « mythique » devenait le plus faux de la page. */
      ed.innerHTML = 'Season ' + (C.saison || 1) + ' — <b>' + nb(total, 0) + '</b> ' +
        sujet + 's will ever exist. ' +
        C.raretes.map(function (r) {
          return '<span style="color:' + r.couleur + '">' + nb(r.plafond, 0) + ' ' + ech(r.nom) + '</span>';
        }).join(' \u00b7 ') + ' of each.';
      l.appendChild(ed);
    }

    if (!sortes) {
      var v = document.createElement('div');
      v.className = 'swb-vide';
      v.textContent = 'Nothing yet. Six families, five tiers each — ' +
        'open a chest above and start filling the board.';
      l.appendChild(v);
    }

    /* L'ordre des raretes vient du serveur, du commun au mythique : la rangee
       se lit donc de gauche a droite comme une montee. */
    C.familles.forEach(function (f) {
      var lot = C.raretes.map(function (r) {
        return C.items.filter(function (o) { return o.famille === f.cle && o.rarete === r.cle; })[0];
      });
      var eus = lot.filter(function (o) { return o && inv[o.id]; }).length;

      var tete = document.createElement('div');
      tete.className = 'swb-fam' + (eus === lot.length ? ' plein' : '');
      tete.innerHTML = '<b style="color:' + (f.couleur || '#E7C97A') + '">' + ech(f.nom) + '</b>' +
        '<i>' + eus + '/' + lot.length + (eus === lot.length ? ' \u2713' : '') + '</i>';
      l.appendChild(tete);

      var r = document.createElement('div');
      r.className = 'swb-r';
      lot.forEach(function (o, i) {
        var d = document.createElement('div');
        var q = o ? (inv[o.id] || 0) : 0;
        d.className = 'swb-o' + (q ? '' : ' vide');
        d.style.borderColor = teinte[C.raretes[i].cle] || '#8DA0C4';
        var reste = o && o.plafond ? Math.max(0, o.plafond - (o.emis || 0)) : null;
        d.title = (o ? o.nom : '') + ' \u2014 ' + C.raretes[i].nom +
                  (q ? (o.pouvoir ? '\n' + o.pouvoir : '') : ' (missing)') +
                  (reste === null ? '' : '\n' + nb(reste, 0) + ' of ' + nb(o.plafond, 0) + ' left');
        d.innerHTML = o
          ? (q ? vignette(o) : '<span class="t">' + ech(C.raretes[i].nom) + '</span>')
          : '';
        if (q > 1) d.innerHTML += '<span class="q" style="color:' +
          (teinte[o.rarete] || '#8DA0C4') + '">x' + q + '</span>';
        r.appendChild(d);
      });
      l.appendChild(r);
    });

  }

  /* ---- OU SONT LES AUTRES : SA PROPRE SECTION ----
   *
   * Il vivait au bas de la boutique, apres la course, les trois coffres et la
   * planche de collection. L'ordre de lecture le justifiait — on se compare
   * apres avoir regarde sa propre collection — mais il exigeait de faire
   * defiler quatre blocs pour arriver au cinquieme, et sur un telephone
   * personne ne va chercher si loin ce qu'il ne sait pas etre la. La question
   * « je le trouve ou ? » a tranche : une section qu'il faut expliquer n'est
   * pas au bon endroit.
   *
   * Il a donc son entree, JUSTE SOUS la boutique. Le raisonnement d'ordre
   * tient toujours, il est simplement porte par la liste des sections au lieu
   * du defilement : on lit « Chests & items » avant « Collectors » parce que
   * l'un est ecrit au-dessus de l'autre.
   *
   * Le rang se joue sur les fruits DIFFERENTS, pas sur la quantite : sinon
   * celui qui ouvre le plus de coffres de bois gagne, alors que la collection
   * se termine en trouvant ce qu'on n'a pas.
   */
  /* ---- LE COFFRE DU JOUR ----
   *
   * En TETE de la boutique, avant la course et avant les coffres payants.
   * L'ordre dit quelque chose : la premiere chose qu'on propose ne coute
   * rien. Un joueur qui n'a jamais ouvert de coffre ne sait pas ce que ca
   * fait ; celui-la le lui montre, et c'est le meme tirage, les memes
   * plafonds, la meme animation.
   *
   * Quand il est deja pris, la carte RESTE — grisee, avec « demain ». La
   * retirer donnerait un panneau qui change de forme selon l'heure, et le
   * joueur ne saurait plus qu'il existe.
   */
  function rendOffert(l) {
    if (!OFFERT || !OFFERT.coffre) return;
    var d = document.createElement('button');
    d.type = 'button';
    d.className = 'swb-off' + (OFFERT.dispo ? '' : ' pris');
    d.disabled = !OFFERT.dispo;
    d.innerHTML =
      '<img class="cf" alt="" src="img/shop/coffre_' + encodeURIComponent(OFFERT.image || 'bois') +
        '.webp" onerror="this.remove()">' +
      '<span><span class="n">' + (OFFERT.dispo ? 'Your free chest' : 'Free chest taken') + '</span>' +
      '<span class="o">' + (OFFERT.dispo
        ? 'One ' + ech(OFFERT.nom) + ' every day \u00b7 costs nothing'
        : 'Come back tomorrow for another one') + '</span></span>' +
      '<span class="p">' + (OFFERT.dispo ? 'OPEN' : '\u2713') + '</span>';
    d.addEventListener('click', function () {
      if (d.disabled) return;
      d.disabled = true;
      joueCoffre(OFFERT.image || 'bois');
      sceneOuvre(OFFERT.image || 'bois');
      envoie({ type: 'freeChestOpen' });
    });
    l.appendChild(d);
  }

  /*
   * ===================== LE BANDEAU DES SAISONS =====================
   *
   * Une saison verrouillee est MONTREE, pas cachee. Cacher la saison 2
   * jusqu'a son ouverture reviendrait a n'en parler qu'a ceux qui n'ont plus
   * rien a y gagner : c'est justement pendant qu'elle est fermee qu'elle
   * donne une raison de finir sa collection.
   *
   * D'ou le contenu de la pastille verrouillee : pas « locked », mais ce
   * qu'il manque exactement — « 1/3 lines ». Un verrou sans compteur se lit
   * comme une porte murée ; le meme verrou avec « il en manque deux » se lit
   * comme un objectif.
   *
   * La pastille du gagnant en avance dit « early ». C'est la seule chose que
   * les trois premiers emportent en plus des jetons, et si elle ne s'affiche
   * nulle part elle n'existe pas.
   */
  function rendSaisons(l) {
    var S = BOUTIQUE.saisons;
    if (!S || S.length < 2) return;         // une seule saison : rien a choisir
    var b = document.createElement('div');
    b.className = 'swb-sai';
    S.forEach(function (s) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'swb-s' + (s.n === SAISON ? ' on' : '') + (s.ouverte ? '' : ' clos');
      /* Le nom du serveur porte « Season 2 — Weapons » ; on ne garde que ce
         qui distingue, la place est comptee sur un telephone. */
      var court = String(s.nom).split('—').pop().trim();
      t.innerHTML = '<b>S' + s.n + '</b> ' + ech(court) +
        (s.ouverte
          ? (s.avance ? '<i class="av">early</i>' : '')
          : '<i class="cl">' + s.faites + '/' + s.sur + ' lines</i>');
      t.title = s.ouverte
        ? (s.avance ? 'You are in early — you finished line #' + s.rang : s.nom)
        : 'Opens when ' + s.sur + ' players have completed a full family (' +
          s.faites + ' so far). The first three get in as soon as their own line is done.';
      if (s.ouverte && s.n !== SAISON) t.addEventListener('click', function () {
        SAISON = s.n;
        if (etat.socket && etat.socket.readyState === 1)
          etat.socket.send(JSON.stringify({ type: 'shop', season: SAISON }));
      });
      t.disabled = !s.ouverte;
      b.appendChild(t);
    });
    l.appendChild(b);
  }

  function rendClassementFruits() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    /* Les deux sections lisent la MEME reponse du serveur — `boutiqueEtat`
       porte le catalogue et le classement ensemble. Rien a demander de plus,
       et rien qui puisse diverger entre les deux vues. */
    if (!BOUTIQUE || !BOUTIQUE.catalogue) {
      var att = document.createElement('div');
      att.className = 'swp-v'; att.textContent = 'Loading…';
      l.appendChild(att);
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'shop', season: SAISON }));
      return;
    }
    var C = BOUTIQUE.catalogue;
    var teinte = {};
    C.raretes.forEach(function (r) { teinte[r.cle] = r.couleur; });

    /* Le meme bandeau qu'en boutique : le classement d'une saison n'a de sens
       qu'en disant DE QUELLE saison il parle, et changer de saison ici doit
       changer le classement, pas obliger a repasser par la boutique. */
    rendSaisons(l);

    var CL = BOUTIQUE.classement;
    if (!CL || !CL.top || !CL.top.length) {
      /* Personne n'a encore ouvert de coffre. On le DIT, avec le geste qui
         change ca — un panneau vide sans explication se lit comme une panne,
         et ici c'est une place a prendre. */
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.textContent = 'No collector yet. Open a chest and you are first on this board.';
      l.appendChild(v);
      return;
    }

    var ct = document.createElement('div');
    ct.className = 'swp-g';
    ct.textContent = 'Collectors — ' + CL.total + ' playing';
    l.appendChild(ct);

    var tb = document.createElement('div');
    tb.className = 'swb-cl';
    var dedans = false;
    tb.innerHTML = CL.top.map(function (x) {
      var moi = CL.moi && x.rang === CL.moi.rang && x.sortes === CL.moi.sortes;
      if (moi) dedans = true;
      return ligneCl(x, moi, teinte, null, C);
    }).join('') +
      /* Si le joueur n'est pas dans le haut, sa ligne est ajoutee a part.
         Un classement ou l'on ne se trouve pas ne sert a rien. */
      (CL.moi && !dedans
        ? '<div class="sep"></div>' + ligneCl(CL.moi, true, teinte, 'You', C)
        : '');
    l.appendChild(tb);

    /* La sortie : on regarde ou en sont les autres, l'envie qui suit est
       d'ouvrir un coffre. La section d'a cote est a un clic, mais elle est
       AU-DESSUS dans la liste — donc invisible depuis le bas de celle-ci. */
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'swb-vers';
    b.textContent = '🛒 Open a chest';
    b.addEventListener('click', function () { profVa('sh'); });
    l.appendChild(b);
  }

  /*
   * Une ligne du classement, avec SA RANGEE DE TRENTE FRUITS.
   *
   * Les fruits possedes sont allumes, les manquants restent eteints et gris.
   * Un nombre — « 26/30 » — dit la meme chose, mais on ne voit pas d'un coup
   * d'oeil QUI a les mythiques ni ou sont les trous. La rangee, si : elle se
   * lit comme un code-barres, et celle du premier brille plus que les autres
   * sans qu'on ait a comparer deux chiffres.
   *
   * Chaque fruit garde sa couleur de rarete en halo : une case rouge allumee
   * au milieu d'une rangee terne se repere avant qu'on ait lu le nom.
   *
   * `nom` force le libelle — la ligne du joueur hors du haut n'a pas de nom a
   * afficher, elle a « You ».
   */
  function ligneCl(x, moi, teinte, nom, C) {
    var strip = '';
    if (x.avoir && C && C.items) {
      strip = '<div class="bar">' + C.items.map(function (o, i) {
        var a = x.avoir.charAt(i) === '1';
        return '<span class="' + (a ? 'a' : '') + '"' +
          (a ? ' style="--t:' + (teinte[o.rarete] || '#8DA0C4') + '"' : '') +
          ' title="' + ech(o.nom) + '">' +
          (a ? '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) +
               '.webp" loading="lazy" onerror="this.remove()">' : '') +
          '</span>';
      }).join('') + '</div>';
    }
    return '<div class="r' + (moi ? ' moi' : '') + '">' +
      '<div class="h">' +
        '<span class="rg">' + (x.rang <= 3 ? ['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49'][x.rang - 1] : x.rang) + '</span>' +
        '<span class="nm">' + ech(nom || x.nom) + '</span>' +
        (x.pleines ? '<span class="fp">' + x.pleines + '\u00d7 5/5</span>' : '') +
        '<span class="sc" style="color:' + (teinte[x.meilleure] || '#8DA0C4') + '">' +
          x.sortes + '<i>/30</i></span>' +
      '</div>' + strip + '</div>';
  }

  /* Le nom, toujours ; le dessin par-dessus, s'il existe. L'image se retire
     elle-meme si le fichier manque, ce qui laisse le nom seul plutot qu'une
     icone cassee — c'est ce qui permet d'ouvrir la boutique avant que les
     trente dessins soient faits.
     `muet` sert a la banniere du gain, qui ecrit deja le nom a cote : sans
     lui il apparaissait deux fois, l'un sous l'autre. */
  /*
   * LE SON DES COFFRES.
   *
   * ---- pourquoi il est SYNTHETISE et pas enregistre ----
   *
   * Les sons demandes venaient de Minecraft et de Zelda. Ce sont des oeuvres
   * sous copyright, et les poser sur un site qui encaisse de l'argent est une
   * exposition reelle, pas theorique — Nintendo est l'ayant droit le plus
   * actif du secteur. On fabrique donc les memes CARACTERES au lieu de
   * copier les enregistrements : un choc de bois sec, un carillon qui monte,
   * un gong profond.
   *
   * Trois avantages qui n'ont rien a voir avec le droit, et qui suffiraient
   * a eux seuls : zero octet a telecharger, aucun decodage a l'ouverture de
   * la page, et un son qu'on regle en changeant un nombre au lieu de
   * regenerer un fichier.
   *
   * ---- si tu veux quand meme tes fichiers ----
   *
   * Depose-les en `img/shop/son_<clef>.mp3` — son_bois, son_or, son_mythe.
   * Le code les prefere automatiquement et ne synthetise que ce qui manque.
   * Le choix reste entier, il n'est simplement pas le defaut.
   *
   * ---- le reglage de volume est PARTAGE ----
   *
   * `swogeSfxVol` est la clef que les pages de jeu utilisent deja pour leur
   * propre son. On la relit ici plutot que d'en inventer une deuxieme : un
   * joueur qui coupe le son au blackjack ne s'attend pas a le retrouver dans
   * la boutique.
   */
  var sonCtx = null, sonFichier = {};
  /*
   * ---- COMBIEN DE TEMPS ON LAISSE JOUER CHAQUE SON ----
   *
   * Les fichiers fournis sont bien plus longs que ce qu'un geste d'interface
   * supporte. Mesure de l'enveloppe, par tranches de cinquante millisecondes :
   *
   *   clic    3,07 s de fichier, mais l'energie tient dans les 150 premieres
   *           millisecondes — le reste est du silence encode ;
   *   bois    1,28 s, du son jusqu'a 0,50 ;
   *   or     10,77 s, du son jusqu'a 7,75. C'est « opening AND item catch » :
   *           l'ouverture PUIS la fanfare de l'objet. On garde l'ouverture ;
   *   mythe   4,46 s, du son jusqu'a 3,70.
   *
   * On coupe A LA LECTURE, pas au fichier. Recouper un mp3 demanderait de le
   * reencoder — perte de qualite, poids en plus, et une longueur qu'on ne
   * peut plus regler sans repasser par un outil. Ici c'est un nombre.
   *
   * Ce qui se passe sans ces bornes : dix coffres ouverts a la suite font dix
   * fanfares de sept secondes qui se recouvrent.
   */
  var SON_DUREE = { clic: 200, bois: 700, or: 2600, mythe: 3100 };
  function sonVolume() {
    var v = parseFloat(localStorage.getItem('swogeSfxVol'));
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  }
  function sonPret() {
    if (!sonCtx) {
      try { sonCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (sonCtx.state === 'suspended') { try { sonCtx.resume(); } catch (e) {} }
    return sonCtx;
  }

  /* Une enveloppe percussive : attaque immediate, extinction exponentielle.
     `setValueAtTime(0)` d'abord, sinon le premier son de la page part a plein
     volume sans rampe et claque. */
  function sonEnv(ctx, gain, t0, pic, duree) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, pic), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
  }
  function sonNote(ctx, sortie, t0, freq, pic, duree, forme) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = forme || 'sine'; o.frequency.setValueAtTime(freq, t0);
    sonEnv(ctx, g, t0, pic, duree);
    o.connect(g); g.connect(sortie); o.start(t0); o.stop(t0 + duree + 0.05);
  }
  /* Un souffle court, filtre : c'est ce qui fait la matiere — le bois claque,
     il ne sonne pas. Une note pure seule ferait un jouet electronique. */
  function sonSouffle(ctx, sortie, t0, freq, q, pic, duree) {
    var n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = b;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t0); f.Q.setValueAtTime(q, t0);
    var g = ctx.createGain(); sonEnv(ctx, g, t0, pic, duree);
    n.connect(f); f.connect(g); g.connect(sortie); n.start(t0); n.stop(t0 + duree + 0.05);
  }

  /* Les trois coffres, un caractere chacun. */
  var SON_COFFRE = {
    /* BOIS — un couvercle qui claque, puis retombe. Deux chocs, pas un : un
       seul se lit comme un bouton, deux racontent un geste. */
    bois: function (ctx, out, t) {
      sonSouffle(ctx, out, t, 900, 1.2, 0.35, 0.10);
      sonNote(ctx, out, t, 110, 0.30, 0.16, 'triangle');
      sonSouffle(ctx, out, t + 0.13, 700, 1.4, 0.18, 0.08);
      sonNote(ctx, out, t + 0.13, 85, 0.16, 0.13, 'triangle');
    },
    /* OR — un carillon qui MONTE. La montee est tout : quatre notes qui
       s'elevent se lisent comme une recompense, les memes en descendant se
       liraient comme une perte. */
    or: function (ctx, out, t) {
      sonSouffle(ctx, out, t, 2400, 2, 0.10, 0.06);
      [523.25, 659.26, 783.99, 1046.5].forEach(function (f, i) {
        sonNote(ctx, out, t + i * 0.075, f, 0.22, 0.55 + i * 0.12, 'triangle');
        sonNote(ctx, out, t + i * 0.075, f * 2, 0.06, 0.35, 'sine');
      });
    },
    /* CLIC — un declic sec et tres court. Sert de repli si le fichier manque :
       sans lui, `sonSynthese` retomberait sur le coffre de bois et chaque
       bouton du site ferait le bruit d'un couvercle. */
    clic: function (ctx, out, t) {
      sonSouffle(ctx, out, t, 2600, 3, 0.14, 0.022);
      sonNote(ctx, out, t, 1400, 0.07, 0.02, 'square');
    },
    /* MYTHE — le dong. Un gong n'est pas une note : ses partiels ne sont PAS
       des multiples entiers de la fondamentale (2,76 et 5,40 ici), et c'est
       exactement ce qui fait la difference entre une cloche et un orgue. */
    mythe: function (ctx, out, t) {
      /* ---- LES NIVEAUX SONT MESURES, PAS ESTIMES ----
       * Premiere version : crete 0,77 et RMS 0,068, contre 0,33 et 0,0098
       * pour le bois. Sept fois l'energie du coffre de bois, soit environ
       * dix-sept decibels — un joueur qui enchaine un bois puis un mythique
       * au casque prend une claque. Le mythique DOIT etre le plus gros des
       * trois, mais l'ecart se compte en decibels, pas en « plus fort ».
       * Les quatre gains ci-dessous sont regles pour tenir vers 0,04 de RMS,
       * soit environ douze decibels au-dessus du bois : nettement plus gros,
       * jamais douloureux.
       *
       * La crete venait aussi de quatre sinus qui partent EN PHASE a t=0 et
       * s'additionnent. Les deux graves sont donc decales de quelques
       * millisecondes — inaudible, et ca casse la sommation. */
      sonNote(ctx, out, t, 55, 0.20, 2.6, 'sine');
      sonNote(ctx, out, t + 0.004, 110, 0.17, 2.4, 'sine');
      sonNote(ctx, out, t + 0.002, 110 * 2.76, 0.09, 1.8, 'sine');
      sonNote(ctx, out, t, 110 * 5.40, 0.045, 1.2, 'sine');
      sonSouffle(ctx, out, t, 3000, 1, 0.08, 0.25);
      /* Une seconde frappe tres en retrait, decalee : c'est ce qui donne
         l'impression d'un volume enorme plutot que d'un haut-parleur. */
      sonNote(ctx, out, t + 0.28, 110, 0.07, 2.0, 'sine');
    },
  };

  /*
   * ---- LE CLIC, SUR TOUT LE SITE ----
   *
   * Un seul ecouteur, sur le document, en phase de CAPTURE. Poser un
   * gestionnaire sur chaque bouton demanderait de repasser sur les vingt-six
   * pages et d'y penser a chaque bouton ajoute ensuite ; la delegation le
   * fait une fois pour toutes, y compris pour les boutons crees plus tard.
   *
   * La capture plutot que la remontee : un bouton qui appelle
   * `stopPropagation` — il y en a — ne doit pas avaler son propre clic.
   *
   * Ce qui NE sonne pas, et c'est deliberé :
   *   • les coffres, qui ont deja leur son a eux. Deux sons pour un geste se
   *     lisent comme un defaut ;
   *   • les champs de saisie et les listes deroulantes, ou le clic sert a
   *     placer un curseur, pas a declencher quelque chose ;
   *   • un element desactive, qui ne fait rien.
   */
  var CLIQUABLE = 'button, a, [role="button"], .swp-mir, .swp-t button, summary';
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest(CLIQUABLE);
    if (!el) return;
    if (el.disabled) return;
    if (el.closest('.swb-cof')) return;              // le coffre a son propre son
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    joueCoffre('clic');
  }, true);

  /*
   * ================== L'OUVERTURE, AU CENTRE DE L'ECRAN ==================
   *
   * Sans ca, le coffre OUVERT n'existait qu'en vignette de quarante-six
   * pixels dans une banniere — deux dessins sur six ne servaient a rien.
   *
   * ---- l'attente est REELLE, elle n'est pas jouee ----
   *
   * La scene s'ouvre au CLIC, avec le coffre ferme qui tremble. Elle ne
   * s'ouvre pas quand le serveur repond : entre les deux il y a un
   * aller-retour reseau, et c'est precisement cette attente-la qu'on met en
   * scene. Aucune temporisation n'est ajoutee pour faire durer.
   *
   * Une seule borne, dans l'autre sens : un plancher de 900 ms. Sur une
   * connexion rapide la reponse arrive en cinquante millisecondes, et le
   * coffre s'ouvrirait avant d'avoir eu l'air ferme — on verrait un
   * clignotement, pas une ouverture. Le plancher ne RALENTIT rien, il
   * garantit que l'image ferme a ete vue.
   *
   * ---- la rarete se lit avant le nom ----
   *
   * La lueur derriere le coffre prend la couleur de la rarete au moment de
   * l'ouverture. Le joueur sait qu'il a un legendaire a la couleur, une
   * demi-seconde avant que le mot s'affiche — et c'est la demi-seconde qui
   * fait le jeu.
   */
  var scene = null, sceneT0 = 0, sceneAttente = null;

  function sceneMonte() {
    if (scene) return scene;
    scene = document.createElement('div');
    scene.className = 'swb-scene';
    scene.innerHTML =
      '<div class="halo"></div>' +
      '<div class="boite">' +
        '<img class="cof" alt="">' +
        '<img class="fr" alt="">' +
      '</div>' +
      '<div class="txt"><div class="rar"></div><div class="nom"></div>' +
        '<div class="num"></div><div class="pv"></div></div>' +
      '<div class="tap">tap to close</div>';
    /* Un clic n'importe ou ferme. Personne ne cherche un bouton de
       fermeture sur un ecran qui dure deux secondes. */
    scene.addEventListener('click', sceneFerme);
    document.body.appendChild(scene);
    return scene;
  }
  function sceneFerme() {
    if (!scene) return;
    scene.classList.remove('on', 'ouvert');
    clearTimeout(sceneAttente); sceneAttente = null;
    setTimeout(function () { if (scene && !scene.classList.contains('on')) scene.style.display = 'none'; }, 260);
  }
  /** Au clic : le coffre ferme, qui tremble. */
  function sceneOuvre(cle) {
    var e = sceneMonte();
    e.style.display = '';
    e.classList.remove('ouvert');
    e.querySelector('.cof').src = 'img/shop/coffre_' + encodeURIComponent(cle) + '.webp';
    e.querySelector('.fr').removeAttribute('src');
    e.querySelector('.rar').textContent = '';
    e.querySelector('.nom').textContent = '';
    e.querySelector('.num').textContent = '';
    e.querySelector('.pv').textContent = '';
    e.style.setProperty('--teinte', '#8DA0C4');
    /* Le reflow force l'animation a repartir quand on rouvre aussitot. */
    void e.offsetWidth;
    e.classList.add('on');
    sceneT0 = Date.now();
  }
  /** A la reponse : le couvercle s'ouvre et le fruit sort. */
  function sceneRevele(g, teinte, nomRarete) {
    if (!scene || !scene.classList.contains('on')) return;
    var reste = Math.max(0, 900 - (Date.now() - sceneT0));
    clearTimeout(sceneAttente);
    sceneAttente = setTimeout(function () {
      if (!scene || !scene.classList.contains('on')) return;
      scene.style.setProperty('--teinte', teinte || '#8DA0C4');
      scene.querySelector('.cof').src =
        'img/shop/coffre_' + encodeURIComponent(g.coffreImage || g.coffre) + '_ouvert.webp';
      scene.querySelector('.fr').src =
        'img/shop/' + encodeURIComponent(g.item.cle) + '.webp';
      scene.querySelector('.rar').textContent = nomRarete || '';
      scene.querySelector('.nom').textContent = g.item.nom;
      scene.querySelector('.num').textContent =
        (g.emis && g.plafond) ? '#' + nb(g.emis, 0) + ' of ' + nb(g.plafond, 0) : '';
      scene.querySelector('.pv').textContent = g.item.pouvoir || '';
      scene.classList.add('ouvert');
    }, reste);
  }

  /* La synthese, seule. Sortie separee pour que le repli puisse l'appeler. */
  function sonSynthese(cle, vol) {
    var ctx = sonPret(); if (!ctx) return;
    var out = ctx.createGain(); out.gain.value = vol; out.connect(ctx.destination);
    (SON_COFFRE[cle] || SON_COFFRE.bois)(ctx, out, ctx.currentTime + 0.01);
  }

  /*
   * ---- POURQUOI LE FICHIER NE PEUT PAS ETRE TENTE EN PREMIER ----
   *
   * La premiere version faisait exactement ca : `new Audio(...)` puis `play()`
   * et `return`. Resultat mesure : ZERO son au premier clic de chaque coffre.
   *
   * Un `<audio>` dont la source n'existe pas est un objet parfaitement
   * valide — il ne devient « casse » qu'a l'evenement `error`, qui arrive
   * APRES le clic. Le code voyait donc un objet vrai, appelait `play()`, la
   * promesse partait en echec, le `catch` l'avalait, et la synthese n'etait
   * jamais atteinte. Un `catch` vide sur une promesse de lecture audio, c'est
   * une panne silencieuse par construction.
   *
   * On inverse : le son SORT toujours, tout de suite, par la synthese. Le
   * fichier est sonde en parallele et ne prend la main qu'une fois qu'il a
   * declare pouvoir jouer — donc au clic suivant, jamais a celui-ci.
   */
  function joueCoffre(cle) {
    var vol = sonVolume();
    if (!vol) return;                       // le joueur a coupe le son
    if (sonFichier[cle] === undefined) {
      sonFichier[cle] = null;               // rien de jouable pour l'instant
      var a = new Audio('img/shop/son_' + encodeURIComponent(cle) + '.mp3');
      a.preload = 'auto';
      a.addEventListener('canplaythrough', function () { sonFichier[cle] = a; });
      a.addEventListener('error', function () { sonFichier[cle] = null; });
    }
    if (sonFichier[cle]) {
      try {
        var el = sonFichier[cle];
        el.currentTime = 0; el.volume = vol;
        var pr = el.play();
        /* Meme un fichier valide peut etre refuse — onglet en arriere-plan,
           politique d'autoplay. On ne reste pas muet pour autant. */
        if (pr && pr.catch) pr.catch(function () { sonSynthese(cle, vol); });
        var d = SON_DUREE[cle];
        if (d) {
          clearTimeout(el.__fin);
          el.__fin = setTimeout(function () {
            try { el.pause(); el.currentTime = 0; } catch (e) {}
          }, d);
        }
        return;
      } catch (e) {}
    }
    sonSynthese(cle, vol);
  }
  /* Le banc d'essai en a besoin pour mesurer ce qui sort. */
  window.SWOGE_SON_COFFRE = SON_COFFRE;

  function vignette(o, muet) {
    return (muet ? '' : '<span class="t">' + ech(courtNom(o.nom)) + '</span>') +
      '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" ' +
      'onerror="this.remove()">';
  }

  /* LE MOT « FRUIT » NE SERT A RIEN DANS LA CASE. Ils le sont tous, et sur
     une case de soixante-dix-huit pixels il fait passer « Miracle Fruit » sur
     deux lignes, qui recouvrent alors la moitie du dessin. « Miracle » tient
     sur une, et la ligne se pose au bas de l'image au lieu de la cacher.
     Le nom entier reste au survol et dans la banniere du gain, ou la place
     ne manque pas. */
  function courtNom(n) { return String(n).replace(/\s+Fruit$/i, ''); }

  /* Une chance s'ecrit court : 76 %, 2,8 %, 0,19 %, 0,01 %. `toFixed` fixe
     rendrait « 76.00 % » a cote de « 0.01 % ». */
  function pc(x) {
    if (x >= 10) return String(Math.round(x));
    if (x >= 1) return String(Math.round(x * 10) / 10);
    return String(Math.round(x * 100) / 100);
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
    /* ---- LA BARRE COMPTE DE L'XP, PLUS DES JETONS MISES ----
     *
     * Elle disait « 500 000 $SWOGE de plus pour le niveau 11 ». Une barre de
     * progression qui n'avance qu'en misant davantage, sur un site d'argent
     * reel, est un mecanisme d'incitation a la mise — et elle etait fausse
     * comme promesse de jeu : revenir tous les jours ne la bougeait pas d'un
     * pixel. Elle compte maintenant de l'XP, que cinq gestes alimentent.
     *
     * Le detail des sources part dans l'info-bulle plutot que dans la ligne :
     * ce qui compte a la lecture est « combien il m'en manque », pas d'ou
     * vient le total. */
    var srcNom = { connexion: 'daily', quete: 'quests', collection: 'collection',
                   famille: 'families', parrainage: 'invites' };
    var det = [];
    if (NIVEAU.xpVolume) det.push(nb(NIVEAU.xpVolume, 0) + ' XP from wagering');
    Object.keys(NIVEAU.sources || {}).forEach(function (k) {
      det.push(nb(NIVEAU.sources[k], 0) + ' XP from ' + (srcNom[k] || k));
    });
    d.innerHTML = '<div class="h"><span style="color:' + c + '">' + NIVEAU.palier +
      '</span> · Level <b>' + NIVEAU.niveau + '</b><i title="' + ech(det.join('\n')) + '">' +
      nb(NIVEAU.xp, 0) + ' XP</i></div>' +
      '<div class="b"><i style="width:' + NIVEAU.progression + '%;background:' + c + '"></i></div>' +
      '<div class="r">' + (NIVEAU.max
        ? 'Maximum level. Almost nobody gets here.'
        : nb(NIVEAU.restant, 0) + ' XP to level ' + (NIVEAU.niveau + 1) +
          ' \u00b7 <span class="sr">play daily, finish quests, collect</span>') + '</div>';
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
    /* LES PARIS NE SONT PAS DES MANCHES. « Rounds played » et « Total
       wagered » viennent du detail par jeu, qui ne s'ecrit qu'a la FIN d'une
       manche : un pari pose samedi et regle dimanche n'y entre pas avant, et
       un parieur voyait donc des zeros partout. On pose ses deux chiffres
       ici, et le detail complet vit dans ses onglets de paris. */
    if (s.paris && s.paris.total) {
      cases.push(['Bets placed', nb(s.paris.total, 0) +
        (s.paris.ouverts ? ' · ' + nb(s.paris.ouverts, 0) + ' running' : '')]);
      cases.push(['Bets won', s.paris.taux == null ? '—' : s.paris.taux + '%',
        s.paris.taux == null ? '' : (s.paris.taux >= 50 ? 'g' : '')]);
      cases.push(['Betting result', (s.paris.net >= 0 ? '+' : '') + nb(s.paris.net, 0) + ' $SWOGE',
        s.paris.net >= 0 ? 'g' : 'p']);
    }
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

  /* ---- LE BILAN DES PARIS ----
   *
   * Il repond a la seule question qu'un parieur se pose en ouvrant ses
   * paris : « est-ce que je m'en sors ? » — et elle n'a pas UNE reponse mais
   * trois, qu'il ne faut pas melanger.
   *
   *   • LE TAUX porte sur les paris TRANCHES, remboursements exclus. Un match
   *     annule n'est ni gagne ni perdu : le compter en defaite ferait baisser
   *     un taux sans qu'aucun pari n'ait ete perdu.
   *   • LE RESULTAT ne compte que les paris regles. Un pari en cours n'est ni
   *     gagne ni perdu ; l'inscrire en perte afficherait un joueur perdant le
   *     samedi soir, redevenu gagnant le dimanche sans avoir rien fait.
   *   • CE QUI COURT se dit a part : la mise engagee, et ce qu'elle rendrait.
   *
   * Sans un seul pari tranche, le taux n'existe pas — « 0 % » serait faux, et
   * decourageant pour rien devant un premier pari qui court encore.
   */
  function blocParis() {
    var b = STATS && STATS.paris;
    if (!b || !b.total) return null;
    var box = document.createElement('div');
    box.className = 'swp-st';
    var haut = document.createElement('div');
    haut.className = 'swp-st-h';
    haut.textContent = 'Betting record';
    box.appendChild(haut);
    var cases = [
      ['Bets placed', nb(b.total, 0)],
      ['Win rate', b.taux == null ? '—' : b.taux + '%', b.taux == null ? '' : (b.taux >= 50 ? 'g' : '')],
      ['Won / lost', nb(b.gagnes, 0) + ' / ' + nb(b.perdus, 0)],
      ['Total staked', nb(b.mise, 0) + ' $SWOGE'],
      ['Betting result', (b.net >= 0 ? '+' : '') + nb(b.net, 0) + ' $SWOGE', b.net >= 0 ? 'g' : 'p'],
      ['Returned', nb(b.rendu, 0) + ' $SWOGE'],
    ];
    if (b.ouverts) cases.push(['Still running',
      nb(b.ouverts, 0) + ' · ' + nb(b.aGagner, 0) + ' to return']);
    if (b.rembourses) cases.push(['Refunded', nb(b.rembourses, 0)]);
    if (b.plusGros) cases.push(['Biggest win', '+' + nb(b.plusGros.rendu, 0) + ' $SWOGE', 'g']);
    var g = document.createElement('div');
    g.className = 'swp-st-g';
    cases.forEach(function (c) {
      var d = document.createElement('div');
      d.innerHTML = '<span>' + c[0] + '</span><b class="' + (c[2] || '') + '">' + ech(c[1]) + '</b>';
      g.appendChild(d);
    });
    box.appendChild(g);
    if (b.juges) {
      var f = document.createElement('div');
      f.className = 'swp-st-f';
      /* Ce que le taux NE dit pas. Un taux flatte : on peut gagner la moitie
         de ses paris et perdre de l'argent, parce qu'un pari a cote courte
         rapporte moins qu'un pari a cote longue ne coute. */
      f.textContent = 'Win rate counts settled bets only — refunds are neither won nor lost. ' +
        'The result is what matters: you can win half your bets and still be down.';
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
    /* La boutique ne vient pas des FAMILLES — elle a sa propre entree, entre
       le compte et les sections — donc elle n'est pas dans ONGLETS et son
       titre se pose ici. */
    if (!nom && k === 'sh') nom = 'Shop';
    if (!nom && k === 'cl') nom = 'Collection ranking';
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
    } else connecteSeul();   // socket tombee : on la releve pendant qu'il lit
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
    /* On redemande a chaque ouverture, et on efface l'objet gagne : la
       banniere « vous avez obtenu… » appartient a l'ouverture qui vient
       d'avoir lieu, pas a la visite suivante. */
    /* On repart TOUJOURS sur les manches en ouvrant l'historique. Rouvrir sur
       « Transferts » parce qu'on les avait regardes la veille donne
       l'impression d'avoir appuye sur autre chose — c'est la meme raison qui
       fait que le tiroir s'ouvre sur son sommaire. */
    if (k === 'hi') HISTO = 'r';
    if (k === 'sh' || k === 'cl') {
      /* On efface l'objet gagne : la banniere « vous avez obtenu… »
         appartient a l'ouverture qui vient d'avoir lieu, pas a la visite
         suivante. Le classement demande la MEME chose — une seule reponse du
         serveur porte le catalogue et le classement — donc les deux sections
         se rafraichissent l'une l'autre au lieu de se contredire. */
      if (BOUTIQUE) BOUTIQUE = { catalogue: BOUTIQUE.catalogue, inventaire: BOUTIQUE.inventaire };
      if (etat.socket && etat.socket.readyState === 1) {
        try { etat.socket.send(JSON.stringify({ type: 'shop', season: SAISON })); } catch (e) {}
      }
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
    /* La boutique et le classement ne lisent AUCUN journal : ils se servent
       de `shop`, deja demande par profVa. Sans cette sortie, ouvrir la
       boutique envoyait quand meme une demande d'historique de genre inconnu
       — que le serveur honore en relisant tout le journal du joueur pour
       rendre vingt-cinq lignes que personne n'affiche. */
    if (profOnglet === 'sh' || profOnglet === 'cl') return;
    if (profCharge) return;
    if (!etat.socket || etat.socket.readyState !== 1) { profRend(); return; }
    profCharge = true;
    try {
      /* Le curseur rendu par le serveur est une POSITION dans le fichier du
         joueur, pas un horodatage : trente manches lancees d'affilee partagent
         la meme milliseconde, et « ce qui precede cet instant » en sautait une
         a chaque page. On le renvoie tel quel, sans l'interpreter. */
      var q = { type: 'history', kind: (profOnglet === 'hi' ? HISTO : profOnglet), limit: 25 };
      if (profFin !== null) q.cursor = profFin;      // absent = depuis la fin
      etat.socket.send(JSON.stringify(q));
    } catch (e) { profCharge = false; }
    setTimeout(function () { profCharge = false; }, 6000);
  }

  function poseHistorique(m) {
    profCharge = false;
    if (!profMonte()) return;
    /* La reponse porte le GENRE demande, pas « hi ». Comparer a `profOnglet`
       jetait toutes les reponses de l'historique fusionne — la liste restait
       vide sans qu'aucune erreur ne le dise. */
    var attendu = (profOnglet === 'hi') ? HISTO : profOnglet;
    if (m.kind !== attendu) return;         // reponse d'un onglet qu'on a quitte
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
    } else if (e.k === 'ca') {
      /* Un credit envoye depuis le panneau : dedommagement, lot, rattrapage.
         Sans cette ligne, le solde monte sans explication — et un solde qui
         bouge tout seul se prend pour un bug, ou pour un gain qu'on ira
         chercher a nouveau. Le motif, quand il y en a un, tient lieu de
         message : c'est le seul mot que le joueur recevra. */
      d.innerHTML = '<div class="w"><b>Credited by the team</b><span>' + quand(e.t) +
                    (e.note ? ' · ' + ech(e.note) : '') + '</span></div>' +
                    '<div class="v"><b class="g">+' + nb(e.m) + '</b><span>$SWOGE</span></div>';
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
    if (u) {
      el.style.setProperty('--cadre', 'url("' + u + '")');
      el.classList.add('swcad');
      /* ---- LE CADRE A BESOIN D'UN REPERE, ET LA FEUILLE NE SUFFIT PAS ----
       *
       * Il est dessine par un `::after` en `position:absolute`, donc mesure sur
       * le premier ancetre POSITIONNE. `.swcad` pose bien `position:relative`,
       * mais une page peut la defaire : la roue rangeait le bouton de profil
       * dans une colonne en `position:static`, et le cadre allait alors se
       * mesurer sur le HUD tout entier — un anneau dore de deux cents pixels
       * autour du solde et du bouton de connexion, a cote d'un avatar qui, lui,
       * n'en avait plus.
       *
       * On regarde donc ce qui est REELLEMENT calcule, pas ce que la feuille
       * demande, et on ne corrige que le cas casse : un `fixed` ou un
       * `absolute` voulu par la page est laisse tel quel — les deux font aussi
       * bien l'affaire comme repere. */
      try {
        if (window.getComputedStyle(el).position === 'static')
          el.style.setProperty('position', 'relative', 'important');
      } catch (e) {}
    }
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
    peintBarreBas();
  }

  /* L'avatar de la barre du bas, et la disparition de celui du haut.
     Le cadre de palier demenage avec lui : c'est la seule chose de son niveau
     qu'un joueur voit en permanence, elle ne doit pas se perdre en route. */
  function peintBarreBas() {
    if (!barreBas) return;
    var b = barreBas.querySelector('.swbb-prof');
    var av = b && b.querySelector('.av');
    if (!av) return;
    if (MOI && (MOI.photo || estBadge(MOI.visage))) {
      av.textContent = '';
      av.style.backgroundImage = 'url("' + (MOI.photo ? urlPhoto(MOI.address) : urlBadge(MOI.visage)) + '")';
    } else {
      av.style.backgroundImage = '';
      av.textContent = (MOI && MOI.visage) || '\uD83D\uDC64';
    }
    if (NIVEAU && NIVEAU.niveau > 0) {
      av.style.borderColor = couleurPalier(NIVEAU.palier);
      b.title = 'Level ' + NIVEAU.niveau + ' \u00b7 ' + NIVEAU.palier;
    }
    /* UNE SEULE POIGNEE. Le bouton du haut s'efface des que la barre est la :
       deux facons d'ouvrir le meme panneau, l'une hors de portee du pouce,
       obligent a se demander laquelle ouvre quoi. */
    if (profBtn) profBtn.style.display = 'none';
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
    /* L'infobulle NOMME ce qui attend. Une pastille qui dit « 3 » sans dire
       de quoi oblige a ouvrir pour savoir — ce qui est peut-etre l'effet
       recherche, mais c'est un effet qu'on obtient une fois. */
    if (ATTENTE && ATTENTE.coffre) t.push('Your free chest is waiting');
    if (ATTENTE && ATTENTE.serie) t.push('Daily reward ready');
    if (ATTENTE && ATTENTE.quetes) t.push(ATTENTE.quetes + ' quest' + (ATTENTE.quetes === 1 ? '' : 's') + ' to claim');
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
    poseCopieAdresse(adr);
    poseLienProfil();
    peintChiffres();
  }

  /* ---- LES TROIS CHIFFRES DE L'EN-TETE ----
   *
   * Solde, serie, collection. Le critere de tri n'a pas ete « qu'est-ce qu'on
   * peut afficher » mais « qu'est-ce qui change assez souvent pour qu'on
   * revienne le regarder » — c'est le seul qui trie utilement. Le volume
   * mise, le meilleur gain et la date d'inscription ne changent pas d'une
   * session a l'autre : ce sont des archives, elles restent dans l'apercu.
   *
   * La serie est CLIQUABLE quand elle est a prendre : un chiffre qui annonce
   * une recompense sans permettre de la prendre oblige a chercher ou, et on
   * ne cherche pas.
   */
  function peintChiffres() {
    var z = profBoite && profBoite.querySelector('.swp-ch');
    if (!z) return;
    z.innerHTML = '';
    var cases = [];

    /* 1. LE SOLDE. Il manquait, sur un site ou chaque action est une somme. */
    if (SOLDE !== null && !isNaN(SOLDE))
      cases.push({ b: nb(SOLDE, 0), i: '$SWOGE', t: 'Your balance' });

    /* 2. LA SERIE. Le seul chiffre qui donne une raison de revenir DEMAIN. */
    if (SERIE && SERIE.day !== undefined) {
      var pret = !SERIE.claimedToday;
      cases.push({
        b: '\uD83D\uDD25 ' + (SERIE.day || 0),
        /* Un ETAT, pas un ordre. « claim day 7 » sur une case qu'on ne peut
           pas toucher promet un geste qui n'existe pas ici — la serie se
           reclame sur la table de jeu, ou le bouton est deja. */
        i: pret ? 'reward ready' : 'day streak',
        t: pret ? 'Your daily reward is waiting on any game table'
                : 'Come back tomorrow to keep the streak',
        cls: pret ? 'pret' : 'feu',
      });
    }

    /* 3. LES QUETES DU JOUR. La rangee « Daily Quests » etait une PORTE : elle
       ne disait ni combien sont finies, ni s'il en reste une a reclamer. Une
       recompense non reclamee restait invisible jusqu'a ce qu'on pense a
       aller voir — c'est-a-dire jamais. */
    if (MISSIONS && MISSIONS.length) {
      var faites = MISSIONS.filter(function (q) { return q.done; }).length;
      var aPrendre = MISSIONS.filter(function (q) { return q.done && !q.claimed; }).length;
      cases.push({
        b: aPrendre ? '\u2713 ' + aPrendre : faites + '/' + MISSIONS.length,
        i: aPrendre ? 'to claim' : 'quests',
        t: aPrendre ? aPrendre + ' finished quest' + (aPrendre === 1 ? '' : 's') + ' waiting for you'
                    : faites + ' of ' + MISSIONS.length + ' done today',
        cls: aPrendre ? 'pret' : '',
      });
    }

    /* 4. LA COLLECTION. Ce qui fait rouvrir un coffre. */
    if (BOUTIQUE && BOUTIQUE.classement && BOUTIQUE.classement.moi)
      cases.push({ b: BOUTIQUE.classement.moi.sortes + '/' + BOUTIQUE.classement.sur,
                   i: 'collection', t: 'Fruits you own' });

    /* ---- CES CASES NE SE CLIQUENT PAS ----
     *
     * Elles l'ont ete, et c'etait une faute. Celle des quetes faisait un
     * `location.href` : depuis une table de jeu, elle quittait la page EN
     * PLEINE MANCHE. Les deux autres ouvraient la boutique, ce qui n'a aucun
     * rapport avec un solde ou une collection — un lien invente parce que la
     * case avait l'air de devoir en avoir un.
     *
     * C'est un TABLEAU DE BORD : on le lit. Les gestes sont ailleurs, la ou
     * ils ont un sens — la serie sur la table de jeu, les quetes dans leur
     * panneau, les coffres dans la boutique. Une case qui se contente
     * d'afficher ne peut casser aucune partie en cours. */
    cases.forEach(function (c) {
      var e = document.createElement('span');
      e.className = c.cls || '';
      e.title = c.t || '';
      e.innerHTML = '<b>' + c.b + '</b><i>' + ech(c.i) + '</i>';
      z.appendChild(e);
    });
    z.style.display = cases.length ? '' : 'none';
  }

  /* ================== CE QUI EST REELLEMENT TOUCHE ==================
   *
   * L'ordre des rangees du tiroir a ete decide au jugement. Il vaut ce que
   * vaut un jugement : on sait ou l'on aurait mis les choses, pas ou les gens
   * vont les chercher. Ces compteurs repondent a la question a notre place.
   *
   * ---- ce qu'on compte, et ce qu'on ne compte pas ----
   *
   * Un TOTAL par bouton, pour tout le monde ensemble. Jamais qui a clique :
   * la question est « quelle rangee sert », pas « que fait tel joueur ». Un
   * compteur par personne repondrait a la seconde sans mieux repondre a la
   * premiere, et il faudrait le defendre.
   *
   * ---- ils ne reordonnent RIEN tout seuls ----
   *
   * Un menu qui se reorganise sous les doigts est un menu qu'on ne peut pas
   * apprendre : la memoire du geste bat un ordre legerement meilleur, et
   * l'utilisateur finit par lire chaque libelle a chaque fois. Les chiffres
   * vont au panneau d'administration ; c'est un humain qui deplace les
   * rangees, une fois, en connaissance de cause.
   *
   * ---- pourquoi on tamponne au lieu d'envoyer ----
   *
   * Un message par clic ferait un aller-retour reseau pour une statistique.
   * On accumule et on vide toutes les dix secondes, plus une fois quand la
   * page passe en arriere-plan — c'est le dernier instant ou l'on peut encore
   * parler, et celui que les compteurs perdraient sinon.
   */
  var TAPS = {}, tapsTimer = null;
  function noteTap(cle) {
    if (!cle) return;
    TAPS[cle] = (TAPS[cle] || 0) + 1;
    if (!tapsTimer) tapsTimer = setTimeout(videTaps, 10000);
  }
  function videTaps() {
    tapsTimer = null;
    var k = Object.keys(TAPS);
    if (!k.length) return;
    var lot = TAPS; TAPS = {};
    /* Si la socket est tombee, on REND les compteurs au tampon plutot que de
       les perdre : ils repartiront au prochain vidage. */
    if (!etat.socket || etat.socket.readyState !== 1) {
      k.forEach(function (c) { TAPS[c] = (TAPS[c] || 0) + lot[c]; });
      return;
    }
    try { etat.socket.send(JSON.stringify({ type: 'tap', taps: lot })); }
    catch (e) { k.forEach(function (c) { TAPS[c] = (TAPS[c] || 0) + lot[c]; }); }
  }
  /** La clef d'un element touche, ou rien s'il n'y a rien a compter. */
  function clefTap(e) {
    var b = e.closest && e.closest('.swbb button');
    /* La clef est POSEE sur le bouton, pas devinee dans son contenu. Ma
       premiere version lisait le dernier <span> : sur le bouton du profil
       c'est la PASTILLE, et la barre remontait « bar:3 » — un compteur
       different a chaque nombre de recompenses en attente. */
    if (b) return 'bar:' + ((b.dataset && b.dataset.tap) || 'inconnu');
    var r = e.closest && e.closest('.swp-t button');
    if (r) {
      /* La clef quand il y en a une, sinon le libelle reduit : les rangees du
         menu de la page (portefeuille, depot, retrait) n'ont pas de `data-k`,
         et ce sont justement celles dont on veut savoir si elles servent. */
      if (r.dataset && r.dataset.k) return 'menu:' + r.dataset.k;
      return 'menu:' + String(r.textContent || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    }
    var a = e.closest && e.closest('a[href]');
    if (a) {
      var h = a.getAttribute('href') || '';
      if (!/\.html/.test(h)) return null;
      var f = h.split('/').pop();
      var page = f.split('?')[0].replace(/\.html$/, '');
      var jeu = (f.split('game=')[1] || '').split('&')[0];
      return 'jeu:' + page + (jeu ? ':' + jeu : '');
    }
    return null;
  }
  document.addEventListener('click', function (ev) {
    try { noteTap(clefTap(ev.target)); } catch (e) {}
  }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') videTaps();
  });

  /** Un envoi qui ne jette pas si la socket est tombee. */
  function envoie(o) {
    if (etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send(JSON.stringify(o)); } catch (e) {}
    }
  }

  /* ------------------------------------------------- COPIER SON ADRESSE
   *
   * L'adresse etait affichee, tronquee, et rien de plus : impossible de la
   * copier. Sur un telephone c'est pire qu'inutile — la selection de texte ne
   * prend pas dans un panneau qui defile, et l'adresse est justement ce qu'on
   * doit donner a un ami pour recevoir un virement, ou coller dans un
   * explorateur de chaine.
   *
   * On la rend donc CLIQUABLE, avec la confirmation dessus. Deux facons de
   * copier plutot qu'une : `navigator.clipboard` quand le navigateur le
   * permet, et la vieille zone de texte cachee sinon. La deuxieme n'est pas de
   * la superstition — `clipboard` exige un contexte securise, et la page
   * s'ouvre dans le navigateur interne de Telegram, ou ce n'est pas toujours
   * le cas.
   */
  function copie(texte) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { return navigator.clipboard.writeText(texte).then(function () { return true; },
                                                             function () { return vieilleCopie(texte); }); }
      catch (e) { /* on retombe plus bas */ }
    }
    return Promise.resolve(vieilleCopie(texte));
  }
  function vieilleCopie(texte) {
    try {
      var z = document.createElement('textarea');
      z.value = texte;
      z.setAttribute('readonly', '');
      /* Hors de l'ecran, mais PAS `display:none` : un element cache n'est pas
         selectionnable, et la copie echouerait sans rien dire. */
      z.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(z);
      z.select(); z.setSelectionRange(0, texte.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(z);
      return ok;
    } catch (e) { return false; }
  }

  function poseCopieAdresse(adr) {
    if (!adr || !MOI.address || adr.dataset.copiable) return;
    adr.dataset.copiable = '1';
    adr.classList.add('swp-adr');
    adr.setAttribute('role', 'button');
    adr.setAttribute('tabindex', '0');
    adr.title = 'Tap to copy — ' + MOI.address;
    function fait(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      var plein = MOI.address;
      if (!plein) return;
      Promise.resolve(copie(plein)).then(function (ok) {
        var avant = adr.textContent;
        adr.textContent = ok ? '\u2713 copied' : plein;
        adr.classList.toggle('swp-adr-ok', !!ok);
        setTimeout(function () {
          adr.textContent = avant;
          adr.classList.remove('swp-adr-ok');
        }, 1400);
      });
    }
    adr.addEventListener('click', fait);
    adr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') fait(e);
    });
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
    /* « Not connected. » tout court etait un mur : le joueur EST connecte, il
       vient de lire son solde dans le meme panneau. C'est la socket qui est
       tombee pendant qu'il tapait. On la releve tout de suite, et on lui dit
       quoi faire — attendre quelques secondes, pas recharger la page. */
    if (!etat.socket || etat.socket.readyState !== 1) {
      connecteSeul();
      return dit('Connection lost — reconnecting. Try again in a few seconds.', 'ko');
    }
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
    try { etat.socket.send(JSON.stringify(q)); }
    catch (e) { connecteSeul(); return dit('Connection lost — reconnecting. Try again in a few seconds.', 'ko'); }
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
  /* ---- CE QUI ATTEND, LU D'OU QU'IL VIENNE ----
   *
   * `bonus.streak` sur un message, `attente` sur un autre, `offert` sur un
   * troisieme : le serveur les envoie avec ce qu'il a sous la main au moment
   * ou il repond. On lit donc ce qui est present et on garde le reste — sinon
   * un message qui ne porte que le solde effacerait la serie.
   */
  function recoitAttente(m) {
    if (m.bonus && m.bonus.streak) SERIE = m.bonus.streak;
    if (m.attente) ATTENTE = m.attente;
    if (m.offert) OFFERT = m.offert;
    /* `streakClaimed` ne renvoie pas l'objet `streak` complet : on avance le
       compteur nous-memes plutot que d'attendre un aller-retour de plus, et
       la ligne des chiffres se met a jour dans le meme geste. */
    if (m.type === 'streakClaimed') SERIE = { day: m.day, claimedToday: true };
  }

  function pastilleAmis() {
    if (!profBtn) return;
    var p = profBtn.querySelector('.swpn');
    /* LA PASTILLE COMPTE AUSSI LES RECOMPENSES. Une recompense qu'il faut
       penser a aller chercher est une recompense que personne ne va chercher.
       Les transferts non lus sont deja dans `attente` : on prend le plus grand
       des deux plutot que de les additionner, sinon ils comptent double. */
    var recompenses = ATTENTE ? Math.max(0, ATTENTE.total - (ATTENTE.transferts ? 1 : 0)) : 0;
    var total = (EN_ATTENTE || 0) + (NON_LUS || 0) + recompenses;
    /* La pastille suit la POIGNEE VISIBLE. Posee sur le bouton du haut alors
       que la barre du bas l'a remplacee, elle serait allumee sur un element
       en display:none — invisible, donc inutile, et sans que rien ne le
       signale. */
    var cible = barreBas && barreBas.querySelector('.swbb-prof');
    if (cible) {
      var q = cible.querySelector('.swpn');
      if (!total) { if (q) q.remove(); }
      else {
        if (!q) { q = document.createElement('span'); q.className = 'swpn'; cible.appendChild(q); }
        q.textContent = total > 9 ? '9+' : String(total);
      }
    }
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

  /* ---- LES ONGLETS DE L'HISTORIQUE ----
   *
   * Une rangee de cinq, en tete du panneau. Ils remplacent cinq rangees du
   * menu : le choix existe toujours, il a simplement quitte la liste ou il
   * coutait une place a chaque fois.
   *
   * Le compteur du bandeau (« 42 events since… ») se vide au changement : il
   * decrit ce qui est charge, et ce qui est charge vient de changer. Le
   * laisser afficherait le compte des depots au-dessus des retraits.
   */
  function rendHistoOnglets() {
    var b = document.createElement('div');
    b.className = 'swp-ho';
    HISTO_ONGLETS.forEach(function (o) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = (o[0] === HISTO ? 'on' : '');
      t.textContent = o[1];
      t.addEventListener('click', function () {
        if (HISTO === o[0]) return;
        HISTO = o[0];
        /* Le meme reglage a zero qu'un changement de section : la liste, le
           curseur et le resume appartiennent au genre qu'on quitte. */
        profItems = []; profFin = null; profEncore = false; profResume = null;
        filtreJeu = null;
        /* ---- ET LE VERROU DE CHARGEMENT ----
         *
         * `profDemande` refuse de partir tant qu'une demande est en vol, et ce
         * verrou tient six secondes. Sans cette ligne, changer d'onglet dans
         * les six secondes ne demandait RIEN : la liste du genre precedent
         * restait affichee sous le nouveau libelle, sans erreur, sans vide,
         * sans rien qui le signale. Mesure au banc : trois clics, une seule
         * demande partie.
         *
         * On abandonne la demande en vol, pas ses degats : la reponse tardive
         * porte son genre, et le controle de genre la jette. */
        profCharge = false;
        profRend();
        profDemande();
      });
      b.appendChild(t);
    });
    return b;
  }

  function profRend() {
    if (!profBoite) return;
    if (profOnglet === 'ap') { profEnTete(); return rendApercu(); }
    if (profOnglet === 'am') { profEnTete(); return rendAmis(); }
    if (profOnglet === 'in') { profEnTete(); return rendInvite(); }
    if (profOnglet === 'lb') { profEnTete(); return rendClassement(); }
    if (profOnglet === 'sh') { profEnTete(); return rendBoutique(); }
    if (profOnglet === 'cl') { profEnTete(); return rendClassementFruits(); }
    var l = profBoite.querySelector('.swp-l');
    var sous = profBoite.querySelector('.swp-sub');
    if (profResume) {
      var mot = profResume.mot || 'event';
      sous.textContent = nb(profResume.lignes, 0) + ' ' + mot + (profResume.lignes === 1 ? '' : 's') +
        (profResume.depuis ? ' since ' + new Date(profResume.depuis).toLocaleDateString('en-US',
          { day: '2-digit', month: 'short', year: 'numeric' }) : '');
    }
    l.innerHTML = '';
    if (profOnglet === 'hi') l.appendChild(rendHistoOnglets());
    if (profOnglet === 'r' || (profOnglet === 'hi' && HISTO === 'r')) {
      var bn = blocNiveau(); if (bn) l.appendChild(bn);
      var st = blocStats(); if (st) l.appendChild(st);
      var fj = blocFiltre(); if (fj) l.appendChild(fj);
    }
    /* Le bilan des paris coiffe LES DEUX onglets de paris — celui des paris en
       cours comme celui des paris regles. Le mettre sur un seul obligerait a
       changer d'onglet pour savoir ou l'on en est, et c'est la premiere chose
       qu'on regarde en les ouvrant. */
    if (profOnglet === 'bo' || profOnglet === 'bs') {
      var bp = blocParis(); if (bp) l.appendChild(bp);
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
    var estManches = (profOnglet === 'r' || (profOnglet === 'hi' && HISTO === 'r'));
    var montres = (estManches && filtreJeu)
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
        : (estManches && filtreJeu) ? 'No ' + (JEUX[filtreJeu] || filtreJeu) + ' round on this page.'
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
