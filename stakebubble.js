/*
 * SWOGE — les deux pastilles posees a cote du solde, sur toutes les pages :
 *   • le rendement du staking, qui monte, et qu'un clic encaisse ;
 *   • le nombre de joueurs en ligne, et le nombre de comptes en tout.
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

  // Dix fois par seconde : le dernier chiffre coule sans que ca coute rien.
  setInterval(rend, 100);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { rend(); });
  else rend();
})();
