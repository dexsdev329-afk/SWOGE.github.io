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
      /* ---- LE CADENAS NE RECLAMAIT RIEN SUR LES PAGES SANS SOCKET ----
       * DEMANDE : « sur games.html et index.html, repare le claim au niveau du
       * cadenas du staking ; il fonctionne bien sur swogebet ».
       * Et il fonctionnait la-bas pour une raison precise : swogebet a SA
       * PROPRE socket, et le chemin qui l'ecoute (plus bas, `auth`/`stakeInfo`/
       * `stakeUnstaked`) appelle `pose()` — donc `etat.mise`, `etat.tauxBps` et
       * `etat.acquis` sont remplis, et `courant()` rend une valeur.
       * Cette socket-ci, celle des pages qui n'en ont pas, ne lisait QUE le
       * solde : elle ignorait `m.stake` sur `auth` et ne faisait rien de
       * `stakeInfo`. L'etat du staking restait donc vide, `courant()` rendait
       * zero, et `reclame()` sortait des sa premiere ligne — le clic sur le
       * cadenas ne partait jamais. Le meme etat manquant vaut pour l'affichage
       * du compteur : ce n'etait pas seulement le clic qui etait muet.
       * On relaie donc ici exactement ce que relaie l'autre chemin. */
      else if (m.type === 'auth') {
        etat.socket = w; poseSolde(m.balance);
        if (m.stake) pose(m.stake); else demande();
      }
      else if (m.type === 'balance' || m.type === 'stakeInfo') {
        if (m.balance != null) poseSolde(m.balance);
        if (m.type === 'stakeInfo') pose(m);
      }
      /* Un desengagement change la mise : on relit plutot que de deviner —
         meme geste que sur une page qui a sa socket. */
      else if (m.type === 'stakeUnstaked') { etat.socket = w; demande(); }
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

  /* ==================== CE QUE CE FICHIER DESSINE, IL LE REND CLIQUABLE ====================
   *
   * Trois pages du site portent `a[href], button{ pointer-events:none }` :
   * elles sont des MAQUETTES, et leurs boutons gardent leur dessin sans
   * repondre au doigt. La regle vise les elements par leur TYPE, donc elle
   * frappe aussi tout ce que ce fichier ajoute apres coup — la porte de
   * connexion et les rangees du tiroir.
   *
   * ---- ELLE ETAIT AU MAUVAIS ENDROIT ----
   *
   * Elle vivait dans la feuille de la PORTE DE CONNEXION, posee seulement
   * quand cette porte se construit. Sur l accueil, quelqu un de deja connecte
   * ne la voit jamais se construire : la garde n arrivait donc pas, et les
   * rangees du tiroir restaient mortes sous le doigt — alors qu un clic lance
   * par script, lui, passait. D ou un menu qui « marche » depuis l en-tete et
   * ne repond a rien une fois le tiroir ouvert.
   * Elle a maintenant sa feuille, posee des le chargement, sans condition.
   *
   * Un clic lance par script IGNORE `pointer-events` : aucun essai qui appelle
   * `.click()` ne peut voir ce defaut. Seul un vrai pointeur le montre. */
  (function () {
    if (document.getElementById('swpe-css')) return;
    var g = document.createElement('style');
    g.id = 'swpe-css';
    g.textContent =
      '.swcon,.swpb,' +
      '.swcon-ov button,.swcon-ov input,.swcon-ov a,' +
      '.swpov button,.swpov a,.swpov input,.swpov select,.swpov textarea' +
      '{pointer-events:auto;}' +
      /* ---- SAUF DERRIERE UN CALQUE ENCORE FERME ----
         Deux calques s ouvrent en fondu et se gardent d etre cliquables tant
         qu ils sont transparents. Mais `pointer-events:none` sur un parent
         n empeche PAS un enfant qui dit `auto` de recevoir le clic : sans ces
         deux lignes, la regle du dessus rendrait cliquables des boutons
         invisibles, poses en travers de l ecran. */
      '.swb-scene:not(.on) *,.swv:not(.on) *{pointer-events:none;}';
    (document.head || document.documentElement).appendChild(g);
  })();

  /* ---- SUR TELEPHONE, LA MARQUE REND SA PLACE A LA PHOTO DE PROFIL ----
   *
   * Signale, capture a l appui : sur l accueil et le hall, la photo de profil
   * tombait sur une rangee A ELLE, sous la marque et les pastilles. L en-tete
   * y faisait 228 px de haut — quatre rangees — avant meme que la page
   * commence.
   *
   * La cause tient en une addition. Sur 358 px de barre utile : la marque en
   * prend 116, les pastilles (solde, cours, joueurs en ligne) environ 240, la
   * photo 38, plus les gouttieres. Il manque une cinquantaine de pixels, et
   * c est la photo — le dernier element de la rangee — qui passe a la ligne.
   *
   * Des 116 px de la marque, 82 ne sont que le mot « SWOGE WORLD » ecrit a
   * cote de la patte. La patte reste, elle garde le lien vers le Nexus et
   * l identite ; le mot s efface sous 620 px. La photo remonte, l en-tete perd
   * une rangee entiere.
   *
   * PAS `display:none` : le mot est le seul TEXTE de ce lien — la patte est un
   * emoji, qu un lecteur d ecran n annonce pas comme un nom. On le sort donc
   * du flux sans le retirer du document, la technique habituelle : le lien
   * garde son nom accessible et ne prend plus un pixel de large.
   *
   * Pose ici et pas dans les vingt-quatre pages : la barre du haut est deja
   * geree depuis ce fichier — les pastilles, la photo, le repli quand ca ne
   * tient plus. Une regle de barre de plus a sa place au meme endroit, et une
   * seule empreinte de cache a bouger. */
  (function () {
    if (document.getElementById('swmq-css')) return;
    var m = document.createElement('style');
    m.id = 'swmq-css';
    m.textContent =
      '@media (max-width:620px){' +
      '.sw-marque>span:not(.sw-patte){position:absolute;width:1px;height:1px;' +
      'margin:-1px;padding:0;border:0;overflow:hidden;white-space:nowrap;' +
      'clip-path:inset(50%);}' +
      /* La gouttiere de neuf pixels separait la patte du mot ; sans le mot,
         elle ne separe plus rien et decale la patte du bord. */
      '.sw-marque{gap:0;}' +
      /* ---- ET LA RANGEE DE PASTILLES CESSE DE POUSSER LA PHOTO A LA LIGNE ----
       * Effacer le mot ne suffisait pas : il restait six pixels de trop, et
       * six pixels suffisent a faire passer la photo a la ligne suivante.
       *
       * La raison n'est pas la largeur, c'est l'ordre des operations de
       * flexbox. Le navigateur COUPE les lignes avant de RETRECIR quoi que ce
       * soit, et il coupe d'apres la taille naturelle de chaque element. La
       * rangee de pastilles annonce 280 px de large ; patte + pastilles +
       * photo = 372 pour 358 disponibles, donc la photo — derniere de la
       * rangee — passe a la ligne. Le `flex-shrink` de la rangee ne servait a
       * rien : il ne s'applique qu'APRES la coupure, sur une ligne dont la
       * photo est deja partie.
       *
       * On lui donne donc une taille naturelle de zero. Elle ne compte plus
       * pour la coupure, les trois elements tiennent sur la premiere ligne, et
       * la rangee reprend ensuite toute la place restante. Ce sont les
       * pastilles qui se replient si elles ne tiennent pas — dans leur coin, a
       * droite — au lieu d'expulser la photo. */
      'nav.sb-ancre{flex:1 1 0!important;min-width:0!important;' +
      'flex-wrap:wrap!important;row-gap:6px!important;}' +
      /* ---- ET LE SOLDE SE RANGE A COTE DE LA PHOTO ----
       * DEMANDE : « les soldes devraient aller a cote de la photo de profil ».
       * Sur l'accueil et le hall, la rangee de pastilles — solde, cours,
       * joueurs en ligne — etait posee en `order:4`, c'est-a-dire APRES la
       * bande des chiffres du site. Elle tombait donc toute seule sur une
       * TROISIEME rangee, sous « ROUNDS PLAYED / WINNINGS PAID », loin du
       * compte auquel elle se rapporte. Les pages de jeu, elles, l'avaient
       * deja en deuxieme position ; c'est l'accueil et le hall qui etaient
       * l'exception.
       *
       * On fixe donc le meme ordre PARTOUT, depuis ici : la patte, puis les
       * pastilles, puis la photo — trois choses qui parlent du compte, sur la
       * meme ligne — et les chiffres du site en dernier, sur la leur. Rien ne
       * bouge sur les pages de jeu, qui etaient deja dans cet ordre.
       *
       * `9` pour les chiffres et pas `5` : les coquilles ne numerotent pas
       * pareil (5 ici, 3 la), et un rang eleve les met derriere toutes sans
       * avoir a connaitre chacune. */
      '.sw-marque{order:1!important;}' +
      'nav.sb-ancre{order:2!important;}' +
      '#gxProfil{order:3!important;}' +
      '.sw-chiffres{order:9!important;}' +
      '}';
    (document.head || document.documentElement).appendChild(m);
  })();

  /* ================== LE PANNEAU DE DIAGNOSTIC ==================
   * Il ne s'affiche QUE si l'adresse porte `?diag=1`. Aucun visiteur ne le
   * verra jamais par accident, et il ne fait rien tant qu'il dort.
   *
   * POURQUOI IL EXISTE. Un defaut de mise en page est signale depuis un iPhone,
   * dans le navigateur de Telegram — un moteur qu'on n'a pas ici. Trois tours
   * de correction ont ete decides en MESURANT DES CAPTURES D'ECRAN : en
   * comparant des largeurs en pixels d'image pour en deduire des points CSS.
   * Ca marche, ca a permis de trouver deux vrais defauts, mais ca reste de la
   * deduction, et une deduction peut etre juste sur le mecanisme et fausse sur
   * le coupable.
   *
   * Ce panneau donne les six nombres qui tranchent, et surtout `echelle` :
   * quand iOS n'arrive pas a faire tenir un document, il DEGONFLE toute la
   * page, et `visualViewport.scale` le dit. En dessous de 1, la page a ete
   * degonflee et il y a un element trop large ; a 1, le probleme est ailleurs.
   * Le panneau nomme aussi le plus large des elements fautifs, ce qui evite
   * d'avoir a le deviner.
   *
   * Il se remesure chaque seconde : le defaut apparait « deux secondes apres
   * l'ouverture », donc une mesure unique au chargement le manquerait.
   * ============================================================= */
  (function () {
    if (!/[?&]diag=1/.test(location.search)) return;
    var boite = null;
    function pose() {
      if (boite) return;
      boite = document.createElement('div');
      boite.id = 'swdiag';
      boite.setAttribute('style',
        'position:fixed;top:0;left:0;right:0;z-index:2147483600;' +
        'background:#000;color:#4ef07a;font:600 13px/1.45 ui-monospace,Menlo,monospace;' +
        'padding:10px 12px;white-space:pre-wrap;pointer-events:none;' +
        'max-height:48vh;overflow:hidden;border-bottom:2px solid #4ef07a;');
      (document.body || document.documentElement).appendChild(boite);
    }
    function dansUnScroll(e) {
      for (var a = e.parentElement; a; a = a.parentElement) {
        var c = getComputedStyle(a);
        if (c.overflowX === 'auto' || c.overflowX === 'scroll' || c.overflowX === 'hidden') return true;
      }
      return false;
    }
    function mesure() {
      pose();
      if (!boite) return;
      var W = document.documentElement.clientWidth;
      var pire = null, n = 0;
      var tout = document.querySelectorAll('body *');
      for (var i = 0; i < tout.length; i++) {
        var e = tout[i];
        if (e === boite) continue;
        var c = getComputedStyle(e);
        if (c.display === 'none' || c.visibility === 'hidden') continue;
        var r = e.getBoundingClientRect();
        if (r.width < 1) continue;
        if (r.right > W + 1 && !dansUnScroll(e)) {
          n++;
          if (!pire || r.right > pire.d) {
            pire = { n: e.tagName.toLowerCase()
                        + (e.id ? '#' + e.id : '')
                        + (typeof e.className === 'string' && e.className
                           ? '.' + e.className.trim().split(/\s+/)[0] : ''),
                     d: Math.round(r.right), l: Math.round(r.width) };
          }
        }
      }
      var vv = window.visualViewport;
      var h = document.querySelector('.sw-haut');
      var lignes = [
        'document ' + document.documentElement.scrollWidth + '   ecran ' + W
          + '   fenetre ' + window.innerWidth,
        'echelle  ' + (vv ? Math.round(vv.scale * 1000) / 1000 : '?')
          + '   vue ' + (vv ? Math.round(vv.width) : '?')
          + '   ' + (vv && vv.scale < 0.995 ? '<<< LA PAGE EST DEGONFLEE' : 'page a l echelle 1'),
        'en-tete ' + (h ? Math.round(h.getBoundingClientRect().width) : '-'),
      ];
      var b = document.querySelector('.sb-films') || document.querySelector('.haut-films');
      if (b) {
        var r2 = b.getBoundingClientRect();
        lignes.push('banniere ' + Math.round(r2.width) + 'x' + Math.round(r2.height)
          + '  rapport ' + (r2.height ? (r2.width / r2.height).toFixed(2) : '?'));
      }
      lignes.push(pire ? (n + ' element(s) trop larges. Le pire :\n  ' + pire.n
                          + '\n  largeur ' + pire.l + ', bord droit ' + pire.d)
                       : 'aucun element ne deborde');
      boite.textContent = lignes.join('\n');
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mesure);
    } else { mesure(); }
    setInterval(mesure, 1000);
  })();

  function styleConnexion() {
    if (document.getElementById('swcon-css')) return;
    var c = document.createElement('style');
    c.id = 'swcon-css';
    c.textContent =
      '.swcon{display:inline-flex;align-items:center;gap:6px;vertical-align:middle;' +
      'margin-left:8px;padding:7px 13px;border-radius:999px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#231a06;' +
      'border:0;background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      /* Au-dessus de tout ce que la page empile : le tiroir du profil
         (99999), la barre du bas (2147482000) et le bandeau de messages
         (2147483000). C'est le seul panneau qu'on ouvre PAR-DESSUS un
         autre — on s'y reconnecte sans quitter ce qu'on faisait. */
      '.swcon-ov{position:fixed;inset:0;z-index:2147483200;display:none;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(244,247,252,.72);}' +
      '.swcon-ov.on{display:flex;}' +
      '.swcon-b{width:min(360px,100%);border-radius:16px;padding:18px;' +
      'background:#FFFFFF;border:1px solid rgba(27,95,224,.28);color:#0B1B36;' +
      'font-family:inherit;box-shadow:0 24px 60px rgba(11,27,54,0.18);}' +
      '.swcon-b h4{margin:0 0 4px;font-size:15px;}' +
      '.swcon-b p{margin:0 0 14px;font-size:11.5px;line-height:1.5;color:#5F6E88;}' +
      '.swcon-b button{width:100%;margin-top:8px;padding:11px;border-radius:11px;' +
      'cursor:pointer;font-family:inherit;font-size:13px;font-weight:800;border:0;}' +
      '.swcon-b .w{color:#231a06;background:linear-gradient(180deg,#F2C868,#E6A537);}' +
      '.swcon-b .e{color:#0B1B36;background:rgba(11,27,54,.08);' +
      'border:1px solid rgba(11,27,54,.16);}' +
      '.swcon-b input{width:100%;margin-top:8px;padding:11px;border-radius:11px;' +
      'font-family:inherit;font-size:13px;color:#0B1B36;background:rgba(11,27,54,.05);' +
      'border:1px solid rgba(11,27,54,.16);}' +
      '.swcon-b .m{margin-top:10px;font-size:11.5px;line-height:1.45;color:#1B5FE0;}' +
      '.swcon-b .x{margin-top:12px;background:transparent;color:#5F6E88;font-weight:600;' +
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
  function ouvreConnexion() {
    /* Le tiroir du profil se referme : le laisser ouvert mettrait un fond
       floute entre le joueur et le formulaire qu'il doit remplir. */
    var d = document.querySelector('.swpov.on');
    if (d) d.classList.remove('on');
    dialogue().classList.add('on');
  }
  function fermeConnexion() { if (conBoite) conBoite.classList.remove('on'); }
  /* ---- LA PORTE, OUVERTE AUX AUTRES FICHIERS ----
   *
   * swogecompte.js doit pouvoir proposer « reconnecte-toi » quand un depot
   * echoue. Il envoyait pour cela sur swoge_pusher.html, ce qui deplacait le
   * joueur : il tapait « me reconnecter » depuis le hall et se retrouvait
   * dans un autre jeu. Le formulaire est ICI, il sait deja se reconnecter en
   * place — on l'expose plutot que d'en ecrire un second, et surtout plutot
   * que de faire voyager quelqu'un qui voulait juste deposer. */
  window.swogeConnexion = { ouvre: ouvreConnexion, ferme: fermeConnexion };

  /* ==================== LE FIL, POUR LES PAGES QUI N EN OUVRENT PAS ====================
   *
   * L accueil et le hall n ont pas de socket a eux : ils n en avaient pas
   * besoin tant qu ils se contentaient de MONTRER. Depuis qu on peut y poser
   * un pari, il leur en faut une — et surtout, il ne leur en faut pas une
   * SECONDE. Deux sockets veulent dire deux authentifications, deux soldes a
   * tenir d accord, et le doute sur celle qui recevra la reponse.
   *
   * Ce fichier en tient deja une, ouverte avec le jeton de session, et il
   * enveloppe le constructeur pour ecouter tout ce qui passe. On l ouvre donc
   * aux pages, en lecture et en ecriture, plutot que de les laisser en ouvrir
   * une de plus.
   *
   * `pret()` ne dit pas « le joueur est connecte » : il dit « il y a un fil ».
   * C est au serveur de refuser un pari sans session — lui seul le sait
   * vraiment, et une page qui deciderait a sa place se tromperait le jour ou
   * la session expire sans qu elle l apprenne. */
  var abonnes = [];
  window.swogeFil = {
    pret: function () { return !!(etat.socket && etat.socket.readyState === 1); },
    envoie: function (o) { envoie(o); },
    ecoute: function (fn) {
      if (typeof fn !== 'function') return function () {};
      abonnes.push(fn);
      return function () {
        var i = abonnes.indexOf(fn);
        if (i >= 0) abonnes.splice(i, 1);
      };
    },
  };
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
    /* On rejoue l'initialisation au lieu de sortir tout de suite : le module
       pose son global a la FIN de son execution, et son `onload` — qui appelle
       `init` — est une tache separee. Un chargeur qui regarde entre les deux
       voyait un module present et NON initialise, et sortait. `init` est
       idempotent cote module, donc le rejouer ne coute rien.
       Voir `swogecompte.js` pour le detail : c'est le meme raccourci, et il y
       cassait le portefeuille en silence. */
    if (window.SwogePrivy) {
      try { SwogePrivy.init(PRIVY_APP_ID); } catch (e) {}
      return Promise.resolve();
    }
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
        'font-weight:800;color:#1B5FE0;white-space:nowrap;' +
        'background:linear-gradient(180deg,rgba(244,247,252,.92),rgba(255,255,255,.96));' +
        'border:1px solid rgba(27,95,224,.45);}' +
        '.swbal .pt{width:8px;height:8px;border-radius:50%;background:#16D97F;' +
        'box-shadow:0 0 8px #16D97F;}' +
        '.swbal em{font-style:normal;font-size:10px;color:#1B5FE0;letter-spacing:.8px;}' +
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
    /* ---- LA SOCKET SE RETIENT SUR TOUT MESSAGE ----
     * Elle ne l etait que sur `auth`, `stakeInfo` et `history` : trois types
     * choisis parce que c est ce dont la bulle avait besoin. Une page qui
     * veut ENVOYER quelque chose — l accueil et le hall posent maintenant des
     * paris — se retrouvait sans fil tant qu aucun des trois n etait passe.
     * Toute reponse identifie la socket aussi bien que ces trois-la. */
    etat.socket = ev.target;
    /* Et l on previent qui ecoute, AVANT de traiter : un abonne qui jette ne
       doit pas emporter le reste. */
    for (var iA = 0; iA < abonnes.length; iA++) {
      try { abonnes[iA](m); } catch (eA) {}
    }
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
      if (m.profile) {
        MOI = m.profile;
        /* ---- ET ON REPEINT ----
         * `MOI` porte la photo, le badge et le palier : c'est TOUT ce que
         * l'avatar montre. Il n'etait repeint qu'a l'authentification et a la
         * montee de niveau — deux moments ou `MOI` n'est pas encore arrive.
         * Le visage apparaissait donc a l'ouverture du tiroir, et seulement
         * la : un bouton de compte qui ne montre pas le compte tant qu'on ne
         * l'ouvre pas. */
        peintBouton();
      }
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
    if (m.type === 'market') {
      MARCHE = m;
      if (m.error) toast(m.error, 'bad');
      else if (m.fait) {
        /* On NOMME ce qui vient de se passer. « Sold » et « Listed » ne se
           distinguent pas d'un simple rafraichissement si rien ne le dit. */
        if (m.fait.annule !== undefined) toast('Taken back', 'ok');
        else if (m.fait.prix !== undefined && m.fait.vendeur) toast('Bought for ' + nb(m.fait.prix, 0) + ' $SWOGE', 'good');
        else toast('Listed for ' + nb(m.fait.prix, 0) + ' $SWOGE', 'ok');
        if (m.fait.ligne) toast('🏆 Family complete — ' + nb(m.fait.ligne.prix, 0) + ' $SWOGE', 'good');
        EQUIPABLE = null;   // l'inventaire a bouge — la liste equipable est perimee
      }
      if (m.catalogue) BOUTIQUE = Object.assign(BOUTIQUE || {}, m);
      if (m.balance != null) rafraichitSolde();
      /* Vendre ou acheter un animal change l'enclos et le coffre a oeufs. Le
         serveur les renvoie AVEC la vitrine : les rafraichir chacun de leur
         cote montrerait un familier qu'on vient de vendre encore assis dans
         son enclos. */
      if (m.familiers) FAMILIERS = m.familiers;
      if (m.coffreOeufs) OEUFS_COFFRE = m.coffreOeufs;
      if (profOnglet === 'mk' || profOnglet === 'sh' || profOnglet === 'pt') profRend();
    }
    /* ---- ON A ETE PAYE ----
     *
     * Le seul comptoir du jeu ou deux joueurs echangent des $SWOGE reels
     * contre un bien, et le seul qui n'envoyait rien au vendeur : sa page
     * gardait l'ancien solde et son annonce comme si elle courait toujours,
     * jusqu'a ce qu'il clique ailleurs. Un joueur qui ne voit pas sa vente
     * aboutir conclut que le marche ne marche pas.
     *
     * Le message arrive QUAND ON VEUT, sans qu'on ait rien demande : il est
     * donc traite ici, et pas dans la reponse a un clic. */
    if (m.type === 'marketSold' && m.vente) {
      var ve = m.vente;
      var nomVendu = (ve.annonce && ve.annonce.item && ve.annonce.item.nom) || 'Your listing';
      /* Le NET, pas le prix affiche : c'est ce qui arrive sur le solde, et
         c'est le chiffre que le vendeur va comparer. Les frais se disent a
         cote plutot que d'etre passes sous silence — un ecart inexplique entre
         le prix demande et le solde recu se lit comme un vol. */
      toast('\uD83D\uDCB0 ' + nomVendu + ' sold — +' + nb(ve.net, 0) + ' $SWOGE'
            + (ve.frais > 0 ? ' (fee ' + nb(ve.frais, 0) + ')' : ''), 'good');
      if (m.balance != null) rafraichitSolde();
      /* L'inventaire du vendeur a bouge : ce qu'il croyait equipable ne l'est
         plus forcement. */
      EQUIPABLE = null;
      /* La vitrine se redemande AVEC LA SAISON QU'IL REGARDE, lui. Le serveur
         ne la pousse pas : il ne connait que celle de l'acheteur, et la lui
         imposer lui changerait d'onglet sous les doigts. */
      if (profOnglet === 'mk' || profOnglet === 'pt') envoie({ type: 'market', season: SAISON });
    }
    /* ---- UNE LIGNE VIENT DE PARTIR, CHEZ QUELQU'UN D'AUTRE ----
     *
     * Sans ce message, la vitrine des autres gardait a l'ecran des annonces
     * qui n'existaient plus, et le seul retour etait l'erreur « this listing no
     * longer exists » — c'est-a-dire APRES le clic sur un bouton mort.
     *
     * On retire la ligne au lieu de rafraichir toute la vitrine : le serveur
     * n'envoie qu'un identifiant, et la repeindre en entier a chaque vente du
     * site couterait cent fois plus pour la meme chose. */
    if (m.type === 'marketGone' && MARCHE && MARCHE.annonces) {
      var avant = MARCHE.annonces.length;
      if (m.reste > 0) {
        MARCHE.annonces.forEach(function (a) { if (a.id === m.id) a.qte = m.reste; });
      } else {
        MARCHE.annonces = MARCHE.annonces.filter(function (a) { return a.id !== m.id; });
      }
      /* On ne repeint QUE si la vitrine est sous les yeux, et QUE si quelque
         chose a change : repeindre un panneau ferme est du travail pour
         personne. */
      if ((avant !== MARCHE.annonces.length || m.reste > 0) && profOnglet === 'mk') profRend();
    }
    /* ---- L'ENCLOS ET LE COFFRE A OEUFS ----
     * Ils arrivent ensemble et se lisent ensemble : « tu as cet animal, donc
     * cet oeuf-la ne peut plus eclore » est UNE phrase. Deux messages
     * l'auraient affichee dans deux etats differents pendant une
     * demi-seconde. */
    if (m.type === 'familiers' || m.type === 'oeufRange' || m.type === 'oeufSort') {
      if (m.error) toast(m.error, 'bad');
      if (m.familiers) FAMILIERS = m.familiers;
      if (m.coffreOeufs) OEUFS_COFFRE = m.coffreOeufs;
      if (profOnglet === 'pt') profRend();
    }
    /* ---- LES SKINS ----
     *
     * Une seule reponse, deux raisons de la recevoir : la liste demandee a
     * l'ouverture de l'onglet, et le resultat d'un achat. `achete` distingue
     * les deux — sans lui, un simple rafraichissement de la liste aurait
     * affiche un toast d'achat a chaque ouverture de l'onglet. */
    if (m.type === 'skins') {
      /* `or` voyage avec le catalogue : c'est le seul endroit du tiroir qui
         connait l'or du compte, et une fiche affichant un prix en or sans
         dire ce qu'on a laisse deviner. Recopier les champs un par un est
         DELIBERE — un `Object.assign(m)` embarquerait `type` et `error`, et
         un refus resterait colle a l'etat jusqu'au message suivant. */
      SKINS = { catalogue: m.catalogue, actif: m.actif, or: m.or };
      if (m.error) toast(m.error, 'bad');
      else if (m.achete) {
        var acq = (m.catalogue || []).filter(function (s) { return s.id === m.achete; })[0] || {};
        toast('Unlocked — you are now playing as ' + acq.nom +
          (acq.pixel ? ' · 🎁 pixel gift unlocked too' : ''), 'good');
      }
      if (m.balance != null) rafraichitSolde();
      /* L'apercu montre aussi le skin porte : une reponse a ce message doit
         donc repeindre les DEUX onglets qui en dependent, pas seulement
         celui de la boutique. */
      if (profOnglet === 'sk' || profOnglet === 'ap') profRend();
      /* La fiche en grand se repeint independamment de l'onglet du dessous —
         un achat ou un choix de port doit y changer le bouton tout de suite,
         et `peintDetailSkin` ne fait rien si aucune fiche n'est ouverte. */
      peintDetailSkin();
    }
    /* ---- LA PROGRESSION D'UN PERSONNAGE ----
     *
     * Meme reponse pour la lecture (a l'ouverture de la fiche) et pour un
     * changement d'equipement — les deux rendent l'etat COMPLET du skin
     * concerne, donc un seul lecteur suffit. */
    if (m.type === 'personnage') {
      /* Un REFUS ne remplace pas la fiche qu'on avait deja. Le serveur repond
         au refus avec `etat: null` — exactement le meme null que pour un skin
         qu'on ne possede pas, qui n'a legitimement aucune fiche a montrer. Ce
         qui separe les deux n'est pas le null, c'est `error` : sans lui le
         null est une reponse, avec lui c'est une reponse qui n'a pas eu lieu.
         Ranger ce null-la effacait le niveau, les stats et les quatre cases
         sous les yeux du joueur : il lisait « you do not own this item » et
         voyait en meme temps son personnage devenir vierge, donc il en
         concluait qu'il venait de perdre son equipement. Et l'ecran restait
         faux jusqu'a ce qu'il referme la fiche.
         Ne rien ecrire garde aussi la distinction que `peintDetailSkin` fait
         plus bas entre `undefined` (« Loading character… ») et `null` (rien a
         montrer) : un refus n'est ni l'un ni l'autre, il ne dit rien de la
         fiche. Un skin sans fiche arrive par la route de LECTURE, qui ne pose
         jamais `error` — le cas legitime passe donc toujours. */
      if (m.error) toast(m.error, 'bad');
      else PERSO_PAR_SKIN[m.skin] = m.etat || null;
      peintDetailSkin();
    }
    /* La liste de ce qu'il y a a equiper ne depend d'aucune saison parcourue
       et ne change que quand l'inventaire change (achat, coffre) — on la
       redemande donc aussi apres un gain de boutique, pas seulement une
       fois. */
    if (m.type === 'equipable') {
      EQUIPABLE = { fruits: m.fruits || [], armes: m.armes || [],
                    armures: m.armures || [], bagues: m.bagues || [] };
      peintDetailSkin();
    }
    /* ---- LE RACHAT ----
     *
     * Il repond avec la boutique entiere, donc on la range comme le marche le
     * fait. Ce qui change, c'est le message : on annonce la SOMME et le fait
     * que l'objet repart au coffre — c'est la seule vente du site qui remet
     * une piece en circulation, et le joueur doit le savoir sans avoir a
     * relire la feuille qu'il vient de fermer. */
    if (m.type === 'buyback') {
      if (m.error) toast(m.error, 'bad');
      else if (m.fait) {
        toast('Sold back for ' + nb(m.fait.total, 0) + ' $SWOGE' +
              (m.fait.recycle ? ' · back in the chest pool' : ''), 'good');
        EQUIPABLE = null;   // l'objet vendu a quitte l'inventaire
      }
      if (m.catalogue) BOUTIQUE = Object.assign(BOUTIQUE || {}, m);
      if (m.balance != null) rafraichitSolde();
      if (profOnglet === 'sh' || profOnglet === 'mk') profRend();
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
        EQUIPABLE = null;   // un nouvel objet vient d'entrer dans l'inventaire
      }
      if (profOnglet === 'sh' || profOnglet === 'cl') profRend();
    }
    /* Les missions du jour arrivent avec les quetes, sur trois messages
       differents selon la page. On les garde ici, et on decore ensuite. */
    if (m.quests) { MISSIONS = m.quests; surveilleMissions(); if (profOuvert) { peintChiffres(); peintNotifs(); } }
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
      ouvreOngletDepuisURL();
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
        'line-height:1.5;color:#1B5FE0;background:rgba(27,95,224,.08);' +
        'border:1px solid rgba(27,95,224,.28);';
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
      'box-shadow:inset 0 1px 0 rgba(11,27,54,.5),0 2px 8px rgba(18,161,80,.3);' +
      'white-space:nowrap;transition:transform .1s,box-shadow .15s;}' +
      '.swstk:hover{box-shadow:inset 0 1px 0 rgba(11,27,54,.5),0 0 0 2px rgba(18,161,80,.45),0 4px 12px rgba(18,161,80,.4);}' +
      '.swstk:active{transform:translateY(1px);}' +
      '.swstk b{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.2px;}' +
      '.swstk .swi{font-size:12px;filter:none;}' +
      '.swstk.swflash{animation:swflash .7s ease-out;}' +
      '@keyframes swflash{0%{transform:scale(1.18);box-shadow:0 0 0 6px rgba(18,161,80,.5);}' +
      '100%{transform:scale(1);box-shadow:inset 0 1px 0 rgba(11,27,54,.5),0 2px 8px rgba(18,161,80,.3);}}' +
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
      'font-family:inherit;font-size:12px;font-weight:700;line-height:1;color:#0B1B36;' +
      'background:linear-gradient(180deg,rgba(46,123,255,.22),rgba(244,247,252,.75));' +
      'border:1px solid rgba(46,123,255,.5);white-space:nowrap;' +
      'box-shadow:inset 0 1px 0 rgba(11,27,54,.12);}' +
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

  var repriseClaim = false;
  function reclame() {
    if (occupe) return;
    /* On ne demande rien quand il n'y a rien : le serveur repondrait « no
       yield to claim yet », et la page afficherait une erreur pour un clic
       parfaitement raisonnable. */
    if (!(courant() > 0)) return;
    /* ---- LE CLIC NE PART PLUS DANS LE VIDE ----
     * DEMANDE : « repare le claim au niveau du cadenas du staking sur
     * games.html et index.html ; il fonctionne bien sur swogebet ».
     * Et la difference est la : swogebet a SA PROPRE socket, ouverte tant
     * qu'on joue. Les pages sans jeu — l'accueil, le hall — dependent de la
     * socket autonome ouverte plus haut, et `veilleSolde()` la FERME apres une
     * minute de silence (c'est voulu : la page se reconnecte seule et le solde
     * revient a jour). Entre cette fermeture et la reconnexion, `etat.socket`
     * est nul : le clic sortait ici meme, sans un mot. Le cadenas paraissait
     * donc mort alors que tout etait normal.
     * On relance la connexion et on repart — et si vraiment rien ne revient,
     * on le DIT, plutot que de ne rien faire. */
    if (!etat.socket || etat.socket.readyState !== 1) {
      if (repriseClaim) return;
      repriseClaim = true;
      try { connecteSeul(); } catch (e) {}
      toast('Reconnecting\u2026');
      var essais = 0;
      var minuteur = setInterval(function () {
        essais++;
        if (etat.socket && etat.socket.readyState === 1) {
          clearInterval(minuteur); repriseClaim = false; reclame();
        } else if (essais > 20) {                 // dix secondes
          clearInterval(minuteur); repriseClaim = false;
          toast('Not connected \u2014 reload the page and try again', 'bad');
        }
      }, 500);
      return;
    }
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
  /* L'enclos et le coffre a oeufs. Vides tant que le serveur n'a rien dit —
     on ne montre pas « aucun familier » a quelqu'un dont on n'a pas encore
     demande la liste, ce serait une information fausse. */
  var FAMILIERS = null, OEUFS_COFFRE = null;
  var VISAGES = [], MOI = { name: null, visage: null, address: null };
  var AMIS = { amis: [], recues: [], envoyees: [] }, EN_ATTENTE = 0, RECHERCHE = [];
  var NON_LUS = 0, PARRAIN = null, STATS = null, CLASSEMENT = null, NIVEAU = null;
  /* La serie du jour, ce qui attend le joueur, et le coffre offert. Les trois
     arrivent avec l'authentification et non sur demande : une pastille qui
     s'allume seulement quand on pense a regarder ne ramene personne. */
  var SERIE = null, ATTENTE = null, OFFERT = null;
  var MARCHE = null, MARCHE_F = 'tout', MARCHE_Q = '';
  var SKINS = null;   // { catalogue, actif, or } — independant de SAISON
  var PERSO_PAR_SKIN = {};                // skinId -> etat (niveau/xp/stats/equip) une fois recu
  var EQUIPABLE = null;                   // { fruits, armes } — ce qu'il y a a equiper, toutes saisons confondues
  var EQUIPABLE_DEMANDE = false;          // pour ne demander la liste qu'une fois par session
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
    /* Le TEXTE passe par `lisible`, la bordure garde la teinte pleine : sur du
       blanc, un lisere pale est une decoration, un chiffre pale est une
       information qu on n arrive pas a lire. */
    return '<span class="swlv" style="color:' + lisible(couleurPalier(p.palier)) + ';border-color:' +
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
      'background-color:rgba(11,27,54,.07);position:relative;}' +
      /* Le visage REMPLACE la pastille de couleur : elle disait qui etait
         rouge et qui etait bleu, le cadre de palier le dit mieux, et sur un
         telephone les deux ensemble ne laissaient plus de place au nom. La
         couleur revient en anneau, donc rien n'est perdu. */
      '.c4-joueur .nm .swhav ~ .pion{display:none;}' +
      '.c4-joueur.j1 .swhav{box-shadow:0 0 0 2px #FF4655;}' +
      '.c4-joueur.j2 .swhav{box-shadow:0 0 0 2px #2E7BFF;}' +
      '.swhav.swcad::after{content:"";position:absolute;left:-18%;top:-15.4%;width:136%;height:136%;' +
      'background:var(--cadre) center/contain no-repeat;pointer-events:none;}' +
      '.swhlv{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:999px;' +
      'font-family:inherit;font-size:9.5px;font-weight:900;letter-spacing:.5px;' +
      'border:1px solid;background:rgba(11,27,54,.05);white-space:nowrap;}' +
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
      'line-height:1;padding:0;font-family:inherit;color:#0B1B36;' +
      'background:rgba(11,27,54,.06);border:1px solid rgba(11,27,54,.12);}' +
      '.swdire button:hover{background:rgba(27,95,224,.16);border-color:rgba(27,95,224,.45);}' +
      '.swdire button:active{transform:translateY(1px);}' +
      '.swdire button.mu{margin-left:8px;font-size:14px;}' +
      '.swdire .rst{align-self:center;margin-left:8px;font-style:normal;font-size:10.5px;' +
      'font-weight:800;letter-spacing:.4px;color:#C2410C;}' +
      /* La bulle : posee en absolu au-dessus du joueur, donc le bloc qui la
         porte doit devenir un repere — sans quoi elle irait se placer par
         rapport a la page entiere. */
      '#c4J1,#c4J2,.swdw .hd{position:relative;}' +
      '.swdit{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);' +
      'margin-bottom:7px;padding:6px 11px;border-radius:11px;white-space:nowrap;' +
      'font-family:inherit;font-size:12px;font-weight:700;color:#07101F;z-index:9;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);box-shadow:0 6px 18px rgba(11,27,54,0.18);' +
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

  var profStyleFait = false;
  /* ================== UNE COULEUR DU SERVEUR, LISIBLE SUR BLANC ==================
   *
   * Les teintes de rarete viennent du CATALOGUE : le serveur les envoie, le
   * monde les dessine, et elles ne se decident pas ici — les reecrire dans ce
   * fichier ferait deux verites sur la couleur d un objet legendaire.
   *
   * Mais elles ont ete choisies pour un fond NOIR. Sur le tiroir blanc, « 0,19 %
   * Legendary » en or pale a dix pixels et demi ne se lit plus : l information
   * est affichee et illisible, ce qui est pire que de ne pas l afficher — on
   * croit l avoir montree.
   *
   * On garde donc la TEINTE et l on baisse la clarte jusqu a ce que le rapport
   * de contraste passe. La couleur reste reconnaissable — un legendaire reste
   * dore, un mythique reste rouge — et le mot se lit. C est fait au moment de
   * PEINDRE, jamais en memoire : ce que le serveur a envoye n est pas modifie.
   *
   * Seul le TEXTE passe par ici. Une bordure pale sur du blanc est une
   * decoration, pas une information ; l assombrir lui donnerait un poids
   * qu elle n a pas. */
  /* ---- LE GRIS DU TIROIR EST PLUS SOMBRE QUE CELUI DU SITE ----
   * Le site ecrit son texte secondaire en `#6B7C99`. Mesure sur le blanc du
   * tiroir, ce gris donne 4,0 pour 1 — sous le seuil de 4,5 des textes
   * ordinaires, et ce sont justement les libelles qui expliquent les chiffres
   * (« $SWOGE », « reward ready », « quests »). Ils etaient affiches et
   * a peine lisibles, ce qui est pire que de ne pas les afficher : on croit
   * les avoir montres.
   * Le tiroir prend donc `#5F6E88`, qui passe a 5,2. Meme histoire pour le
   * vert des reussites : `#12A150` ne donnait que 3,1 sur le vert pale des
   * cartes « OPEN » et « Wearing » — il devient `#0E7C3E`.
   * La meme mesure vaut pour les trois pages claires du site, qui portent
   * encore les couleurs d origine : c est un changement a part, sur d autres
   * fichiers. */
  function lisible(c) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return c;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), v = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    function canal(x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    function rapport() {
      var L = 0.2126 * canal(r) + 0.7152 * canal(v) + 0.0722 * canal(b);
      return 1.05 / (L + 0.05);                      /* contre du blanc */
    }
    /* Quatre et demi, c est le seuil des textes ordinaires. On vise 4,8 : le
       calcul se fait contre du BLANC PUR, mais les cartes du tiroir sont
       peintes d un degrade qui descend vers #F4F7FC. Un texte tout juste a
       4,5 sur du blanc retombait a 4,2 sur la carte, et les pourcentages de
       rarete passaient sous le seuil — mesure, pas suppose.
       On descend par petits pas plutot que d un coup : un seul saut
       assombrirait un rouge deja lisible autant qu un jaune qui ne l est pas
       du tout. */
    var garde = 0;
    while (rapport() < 4.8 && garde++ < 40) {
      r = Math.round(r * 0.92); v = Math.round(v * 0.92); b = Math.round(b * 0.92);
    }
    function deux(x) { var t = x.toString(16); return t.length < 2 ? '0' + t : t; }
    return '#' + deux(r) + deux(v) + deux(b);
  }

  function profStyle() {
    /* Injecte UNE fois. Ce bloc porte aussi l'habit de la scene d'ouverture
       de coffre, que le Nexus emprunte : sans ce garde-fou, chaque appel
       ajouterait une feuille de style de plus a la page. */
    if (profStyleFait) return;
    profStyleFait = true;
    var css = document.createElement('style');
    css.textContent =
      '.swpb{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;' +
      'margin-left:8px;width:34px;height:34px;padding:0;border-radius:50%;cursor:pointer;' +
      'font-size:15px;line-height:1;color:#1B5FE0;' +
      'background:linear-gradient(180deg,rgba(244,247,252,.95),rgba(255,255,255,.98));' +
      'border:1px solid rgba(27,95,224,.5);}' +
      /* Le survol virait a l or : la derniere couleur d avant, sur le bouton
         qu on regarde le plus. */
      '.swpb:hover{border-color:#1B5FE0;color:#0B1B36;}' +
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
      'background-color:rgba(255,255,255,.9);}' +
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
      'background:rgba(244,247,252,.42);opacity:0;visibility:hidden;' +
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
      'border-radius:0 18px 18px 0;overflow:hidden;color:#0B1B36;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,' +
      '"Helvetica Neue",Arial,sans-serif;' +
      'background:linear-gradient(180deg,#FFFFFF,#F7FAFF);' +
      'border:1px solid rgba(27,95,224,.4);border-left:0;' +
      'box-shadow:18px 0 60px rgba(11,27,54,0.18);}' +
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
       * doit pas se faire manger les deux tiers par un tiroir.
       *
       * Les deux facteurs sont choisis pour que le second palier ne soit
       * JAMAIS plus etroit que le premier au moment du changement (a 1280 px
       * pile) : 55 % de 1280 depasse deja le plafond de 680 du premier
       * palier, la largeur ne peut donc que grandir en traversant le seuil. */
      '@media (min-width:900px){.swp{width:min(62vw,680px);}}' +
      '@media (min-width:1280px){.swp{width:min(55vw,900px);}}' +
      /* Le nom de l'objet suit la case : a 9,5 px sur une vignette de 123, il
         se lisait comme une note de bas de page sous un poster. */
      '@media (min-width:900px){.swb-o{font-size:11px;padding:6px 6px 3px;}' +
        '.swb-r{gap:7px;}}' +
      /* ---- LA BARRE DU HAUT AUSSI ----
       * C etait le dernier aplat teinte du tiroir : un fond bleu a huit pour
       * cent, reste de l epoque ou tout etait sombre et ou il fallait detacher
       * l en-tete du reste. Sur un tiroir blanc, il n a plus rien a detacher —
       * le filet du bas suffit. Demande : « quand j ouvre le profil, tout en
       * blanc ». */
      '.swp-h{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 15px;' +
      'border-bottom:1px solid rgba(11,27,54,.12);background:#FFFFFF;}' +
      /* ---- L ECHELLE ----
         Le panneau portait HUIT tailles, de 9,5 a 13,5 px : la plus GROSSE
         faisait 13,5. Chez n'importe quelle application de compte, 13 px c'est
         la legende, pas le libelle. Quatre tailles remplacent les huit —
         16 / 14 / 12,5 / 11 — et la graisse cesse d'etre a 800 partout : quand
         tout est gras, rien ne ressort. */
      '.swp-h b{font-size:15px;letter-spacing:1.2px;text-transform:uppercase;color:#1B5FE0;' +
      'font-family:inherit;}' +
      '.swp-h span{flex:1;font-size:12.5px;color:#5F6E88;}' +
      '.swp-x{width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:15px;' +
      'color:#0B1B36;background:rgba(11,27,54,.07);border:1px solid rgba(11,27,54,.14);}' +
      /* ---- LE CORPS : DEUX VUES, PAS DEUX COLONNES ----
         Dans un tiroir de 400 px, un rail lateral coute 124 px a la liste
         pour afficher onze mots. On empile donc : le tiroir s'ouvre sur le
         SOMMAIRE — toute la largeur, une rangee par section — et une
         section touchee remplace le sommaire par sa liste, avec un retour
         en haut. C'est le geste de n'importe quelle application de compte,
         et la liste recupere les 124 px. */
      '.swp-body{flex:1;display:flex;min-height:0;overflow:hidden;}' +
      /* La deconnexion n'est pas une rangee comme les autres : elle se
         detache, sans crier. Un rouge plein en ferait un bouton qu'on
         evite de frôler, alors que c'est un geste ordinaire. */
      '.swp-sep{height:1px;margin:14px 12px 8px;background:rgba(11,27,54,.09);}' +
      '.swp-out{display:block;width:calc(100% - 16px);margin:0 8px 14px;padding:11px 12px;' +
      'border-radius:10px;border:1px solid rgba(224,68,62,.28);background:rgba(224,68,62,.07);' +
      'color:#E0443E;font:inherit;font-size:13px;font-weight:700;text-align:left;cursor:pointer;}' +
      '.swp-out:hover{background:rgba(224,68,62,.14);color:#E0443E;}' +
      '.swp-t{flex:1;display:flex;flex-direction:column;gap:3px;' +
      'padding:8px 10px 18px;overflow-y:auto;background:transparent;}' +
      '.swp-t .swp-g{margin:13px 0 4px;padding:0 6px;font-size:10.5px;font-weight:700;' +
      'letter-spacing:1.3px;text-transform:uppercase;color:#5F6E88;}' +
      '.swp-t .swp-g:first-child{margin-top:2px;}' +
      /* ---- CE QUI ATTEND LE JOUEUR ----
       *
       * En TETE du tiroir, avant tout le reste. Un joueur ouvre son profil
       * pour deux raisons : regarder un chiffre, ou s'occuper de ce qui
       * clignote. La deuxieme est la seule qui ait une urgence, donc elle est
       * la premiere qu'on voit.
       *
       * Les lignes sont plus HAUTES et plus contrastees que les rangees du
       * menu : elles ne sont pas de la navigation, ce sont des choses a
       * faire. Leur donner l'apparence du menu les aurait rendues invisibles
       * au milieu de dix-huit autres rangees — ce qui est exactement le
       * probleme qu'on repare. */
      '.swp-nz{margin:0 0 4px;}' +
      '.swp-n{display:flex!important;align-items:center;gap:11px;width:100%;' +
        'min-height:56px;padding:9px 11px;margin-bottom:6px;border-radius:12px;' +
        'border:1px solid rgba(27,95,224,.28);background:rgba(27,95,224,.07);' +
        'color:#0B1B36;font:inherit;text-align:left;cursor:pointer;}' +
      '.swp-n:hover{background:rgba(27,95,224,.13);}' +
      '.swp-n:disabled{opacity:.5;cursor:default;}' +
      '.swp-n .ic{flex:0 0 auto;font-size:19px;line-height:1;}' +
      '.swp-n .tx{flex:1;min-width:0;}' +
      '.swp-n .tx b{display:block;font-size:13.5px;font-weight:700;line-height:1.3;}' +
      '.swp-n .tx i{display:block;font-style:normal;font-size:11px;color:#5F6E88;' +
        'margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      /* « Claim » est un BOUTON dans le bouton : le geste se termine ici. Le
         chevron dit l'inverse — il emmene ailleurs. Deux gestes differents ne
         doivent pas porter le meme signe. */
      /* ---- LE CHEVRON DU MENU NE S'APPLIQUE PAS ICI ----
       *
       * `.swp-t button::after` ajoute un chevron a TOUTE rangee du sommaire.
       * Sur ces lignes-la il en faisait deux — le sien et le notre — et sur
       * les lignes d'action il collait un « › » derriere « Claim », ce qui
       * promet d'aller ailleurs a un bouton qui termine le geste sur place.
       * Trouve a la capture d'ecran, pas a la lecture. */
      '.swp-t .swp-n::after{content:none;}' +
      '.swp-n .fl{flex:0 0 auto;font-size:12px;font-weight:800;color:#1B5FE0;}' +
      '.swp-n:not(.agir) .fl{font-size:17px;font-weight:400;color:#5F6E88;}' +
      '.swp-n.agir .fl{padding:5px 11px;border-radius:9px;' +
        'border:1px solid rgba(27,95,224,.55);background:rgba(27,95,224,.16);}' +
      /* 46 px de haut : c'est la cible tactile confortable, et c'est aussi
         ce qui donne au sommaire l'air d'un menu plutot que d'une liste de
         cases a cocher serrees. */
      '.swp-t button{display:flex;align-items:center;width:100%;min-height:46px;' +
      'text-align:left;padding:0 12px;border-radius:11px;cursor:pointer;min-width:0;' +
      'font-family:inherit;font-size:14px;font-weight:600;letter-spacing:.1px;' +
      'color:#24406E;background:rgba(11,27,54,.03);border:1px solid transparent;}' +
      '.swp-t button::after{content:"\\203A";margin-left:auto;padding-left:10px;' +
      'font-size:17px;line-height:1;color:#5F6E88;}' +
      '.swp-t button:hover{background:rgba(11,27,54,.08);color:#0B1B36;}' +
      /* La derniere section ouverte se signale par un lisere, pas par un
         aplat dore : sur toute la largeur, l'aplat se lit comme un bouton
         d'action a presser, et il y en avait un par ouverture du tiroir. */
      '.swp-t button.on{color:#1B5FE0;background:rgba(27,95,224,.10);' +
      'border-color:rgba(27,95,224,.34);}' +
      '.swp-t button.on::after{color:#1B5FE0;}' +
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
        'border:1px solid rgba(18,161,80,.45);background:rgba(18,161,80,.10);' +
        'color:#0B1B36;transition:background .15s,border-color .15s;}' +
      '.swb-off:hover:not(:disabled){background:rgba(18,161,80,.16);border-color:rgba(18,161,80,.7);}' +
      '.swb-off .cf{flex:0 0 auto;width:52px;height:52px;object-fit:contain;}' +
      '.swb-off .n{display:block;font-weight:800;font-size:13.5px;color:#0B1B36;}' +
      '.swb-off .o{display:block;font-size:10.5px;color:#5F6E88;margin-top:2px;}' +
      '.swb-off .p{margin-left:auto;font-weight:800;font-size:12px;letter-spacing:.1em;color:#0E7C3E;}' +
      /* Pris : la carte reste, elle ne disparait pas. Un panneau qui change de
         forme selon l heure fait douter de ce qu on y a vu la veille. */
      '.swb-off.pris{opacity:.5;cursor:default;border-color:rgba(11,27,54,.12);' +
        'background:rgba(11,27,54,.04);}' +
      '.swb-off.pris .n,.swb-off.pris .p{color:#5F6E88;}' +
      '.swb-c{display:grid;gap:9px;margin:2px 0 14px;}' +
      '.swb-cof{display:flex;align-items:center;gap:11px;text-align:left;width:100%;' +
        'padding:10px 12px;border-radius:13px;cursor:pointer;' +
        'background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(244,247,252,.96));' +
        'border:1px solid rgba(27,95,224,.28);color:#0B1B36;font:inherit;}' +
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
      '.swb-cof .p{margin-left:auto;color:#1B5FE0;font-weight:800;white-space:nowrap;}' +
      '.swb-cof .o{display:block;font-size:10.5px;color:#5F6E88;margin-top:2px;}' +
      '.swb-ch{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;margin:-8px 2px 14px;}' +
      '.swb-ch span{color:#5F6E88;}' +
      '.swb-ch b{font-weight:800;}' +
      '.swb-fam{display:flex;align-items:baseline;gap:7px;margin:13px 2px 5px;}' +
      '.swb-fam b{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#1B5FE0;}' +
      '.swb-fam i{font-style:normal;font-size:11px;color:#5F6E88;margin-left:auto;}' +
      '.swb-fam.plein i{color:#0E7C3E;font-weight:800;}' +
      '.swb-mention{font-size:10.5px;color:#5F6E88;line-height:1.5;margin:-2px 2px 4px;font-style:italic;}' +
      '.swb-gain .pv{font-style:italic;margin-top:2px;line-height:1.35;}' +
      '.swb-gain .num{font-weight:800;letter-spacing:.4px;margin-top:3px;}' +
      '.swb-ed{font-style:normal;margin-top:-2px;}' +
      '.swb-ed b{color:#1B5FE0;}' +
      '.swb-course{margin:2px 0 13px;padding:11px 13px;border-radius:13px;' +
        'background:linear-gradient(180deg,rgba(234,241,255,.92),rgba(244,247,252,.95));' +
        'border:1px solid rgba(27,95,224,.34);}' +
      '.swb-course .t{font-size:11px;letter-spacing:1.3px;text-transform:uppercase;' +
        'color:#1B5FE0;font-weight:800;margin-bottom:7px;}' +
      '.swb-course .l{font-size:12.5px;line-height:1.75;}' +
      '.swb-course .l b{color:#1B5FE0;}' +
      '.swb-course .l span{color:#5F6E88;}' +
      '.swb-course .l.pris{opacity:.55;}' +
      '.swb-course .l.pris span{color:#0E7C3E;}' +
      '.swb-course .s{font-size:10.5px;color:#5F6E88;margin-top:6px;font-style:italic;}' +
      '.swb-course.finie{opacity:.6;}' +
      '.swb-course.gagne{border-color:#7CFF9B;' +
        'background:linear-gradient(180deg,rgba(232,248,238,.94),rgba(240,251,244,.96));}' +
      '.swb-course.gagne .t{color:#0E7C3E;}' +
      /* ---- LA SCENE D'OUVERTURE ----
         Elle est au-dessus du tiroir ET du voile de la page : c'est le seul
         moment ou plus rien d'autre ne compte. */
      /* Le voile monte a .96 avec un flou : a .88 les panneaux du tiroir
         restaient lisibles derriere et se battaient avec le nom du fruit —
         on lisait « 45% Common » a travers « Miracle Fruit ». Le flou fait
         le reste du travail sans rendre l'ecran opaque. */
      '.swb-scene{position:fixed;inset:0;z-index:2147483100;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'background:rgba(244,247,252,.96);-webkit-backdrop-filter:blur(7px);' +
        'backdrop-filter:blur(7px);opacity:0;pointer-events:none;' +
        'transition:opacity .25s;--teinte:#5F6E88;' +
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
        'background:rgba(11,27,54,.05);}' +
      '.swb-cl .bar span.a{background:rgba(11,27,54,.05);' +
        'box-shadow:inset 0 0 0 1px var(--t),0 0 5px -1px var(--t);}' +
      '.swb-cl .bar img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}' +
      '.swb-cl .r:nth-child(odd){background:rgba(11,27,54,.035);}' +
      '.swb-cl .r.moi{background:rgba(27,95,224,.13);' +
        'box-shadow:inset 0 0 0 1px rgba(27,95,224,.32);}' +
      '.swb-cl .rg{flex:0 0 24px;text-align:center;font-weight:800;color:#5F6E88;}' +
      '.swb-cl .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swb-cl .fp{flex:0 0 auto;font-size:10px;font-weight:800;color:#0E7C3E;' +
        'background:rgba(18,161,80,.12);padding:2px 6px;border-radius:6px;}' +
      '.swb-cl .sc{flex:0 0 auto;font-weight:800;}' +
      '.swb-cl .sc i{font-style:normal;font-weight:600;color:#5F6E88;font-size:10.5px;}' +
      '.swb-cl .sep{height:1px;background:rgba(11,27,54,.1);margin:5px 9px;}' +
      /* Le bandeau des saisons. Deux onglets pleine largeur : a deux, une
         rangee qui se partage l'espace se lit mieux qu'une barre de defilement
         horizontale — et le jour ou il y en a quatre, le `flex-wrap` les met
         sur deux lignes au lieu d'en cacher deux. */
      '.swb-sai{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 13px;}' +
      '.swb-s{flex:1 1 130px;display:flex;align-items:baseline;gap:6px;' +
        'padding:9px 11px;border-radius:11px;font:inherit;font-size:12px;cursor:pointer;' +
        'border:1px solid rgba(11,27,54,.13);background:rgba(11,27,54,.04);' +
        'color:#5F6E88;transition:background .15s,border-color .15s,color .15s;}' +
      '.swb-s b{font-size:12.5px;font-weight:800;letter-spacing:.4px;color:#24406E;}' +
      '.swb-s:hover:not(:disabled){background:rgba(11,27,54,.08);' +
        'border-color:rgba(11,27,54,.24);}' +
      '.swb-s.on{background:rgba(27,95,224,.13);border-color:rgba(27,95,224,.55);color:#1B5FE0;}' +
      '.swb-s.on b{color:#1B5FE0;}' +
      /* Verrouillee : grisee, mais PAS cachee, et le curseur dit qu'il n'y a
         rien a cliquer plutot que de laisser essayer. */
      '.swb-s.clos{opacity:.55;cursor:not-allowed;}' +
      '.swb-s i{font-style:normal;margin-left:auto;font-size:10px;font-weight:800;' +
        'letter-spacing:.5px;text-transform:uppercase;white-space:nowrap;}' +
      '.swb-s i.cl{color:#5F6E88;}' +
      /* Le renvoi vers la boutique, au bas du classement. Discret — c'est une
         sortie, pas un appel : le bouton d'achat est dans l'autre section et
         il n'y a rien a gagner a en poser un faux ici. */
      '.swb-vers{display:block;width:100%;margin:14px 0 4px;padding:11px;' +
        'border-radius:12px;border:1px solid rgba(11,27,54,.14);' +
        'background:rgba(11,27,54,.05);color:#24406E;font:inherit;font-weight:700;' +
        'font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s;}' +
      '.swb-vers:hover{background:rgba(11,27,54,.09);border-color:rgba(11,27,54,.26);}' +
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
      '.swb-scene .nom{font-size:26px;font-weight:800;margin:3px 0 5px;color:#0B1B36;}' +
      '.swb-scene .num{font-size:13px;font-weight:800;color:#1B5FE0;letter-spacing:.6px;}' +
      '.swb-scene .pv{font-size:12.5px;font-style:italic;color:#5F6E88;margin-top:7px;line-height:1.5;}' +
      '.swb-scene .tap{position:absolute;bottom:34px;font-size:11px;letter-spacing:1.6px;' +
        'text-transform:uppercase;color:#5F6E88;opacity:0;transition:opacity .4s 1s;}' +
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
        'background:radial-gradient(120% 120% at 30% 20%,rgba(11,27,54,.07),rgba(11,27,54,.05));' +
        'border:1px solid;display:flex;align-items:flex-end;justify-content:center;' +
        /* Le nom descend de trois pixels. Cale a cinq de chaque cote il
           flottait au milieu du bas du dessin ; pose plus bas il se lit
           comme une legende sous l'image, ce qu'il est. */
        'padding:5px 5px 2px;font-size:9.5px;line-height:1.15;text-align:center;}' +
      '.swb-o img{position:absolute;inset:9%;width:82%;height:82%;object-fit:contain;}' +
      '.swb-o .q{position:absolute;top:4px;right:5px;font-weight:800;font-size:10px;' +
        'background:rgba(11,27,54,.05);border-radius:6px;padding:1px 4px;}' +
      '.swb-o .t{position:relative;z-index:2;text-shadow:0 1px 3px #000,0 0 6px #000;}' +
      /* UN VOILE SOUS LE NOM. Tant que les dessins manquaient, le nom flottait
         sur un fond uni et se lisait tout seul. Pose sur un fruit clair, il se
         battait avec lui : l'ombre portee suffisait a le rendre lisible, pas a
         le rendre propre. Le degrade ne couvre que le tiers bas et n'existe
         que sur les cases qui ont une image. */
      '.swb-o:has(img) .t::before{content:"";position:absolute;inset:-4px -8px -6px -8px;' +
        'z-index:-1;background:linear-gradient(to top,rgba(244,247,252,.92),rgba(244,247,252,0));}' +
      '.swb-vide{color:#5F6E88;font-size:12px;text-align:center;padding:16px 8px;line-height:1.55;}' +
      '.swb-gain{margin:2px 0 12px;padding:11px 12px;border-radius:13px;border:1px solid;' +
        'display:flex;align-items:center;gap:11px;}' +
      '.swb-gain .l{font-size:11px;color:#5F6E88;}' +
      '.swb-gain .n{font-weight:800;font-size:14px;}' +
      '.swp-l{display:none;flex:1;overflow-y:auto;padding:8px 12px 18px;min-height:180px;}' +
      '.swp.detail .swp-t{display:none;}' +
      '.swp.detail .swp-l{display:block;}' +
      /* La barre de retour : elle ne sert que dans la vue detail, donc
         elle n'existe que la. Un bouton retour toujours visible sur le
         sommaire ferait croire qu'il y a un cran au-dessus. */
      '.swp-back{display:none;align-items:center;gap:9px;padding:9px 12px;' +
      'border-bottom:1px solid rgba(11,27,54,.09);background:rgba(11,27,54,.02);}' +
      '.swp.detail .swp-back{display:flex;}' +
      '.swp-back .swp-bk{width:30px;height:30px;flex:0 0 30px;border-radius:9px;cursor:pointer;' +
      'font-size:17px;line-height:1;color:#0B1B36;font-family:inherit;' +
      'background:rgba(11,27,54,.07);border:1px solid rgba(11,27,54,.14);}' +
      '.swp-back .swp-bk:hover{color:#1B5FE0;border-color:rgba(27,95,224,.5);}' +
      '.swp-back b{font-size:14px;font-weight:700;letter-spacing:.2px;color:#0B1B36;}' +
      '.swp-r{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;' +
      'margin-bottom:6px;background:rgba(11,27,54,.04);' +
      'border:1px solid rgba(11,27,54,.07);}' +
      '.swp-r .w{flex:1;min-width:0;}' +
      '.swp-r .w b{display:block;font-size:14px;font-weight:600;color:#0B1B36;}' +
      '.swp-r .w span{display:block;font-size:12px;color:#5F6E88;margin-top:3px;}' +
      /* L adresse en entier : c est elle qu on relit avant d envoyer. */
      '.swp-r .w span.ad{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:11px;letter-spacing:.15px;color:#7E92B6;word-break:break-all;cursor:pointer;}' +
      '.swp-r .w span.ad:hover{color:#1B5FE0;}' +
      '.swp-r .w span.su{color:#5F6E88;font-size:12px;}' +
      '.swlv{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;' +
      'font-size:10px;font-weight:900;line-height:1.5;vertical-align:middle;' +
      'border:1px solid;background:rgba(11,27,54,.05);}' +
      /* La regle des lignes, « .swp-r .w span{display:block} », est PLUS
         SPECIFIQUE que « .swlv » : la pastille s etirait sur toute la largeur
         de la ligne et ressemblait a un champ de saisie vide. Il faut donc
         redire ici, a specificite egale, ce qu elle est. */
      '.swp-r .w span.swlv,.swp-r .w b span.swlv{display:inline-block;width:auto;' +
      'margin-top:0;font-size:10px;}' +
      /* La barre de progression : un niveau sans la marche suivante ne donne
         envie de rien. */
      '.swnv{margin-bottom:10px;padding:10px 12px;border-radius:12px;' +
      'background:rgba(11,27,54,.04);border:1px solid rgba(11,27,54,.10);}' +
      '.swnv .h{display:flex;align-items:baseline;gap:8px;font-size:12.5px;font-weight:800;' +
      'color:#0B1B36;}' +
      '.swnv .h i{margin-left:auto;font-style:normal;font-size:10.5px;color:#5F6E88;}' +
      '.swnv .b{height:7px;border-radius:999px;margin-top:8px;overflow:hidden;' +
      'background:rgba(11,27,54,.05);}' +
      '.swnv .b>i{display:block;height:100%;border-radius:999px;transition:width .4s;}' +
      '.swnv .r .sr{color:#0E7C3E;opacity:.85;}' +
      '.swnv .r{margin-top:6px;font-size:10.5px;color:#5F6E88;}' +
      /* L echelle des dix paliers de parrainage : dix pastilles qui se
         replient, celle du joueur allumee. */
      '.swech{display:flex;flex-wrap:wrap;gap:4px;margin-top:9px;}' +
      '.swech span{flex:1 1 auto;min-width:52px;text-align:center;padding:5px 3px;' +
      'border-radius:8px;font-size:9px;color:#5F6E88;line-height:1.5;' +
      'background:rgba(11,27,54,.05);border:1px solid rgba(11,27,54,.09);}' +
      '.swech span b{display:block;font-size:12px;font-weight:900;color:#0B1B36;}' +
      '.swech span.on{background:rgba(11,27,54,.07);}' +
      '.swech span.on b{color:inherit;}' +
      '.swp-r .v{flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;}' +
      '.swp-r .v b{display:block;font-size:16px;font-weight:700;}' +
      '.swp-r .v span{font-size:11px;color:#5F6E88;}' +
      '.swp-r .g{color:#0E7C3E;} .swp-r .p{color:#E0443E;} .swp-r .n{color:#1B5FE0;}' +
      '.swp-v{text-align:center;color:#5F6E88;font-size:13.5px;padding:30px 10px;line-height:1.7;}' +
      /* L'apercu : des cartes, pas un tableau. Un tableau se lit de gauche a
         droite ; une grille de cartes se balaie, et c'est ce qu'on fait devant
         son propre profil. */
      /* Centre, large, cliquable — c est un portrait, pas une carte de plus
         dans la grille des chiffres. Le bord suit la couleur du skin, comme
         partout ailleurs ou un skin s affiche. */
      '.swap-skin{display:flex;flex-direction:column;align-items:center;gap:2px;' +
        'margin:2px 0 14px;padding:16px 10px 13px;border-radius:16px;cursor:pointer;' +
        'border:1px solid rgba(11,27,54,.10);background:rgba(11,27,54,.03);' +
        'border-top:3px solid var(--t);}' +
      '.swap-skin:hover{background:rgba(11,27,54,.06);}' +
      '.swap-skin .ico{width:104px;height:104px;display:flex;align-items:center;justify-content:center;}' +
      '.swap-skin .ico img{max-width:100%;max-height:100%;object-fit:contain;' +
        'filter:drop-shadow(0 8px 14px rgba(0,0,0,.4));}' +
      '.swap-skin i{font-style:normal;font-size:10px;letter-spacing:.8px;text-transform:uppercase;' +
        'color:#5F6E88;margin-top:4px;}' +
      '.swap-skin b{font-size:15.5px;font-weight:800;color:#0B1B36;}' +
      '.swap-g{display:grid;gap:7px;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));' +
      'margin-bottom:12px;}' +
      '.swap-c{padding:10px 11px;border-radius:11px;background:rgba(11,27,54,.05);' +
      'border:1px solid rgba(11,27,54,.10);}' +
      '.swap-c span{display:block;font-size:10px;letter-spacing:.7px;text-transform:uppercase;' +
      'color:#5F6E88;}' +
      '.swap-c b{display:block;margin-top:3px;font-size:16px;font-weight:900;color:#0B1B36;' +
      'font-variant-numeric:tabular-nums;}' +
      '.swap-c i{display:block;margin-top:2px;font-style:normal;font-size:10.5px;color:#5F6E88;}' +
      '.swap-t{margin:12px 0 6px;font-size:10px;letter-spacing:1px;text-transform:uppercase;' +
      'color:#5F6E88;}' +
      '.swap-f{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.swap-f span{padding:7px 10px;border-radius:10px;font-size:11.5px;font-weight:700;' +
      'color:#0B1B36;background:rgba(11,27,54,.05);border:1px solid rgba(11,27,54,.10);}' +
      '.swap-f span i{margin-left:6px;font-style:normal;font-weight:600;color:#5F6E88;}' +
      /* Les pastilles de filtre : assez petites pour ne pas voler la vedette a
         la liste qu'elles trient. */
      '.swap-fl{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0 10px;}' +
      '.swap-fl button{padding:5px 9px;border-radius:999px;cursor:pointer;font-family:inherit;' +
      'font-size:10.5px;font-weight:700;color:#5F6E88;background:rgba(11,27,54,.05);' +
      'border:1px solid rgba(11,27,54,.10);}' +
      '.swap-fl button.on{color:#07101F;background:linear-gradient(180deg,#FFE08A,#FFC53D);' +
      'border-color:transparent;}' +
      '.swp-more{display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;' +
      'cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:800;color:#0B1B36;' +
      'background:rgba(11,27,54,.06);border:1px solid rgba(11,27,54,.14);}' +
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
      'border-bottom:1px solid rgba(27,95,224,.18);background:rgba(11,27,54,.03);}' +
      /* L'adresse partageable. Elle passe a la ligne sous le nom : la mettre
         a cote comprimerait un nom long, qui est justement ce qu'on partage. */
      '.swp-me{flex-wrap:wrap;}' +
      '.swpart{flex:1 0 100%;margin-top:9px;padding:8px 10px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:800;color:#1B5FE0;' +
      'background:rgba(27,95,224,.10);border:1px solid rgba(27,95,224,.34);}' +
      '.swpart:hover{background:rgba(27,95,224,.18);}' +
      /* ---- LE CADRE DE PALIER ----
         Il se pose SANS toucher au balisage : un ::after par-dessus la photo,
         un peu plus grand qu'elle. Le trou du cadre fait 56 % de l'image, donc
         a 148 % il mord sur les 18 % exterieurs de la photo — c'est ce que
         fait un vrai cadre, et c'est ce qui empeche le lisere de flotter.
         La marge laterale rend au voisin la place que le cadre lui prend. */
      /* ---- L'AVATAR DE LA PAGE, EN IMAGE ----
       * Les feuilles des pages le dessinent en carre arrondi avec un emoji au
       * centre : elles n'ont jamais prevu qu'il porte une photo. On pose donc
       * ici ce qu'il faut, et RIEN de plus — ni taille ni position, qui
       * restent a la page. `!important` parce que sa regle a elle pose un
       * `background` complet, raccourci qui ecraserait notre image. */
      '.swav-img{background-size:cover !important;background-position:center !important;' +
      'background-repeat:no-repeat !important;color:transparent !important;' +
      'border-color:transparent !important;}' +
      /* Un cadre est ROND. Pose sur un carre arrondi, l'anneau flotte a ses
         quatre coins — le meme defaut que le decalage vertical, dans l'autre
         sens. */
      '.sw-avatar.swcad{border-radius:50% !important;}' +
      '.swcad{position:relative;overflow:visible;}' +
      /* ---- LA TAILLE ET LE CALAGE VIENNENT D'UNE MESURE ----
       * Le cadre etait pose a 148 %, centre. Deux defauts, signales ensemble :
       * « recale bien la banniere avec la photo, il y a un decalage » et
       * « trop petite la photo ».
       *
       * Mesure sur les DIX cadres : leur trou fait 67,7 % de la largeur en
       * moyenne, et son centre est 1,9 % PLUS HAUT que le centre de l'image —
       * la banniere du bas pousse l'anneau vers le haut. Un cadre centre
       * posait donc son trou au-dessus de la photo, toujours du meme cote.
       *
       * A 136 % l'anneau mord huit pour cent du diametre de la photo, ce qui
       * est ce que fait un cadre, et son encombrement passe de 1,48 a 1,36 :
       * la photo occupe visiblement plus de place sans grandir d'un pixel.
       * Le decalage vers le BAS vaut 1,9 % du cadre, soit 2,6 % de l'element.
       */
      '.swcad::after{content:"";position:absolute;left:-18%;top:-15.4%;width:136%;height:136%;' +
      'background:var(--cadre) center/contain no-repeat;pointer-events:none;z-index:2;}' +
      '.av.swcad{margin:0 5px;border-color:transparent;}' +
      /* Le bouton de la barre : le cadre deborde de 24 % de chaque cote, il
         faut donc lui rendre cette place, sinon il mord sur ses voisins. */
      '.swpb.swcad{margin-left:15px;margin-right:7px;border-color:transparent;box-shadow:none;}' +
      '.swp-av.swcad{margin:0 7px;border-color:transparent;}' +
      /* Le mur de la salle derriere les blocs du profil : le meme que la page
         d accueil, assombri pour que le texte reste lisible. */
      /* ---- LE MUR DE LA SALLE EST PARTI ----
       * Ces deux blocs gardaient la photo de la salle sous un voile sombre,
       * seuls ilots de nuit dans un tiroir devenu blanc. Il fallait leur ecrire
       * un jeu de couleurs a part — texte clair, bordures claires — et cette
       * exception s est deja retournee une fois : le nom du joueur et son
       * adresse avaient disparu dans le mur.
       * Demande : « my profil, le menu tout en blanc ». Ils prennent donc la
       * meme carte que le reste, et les regles d exception disparaissent avec
       * le fond qui les justifiait. Une image de moins a charger. */
      '.swp-me,.swnv{background:#F4F7FC;border:1px solid rgba(11,27,54,.10);}' +
      '.swp-me{border-width:0 0 1px 0;}' +
      '.swp .swp-me .nm b,.swp .swnv .h,.swp .swnv .h b{color:#0B1B36;}' +
      '.swp .swp-me .nm > span,.swp .swnv .h i,.swp .swnv .r{color:#5F6E88;}' +
      '.swp .swp-me .swp-adr{border-bottom-color:rgba(11,27,54,.28);}' +
      '.swp .swp-me .swp-ed{color:#5F6E88;background:rgba(11,27,54,.06);' +
      'border-color:rgba(11,27,54,.13);}' +
      '.swp .swp-me .swp-ed:hover{color:#1B5FE0;border-color:rgba(27,95,224,.5);}' +
      /* 56 px et non 40 : le cadre de palier est ce qu'on remarque en premier
         chez les autres joueurs — c'est la seule chose du profil qui se voie
         d'un coup d'oeil et qui se merite. A 40 px il etait un detail. */
      '.swp-av{flex:0 0 auto;width:56px;height:56px;border-radius:50%;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;font-size:21px;' +
      'background:linear-gradient(180deg,rgba(244,247,252,.95),rgba(255,255,255,.98));' +
      'border:1px solid rgba(27,95,224,.5);}' +
      '.swp-me .nm{flex:1;min-width:0;}' +
      '.swp-me .nm b{display:block;font-size:17px;font-weight:700;color:#0B1B36;' +
      'letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.swp-adr{cursor:pointer;-webkit-user-select:all;user-select:all;' +
      'border-bottom:1px dashed #E1E9F6;padding-bottom:1px;}' +
      '.swp-adr:hover{color:#CFE0FF;border-bottom-color:#7d92cc;}' +
      '.swp-adr-ok{color:#0E7C3E!important;border-bottom-color:#7BE3A0!important;}' +
      '.swp-ch{display:flex;gap:7px;padding:0 13px 12px;flex-wrap:wrap;}' +
      /* Des <span>, jamais des <button> : rien ici ne se clique, et un survol
         qui reagit apprend le contraire. */
      /* La vitrine */
      '.swm-q{width:100%;padding:9px 12px;margin:0 0 12px;border-radius:11px;font:inherit;' +
        'font-size:13px;border:1px solid rgba(11,27,54,.13);background:rgba(11,27,54,.04);' +
        'color:#0B1B36;-webkit-appearance:none;}' +
      '.swm-q::placeholder{color:#5F6E88;}' +
      '.swm-l{display:grid;gap:8px;margin:0 0 14px;}' +
      '.swm-a{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:13px;' +
        'border:1px solid rgba(11,27,54,.10);background:rgba(11,27,54,.04);' +
        'border-left:3px solid var(--t);}' +
      '.swm-a.mien{background:rgba(27,95,224,.08);border-color:rgba(27,95,224,.3);}' +
      '.swm-a img{width:42px;height:42px;flex:0 0 42px;object-fit:contain;}' +
      /* La vignette d'un familier est une CASE de planche : seize poses dans
         une image de quatre sur quatre. On cadre la pose de face — rangee
         « down », premiere colonne — c'est celle sous laquelle on le
         reconnait, celle qu'il a quand il vous regarde. */
      '.swm-a .pl{width:42px;height:42px;flex:0 0 42px;display:block;' +
      'image-rendering:pixelated;background-repeat:no-repeat;' +
      'background-size:400% 400%;background-position:0% 33.333%;}' +
      '.swm-a .nm{flex:1;min-width:0;}' +
      '.swm-a .nm b{display:block;font-size:13px;font-weight:800;color:#0B1B36;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swm-a .nm b em{font-style:normal;color:var(--t);}' +
      '.swm-a .nm i{display:block;font-style:normal;font-size:10px;color:#5F6E88;margin-top:1px;}' +
      '.swm-a .nm i.v{color:#5F6E88;}' +
      '.swm-a .px{text-align:right;flex:0 0 auto;}' +
      '.swm-a .px b{display:block;font-size:14px;font-weight:800;color:#1B5FE0;' +
        'font-variant-numeric:tabular-nums;}' +
      '.swm-a .px i{font-style:normal;font-size:9px;color:#5F6E88;letter-spacing:.06em;}' +
      '.swm-a .swact{flex:0 0 auto;padding:8px 13px;border-radius:10px;font:inherit;' +
        'font-size:12px;font-weight:800;cursor:pointer;border:1px solid rgba(11,27,54,.18);' +
        'background:rgba(11,27,54,.06);color:#0B1B36;}' +
      '.swm-a .swact:hover:not(:disabled){background:rgba(11,27,54,.12);}' +
      '.swm-a .swact:disabled{opacity:.45;cursor:default;}' +
      '.swm-a.mien .act{border-color:rgba(27,95,224,.5);color:#1B5FE0;}' +
      /* ---- LES SKINS : UNE CARTE PAR PERSONNAGE, PAS UNE LIGNE ----
       *
       * Le marche est une liste parce qu'une annonce est faite de texte —
       * nom, vendeur, prix — que du texte lit bien en ligne. Un skin est
       * d'abord une IMAGE : cinq personnages se comparent d'un coup d'oeil
       * sur une grille, jamais aussi vite dans une colonne qu'il faut
       * parcourir un a un. */
      '.swk-g{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:4px;}' +
      '@media (min-width:360px){.swk-g{grid-template-columns:repeat(2,1fr);}}' +
      '.swk-c{display:flex;flex-direction:column;align-items:center;text-align:center;' +
        'padding:14px 10px 12px;border-radius:14px;gap:6px;cursor:pointer;' +
        'border:1px solid rgba(11,27,54,.10);background:rgba(11,27,54,.03);' +
        'border-top:3px solid var(--t);}' +
      '.swk-c:hover{background:rgba(11,27,54,.06);}' +
      '.swk-c.actif{background:rgba(18,161,80,.06);border-color:rgba(18,161,80,.35);' +
        'border-top-color:#7CFF9B;}' +
      '.swk-c .ico{width:84px;height:84px;display:flex;align-items:center;justify-content:center;}' +
      '.swk-c .ico img{max-width:100%;max-height:100%;object-fit:contain;' +
        'filter:drop-shadow(0 6px 10px rgba(0,0,0,.4));}' +
      '.swk-c .nm{font-size:13.5px;font-weight:800;color:#0B1B36;}' +
      /* La puissance en points, pas en chiffre : cinq cartes se comparent
         d'un regard, sans avoir a lire cinq nombres et les classer soi-meme. */
      '.swk-c .pw{display:flex;gap:3px;font-style:normal;}' +
      '.swk-c .pw i{width:6px;height:6px;border-radius:99px;background:rgba(11,27,54,.16);}' +
      '.swk-c .pw i.on{background:var(--t);}' +
      '.swk-c .pv{font-style:normal;font-size:10.5px;color:#5F6E88;line-height:1.4;' +
        'min-height:2.7em;}' +
      '.swk-c .bas,.swk-da{margin-top:4px;}' +
      '.swk-c .swtag,.swk-da .swtag{font-size:11px;font-weight:800;color:#0E7C3E;' +
        'border:1px solid rgba(18,161,80,.4);border-radius:99px;padding:4px 12px;}' +
      '.swk-c .swact,.swk-da .swact{padding:8px 14px;border-radius:10px;font:inherit;font-size:12px;' +
        'font-weight:800;cursor:pointer;border:1px solid rgba(11,27,54,.18);' +
        'background:rgba(11,27,54,.06);color:#0B1B36;}' +
      '.swk-c .swact:hover:not(:disabled),.swk-da .swact:hover:not(:disabled){background:rgba(11,27,54,.12);}' +
      '.swk-c .swact:disabled,.swk-da .swact:disabled{opacity:.45;cursor:default;}' +
      /* Le prix est le SEUL bouton dore du tiroir en dehors des gestes
         d argent : il doit se voir comme « ceci coute », pas comme un bouton
         d action neutre parmi d autres. */
      /* ---- POURQUOI TOUTES CES CLASSES SONT PREFIXEES `sw` ----
       *
       * Ce fichier pose ses elements sur les dix-neuf pages du site, et
       * chacune a sa propre feuille de style. Une classe au nom courant y
       * est donc un pari : le jour ou une page nomme la meme chose, elle
       * capture nos elements sans que rien ne le signale.
       *
       * Ce n'est pas theorique, ca s'est produit trois fois :
       *   - `.buy`   : le bouton « Buy $SWOGE » de la barre est un sprite
       *                dont le texte part hors-ecran (`text-indent:-9999px`)
       *                et le fond est force transparent en `!important`. Le
       *                bouton d'achat de skin portait la meme classe et en
       *                heritait : un rectangle vide. Personne ne pouvait
       *                acheter de personnage, sans une erreur en console.
       *   - `.act`   : douze pages posent `.act{display:flex;gap:10px}` sur
       *                leur rangee d'actions ; nos boutons devenaient des
       *                conteneurs flex, prix disloque en deux morceaux.
       *   - `.tag`   : `games.html` force couleur, fond et bordure en
       *                `!important` — ce qui BAT notre regle malgre sa
       *                specificite superieure. Le badge « Wearing » virait
       *                a l'or au lieu du vert qui veut dire « celui-ci ».
       *
       * Le prefixe n'est donc pas une convention d'ecriture, c'est le seul
       * mecanisme d'isolation qu'on ait sans Shadow DOM. Une classe nue
       * ajoutee ici est une panne qui attend sa page. */
      '.swk-c .swact.swprix,.swk-da .swact.swprix{border-color:rgba(27,95,224,.55);background:rgba(27,95,224,.14);' +
        'color:#1B5FE0;}' +
      '.swk-c .swact.swprix i,.swk-da .swact.swprix i{font-style:normal;font-weight:600;opacity:.85;}' +
      /* ---- CELUI QU'ON DONNE ----
         Vert, comme tout ce qui est acquis dans ce jeu, et pas dore comme un
         prix : la couleur dit deja qu'il n'y a rien a payer avant qu'on ait lu
         le mot. Le ruban se pose sur la vignette parce que c'est elle qu'on
         regarde en premier dans une grille de six. */
      '.swk-c .swact.swgratuit,.swk-da .swact.swgratuit{border-color:rgba(18,161,80,.5);' +
        'background:rgba(18,161,80,.14);color:#0E7C3E;font-weight:800;letter-spacing:.06em;}' +
      '.swk-c{position:relative;}' +
      '.swk-c .swk-free{position:absolute;top:8px;right:8px;text-decoration:none;' +
        'font-size:9.5px;font-weight:900;letter-spacing:.08em;color:#0d1117;' +
        'background:#7CFF9B;border-radius:99px;padding:2px 7px;line-height:1.4;}' +
      /* Le compteur d edition prend la MEME place que « FREE » — les deux ne
         peuvent pas coexister sur une carte (un skin offert n a pas d
         edition), et deux pastilles au meme coin se superposeraient. */
      '.swk-c .swk-ed{position:absolute;top:8px;right:8px;text-decoration:none;' +
        'font-size:9.5px;font-weight:900;letter-spacing:.06em;color:#0d1117;' +
        'background:#FFC53D;border-radius:99px;padding:2px 7px;line-height:1.4;}' +
      '.swk-c .swk-ed.vide{background:#E1E9F6;color:#0d1117;}' +
      '.swk-edl{font-style:normal;font-size:11.5px;font-weight:700;color:#1B5FE0;' +
        'letter-spacing:.03em;}' +
      '.swk-edl.vide{color:#5F6E88;}' +
      '.swk-avoir{font-style:normal;font-size:11px;color:#5F6E88;}' +
      /* La fiche empile maintenant trois choses sous le portrait (le compteur
         d edition, l or qu on a, le bouton). En flux normal, un <i> et un
         <button> se rangent cote a cote sur la meme ligne : la colonne le DIT
         plutot que d ajouter un <br> entre chaque. */
      '.swk-da{display:flex;flex-direction:column;align-items:center;gap:6px;}' +
      /* « SOLD OUT » n est pas une bonne nouvelle : il ne prend pas le vert de
         « Wearing », qui se lit comme une reussite. */
      '.swk-c .swtag.swk-fini,.swk-da .swtag.swk-fini{color:#5F6E88;' +
        'border-color:rgba(11,27,54,.16);}' +
      /* ---- LA FICHE EN GRAND ----
       *
       * Meme coque que la feuille de vente (.swv, .swv-f, .swv-x) — mais PAS
       * le meme ancrage. La feuille de vente est un formulaire qu'on remplit
       * en bas, pres du pouce. La fiche d'un personnage est un portrait :
       * elle se regarde au CENTRE de l'ecran, meme quand on l'ouvre depuis un
       * skin affiche tout en haut du profil — sinon le geste (taper en haut)
       * et la reponse (une feuille qui monte du bas) se contredisent. */
      /* `.swv.swk-v` et pas juste `.swk-v` : les deux classes sont sur le
         MEME element (`swv swk-v`), et la regle de base `.swv{align-items:
         flex-end}` vient plus loin dans la feuille — a specificite egale,
         c'est elle qui gagnerait a l'usure. Le doublement de classe force
         une specificite superieure, sans dependre de l'ordre. */
      '.swv.swk-v{align-items:center;padding:16px;}' +
      '.swk-v .swv-f{width:calc(100% - 0px);max-width:380px;border-radius:18px;' +
        'align-items:center;text-align:center;gap:9px;padding-top:28px;' +
        'transform:scale(.94);opacity:0;transition:transform .2s,opacity .2s;}' +
      '.swk-v.on .swv-f{transform:none;opacity:1;}' +
      /* Le portrait au centre, un emplacement d equipement de chaque cote —
         a gauche le fruit, a droite l arme. C est la disposition d une
         fiche de personnage, pas une image seule suivie d une liste en
         dessous : on doit voir sur QUI l objet est pose. */
      '.swk-herorow{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;}' +
      '.swk-hero{width:min(42vw,170px);height:min(42vw,170px);display:flex;flex:0 0 auto;' +
        'align-items:center;justify-content:center;}' +
      '.swk-hero img{max-width:100%;max-height:100%;object-fit:contain;' +
        'filter:drop-shadow(0 10px 18px rgba(0,0,0,.45));}' +
      /* Deux cases empilees de chaque cote : fruit au-dessus de l armure a
         gauche, arme au-dessus de la bague a droite. */
      '.swk-slotcol{display:flex;flex-direction:column;gap:10px;flex:0 0 auto;}' +
      '.swk-slot{position:relative;flex:0 0 auto;width:58px;height:58px;border-radius:13px;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
        'padding:4px;font:inherit;cursor:pointer;border:2px solid var(--c,rgba(11,27,54,.18));' +
        'background:rgba(11,27,54,.04);color:#5F6E88;}' +
      '.swk-slot:hover{background:rgba(11,27,54,.09);}' +
      '.swk-slot.vide{border-style:dashed;}' +
      '.swk-slot img{max-width:70%;max-height:56%;object-fit:contain;}' +
      '.swk-slot b{font-style:normal;font-size:9px;font-weight:800;color:#0E7C3E;line-height:1.15;}' +
      '.swk-slot i{font-style:normal;font-size:9.5px;line-height:1.2;}' +
      /* Le retrait se fait depuis le badge, pas depuis le corps du bouton —
         sinon toucher la case pour voir ce qu on pourrait mettre a la place
         retirerait l objet au lieu d ouvrir le choix. */
      '.swk-slot .rm{position:absolute;top:-6px;right:-6px;width:19px;height:19px;' +
        'border-radius:99px;display:flex;align-items:center;justify-content:center;' +
        'font-size:11px;line-height:1;border:1px solid rgba(11,27,54,.2);' +
        'background:#EEF3FB;color:#5F6E88;}' +
      '.swk-slot .rm:hover{color:#FF7A7A;border-color:rgba(255,122,122,.4);}' +
      '.swk-dn{font-size:19px;font-weight:800;color:#0B1B36;}' +
      '.swk-dp{display:flex;gap:5px;font-style:normal;justify-content:center;}' +
      '.swk-dp i{width:8px;height:8px;border-radius:99px;background:rgba(11,27,54,.16);}' +
      '.swk-dp i.on{background:var(--t);}' +
      '.swk-dv{font-style:normal;font-size:13px;color:#5F6E88;line-height:1.5;' +
        'max-width:280px;margin:2px 0 4px;}' +
      '.swk-da .swact{padding:12px 26px;font-size:14px;}' +
      /* Le cadeau pixel : une phrase avant l achat, deux petits boutons
         apres. Meme famille visuelle que les points de puissance — discret,
         ca n est pas l argument principal de la fiche, juste un plus. */
      '.swk-dg{min-height:20px;display:flex;align-items:center;justify-content:center;' +
        'gap:6px;margin-top:2px;}' +
      '.swk-teaser{font-style:normal;font-size:11.5px;color:#5F6E88;}' +
      '.swk-face{padding:5px 12px;border-radius:99px;font:inherit;font-size:11px;' +
        'font-weight:700;cursor:pointer;border:1px solid rgba(11,27,54,.16);' +
        'background:rgba(11,27,54,.04);color:#5F6E88;}' +
      '.swk-face.on{border-color:var(--t);color:#0B1B36;background:rgba(11,27,54,.08);}' +
      /* ---- LA PROGRESSION DU PERSONNAGE ----
       *
       * Niveau, XP, huit stats, deux emplacements — tout tient sous la
       * description, avant le bouton d achat/port, dans la meme feuille. */
      '.swk-st{width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;' +
        'margin-top:2px;}' +
      '.swk-stload{font-style:normal;font-size:12px;color:#5F6E88;}' +
      '.swk-lvl{width:100%;}' +
      '.swk-lvlt{display:flex;justify-content:space-between;align-items:baseline;' +
        'font-size:11.5px;color:#5F6E88;margin-bottom:4px;}' +
      '.swk-lvlt b{font-size:13px;color:#0B1B36;}' +
      '.swk-xpb{height:6px;border-radius:99px;background:rgba(11,27,54,.08);overflow:hidden;}' +
      '.swk-xpb i{display:block;height:100%;border-radius:99px;background:var(--t);}' +
      '.swk-sg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}' +
      '.swk-s{display:flex;flex-direction:column;align-items:center;gap:2px;' +
        'padding:6px 2px;border-radius:8px;background:rgba(11,27,54,.04);}' +
      '.swk-s i{font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.03em;' +
        'color:#5F6E88;}' +
      '.swk-s b{font-size:13px;font-weight:800;color:#0B1B36;}' +
      '.swk-s b em{font-style:normal;font-size:10.5px;font-weight:800;color:#0E7C3E;}' +
      /* La liste de choix, sous les stats : elle n existe dans le DOM que le
         temps ou une case est ouverte (display:none sinon), affichee juste
         sous la grille de stats — bordee en haut pour la separer d elle. */
      '.swk-eql{width:100%;display:flex;flex-direction:column;gap:5px;' +
        'padding-top:8px;border-top:1px solid rgba(11,27,54,.08);' +
        'max-height:150px;overflow-y:auto;}' +
      '.swk-eqi{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9px;' +
        'font:inherit;cursor:pointer;border:1px solid rgba(11,27,54,.14);' +
        'border-left:3px solid var(--c,#8DA0C4);background:rgba(11,27,54,.04);text-align:left;}' +
      '.swk-eqi img{width:28px;height:28px;object-fit:contain;flex:0 0 auto;}' +
      '.swk-eqi:hover{background:rgba(11,27,54,.09);}' +
      '.swk-eqi.actif{background:rgba(18,161,80,.08);border-color:rgba(18,161,80,.35);}' +
      /* le nom cede la place au detail des stats, pas l'inverse : sur un telephone
         c'est le chiffre qu'on vient lire, le nom est deja sur l'image. */
      '.swk-eqi b{font-size:12px;color:#0B1B36;flex:1;min-width:0;overflow:hidden;'+
      'text-overflow:ellipsis;white-space:nowrap;}' +
      '.swk-eqi i{font-style:normal;font-size:10.5px;color:#0E7C3E;font-weight:800;'+
      'flex:0 0 auto;text-align:right;}' +
      '.swk-eqi span{font-size:10px;color:#5F6E88;}' +
      /* La case vendable : rien de crie, juste de quoi comprendre qu on peut
         appuyer dessus. Un bouton sur chaque case ferait une grille de
         boutons au lieu d une collection. */
      '.swb-o.vendable{cursor:pointer;}' +
      '.swb-o.vendable:hover{filter:brightness(1.15);}' +
      /* La feuille de vente */
      /* ---- LA FEUILLE DE VENTE EST DANS LE TIROIR, PAS SUR L'ECRAN ----
       *
       * Elle etait `position:fixed` sur toute la fenetre : bas de l'ECRAN,
       * centree horizontalement. Sur telephone ca ne se voyait pas — le tiroir
       * fait 90 % de la largeur. Sur un ecran large, le tiroir est un panneau
       * de 400 px colle a gauche et la feuille s'ouvrait au MILIEU de la page,
       * a plusieurs centaines de pixels de la case qu'on venait de toucher.
       * On perdait le fil : l'objet qu'on vend n'est plus a cote de la question
       * qu'on nous pose.
       *
       * `absolute` dans `.swp` — qui est deja positionne — la colle au bas du
       * tiroir, a sa largeur exacte. Elle suit son ouverture et sa fermeture
       * sans qu'on ait a synchroniser quoi que ce soit, et elle ne peut plus
       * etre plus large que lui. */
      '.swv{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
        'justify-content:center;background:rgba(244,247,252,.66);opacity:0;pointer-events:none;' +
        'transition:opacity .18s;border-radius:inherit;}' +
      '.swv.on{opacity:1;pointer-events:auto;}' +
      /* ---- LA BARRE DU BAS PASSE DEVANT ----
       *
       * Elle est `fixed` sur la fenetre avec un z-index enorme ; la feuille
       * vit maintenant DANS le tiroir, donc elle passe dessous. Sans cette
       * marge, la barre mangeait la derniere ligne de la note — celle qui
       * explique justement pourquoi le bouton est verrouille.
       *
       * `--swbb-h` est la meme variable que les listes du tiroir utilisent
       * deja. La hauteur de la barre vient de son contenu ; la recopier en dur
       * ici aurait fait un deuxieme chiffre a tenir d'accord avec elle.
       *
       * `max-height` + `overflow-y` : sur un petit ecran en paysage, la
       * feuille depasse la hauteur du tiroir. Sans plafond, le bouton de vente
       * sortait par le haut et devenait inatteignable. */
      '.swv-f{width:100%;background:#F4F7FD;border:1px solid rgba(11,27,54,.12);' +
        'border-radius:18px 18px 0 0;' +
        /* Le repli valait 62 : la hauteur de la barre du bas, qui n'existe
           plus. Il vaut zero, comme la variable. */
        'padding:18px 18px calc(var(--swbb-h,0px) + 14px);' +
        'max-height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'display:flex;flex-direction:column;gap:8px;transform:translateY(18px);' +
        'transition:transform .22s;position:relative;}' +
      '.swv.on .swv-f{transform:none;}' +
      '.swv-x{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:9px;' +
        'border:1px solid rgba(11,27,54,.14);background:rgba(11,27,54,.05);' +
        'color:#5F6E88;font-size:17px;cursor:pointer;line-height:1;}' +
      '.swv-t{display:flex;align-items:center;gap:11px;margin-bottom:4px;}' +
      '.swv-t img{width:48px;height:48px;object-fit:contain;}' +
      '.swv-t b{display:block;font-size:16px;font-weight:800;color:#0B1B36;}' +
      '.swv-t i{font-style:normal;font-size:11px;}' +
      '.swv-l{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#5F6E88;' +
        'font-weight:700;margin-top:4px;}' +
      '.swv-l span{color:#5F6E88;letter-spacing:0;text-transform:none;}' +
      '.swv-f input{padding:11px 13px;border-radius:11px;font:inherit;font-size:15px;' +
        'font-weight:700;border:1px solid rgba(11,27,54,.14);background:rgba(11,27,54,.05);' +
        'color:#0B1B36;-webkit-appearance:none;}' +
      '.swv-net{font-size:12.5px;color:#5F6E88;margin:2px 0 4px;}' +
      '.swv-net b{color:#0E7C3E;font-weight:800;}' +
      '.swv-net span{color:#5F6E88;}' +
      '.swv-go{margin-top:4px;padding:13px;border-radius:12px;font:inherit;font-size:14px;' +
        'font-weight:800;cursor:pointer;border:1px solid rgba(27,95,224,.6);' +
        'background:rgba(27,95,224,.16);color:#1B5FE0;}' +
      '.swv-go:hover{background:rgba(27,95,224,.24);}' +
      /* Le rachat est une SECONDE action, pas une variante de la premiere :
         un separateur, un bouton sobre, et la phrase qui dit ce qu'on perd.
         Le mettre au meme niveau visuel que la mise en vente pousserait au
         geste le moins bon des deux. */
      '.swv-or{display:flex;align-items:center;gap:8px;margin:12px 0 2px;font-size:11px;' +
        'text-transform:uppercase;letter-spacing:.08em;color:#5F6E88;}' +
      '.swv-or:before,.swv-or:after{content:"";flex:1;height:1px;' +
        'background:rgba(11,27,54,.1);}' +
      '.swv-now{padding:12px;border-radius:12px;font:inherit;font-size:13.5px;' +
        'font-weight:800;cursor:pointer;border:1px solid rgba(11,27,54,.16);' +
        'background:rgba(11,27,54,.05);color:#0B1B36;}' +
      '.swv-now:hover{background:rgba(11,27,54,.09);}' +
      '.swv-now:disabled{opacity:.45;cursor:default;}' +
      '.swv-note{font-size:11.5px;line-height:1.5;color:#5F6E88;margin-top:7px;}' +
      '.swp-ho{display:flex;gap:5px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px;' +
        '-webkit-overflow-scrolling:touch;scrollbar-width:none;}' +
      '.swp-ho::-webkit-scrollbar{display:none;}' +
      '.swp-ho button{flex:0 0 auto;padding:7px 13px;border-radius:999px;font:inherit;' +
        'font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;' +
        'border:1px solid rgba(11,27,54,.13);background:rgba(11,27,54,.04);' +
        'color:#5F6E88;transition:background .14s,border-color .14s,color .14s;}' +
      '.swp-ho button:hover{color:#24406E;border-color:rgba(11,27,54,.26);}' +
      '.swp-ho button.on{background:rgba(27,95,224,.14);border-color:rgba(27,95,224,.55);' +
        'color:#1B5FE0;}' +
      '.swp-ch span{flex:1 1 92px;display:flex;flex-direction:column;gap:1px;' +
        'padding:8px 10px;border-radius:11px;border:1px solid rgba(11,27,54,.12);' +
        'background:rgba(11,27,54,.05);font:inherit;text-align:left;color:#24406E;}' +
      '.swp-ch b{font-size:15px;font-weight:800;color:#0B1B36;line-height:1.15;' +
        'font-variant-numeric:tabular-nums;}' +
      '.swp-ch i{font-style:normal;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;' +
        'color:#5F6E88;font-weight:700;}' +
      /* Le seul accent dore de l'en-tete : ce qui est A PRENDRE. Un accent
         qui est partout n'accentue rien. */
      '.swp-ch .pret{border-color:rgba(27,95,224,.55);background:rgba(27,95,224,.13);}' +
      '.swp-ch .pret b{color:#1B5FE0;}' +
      '.swp-ch .feu b{color:#C2410C;}' +
      '.swp-me .nm > span{display:block;font-size:11.5px;color:#5F6E88;margin-top:3px;' +
      'font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      /* Le bouton d'edition devient un CHEVRON. En haut d'un tiroir, un
         bouton dore intitule « Edit » attire l'oeil avant le nom et avant
         le sommaire, alors qu'on change son nom une fois dans sa vie. Le
         chevron dit la meme chose et laisse la vedette au reste. */
      '.swp-ed{flex:0 0 auto;width:32px;height:32px;padding:0;border-radius:50%;' +
      'cursor:pointer;font-family:inherit;font-size:17px;line-height:1;color:#5F6E88;' +
      'background:rgba(11,27,54,.06);border:1px solid rgba(11,27,54,.13);}' +
      '.swp-ed:hover{color:#1B5FE0;border-color:rgba(27,95,224,.5);}' +
      '.swp-ed.on{color:#07101F;background:linear-gradient(180deg,#FFE08A,#FFC53D);' +
      'border-color:transparent;}' +
      /* Le formulaire vit maintenant dans un tiroir a hauteur FIXE, la ou
         la boite d'avant s'etirait a 86 vh. Ouvert en paysage sur un
         telephone, ses vingt frimousses plus le champ du nom depassaient
         la hauteur restante et poussaient le sommaire hors du tiroir. Il
         defile chez lui. */
      '.swp-form{flex:0 0 auto;max-height:46vh;overflow-y:auto;' +
      'padding:11px 13px;border-bottom:1px solid rgba(27,95,224,.18);' +
      'background:rgba(11,27,54,.05);}' +
      '.swp-form.off{display:none;}' +
      '.swp-avs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px;}' +
      '.swp-avs button{width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;' +
      'background:rgba(11,27,54,.05);border:1px solid rgba(11,27,54,.12);}' +
      '.swp-avs button.on{background:rgba(27,95,224,.28);border-color:#FFC53D;}' +
      /* Les medailles sont dessinees : plus grandes que les frimousses, et
         posees en tete de liste, ce sont elles qu on choisit. */
      '.swp-avs button.bg{width:46px;height:46px;background-size:contain;' +
      'background-repeat:no-repeat;background-position:center;background-color:transparent;' +
      'border-color:rgba(11,27,54,.10);}' +
      '.swp-avs button.bg.on{background-color:rgba(27,95,224,.20);border-color:#FFC53D;' +
      'box-shadow:0 0 0 2px rgba(27,95,224,.35);}' +
      '.swp-in{display:flex;gap:7px;flex-wrap:wrap;}' +
      '.swp-in input{flex:1 1 150px;min-width:0;padding:9px 11px;border-radius:9px;' +
      'font-family:inherit;font-size:13px;color:#0B1B36;background:rgba(11,27,54,.05);' +
      'border:1px solid rgba(11,27,54,.16);}' +
      '.swp-in button{flex:0 0 auto;padding:9px 14px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12.5px;font-weight:800;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);border:0;}' +
      /* z-index 3 : le cadre du palier se peint en 2, et la pastille doit
         rester lisible par-dessus — c'est elle qui appelle le clic. */
      '.swpn{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;z-index:3;' +
      'border-radius:999px;display:flex;align-items:center;justify-content:center;' +
      'font-size:10px;font-weight:900;color:#07101F;background:#16D97F;' +
      'box-shadow:0 0 0 2px rgba(11,27,54,.9);}' +
      /* Au-dessus de la barre du bas (2147482000) ET au-dessus d'elle en
         position : sinon le message existe mais personne ne le voit. */
      '.swtoast{position:fixed;left:50%;bottom:calc(var(--swbb-h,0px) + 16px);' +
      'transform:translate(-50%,20px);z-index:2147483000;' +
      'padding:11px 16px;border-radius:999px;font-family:inherit;font-size:13px;font-weight:700;' +
      'color:#07101F;background:linear-gradient(180deg,#8CFFC0,#16D97F);opacity:0;' +
      'transition:opacity .25s,transform .25s;box-shadow:0 8px 24px rgba(11,27,54,0.18);}' +
      '.swtoast.go{opacity:1;transform:translate(-50%,0);}' +
      /* UN REFUS NE DOIT PAS ETRE VERT. La classe `bad` etait deja passee par
         deux appels — un solde insuffisant, une erreur du serveur — mais elle
         n'avait aucun style : le message s'affichait dans le meme vert que
         « Sent 5 000 $SWOGE », et se lisait comme une reussite. */
      '.swtoast.bad{background:linear-gradient(180deg,#FF9B92,#E8483C);color:#2A0704;}' +
      '.swp-res:not(:empty){margin-bottom:9px;padding-bottom:7px;' +
      'border-bottom:1px solid rgba(11,27,54,.09);}' +
      '.swp-up{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px;}' +
      '.swp-up button{flex:1 1 auto;padding:9px 12px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#0B1B36;' +
      'background:rgba(11,27,54,.07);border:1px solid rgba(11,27,54,.16);}' +
      '.swp-up button:hover{border-color:#FFC53D;}' +
      '.swp-up .swp-drop{flex:0 0 auto;}' +
      /* Le parrainage et les chiffres. Une grille qui se replie toute seule :
         deux colonnes sur telephone, quatre sur un ecran large. */
      '.swp-ex{font-size:11.5px;line-height:1.6;color:#5F6E88;margin-bottom:9px;' +
      'padding:9px 11px;border-radius:10px;background:rgba(27,95,224,.07);' +
      'border:1px solid rgba(27,95,224,.20);}' +
      '.swp-ex b{color:#1B5FE0;}' +
      '.swp-lien{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;}' +
      '.swp-st{margin-bottom:10px;padding:10px 11px;border-radius:12px;' +
      'background:rgba(11,27,54,.035);border:1px solid rgba(11,27,54,.09);}' +
      '.swp-st-h{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;' +
      'color:#5F6E88;margin-bottom:9px;}' +
      '.swp-st-g{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));}' +
      '.swp-st-g>div{min-width:0;}' +
      '.swp-st-g span{display:block;font-size:10px;color:#5F6E88;margin-bottom:2px;}' +
      '.swp-st-g b{display:block;font-size:13.5px;font-weight:800;color:#0B1B36;' +
      'font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;}' +
      '.swp-st-g b.g{color:#0E7C3E;} .swp-st-g b.p{color:#E0443E;}' +
      '.swp-st-f{margin-top:9px;padding-top:8px;font-size:10.5px;color:#5F6E88;' +
      'border-top:1px solid rgba(11,27,54,.07);}' +
      '.swp-r .rg{flex:0 0 auto;min-width:30px;font-size:12px;font-weight:800;color:#1B5FE0;' +
      'text-align:center;font-variant-numeric:tabular-nums;}' +
      '.swp-r.moi{border-color:rgba(27,95,224,.55);background:rgba(27,95,224,.09);}' +
      /* Le prix d un nom, annonce AVANT la saisie. Un prix decouvert au
         moment du refus se lit comme une panne. */
      '.swp-prix{margin:7px 0 2px;font-size:11.5px;line-height:1.5;color:#5F6E88;}' +
      '.swp-prix b{color:#1B5FE0;}' +
      '.swp-prix.ko b{color:#E0443E;}' +
      '.swp-msg{margin-top:8px;font-size:11.5px;line-height:1.5;color:#5F6E88;}' +
      '.swp-msg.ko{color:#E0443E;} .swp-msg.ok{color:#0E7C3E;}' +
      '.swp-r .av{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:flex;' +
      'align-items:center;justify-content:center;font-size:15px;' +
      'background:rgba(11,27,54,.06);border:1px solid rgba(11,27,54,.12);}' +
      '.swp-r .mini{flex:0 0 auto;padding:6px 10px;border-radius:8px;cursor:pointer;' +
      'font-family:inherit;font-size:11.5px;font-weight:800;color:#07101F;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);border:0;}' +
      '.swp-r .mini.gh{color:#0B1B36;background:rgba(11,27,54,.08);' +
      'border:1px solid rgba(11,27,54,.16);}' +
      '.swp-fair{font-size:10px;color:#6E80A4;margin-top:3px;font-family:monospace;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      /* Les jambes d'un pari. Un filet a gauche les rattache visiblement au
         titre : sans lui, un combine de quatre se lit comme quatre paris. */
      /* La reference du pari. Monospace : on la recopie, on la compare
         caractere par caractere, et une police proportionnelle confond le
         1 et le l. */
      '.swp-r .w span .swp-pid{display:inline;font-family:ui-monospace,SFMono-Regular,' +
      'Menlo,Consolas,monospace;font-size:11px;color:#5F6E88;cursor:pointer;' +
      'border-bottom:1px dotted rgba(159,176,206,.45);}' +
      '.swp-r .w span .swp-pid:hover{color:#1B5FE0;border-bottom-color:#FFC53D;}' +
      '.swp-r .w span .swp-pid.ok{color:#0E7C3E;border-bottom-color:#7CFF9B;}' +
      '.swp-pj{font-size:12px;color:#5F6E88;margin-top:4px;padding-left:9px;' +
      'border-left:2px solid rgba(27,95,224,.35);line-height:1.45;}' +
      /* « .swp-r .w b » met les <b> en BLOC : sans ce selecteur plus
         specifique, le choix et sa cote partaient chacun a la ligne et une
         jambe tenait sur trois lignes. */
      '.swp-r .w .swp-pj b{display:inline;font-size:12px;font-weight:700;color:#0B1B36;}' +
      /* Comme « .swlv », cette pastille vit DANS un <b> que la regle des
         lignes voudrait mettre en bloc pleine largeur. */
      '.swp-r .w b .swp-pe{display:inline-block;width:auto;margin-left:7px;' +
      'padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;' +
      'letter-spacing:.4px;text-transform:uppercase;vertical-align:1px;' +
      'background:rgba(11,27,54,.07);border:1px solid rgba(11,27,54,.14);}' +
      /* La couleur doit etre REPOSEE ici : « .swp-r .w span » est plus
         specifique que « .swp-r .g » et la repeignait en gris. */
      '.swp-r .w b .swp-pe.g{color:#0E7C3E;background:rgba(18,161,80,.12);' +
      'border-color:rgba(18,161,80,.32);}' +
      '.swp-r .w b .swp-pe.p{color:#E0443E;background:rgba(224,68,62,.12);' +
      'border-color:rgba(224,68,62,.32);}' +
      '.swp-r .w b .swp-pe.n{color:#1B5FE0;background:rgba(231,201,122,.12);' +
      'border-color:rgba(231,201,122,.32);}' +
      /* les mois : un bandeau qu'on replie */
      '.swp-mo{display:flex;align-items:center;gap:9px;width:100%;margin:10px 0 6px;' +
      'padding:8px 11px;border-radius:9px;cursor:pointer;font-family:inherit;' +
      'font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;' +
      'color:#1B5FE0;background:rgba(27,95,224,.10);' +
      'border:1px solid rgba(27,95,224,.28);}' +
      '.swp-mo:first-child{margin-top:0;}' +
      '.swp-mo i{font-style:normal;font-weight:600;letter-spacing:.3px;text-transform:none;' +
      'color:#5F6E88;font-size:11px;margin-left:auto;}' +
      '.swp-mo .ch{color:#5F6E88;font-size:10px;}' +
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
      /* La vitrine, dans le meme groupe que les coffres : c'est la deuxieme
         facon d'obtenir un objet, et la seule qui reste quand l'edition est
         epuisee. La separer suggererait qu'elle parle d'autre chose. */
      var mk = document.createElement('button');
      mk.type = 'button'; mk.dataset.k = 'mk';
      mk.textContent = '🏷️ Player market';
      mk.addEventListener('click', function () { profVa('mk'); });
      t.appendChild(mk);
      /* ---- LES SKINS, DANS LE MEME GROUPE MAIS PAS LA MEME PHRASE ----
       *
       * « Rien a voir avec les saisons » : le libelle le dit lui-meme, pour
       * que personne ne cherche un skin dans l'onglet Shop en pensant qu'il
       * vient d'un coffre. Il reste dans le groupe Shop parce que c'est bien
       * un achat — seulement un achat qui ne se tire pas. */
      var sk = document.createElement('button');
      sk.type = 'button'; sk.dataset.k = 'sk';
      sk.textContent = '🎭 Character skins';
      sk.addEventListener('click', function () { profVa('sk'); });
      t.appendChild(sk);
      /* ---- L'ENCLOS ET LE COFFRE A OEUFS ----
       * Dans le groupe Shop parce que c'est de la ce qu'on FAIT avec : on les
       * y met en vente. Les animaux se gagnent dans le monde — l'oeuf tombe
       * une fois sur mille deux cents — mais ce panneau-ci n'est pas celui
       * ou l'on joue avec eux : c'est celui ou l'on gere ce qu'on possede,
       * comme les coffres et la collection. */
      var pt = document.createElement('button');
      pt.type = 'button'; pt.dataset.k = 'pt';
      pt.textContent = '\uD83D\uDC36 Pets & eggs';
      pt.addEventListener('click', function () { profVa('pt'); });
      t.appendChild(pt);
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
    /* ---- SE DECONNECTER, TOUT EN BAS ----
     *
     * Il n'y avait qu'un « Disconnect » enfoui dans le panneau Portefeuille,
     * c'est-a-dire a trois gestes de la, sur une page qui n'a pas toujours ce
     * panneau. Se deconnecter est pourtant le geste qu'on cherche quand on
     * prete son telephone ou qu'on veut changer de compte : il doit etre la
     * ou l'on regarde en dernier, au bas du profil, et nulle part ailleurs.
     *
     * On efface les DEUX cles — le jeton de session et le mode de connexion —
     * et on ferme aussi la session du portefeuille email si elle est ouverte :
     * n'oublier que le jeton laisserait le compte Privy actif pour le suivant
     * qui prend l'appareil. */
    /* On montre la sortie des qu'il y a la moindre trace de compte — un jeton
       de session OU un mode de connexion. Se fier au seul jeton laisserait
       sans bouton quelqu'un connecte depuis une page de jeu, c'est-a-dire
       precisement celui qui cherche a se deconnecter. */
    var signe = false;
    try { signe = !!(jetonRange() || localStorage.getItem('swogeAuth')); } catch (e) { signe = !!jetonRange(); }
    if (signe) {
      var sep = document.createElement('div');
      sep.className = 'swp-sep';
      t.appendChild(sep);
      var bq = document.createElement('button');
      bq.type = 'button'; bq.className = 'swp-out'; bq.textContent = '🚪 Sign out';
      bq.addEventListener('click', function () {
        if (!window.confirm('Sign out of this device?')) return;
        try { localStorage.removeItem('swogeSession'); } catch (e) {}
        try { localStorage.removeItem('swogeAuth'); } catch (e) {}
        try {
          if (window.SwogePrivy && SwogePrivy.logout) SwogePrivy.logout();
        } catch (e) {}
        location.reload();
      });
      t.appendChild(bq);
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
    /* Le portefeuille n'est plus une rangee d'ici : il a son rond en bas a
       droite de chaque page (`walletMonte`), et une rangee de plus ne
       faisait que le repeter. */
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
  /* ---- LE REPLI POINTAIT SUR UNE PAGE MORTE ----
     Sur une page qui n'a pas ses propres panneaux de compte, le tiroir ne
     peut rien emprunter : ces cinq rangees sont alors de simples LIENS. Ils
     menaient a `swoge_pusher.html` — la page que plus aucun lien du site
     n'atteint, remplacee par `swoge_pusher_live.html`. C'est ce qui faisait
     que « My Wallet » emmenait sur l'ancien Coin Pusher au lieu d'ouvrir le
     portefeuille sur place. La page vivante gere les cinq memes ancres
     (#wallet, #staking, #deposit, #withdraw, #quests), verifie. */
  var COMPTE_AILLEURS = [
    ['swoge_pusher_live.html#staking',  '🔒 Staking'],
    ['swoge_pusher_live.html#deposit',  '💰 Deposit'],
    ['swoge_pusher_live.html#withdraw', '🏧 Withdraw'],
    ['swoge_pusher_live.html#quests',   '🎯 Daily Quests'],
  ];
  function SECOURS_COMPTE() {
    var ici = (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html';
    /* Les deux coquilles du Coin Pusher ont leurs panneaux en propre : leur
       proposer un lien vers elles-memes serait un aller-retour pour rien. */
    if (ici === 'swoge_pusher.html' || ici === 'swoge_pusher_live.html') return [];
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

  /* ---- LE PORTEFEUILLE N'EST PLUS UNE RANGEE DU TIROIR ----
   *
   * « Il y a withdraw, deposit, my wallet… faudrait le retirer de toutes les
   *   pages : on est cense l'ouvrir depuis le petit bouton rond en bas. »
   *
   * Les pages ont perdu ces rangees dans leur propre `#menu`, mais le tiroir
   * les ecarte AUSSI : une coquille qui garde la sienne (le Coin Pusher et la
   * roue tiennent leur rangee pour son gestionnaire) ne doit pas la faire
   * remonter ici. Le rond en bas a droite est le seul chemin, partout. */
  function rangeePortefeuille(el) {
    if (!el) return false;
    if ((el.getAttribute && el.getAttribute('data-panel')) === 'wallet') return true;
    if (el.id === 'mnWallet') return true;
    return /swoge_wallet\.html/i.test(String((el.getAttribute && el.getAttribute('href')) || ''));
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
        if (el.tagName === 'A' && el.id !== 'mnClose' && !rangeePortefeuille(el)) paquets[paquets.length - 1].push(el);
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
    return trieParContenu([].slice.call(boite.querySelectorAll('button')).filter(function (b) { return !rangeePortefeuille(b); }));
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
      'font-size:11.5px!important;letter-spacing:.2px;color:#5F6E88!important;' +
      'background:rgba(11,27,54,.035);border:1px solid rgba(11,27,54,.09);}' +
      W + ' .strow b{font-size:14px!important;font-weight:800;' +
      'color:#0B1B36!important;font-variant-numeric:tabular-nums;}' +
      /* Le $SWOGE porte l'or et le grand chiffre : c'est LUI qu'on est venu
         voir, et c'est lui qui decide si on peut deposer. On le designe par
         l'identifiant qu'il contient — `:first-of-type` viserait la plaque de
         titre, qui est un div elle aussi. */
      W + ' .strow:has(#acSwoge){order:0;padding:14px!important;' +
      'background:rgba(27,95,224,.07);border-color:rgba(27,95,224,.20);}' +
      W + ' .strow:has(#acSwoge) b{font-size:22px!important;color:' + OR + '!important;}' +
      /* Le gaz est une CONDITION, pas un avoir : on le garde lisible et petit.
         Il ne devient interessant que le jour ou il manque. */
      W + ' .strow:has(#acEth){order:1;}' +

      /* ---- 2. L'ADRESSE, EN ENTIER ---- */
      W + ' label{order:2;margin:15px 0 6px!important;' +
      'font-size:10.5px!important;letter-spacing:1px;color:#5F6E88!important;}' +
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
      'color:#24406E!important;background:rgba(11,27,54,.05)!important;' +
      'border:1px solid rgba(11,27,54,.10)!important;}' +

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
      'color:#0B1B36!important;border:1px solid rgba(11,27,54,.14)!important;' +
      'box-shadow:none!important;}' +
      /* Copier suit l'adresse et lui appartient : discret, et or parce qu'il
         agit sur ce qui est juste au-dessus. */
      W + ' #acCopy{order:4;margin-top:7px!important;padding:9px!important;' +
      'font-size:12px!important;color:' + OR + '!important;' +
      'background:rgba(27,95,224,.10)!important;' +
      'border-color:rgba(27,95,224,.34)!important;}' +
      W + ' #acCopy:hover{background:rgba(27,95,224,.18)!important;}' +
      /* Deposer est LE geste du panneau — le seul qui fasse entrer de l'argent
         dans le jeu. Un seul aplat plein sur l'ecran, et c'est celui-la. */
      W + ' #acDeposit{order:5;margin-top:14px!important;padding:13px!important;' +
      'font-size:13.5px!important;color:' + ENCRE + '!important;' +
      'background:linear-gradient(180deg,#F2C868,#E6A537)!important;' +
      'border-color:transparent!important;}' +
      W + ' #acExplorer{order:6;background:rgba(11,27,54,.05)!important;' +
      'color:#24406E!important;}' +
      W + ' #acExplorer::after{content:" \\2197";color:#5F6E88;}' +
      /* Se deconnecter reste possible, et cesse d'etre le plus visible : bord
         rouge sur fond vide, en bas, apres un trait. On ne le cache pas — on le
         met a sa place, celle d'un geste rare. */
      W + ' #acLogout{order:7;margin-top:16px!important;padding:10px!important;' +
      'font-size:11.5px!important;font-weight:700!important;color:#E0443E!important;' +
      'border-color:rgba(224,68,62,.28)!important;}' +
      W + ' #acLogout:hover{background:rgba(224,68,62,.10)!important;}'
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

  /* ==================== LA BARRE DU BAS N'EXISTE PLUS ====================
   *
   * DEMANDE : « supprime cette barre en bas du telephone et sur pc aussi, ca
   * prend de la place pour rien ».
   *
   * Elle portait quatre entrees — Play, Bets, Chests, Profile — et prenait
   * soixante-deux pixels en bas de CHAQUE page, plus la marge de securite de
   * l'iPhone. Sur le Nexus, ou l'ecran est le jeu, c'etait autant de monde en
   * moins.
   *
   * Rien n'est devenu inatteignable, et c'est ce qui a ete verifie avant de
   * la retirer :
   *   • PROFIL — les six pages portent leur propre avatar `#gxProfil` dans
   *     l'en-tete. C'est meme pour ca que le bouton de ce fichier y etait
   *     deja masque : deux avatars a l'ecran, c'etait le doublon de trop.
   *   • PLAY et BETS — la colonne de gauche (Home, Casino, Sports, Docs) sur
   *     les pages qui en ont une ; et sur le Nexus, le menu du compte porte
   *     deja « Other games » et « Home ».
   *   • CHESTS — la boutique est un onglet du tiroir. Elle passe d'un geste a
   *     deux : c'est le seul cout de ce retrait, et il est dit ici pour que
   *     personne n'ait a le redecouvrir.
   *
   * `--swbb-h` reste PUBLIEE, a zero. Trois endroits s'en servent pour ne pas
   * se peindre derriere elle — le bandeau de messages, la bulle de duels, et
   * le cadrage du monde. Les laisser sans variable aurait marche par leur
   * repli, mais un repli qui devient le cas normal est un piege pour le jour
   * ou quelqu'un lit `var(--swbb-h, 0px)` et cherche qui la pose. */
  try { document.documentElement.style.setProperty('--swbb-h', '0px'); } catch (e) {}


  function profBtnVisible(v) {
    if (!profMonte()) return;
    /* ---- UN SEUL AVATAR A L'ECRAN ----
     *
     * Vingt pages posent le LEUR dans leur en-tete (`#gxProfil`). Trois
     * seulement masquaient le notre, a la main, chacune avec sa regle et son
     * commentaire ; les dix-sept autres montraient les deux. Ca ne se voyait
     * pas tant que le notre portait le visage et le leur un bonhomme gris —
     * deux choses differentes se lisent comme deux boutons. Depuis qu'ils
     * portent le MEME visage, ce sont deux fois le meme bouton, cote a cote,
     * avec la meme pastille : signale sur la table de Three Card, capture a
     * l'appui.
     *
     * La regle descend donc ici, une fois, pour toutes les pages. Les trois
     * qui la portaient encore ne font plus que la repeter.
     *
     * `display:none` et non un retrait : ce bouton reste la POIGNEE du tiroir,
     * et le menu s'en sert pour l'ouvrir avant de choisir une rangee. Un clic
     * envoye par script passe malgre `display:none` ; seul celui du doigt
     * cesse, et il n'en a plus besoin. */
    profBtn.style.display = (v && !document.getElementById('gxProfil')) ? '' : 'none';
    ajusteBientot();
    /* Le nom, le visage et la liste des visages ne viennent PAS avec
       l'authentification : on les demande des qu'on sait a qui on parle,
       sinon le panneau s'ouvre sur un formulaire vide. */
    if (v && etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"profile"}'); } catch (e) {}
    }
  }

  /* ==================== CHANGER DE JEU SANS REPASSER PAR LE HALL ====================
   *
   * DEMANDE : « une fois qu'on est sur le blackjack, ce serait bien qu'au
   * centre sur la gauche il y ait une petite fleche qui nous fasse changer de
   * jeu, a chaque fois un different, ca defile — comme ca les gens peuvent
   * changer de jeu plus rapidement ».
   *
   * Aujourd'hui il faut revenir au hall, retrouver la rangee, faire defiler,
   * choisir. Trois gestes et un ecran, pour une envie qui en vaut un.
   *
   * ---- LA LISTE N'EXISTE QU'UNE FOIS ----
   *
   * Elle est ECRITE ici et VERIFIEE contre la rangee de `games.html` par un
   * essai : ce depot a paye quatre fois le prix de deux listes qui divergent,
   * et celle-ci changerait le jour ou l'on ajoute un jeu. Les adresses sont
   * la seule chose qui compte, et ce sont elles qu'on compare.
   *
   * ---- ET SEULEMENT SUR TELEPHONE ----
   *
   * C'est ce qui a ete demande, et c'est aussi la ou ca sert : sur un grand
   * ecran le hall est a un onglet, et une pastille collee au bord gauche
   * passerait devant le jeu pour rendre un service que la barre du navigateur
   * rend deja.
   */
  var MAISON = [
    { u: 'swoge_blackjack.html?table=or', n: 'Blackjack' },
    { u: 'swoge_spin.html', n: 'Spin' },
    { u: 'swoge_casino.html?game=holdem', n: "Hold'em" },
    { u: 'swoge_casino.html?game=three', n: 'Three Card' },
    { u: 'swoge_casino.html?game=mines', n: 'Mines' },
    { u: 'swoge_casino.html?game=hilo', n: 'Hi-Lo' },
    { u: 'plinko.html', n: 'Plinko' },
    { u: 'swoge_smash.html', n: 'Smash' }
  ];

  /* Ou sommes-nous dans la liste ? Le fichier ET le parametre : trois de ces
     jeux vivent dans `swoge_casino.html` et ne se distinguent que par lui. */
  function jeuCourant() {
    var f = (location.pathname.split('/').pop() || '').toLowerCase();
    var q = new URLSearchParams(location.search);
    for (var i = 0; i < MAISON.length; i++) {
      var m = MAISON[i].u.split('?');
      if (m[0].toLowerCase() !== f) continue;
      if (!m[1]) return i;
      var p = new URLSearchParams(m[1]);
      var bon = true;
      p.forEach(function (v, k) { if (q.get(k) !== v) bon = false; });
      if (bon) return i;
    }
    return -1;
  }

  function monteFleche() {
    if (document.getElementById('swjx')) return;
    if (!document.body) return;
    var i = jeuCourant();
    if (i < 0) return;                       // on n'est pas sur un jeu de la liste
    var precedent = MAISON[(i - 1 + MAISON.length) % MAISON.length];

    var c = document.createElement('style');
    c.id = 'swjx-css';
    c.textContent =
      /* Au bord gauche, a mi-hauteur — c'est ou le pouce d'une main gauche
         tombe, et c'est ce qui a ete demande. */
      '#swjx{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:2147481000;' +
      'display:flex;align-items:center;gap:4px;padding:9px 9px 9px 5px;border:0;' +
      'border-radius:0 999px 999px 0;cursor:pointer;font:800 11px/1 inherit;' +
      'background:rgba(12,18,34,.82);color:#EAF2FF;backdrop-filter:blur(6px);' +
      'box-shadow:0 6px 18px rgba(0,0,0,.35);' +
      /* Trois pages du site rendent tout bouton inerte pour que leurs
         vignettes de demonstration ne promettent rien. Celui-ci n'est pas une
         vignette. La lecon a deja coute deux signalements. */
      'pointer-events:auto !important;' +
      'max-width:52vw;overflow:hidden;white-space:nowrap;}' +
      '#swjx b{font:900 15px/1 inherit;opacity:.9;}' +
      '#swjx span{font-weight:700;letter-spacing:.2px;opacity:.92;' +
      'overflow:hidden;text-overflow:ellipsis;}' +
      /* Sur grand ecran il n'a rien a faire la : le hall est a un onglet. */
      '@media (min-width:981px){#swjx{display:none}}' +
      /* Et jamais par-dessus un panneau ouvert : un raccourci qui recouvre ce
         qu'on est en train de lire n'est plus un raccourci.
         ---- CETTE REGLE NE SERVAIT A RIEN ----
         `swdrawer` n'etait pose par personne : ni ce fichier, ni
         `swogeprofil.js`, ni aucune page. La fleche flottait donc bel et bien
         sur le tiroir ouvert — vu au rendu, le raccourci « Hi-Lo » par-dessus
         la ligne « Music: 1 ». On garde la regle, au cas ou la classe
         arriverait un jour, et on en ajoute deux qui lisent l'etat REEL des
         deux tiroirs plutot qu'une classe a poser. */
      'body.swdrawer #swjx{display:none}' +
      /* En regles SEPAREES : un navigateur qui ne connait pas `:has()` jette
         le selecteur entier. Melangees a la ligne du dessus, elles
         l'emporteraient avec elles. */
      'body:has(#gxMenu:not([hidden])) #swjx{display:none}' +
      'body:has(.swpov.on) #swjx{display:none}';
    document.head.appendChild(c);

    var b = document.createElement('button');
    b.id = 'swjx';
    b.type = 'button';
    b.setAttribute('aria-label', 'Previous game: ' + precedent.n);
    b.title = 'Previous game: ' + precedent.n;
    b.innerHTML = '<b>\u2039</b><span></span>';
    b.querySelector('span').textContent = precedent.n;
    b.addEventListener('click', function () { location.href = precedent.u; });
    document.body.appendChild(b);
  }

  /* Elle ne depend d'AUCUN compte : changer de jeu ne depense rien et ne
     demande a personne qui l'on est. La poser derriere l'authentification
     l'aurait rendue invisible a celui qui regarde avant de se connecter,
     c'est-a-dire exactement celui qui cherche encore son jeu. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { monteFleche(); } catch (e) {}
    });
  } else { try { monteFleche(); } catch (e) {} }

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
      /* ---- LE TAUX DE CE LIEN-LA, ET DE QUOI LE REFAIRE ----
       * Depuis la prime de recruteur, deux amis ne rapportent plus au meme
       * taux : celui qui a lui-meme amene du monde rapporte plus. Afficher un
       * seul pourcentage en tete de page ferait donc mentir la moitie des
       * lignes — et quelqu'un qui ne peut pas refaire le calcul cesse de
       * croire le total juste a cote.
       * On l'ecrit sur la ligne, avec sa raison. */
      var raison = '';
      if (!f.depose) raison = 'has not deposited yet — you earn nothing until then';
      else if (f.prime > 0) {
        raison = f.part + '% of what they lose · +' + f.prime + '% because they brought ' +
                 f.recrues + (f.recrues > 1 ? ' players' : ' player') + ' who play';
      } else if (f.part) {
        raison = f.part + '% of what they lose';
      }
      d.innerHTML = corpsAmi(f, raison) +
        '<div class="v"><b class="g">' + nb(f.rapporte) + '</b><span>earned</span></div>';
      peintVisage(d.querySelector('.av'), f);
      copiable(d);
      l.appendChild(d);
    });

    /* ---- POURQUOI ON VOUDRAIT QU'ILS RECRUTENT AUSSI ----
     * La regle ne se devine pas en regardant les lignes : il faut qu'un ami
     * ait deja amene quelqu'un pour qu'elle apparaisse quelque part. On la dit
     * donc en toutes lettres, une fois, sous la liste — et avec les chiffres
     * du SERVEUR, jamais les notres : deux tables a tenir d'accord de part et
     * d'autre du reseau finissent par ne plus l'etre, et ce desaccord-la se
     * lit comme un compte faux. */
    if (P.primeMax > 0) {
      var pr = document.createElement('div');
      pr.className = 'swp-ex';
      pr.style.marginTop = '10px';
      var pas = (P.primePalier && P.primePalier[1]) ? P.primePalier[1].prime : 0;
      pr.innerHTML = '<b>Invite people who invite people.</b> When a friend brings in ' +
        'someone who actually plays, your share <i>on that friend</i> goes up by ' +
        pas + '% — up to +' + P.primeMax + '%. ' +
        'It is still their losses you earn from, never a cut of anyone else\'s.';
      l.appendChild(pr);
    }

    if (P.parrain) {
      var q = document.createElement('div');
      q.className = 'swp-ex';
      q.style.marginTop = '10px';
      /* Ce qu'on rapporte a SON parrain ferme la boucle : on comprend d'un
         coup d'oeil que recruter des recruteurs paie, parce qu'on est
         soi-meme le recruteur de quelqu'un. */
      q.textContent = 'You were invited by ' + (P.parrain.name || court(P.parrain.address)) + '.' +
        (P.mesRecrues > 0
          ? ' You have brought in ' + P.mesRecrues + (P.mesRecrues > 1 ? ' players' : ' player') +
            ' who play — so they earn more on you.'
          : '');
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
        '<div><div class="l" style="color:' + lisible(teinte[g.rarete] || '#8DA0C4') + '">' +
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
          return '<span style="white-space:nowrap"><b style="color:' + lisible(x.couleur) + '">' +
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
      /* ---- « A LA FOIS », PAS « EN TOUT » ----
       *
       * Le rachat instantane remet la piece dans le coffre : le plafond ne
       * borne plus le nombre de tirages d'un objet sur la vie de la saison,
       * il borne le nombre d'exemplaires QUI EXISTENT AU MEME MOMENT. Ecrire
       * « will ever exist » au-dessus d'un registre qui redescend serait la
       * seule phrase fausse de la planche — et celle sur laquelle repose tout
       * le reste. */
      ed.innerHTML = 'Season ' + (C.saison || 1) + ' — only <b>' + nb(total, 0) + '</b> ' +
        sujet + 's exist at any one time. ' +
        C.raretes.map(function (r) {
          return '<span style="color:' + lisible(r.couleur) + '">' + nb(r.plafond, 0) + ' ' + ech(r.nom) + '</span>';
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
      tete.innerHTML = '<b style="color:' + lisible(f.couleur || '#E7C97A') + '">' + ech(f.nom) + '</b>' +
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
          lisible(teinte[o.rarete] || '#8DA0C4') + '">x' + q + '</span>';
        /* ---- VENDRE DEPUIS LA PLANCHE ----
         *
         * Le geste part de la case, pas d'un ecran separe : c'est en regardant
         * sa collection qu'on se dit « celui-la, j'en ai trois ». Obliger a
         * retenir le nom du fruit puis a le retrouver dans une liste ailleurs
         * ferait perdre l'intention entre les deux. */
        if (q > 0) {
          d.classList.add('vendable');
          d.addEventListener('click', function () { ouvreVente(o, q, teinte[o.rarete]); });
          d.title += '\n\nTap to sell';
        }
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
  /* ======================== LA VITRINE ========================
   *
   * ---- les trois filtres, et pourquoi ce ne sont pas ceux-la qu'on croit ----
   *
   * « Tout », « Il me manque », « Mes ventes ». Le deuxieme n'est pas un
   * confort : on n'ouvre pas un marche pour racheter ce qu'on a deja, on
   * l'ouvre pour combler un trou. C'est le filtre qui repond a la question
   * qu'on se pose vraiment en arrivant — et c'est le serveur qui calcule
   * `jaiDeja`, pour que la page n'ait pas a croiser deux listes.
   *
   * La recherche est locale : la vitrine tient entiere dans la reponse, et un
   * aller-retour par lettre tapee ferait clignoter la liste sans rien
   * apprendre de plus.
   */
  function rendMarche() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    if (!MARCHE) {
      var att = document.createElement('div');
      att.className = 'swp-v'; att.textContent = 'Loading…';
      l.appendChild(att);
      envoie({ type: 'market', season: SAISON });
      return;
    }
    rendSaisons(l);

    var toutes = MARCHE.annonces || [];
    var compte = {
      tout: toutes.length,
      manque: toutes.filter(function (a) { return !a.jaiDeja && !a.mien; }).length,
      miennes: toutes.filter(function (a) { return a.mien; }).length,
    };

    // ---- les filtres
    var f = document.createElement('div');
    f.className = 'swp-ho';
    [['tout', 'All'], ['manque', "I'm missing"], ['miennes', 'My listings']].forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = (MARCHE_F === o[0] ? 'on' : '');
      b.textContent = o[1] + ' (' + compte[o[0]] + ')';
      b.addEventListener('click', function () { MARCHE_F = o[0]; rendMarche(); });
      f.appendChild(b);
    });
    l.appendChild(f);

    // ---- la recherche
    var rc = document.createElement('input');
    rc.className = 'swm-q'; rc.type = 'search';
    rc.placeholder = 'Search an item…'; rc.value = MARCHE_Q;
    rc.addEventListener('input', function () {
      MARCHE_Q = rc.value;
      /* On redessine la LISTE seulement : refaire tout le panneau reprendrait
         le focus au champ a chaque lettre. */
      peintAnnonces(l.querySelector('.swm-l'));
    });
    l.appendChild(rc);

    var boite = document.createElement('div');
    boite.className = 'swm-l';
    l.appendChild(boite);
    peintAnnonces(boite);

    var pied = document.createElement('div');
    pied.className = 'swb-mention';
    pied.textContent = 'Sellers set their own prices. The platform takes ' +
      ((MARCHE && MARCHE.frais) || 5) + '% of each sale. To sell something, tap it on your collection board.';
    l.appendChild(pied);
  }

  /* ================= LES SKINS ================= */
  /* Le bouton d'action d'un skin — achat, port, ou deja porte. Partage entre
     la carte et la fiche en grand : les deux DOIVENT dire la meme chose au
     meme instant, et un bouton copie-colle deux fois finit par diverger a la
     premiere modification de l'un des deux. */
  /* Le nombre de points vient du catalogue, jamais d un chiffre tape en dur —
     sinon un skin plus fort que tous les autres afficherait exactement les
     memes points que le second, et rien ne les distinguerait. */
  function puissanceMax() {
    var l = (SKINS && SKINS.catalogue) || [];
    return l.reduce(function (m, s) { return Math.max(m, s.puissance || 0); }, 1);
  }
  function pointsPuissance(s) {
    var max = puissanceMax(), h = '';
    for (var i = 1; i <= max; i++) h += '<i class="' + (i <= s.puissance ? 'on' : '') + '"></i>';
    return h;
  }

  function boutonSkin(s, actif) {
    if (actif) {
      var tag = document.createElement('span');
      tag.className = 'swtag'; tag.textContent = 'Wearing';
      return tag;
    }
    /* ---- CELUI QU'ON DONNE ----
     * Andy est offert : tout le monde en a un, sans avoir rien depose. Le
     * bouton le DIT au lieu d'afficher un prix a zero — « 0 $SWOGE » se lit
     * comme un prix qu'on n'a pas su calculer, « FREE » se lit comme une
     * promesse. Il n'existe pas de version du jeu ou l'on regarde sans
     * pouvoir jouer, et c'est la premiere chose qu'un visiteur doit voir. */
    if (s.offert && !s.possede) {
      var f = document.createElement('button');
      f.type = 'button'; f.className = 'swact swgratuit';
      f.textContent = 'FREE';
      f.addEventListener('click', function (e) {
        e.stopPropagation();
        f.disabled = true;
        envoie({ type: 'skinBuy', id: s.id });
      });
      return f;
    }
    if (s.possede) {
      var w = document.createElement('button');
      w.type = 'button'; w.className = 'swact';
      w.textContent = 'Wear';
      w.addEventListener('click', function (e) {
        e.stopPropagation();
        w.disabled = true;
        envoie({ type: 'skinChoisi', id: s.id });
      });
      return w;
    }
    /* ---- L EDITION EPUISEE ----
     * Le controle vient APRES « Wear » : quelqu un qui possede deja un skin
     * d edition doit pouvoir le porter le jour ou le dernier exemplaire part.
     * Un bouton « SOLD OUT » a la place du sien lui ferait croire qu il l a
     * perdu. */
    if (s.edition && !s.reste) {
      var fin = document.createElement('span');
      fin.className = 'swtag swk-fini'; fin.textContent = 'SOLD OUT';
      return fin;
    }
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'swact swprix';
    /* L unite vient du SERVEUR. « 20 000 » se lit exactement pareil en or et
       en jetons, et la deviner d apres le montant — « c est petit, donc c est
       de l or » — c est afficher un prix dans une monnaie que le joueur n a
       pas choisie. */
    b.innerHTML = nb(s.prix, 0) + ' <i>' + (s.monnaie === 'or' ? 'GOLD' : '$SWOGE') + '</i>';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      b.disabled = true;
      envoie({ type: 'skinBuy', id: s.id });
    });
    return b;
  }

  function rendSkins() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    if (!SKINS) {
      var att = document.createElement('div');
      att.className = 'swp-v'; att.textContent = 'Loading…';
      l.appendChild(att);
      envoie({ type: 'skins' });
      return;
    }

    var intro = document.createElement('div');
    intro.className = 'swb-mention';
    intro.textContent = 'Andy is free — everyone gets one, so anyone can play. ' +
      'The others change how your character looks and what stats it starts with. ' +
      'Buy any of them, any time, for a fixed price. The one you buy becomes the one you wear. ' +
      'Tap a character to see it up close.';
    l.appendChild(intro);

    var g = document.createElement('div');
    g.className = 'swk-g';
    l.appendChild(g);

    (SKINS.catalogue || []).forEach(function (s) {
      var actif = SKINS.actif === s.id;
      var d = document.createElement('div');
      d.className = 'swk-c' + (actif ? ' actif' : '');
      /* La carte porte son identifiant, comme la fiche en grand. Sans lui, le
         seul moyen de savoir de QUI parle une carte est de relire le nom
         d'un fichier image dans un `src` — ce qui casse le jour ou l'image
         manque. */
      d.dataset.id = s.id;
      d.style.setProperty('--t', s.couleur || '#8DA0C4');
      /* Toute la carte s'ouvre en grand — pas seulement l'image — parce que
         rien sur une carte de 84 px ne dit qu'elle cache un geste distinct du
         bouton du bas. Le bouton lui-meme coupe l'evenement (stopPropagation
         dans boutonSkin) pour ne pas rouvrir la fiche par-dessus lui. */
      d.addEventListener('click', function () { ouvreDetailSkin(s); });
      /* La puissance se lit en points pleins sur cinq, comme une jauge —
         plus rapide a comparer entre cinq cartes qu'un nombre qu'il faut
         relire chaque fois. */
      var points = pointsPuissance(s);
      d.innerHTML =
        '<div class="ico"><img alt="" src="img/skins/skin_' + encodeURIComponent(s.id) + '.webp" onerror="this.remove()"></div>' +
        (s.offert ? '<u class="swk-free">FREE</u>' : '') +
        (s.edition
          ? '<u class="swk-ed' + (s.reste ? '' : ' vide') + '">' +
              (s.reste ? nb(s.reste, 0) + ' left' : 'GONE') + '</u>'
          : '') +
        '<b class="nm">' + ech(s.nom) + '</b>' +
        '<i class="pw">' + points + '</i>' +
        '<i class="pv">' + ech(s.pouvoir) + '</i>';
      var bas = document.createElement('div');
      bas.className = 'bas';
      bas.appendChild(boutonSkin(s, actif));
      d.appendChild(bas);
      g.appendChild(d);
    });
  }

  /* ==================== LA FICHE D'UN SKIN, EN GRAND ====================
   *
   * Une carte de 84 px dit qui c'est ; elle ne montre pas VRAIMENT le
   * personnage qu'on s'apprete a payer 300 000 $SWOGE. La fiche reprend le
   * meme gabarit que la feuille de vente — une feuille qui monte du bas, pas
   * une modale plein ecran qui coupe une manche en cours — avec la MEME
   * classe `.swv` : deux feuilles qui se comportent pareil n'ont besoin que
   * d'un seul jeu de regles CSS.
   */
  var skinBoite = null;
  function ouvreDetailSkin(s) {
    if (!skinBoite) {
      skinBoite = document.createElement('div');
      skinBoite.className = 'swv swk-v';
      skinBoite.innerHTML =
        '<div class="swv-f">' +
          '<button class="swv-x" type="button" aria-label="Close">&times;</button>' +
          '<div class="swk-herorow">' +
            '<div class="swk-slotcol">' +
              '<button type="button" class="swk-slot" data-genre="fruit" aria-label="Power fruit"></button>' +
              '<button type="button" class="swk-slot" data-genre="armure" aria-label="Armor"></button>' +
            '</div>' +
            '<div class="swk-hero"><img alt=""></div>' +
            '<div class="swk-slotcol">' +
              '<button type="button" class="swk-slot" data-genre="arme" aria-label="Weapon"></button>' +
              '<button type="button" class="swk-slot" data-genre="bague" aria-label="Ring"></button>' +
            '</div>' +
          '</div>' +
          '<b class="swk-dn"></b>' +
          '<i class="swk-dp"></i>' +
          '<i class="swk-dv"></i>' +
          '<div class="swk-dg"></div>' +
          '<div class="swk-st"></div>' +
          '<div class="swk-da"></div>' +
        '</div>';
      var hote = (profBoite && profBoite.querySelector('.swp')) || document.body;
      if (hote === document.body) skinBoite.style.position = 'fixed';
      hote.appendChild(skinBoite);
      skinBoite.addEventListener('click', function (e) {
        if (e.target === skinBoite || e.target.classList.contains('swv-x')) fermeDetailSkin();
      });
    }
    /* La reponse a un achat rafraichit SKINS ; on relit dedans plutot que de
       garder `s` d'un appel a l'autre, sinon la fiche ouverte continuerait
       d'afficher « Buy » un instant apres que l'achat ait reussi. */
    skinBoite.dataset.id = s.id;
    /* La fiche s'ouvre TOUJOURS sur le visage normal, jamais sur le cadeau
       laisse ouvert la derniere fois — sinon un skin qu on vient d acheter
       montrerait par surprise le pixel d un AUTRE skin regarde plus tot. */
    skinBoite.dataset.face = 'normal';
    /* Le picker d'equipement se referme aussi a chaque ouverture — sinon la
       fiche de Pepe s'ouvrirait avec le tiroir « armes » de Landwolf encore
       deplie. */
    skinBoite.dataset.eqOpen = '';
    if (s.possede) {
      envoie({ type: 'personnage', skin: s.id });
      if (!EQUIPABLE) envoie({ type: 'equipable' });
    }
    peintDetailSkin();
    skinBoite.classList.add('on');
  }
  function peintDetailSkin() {
    if (!skinBoite || !skinBoite.dataset.id) return;
    var id = skinBoite.dataset.id;
    var s = ((SKINS && SKINS.catalogue) || []).filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var actif = SKINS.actif === s.id;
    var pixel = skinBoite.dataset.face === 'pixel';
    skinBoite.style.setProperty('--t', s.couleur || '#8DA0C4');
    var im = skinBoite.querySelector('.swk-hero img');
    im.src = 'img/skins/' + (pixel ? 'pixel/skin_' : 'skin_') + encodeURIComponent(s.id) + '.webp';
    im.onerror = function () { im.style.visibility = 'hidden'; };
    im.style.visibility = '';
    /* Les quatre cases autour du portrait : fruit et armure a gauche (l'un
       au-dessus de l'autre), arme et bague a droite. Rien avant l'achat —
       un skin qu'on ne possede pas n'a pas de fiche de personnage a
       equiper. */
    var etatPourSlots = s.possede ? PERSO_PAR_SKIN[s.id] : null;
    EQUIP_SLOTS.forEach(function (cfg) {
      var el = skinBoite.querySelector('.swk-slot[data-genre="' + cfg.genre + '"]');
      peintSlot(el, s, cfg, etatPourSlots && etatPourSlots[cfg.etatChamp]);
    });
    skinBoite.querySelector('.swk-dn').textContent = s.nom;
    skinBoite.querySelector('.swk-dp').innerHTML = pointsPuissance(s);
    skinBoite.querySelector('.swk-dv').textContent = s.pouvoir;
    /* ---- LE CADEAU PIXEL ----
     *
     * Avant l'achat, on l'ANNONCE — un cadeau qu on cache jusqu au bout ne
     * fait pas vendre, il ne fait que surprendre APRES. Une fois possede, on
     * peut le regarder : deux petits boutons echangent l'image, sans quitter
     * la fiche. */
    var zg = skinBoite.querySelector('.swk-dg');
    zg.innerHTML = '';
    if (s.pixel) {
      if (s.possede) {
        ['normal', 'pixel'].forEach(function (face) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'swk-face' + (skinBoite.dataset.face === face ? ' on' : '');
          b.textContent = face === 'pixel' ? '🎁 Pixel gift' : 'Normal';
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            skinBoite.dataset.face = face;
            peintDetailSkin();
          });
          zg.appendChild(b);
        });
      } else {
        var teaser = document.createElement('i');
        teaser.className = 'swk-teaser';
        teaser.textContent = '🎁 Comes with a free pixel-art version';
        zg.appendChild(teaser);
      }
    }
    /* ---- LA PROGRESSION : NIVEAU, STATS, EQUIPEMENT ----
     *
     * Rien de tout ca avant l'achat — un skin qu'on ne possede pas n'a pas
     * de fiche de personnage, `personnageEtat` cote serveur rend `null`. */
    var zst = skinBoite.querySelector('.swk-st');
    zst.innerHTML = '';
    if (s.possede) {
      var etatP = PERSO_PAR_SKIN[s.id];
      if (etatP === undefined) {
        zst.innerHTML = '<i class="swk-stload">Loading character…</i>';
      } else if (etatP) {
        zst.appendChild(blocSkinNiveau(etatP));
        zst.appendChild(blocSkinStats(etatP));
        EQUIP_SLOTS.forEach(function (cfg) {
          zst.appendChild(blocPicker(s, cfg, etatP[cfg.etatChamp]));
        });
      }
    }
    var za = skinBoite.querySelector('.swk-da');
    za.innerHTML = '';
    /* ---- CE QU IL RESTE, EN TOUTES LETTRES ----
     * La pastille de la carte tient en deux mots ; la fiche est l endroit ou
     * l on decide de payer, et « 7 left » sans le total ne dit pas si l
     * edition etait de dix ou de mille. */
    if (s.edition) {
      var el = document.createElement('i');
      el.className = 'swk-edl' + (s.reste ? '' : ' vide');
      el.textContent = s.reste
        ? 'Limited edition — ' + nb(s.reste, 0) + ' of ' + nb(s.edition, 0) + ' left'
        : 'Limited edition — all ' + nb(s.edition, 0) + ' claimed';
      za.appendChild(el);
    }
    /* ---- L OR QU ON A ----
     * On l AFFICHE, on ne bloque pas le bouton avec. Ce chiffre date de la
     * derniere reponse du serveur, et l or monte a chaque monstre tue : un
     * bouton grise sur une valeur perimee refuserait un achat que le compte
     * peut se payer. Le serveur reste le seul a dire non. */
    if (!s.possede && !s.offert && s.monnaie === 'or' && SKINS && SKINS.or != null) {
      var av = document.createElement('i');
      av.className = 'swk-avoir';
      av.textContent = 'You have ' + nb(SKINS.or, 0) + ' gold';
      za.appendChild(av);
    }
    za.appendChild(boutonSkin(s, actif));
  }

  /* La barre de niveau — un seul repere : combien d'XP jusqu'au prochain
     niveau, sous ce skin precis. Au niveau max, la barre est pleine et ne
     dit plus "prochain niveau" puisqu'il n'y en a pas. */
  function blocSkinNiveau(etatP) {
    var d = document.createElement('div');
    d.className = 'swk-lvl';
    var plein = etatP.xpProchain
      ? Math.max(0, Math.min(100, Math.round((etatP.xp - etatP.xpNiveau) * 100 / (etatP.xpProchain - etatP.xpNiveau))))
      : 100;
    d.innerHTML =
      '<div class="swk-lvlt"><b>Level ' + etatP.niveau + '</b><span>' +
      (etatP.xpProchain ? nb(etatP.xp, 0) + ' / ' + nb(etatP.xpProchain, 0) + ' XP' : 'MAX LEVEL') +
      '</span></div>' +
      '<div class="swk-xpb"><i style="width:' + plein + '%"></i></div>';
    return d;
  }

  /* Les huit stats, dans l'ordre RotMG : les deux jauges d'abord, puis les
     six attributs. Le nombre de base et le bonus vert de l'equipement sont
     affiches SEPAREMENT — separement, parce que c'est la seule maniere de
     voir a l'oeil ce qu'un objet apporte vraiment, comme sur une fiche
     RealmEye. */
  var ORDRE_STATS = ['hp', 'mp', 'att', 'def', 'spd', 'dex', 'vit', 'wis'];
  var NOM_STAT = { hp: 'HP', mp: 'MP', att: 'ATT', def: 'DEF', spd: 'SPD', dex: 'DEX', vit: 'VIT', wis: 'WIS' };
  /* Les quatre emplacements, une seule table pour les decrire — le picker,
     les cases et le calcul des stats la lisent tous les trois, plutot que de
     retaper quatre fois la meme correspondance genre -> champ -> message. */
  var EQUIP_SLOTS = [
    { genre: 'fruit', champ: 'fruits', etatChamp: 'equipFruit', typeMsg: 'equipeFruit',
      label: 'Power fruit', vide: 'No power fruit owned yet — open a season 1 chest.' },
    { genre: 'arme', champ: 'armes', etatChamp: 'equipArme', typeMsg: 'equipeArme',
      label: 'Weapon', vide: 'No weapon owned yet — open a season 2 chest.' },
    { genre: 'armure', champ: 'armures', etatChamp: 'equipArmure', typeMsg: 'equipeArmure',
      label: 'Armor', vide: 'No armor piece owned yet — open a season 3 chest.' },
    { genre: 'bague', champ: 'bagues', etatChamp: 'equipBague', typeMsg: 'equipeBague',
      label: 'Ring', vide: 'No ring owned yet — open a season 4 chest.' },
  ];
  /* ---- `bonus` EST UN OBJET, PLUS UN NOMBRE ----
   *
   * Depuis que chaque piece donne un PROFIL de stats, le serveur envoie
   * `bonus: {att: 15, dex: 13}`. Ce panneau lisait encore un nombre : il
   * faisait `stats[k] - bonus`, donc `nombre - objet` = NaN, affiche « 0 ».
   * Resultat a l'ecran : quatre objets equipes, « +0 » partout, et les stats
   * concernees tombees a zero. Les trois fonctions ci-dessous sont les
   * memes que celles du Nexus, pour que les deux fiches racontent la meme
   * chose du meme personnage. */

  /** Ce que TOUT l'equipement apporte sur UNE stat. On somme le profil
      complet de chaque piece, pas seulement sa stat principale — sinon le
      +130 MP d'un casque de sagesse ne compterait nulle part. */
  function sommeBonus(etatP, stat) {
    var t = 0;
    EQUIP_SLOTS.forEach(function (cfg) {
      var eq = etatP[cfg.etatChamp];
      if (eq && eq.bonus) t += (eq.bonus[stat] || 0);
    });
    return t;
  }

  /** Le detail d'une piece en une ligne — « +15 ATT, +13 DEX ». */
  function detailBonus(o) {
    if (!o || !o.bonus) return '';
    var out = [];
    for (var k in o.bonus) if (o.bonus[k]) out.push('+' + nb(o.bonus[k], 0) + ' ' + (NOM_STAT[k] || k.toUpperCase()));
    if (o.degats) out.push(o.degats[0] + '-' + o.degats[1] + ' dmg');
    return out.join(', ');
  }

  /** Le chiffre de la pastille : la PLUS GROSSE valeur du profil. La somme
      n'aurait pas de sens (10 de sagesse et 130 de mana ne s'additionnent
      pas), et la stat principale seule mentirait sur une piece dont une
      autre stat pese plus gros. */
  function bonusEnTete(o) {
    if (!o || !o.bonus) return 0;
    var max = 0;
    for (var k in o.bonus) if (o.bonus[k] > max) max = o.bonus[k];
    return max;
  }

  /** Ce que porte la pastille de la case. Une ARME ne donne plus aucune stat
      — « +0 » sur une epee mythique qui frappe a 120 serait faux. Elle montre
      donc ses degats, prefixes d'une lame pour qu'on ne lise pas un bonus de
      stat a la place.

      Le nom porte « libelle » et pas seulement « pastille » parce que le nom
      nu est DEJA pris, au meme niveau, par la pastille des joueurs en ligne
      (un <span> du DOM range dans un `var` en tete de fichier). La fonction
      etait hoistee, puis l'affectation de ce `var` l'ecrasait avant le
      premier clic : peindre une case remplie levait « pastille is not a
      function », et la fiche entiere restait figee sur « Loading character… ».
      Deux choses differentes ne peuvent pas partager un nom dans une portee
      ou l'une des deux est une variable. */
  function libellePastille(o) {
    var b = bonusEnTete(o);
    if (b > 0) return '+' + nb(b, 0);
    if (o && o.degats) return '\u2694' + o.degats[1];
    return '+0';
  }

  function blocSkinStats(etatP) {
    var d = document.createElement('div');
    d.className = 'swk-sg';
    d.innerHTML = ORDRE_STATS.map(function (k) {
      var bonus = sommeBonus(etatP, k);
      var base = (etatP.stats[k] || 0) - bonus;
      return '<div class="swk-s"><i>' + NOM_STAT[k] + '</i><b>' + nb(base, 0) +
        (bonus > 0 ? ' <em>+' + nb(bonus, 0) + '</em>' : '') + '</b></div>';
    }).join('');
    return d;
  }

  /* La case d'equipement, a cote du portrait — fruit et armure a gauche,
     arme et bague a droite. Elle montre l'image de l'objet directement, pas
     juste son nom : c'est CA qu'on veut voir sur le personnage. Taper la
     case ouvre ou ferme le choix (rendu par blocPicker, juste en dessous) ;
     le petit rond "x" au coin retire l'objet sans passer par le choix. */
  function peintSlot(el, s, cfg, equipe) {
    if (!s.possede) { el.style.display = 'none'; el.onclick = null; return; }
    el.style.display = '';
    el.className = 'swk-slot' + (equipe ? '' : ' vide');
    el.title = equipe ? (equipe.nom + ' — ' + detailBonus(equipe)) : '';
    el.style.setProperty('--c', equipe ? (equipe.couleur || '#8DA0C4') : 'rgba(255,255,255,.18)');
    el.innerHTML = equipe
      ? '<img alt="" src="img/shop/' + encodeURIComponent(equipe.cle) + '.webp" onerror="this.remove()">' +
        '<b>' + libellePastille(equipe) + '</b>' +
        '<span class="rm" title="Remove">&times;</span>'
      : '<i>+ ' + cfg.label + '</i>';
    el.onclick = function (e) {
      e.stopPropagation();
      if (e.target.classList.contains('rm')) {
        envoie({ type: cfg.typeMsg, skin: s.id, item: null });
        return;
      }
      var ouvert = skinBoite.dataset.eqOpen === cfg.genre;
      skinBoite.dataset.eqOpen = ouvert ? '' : cfg.genre;
      if (!EQUIPABLE) envoie({ type: 'equipable' });
      peintDetailSkin();
    };
  }

  /* Le choix, sous les stats : uniquement quand la case correspondante vient
     d'etre touchee. Prend dans EQUIPABLE (qui ne depend d'aucune saison
     parcourue) ce qu'on possede reellement dans cette categorie — le clic
     sur un candidat equipe tout de suite, pas de bouton "confirmer" a part,
     le geste EST la confirmation. */
  function blocPicker(s, cfg, equipe) {
    var d = document.createElement('div');
    var ouvert = skinBoite.dataset.eqOpen === cfg.genre;
    if (!ouvert) { d.style.display = 'none'; return d; }
    d.className = 'swk-eql';
    var candidats = (EQUIPABLE && EQUIPABLE[cfg.champ]) || null;
    if (!candidats) {
      d.innerHTML = '<i class="swk-stload">Loading…</i>';
    } else if (!candidats.length) {
      d.innerHTML = '<i class="swk-teaser">' + cfg.vide + '</i>';
    } else {
      candidats.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'swk-eqi' + (equipe && equipe.item === o.id ? ' actif' : '');
        b.style.setProperty('--c', o.couleur || '#8DA0C4');
        b.innerHTML = '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" onerror="this.remove()">' +
          '<b>' + ech(o.nom) + '</b><i>' + ech(detailBonus(o)) + '</i>' +
          (o.quantite > 1 ? '<span>x' + o.quantite + '</span>' : '');
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          skinBoite.dataset.eqOpen = '';
          envoie({ type: cfg.typeMsg, skin: s.id, item: o.id });
        });
        d.appendChild(b);
      });
    }
    return d;
  }

  function fermeDetailSkin() { if (skinBoite) skinBoite.classList.remove('on'); }

  function peintAnnonces(boite) {
    if (!boite) return;
    boite.innerHTML = '';
    var teinte = {};
    if (BOUTIQUE && BOUTIQUE.catalogue)
      BOUTIQUE.catalogue.raretes.forEach(function (r) { teinte[r.cle] = r.couleur; });
    var q = MARCHE_Q.trim().toLowerCase();
    var l = (MARCHE.annonces || []).filter(function (a) {
      if (MARCHE_F === 'miennes' && !a.mien) return false;
      if (MARCHE_F === 'manque' && (a.jaiDeja || a.mien)) return false;
      if (q && String(a.item.nom).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!l.length) {
      var v = document.createElement('div');
      v.className = 'swp-v';
      v.textContent = q ? 'Nothing on sale matches “' + q + '”.'
        : MARCHE_F === 'miennes' ? 'You have nothing for sale. Tap an item on your collection board to sell it.'
        : MARCHE_F === 'manque' ? 'Nothing on sale that you are missing right now.'
        : 'Nothing for sale yet. Be the first.';
      boite.appendChild(v);
      return;
    }
    l.forEach(function (a) {
      var d = document.createElement('div');
      d.className = 'swm-a' + (a.mien ? ' mien' : '');
      d.style.setProperty('--t', a.item.couleur || teinte[a.item.rarete] || '#8DA0C4');
      var reste = a.item.plafond ? Math.max(0, a.item.plafond - a.item.emis) : null;
      /* ---- UN ANIMAL N'A PAS DE DESSIN DE BOUTIQUE ----
       * Les oeufs et les familiers vivent dans `img/nexus/objets` et
       * `img/nexus/monstres`. Le serveur nomme le genre (`item.genre`) plutot
       * que de laisser la page le deviner d'un champ present ou absent : le
       * jour ou un troisieme genre arrive, c'est une ligne ici et pas un
       * troisieme test a ne pas oublier. */
      var img = a.oeuf ? 'img/nexus/objets/oeuf_' + a.oeuf + '.webp'
              : a.fam ? 'img/nexus/monstres/pet_shiba' +
                        (a.fam.espece === 'normal' ? '' : '_' + a.fam.espece) + '.webp'
              : 'img/shop/' + encodeURIComponent(a.item.cle) + '.webp';
      /* La planche d'un familier porte SEIZE poses. Posee telle quelle, la
         vignette montrerait les seize en timbre-poste ; on cadre donc la pose
         de face, celle sous laquelle on le reconnait. */
      var vignette = a.fam
        ? '<i class="pl" style="background-image:url(' + img + ')"></i>'
        : '<img alt="" src="' + img + '" onerror="this.remove()">';
      /* Ce que la ligne dit d'un animal n'est pas ce qu'elle dit d'une piece.
         « Mythic · 40 left in the edition » n'a aucun sens pour un familier :
         ce qui compte, c'est ce qu'il SAIT FAIRE et a quelle cadence. */
      var sous = a.fam
        ? ech((a.fam.pouvoir && a.fam.pouvoir.nom) || 'Pet') + ' \u00b7 every ' +
          (a.fam.effet ? Math.round(a.fam.effet.recharge) : '?') + 's'
        : a.oeuf
        ? 'Mythic egg \u00b7 ' + (a.jaiDeja ? 'you already hatched this one' : 'never hatched')
        : ech(a.item.rareteNom || a.item.rarete) +
          (reste === null ? '' : ' \u00b7 ' + nb(reste, 0) + ' left in the edition');
      d.innerHTML =
        vignette +
        '<div class="nm"><b>' + ech(a.item.nom) + (a.qte > 1 ? ' <em>x' + a.qte + '</em>' : '') + '</b>' +
        '<i>' + sous + '</i>' +
        '<i class="v">' + (a.mien ? 'your listing' : 'by ' + ech(a.nomVendeur)) + '</i></div>' +
        '<div class="px"><b>' + nb(a.prix, 0) + '</b><i>$SWOGE</i></div>';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'swact';
      /* Une seule action par ligne, et elle depend de qui regarde. Deux
         boutons dont un toujours grise apprendraient a ne plus les lire. */
      b.textContent = a.mien ? 'Take back' : 'Buy';
      /* ---- CE QU'ON NE PEUT PAS ACHETER, ON NE LE PROPOSE PAS ----
       * Un compte ne tient qu'un familier par espece : l'achat serait refuse
       * par le serveur. Un bouton qui ne marche jamais apprend a ne plus lire
       * les boutons — on dit donc POURQUOI, a la place. */
      if (!a.mien && a.fam && a.jaiDeja) {
        b.disabled = true;
        b.textContent = 'You have it';
        b.title = 'One pet of each species per account.';
      }
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        envoie(a.mien ? { type: 'marketCancel', id: a.id, season: SAISON }
                      : { type: 'marketBuy', id: a.id, season: SAISON });
      });
      d.appendChild(b);
      boite.appendChild(d);
    });
  }

  /* ==================== METTRE UN OBJET EN VENTE ====================
   *
   * Une feuille qui monte du bas, pas une modale au centre : on est peut-etre
   * au milieu d'une partie, et une boite qui prend l'ecran entier pour une
   * vente de trois mille jetons coupe une manche pour rien.
   *
   * Trois champs seulement — combien, a quel prix, et ce que ca rapporte
   * vraiment. Le troisieme n'est pas une politesse : la commission de 5 %
   * doit etre lue AVANT de valider, pas decouverte sur le solde apres.
   */
  var venteBoite = null;
  function ouvreVente(o, possede, couleur) {
    if (!venteBoite) {
      venteBoite = document.createElement('div');
      venteBoite.className = 'swv';
      venteBoite.innerHTML =
        '<div class="swv-f">' +
          '<button class="swv-x" type="button" aria-label="Close">&times;</button>' +
          '<div class="swv-t"><img alt=""><div><b></b><i></i></div></div>' +
          '<label class="swv-l">How many <span class="swv-max"></span></label>' +
          '<input class="swv-q" type="number" min="1" step="1" inputmode="numeric">' +
          '<label class="swv-l">Price per item ($SWOGE)</label>' +
          '<input class="swv-p" type="number" min="0" step="1" inputmode="numeric">' +
          '<div class="swv-net"></div>' +
          '<button class="swv-go" type="button">Put up for sale</button>' +
          '<div class="swv-or">or</div>' +
          '<button class="swv-now" type="button"></button>' +
          '<div class="swv-note"></div>' +
        '</div>';
      /* Dans le tiroir. Le repli sur `body` n'est pas decoratif : la planche
         de collection s'ouvre aussi hors du tiroir sur certaines pages, et
         sans lui la feuille n'aurait nulle part ou aller. */
      var hote = (profBoite && profBoite.querySelector('.swp')) || document.body;
      if (hote === document.body) venteBoite.style.position = 'fixed';
      hote.appendChild(venteBoite);
      venteBoite.addEventListener('click', function (e) {
        if (e.target === venteBoite || e.target.classList.contains('swv-x')) fermeVente();
      });
      venteBoite.querySelector('.swv-go').addEventListener('click', envoieVente);
      venteBoite.querySelector('.swv-now').addEventListener('click', envoieRachat);
      ['.swv-q', '.swv-p'].forEach(function (sel) {
        venteBoite.querySelector(sel).addEventListener('input', calculeNet);
      });
    }
    venteBoite.dataset.item = o.id;
    venteBoite.dataset.max = possede;
    /* Le prix de rachat vient du CATALOGUE, jamais d'un calcul refait ici.
       Deux endroits qui derivent le meme bareme finissent par ne plus dire le
       meme chiffre, et c'est le joueur qui decouvre l'ecart au credit. */
    venteBoite.dataset.rachat = o.rachat || 0;
    var im = venteBoite.querySelector('img');
    im.src = 'img/shop/' + encodeURIComponent(o.cle) + '.webp';
    im.onerror = function () { im.style.visibility = 'hidden'; };
    im.style.visibility = '';
    venteBoite.querySelector('b').textContent = o.nom;
    var it = venteBoite.querySelector('i');
    it.textContent = 'You own ' + possede;
    it.style.color = couleur || '#8DA0C4';
    /* On REMET la feuille en mode piece : elle a pu servir a un animal, qui
       cache la quantite et le rachat. Sans ce retour, la vente suivante
       proposerait une piece sans champ de quantite. */
    venteBoite.dataset.animal = '';
    venteBoite.dataset.espece = '';
    var vieux = venteBoite.querySelector('.swv-t .pl');
    if (vieux) vieux.remove();
    im.style.display = '';
    ['.swv-q', '.swv-or', '.swv-now', '.swv-note'].forEach(function (sel) {
      venteBoite.querySelector(sel).style.display = '';
    });
    venteBoite.querySelector('.swv-max').parentNode.style.display = '';
    venteBoite.querySelector('.swv-max').textContent = '(max ' + possede + ')';
    var q = venteBoite.querySelector('.swv-q');
    q.max = possede; q.value = 1;
    venteBoite.querySelector('.swv-p').value = '';
    calculeNet();
    venteBoite.classList.add('on');
    setTimeout(function () { venteBoite.querySelector('.swv-p').focus(); }, 60);
  }
  /* ---- LA MEME FEUILLE, POUR UN ANIMAL ----
   *
   * Un oeuf et un familier passent par `ouvreVente` comme une piece : meme
   * coque, meme champ de prix, meme calcul du net, meme bouton. Ecrire une
   * seconde feuille aurait voulu dire ecrire une seconde fois « et n'oublie
   * pas de retirer les cinq pour cent » — et la rater d'un cote, c'est
   * annoncer au vendeur une somme qu'il ne touchera pas.
   *
   * Trois choses les separent, et elles se lisent toutes ici :
   *  - la QUANTITE n'existe pas. On ne vend pas cinq fois le meme familier,
   *    il n'y en a qu'un. Le champ disparait plutot que d'afficher « max 1 »,
   *    qui est un choix qu'on n'a pas ;
   *  - il n'y a PAS de rachat instantane. La maison ne rachete pas les
   *    animaux : elle n'a pas de bareme pour une progression ;
   *  - le dessin ne vient pas de `img/shop`.
   */
  function ouvreVenteAnimal(quoi, cle, nom, sous, img, couleur, planche) {
    ouvreVente({ id: 0, cle: '', nom: nom, rachat: 0 }, 1, couleur);
    venteBoite.dataset.animal = quoi;      // 'oeuf' ou 'fam'
    venteBoite.dataset.espece = cle;
    var im = venteBoite.querySelector('.swv-t img');
    var t = venteBoite.querySelector('.swv-t');
    /* La planche d'un familier porte seize poses : on la cadre en fond plutot
       que de poser l'image entiere, qui les montrerait toutes en
       timbre-poste. */
    var vig = t.querySelector('.pl');
    if (vig) vig.remove();
    if (planche) {
      im.style.display = 'none';
      var e = document.createElement('i');
      e.className = 'pl';
      e.style.cssText = 'width:48px;height:48px;flex:0 0 48px;display:block;' +
        'image-rendering:pixelated;background-repeat:no-repeat;' +
        'background-size:400% 400%;background-position:0% 33.333%;' +
        'background-image:url(' + img + ')';
      t.insertBefore(e, t.firstChild);
    } else {
      im.style.display = '';
      im.src = img;
    }
    venteBoite.querySelector('.swv-t i').textContent = sous;
    /* Pas de quantite, pas de rachat : deux sections qu'on cache au lieu de
       les griser. Un champ grise se lit comme un choix qu'on n'a pas encore
       fait ; un champ absent se lit comme un choix qui n'existe pas. */
    venteBoite.querySelector('.swv-q').style.display = 'none';
    venteBoite.querySelector('.swv-max').parentNode.style.display = 'none';
    venteBoite.querySelector('.swv-or').style.display = 'none';
    venteBoite.querySelector('.swv-now').style.display = 'none';
    venteBoite.querySelector('.swv-note').style.display = 'none';
    venteBoite.querySelector('.swv-q').value = 1;
    calculeNet();
  }

  function fermeVente() { if (venteBoite) venteBoite.classList.remove('on'); }
  function calculeNet() {
    if (!venteBoite) return;
    var q = venteBoite.dataset.animal ? 1
          : Math.max(1, Math.min(Number(venteBoite.dataset.max) || 1,
                                 Math.floor(Number(venteBoite.querySelector('.swv-q').value) || 1)));
    var p = Math.floor(Number(venteBoite.querySelector('.swv-p').value) || 0);
    var frais = (MARCHE && MARCHE.frais) || 5;
    var net = Math.floor(p * q * (100 - frais) / 100);
    var z = venteBoite.querySelector('.swv-net');
    /* On affiche CE QUE LE VENDEUR TOUCHE, pas ce que l'acheteur paie. Le
       prix affiche est deja sous ses yeux ; ce qu'il ignore, c'est le net. */
    z.innerHTML = p > 0
      ? 'You receive <b>' + nb(net, 0) + ' $SWOGE</b> <span>after the ' + frais + '% fee</span>'
      : '<span>Set a price to see what you receive</span>';

    /* ---- LE RACHAT INSTANTANE ----
     *
     * Le bouton porte le TOTAL pour la quantite choisie, pas le prix unitaire.
     * Bouger la quantite sans voir bouger la somme laisserait croire qu'on
     * vend une piece alors qu'on en vend cinq. */
    var u = Number(venteBoite.dataset.rachat) || 0;
    var bt = venteBoite.querySelector('.swv-now');
    var no = venteBoite.querySelector('.swv-note');
    var ou = venteBoite.querySelector('.swv-or');
    /* Un objet sans prix de rachat — cas qui ne devrait pas exister mais qui
       arriverait au premier bareme incomplet — cache la section au lieu de
       proposer un bouton a zero jeton. */
    var dispo = u > 0;
    ou.style.display = bt.style.display = no.style.display = dispo ? '' : 'none';
    if (!dispo) return;

    /* ---- LA PORTE, MONTREE AVANT LE CLIC ----
     *
     * Le rachat demande d'avoir joue un certain volume — c'est ce qui empeche
     * une ferme d'adresses jetables de revendre son coffre gratuit tous les
     * jours. Un bouton grise sans explication se lit « casse » ; avec le
     * chiffre et ce qui reste, il se lit « pas encore », et il devient une
     * raison de jouer au lieu d'une raison de partir.
     *
     * Le verrou vient du SERVEUR. Le recalculer ici donnerait un deuxieme
     * avis sur la meme question, et le jour ou les deux different, c'est
     * celui qui s'affiche qui a tort. */
    var v = (BOUTIQUE && BOUTIQUE.rachat) || null;
    if (v && !v.ouvert) {
      bt.disabled = true;
      bt.textContent = 'Instant sell locked';
      var pc = Math.min(100, Math.floor(v.volume * 100 / (v.requis || 1)));
      no.innerHTML = 'Unlocks once you have wagered <b>' + nb(v.requis, 0) + ' $SWOGE</b> ' +
        'across the casino — you are at <b>' + nb(v.volume, 0) + '</b> (' + pc + '%), ' +
        nb(v.reste, 0) + ' to go.<br>' +
        'It keeps throwaway accounts from farming the free daily chest. ' +
        'You can still put the item up for sale above.';
      return;
    }
    bt.disabled = false;
    bt.textContent = 'Sell instantly for ' + nb(u * q, 0) + ' $SWOGE';
    no.innerHTML = 'Paid straight away at a fixed price — no waiting for a buyer, ' +
      'and no fee. It is lower than the market: you are paying for the speed.<br>' +
      'The item goes back into the chest pool, so someone else can pull it again.';
  }
  function envoieVente() {
    if (!venteBoite) return;
    var p = Math.floor(Number(venteBoite.querySelector('.swv-p').value) || 0);
    if (!(p > 0)) { toast('Set a price first', 'bad'); return; }
    /* Le MEME message que pour une piece, avec `oeuf` ou `fam` a la place de
       `item`. Le serveur choisit le chemin ; la page n'a pas a connaitre
       trois messages pour un seul geste. */
    var animal = venteBoite.dataset.animal;
    if (animal) {
      var msg = { type: 'marketSell', price: p, season: SAISON };
      msg[animal] = venteBoite.dataset.espece;
      envoie(msg);
      fermeVente();
      return;
    }
    var id = Number(venteBoite.dataset.item);
    var q = Math.max(1, Math.min(Number(venteBoite.dataset.max) || 1,
                                 Math.floor(Number(venteBoite.querySelector('.swv-q').value) || 1)));
    envoie({ type: 'marketSell', item: id, price: p, qty: q, season: SAISON });
    fermeVente();
  }

  /*
   * Le rachat ne demande PAS de confirmation. Elle serait justifiee si le
   * geste etait irreversible pour le joueur — il ne l'est pas : l'objet
   * retourne au coffre et se retire. Ce qu'il faut a la place, c'est que la
   * somme soit lisible sur le bouton avant le clic, et elle l'est.
   */
  function envoieRachat() {
    if (!venteBoite) return;
    var id = Number(venteBoite.dataset.item);
    var q = Math.max(1, Math.min(Number(venteBoite.dataset.max) || 1,
                                 Math.floor(Number(venteBoite.querySelector('.swv-q').value) || 1)));
    venteBoite.querySelector('.swv-now').disabled = true;
    envoie({ type: 'buyback', item: id, qty: q, season: SAISON });
    fermeVente();
  }

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
   * Les quatre saisons sont ouvertes : le bandeau sert donc a CHOISIR
   * laquelle on regarde, plus a annoncer laquelle on peut atteindre.
   *
   * ---- pourquoi le rendu « fermee » reste ecrit ----
   *
   * Il n'y a plus de verrou aujourd'hui, mais l'autorite reste le SERVEUR :
   * cette fonction ne decide rien, elle reflete `s.ouverte`. Tant qu'elle
   * sait afficher les deux etats, refermer une saison un jour ne demande
   * qu'une ligne cote serveur — et surtout, une page qui ne saurait afficher
   * que « ouvert » montrerait un onglet cliquable que le serveur refuserait
   * ensuite, ce qui est la pire des deux erreurs.
   *
   * D'ou le contenu de la pastille fermee : pas « locked », mais ce qui
   * manque exactement — « 1/3 lines ». Un verrou sans compteur se lit comme
   * une porte murée ; le meme avec « il en manque deux » se lit comme un
   * objectif.
   */
  function rendSaisons(l) {
    /* `BOUTIQUE` peut ne pas exister : le marche s'ouvre sans etre passe par
       la boutique, et cette ligne jetait alors — silencieusement, parce que
       l'appel vient d'un gestionnaire d'evenement. Le panneau se vidait et
       rien ne le disait. */
    var S = BOUTIQUE && BOUTIQUE.saisons;
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
      /* Plus de pastille « early » : le serveur ne rend plus `avance`, parce
         qu'entrer en avance la ou tout le monde est deja entre ne distingue
         plus personne. La course garde son rang, ailleurs, ou il veut encore
         dire quelque chose. */
      t.innerHTML = '<b>S' + s.n + '</b> ' + ech(court) +
        (s.ouverte ? '' : '<i class="cl">' + s.faites + '/' + s.sur + ' lines</i>');
      t.title = s.ouverte
        ? s.nom
        : 'Opens when ' + s.sur + ' players have completed a full family (' +
          s.faites + ' so far).';
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

  /* ==================== L'ENCLOS ET LE COFFRE A OEUFS ====================
   *
   * Deux listes dans un seul panneau, et c'est deliberé : « tu as cet animal,
   * donc cet oeuf-la ne peut plus eclore » est UNE phrase. Les separer en deux
   * onglets aurait oblige le joueur a faire l'aller-retour pour repondre a une
   * question que le serveur repond deja (`eclos` sur chaque oeuf).
   */
  function rendAnimaux() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    if (!FAMILIERS || !OEUFS_COFFRE) {
      var att = document.createElement('div');
      att.className = 'swp-v'; att.textContent = 'Loading…';
      l.appendChild(att);
      if (etat.socket && etat.socket.readyState === 1)
        etat.socket.send(JSON.stringify({ type: 'familiers' }));
      return;
    }
    var dessin = function (es) {
      return 'img/nexus/monstres/pet_shiba' + (es === 'normal' ? '' : '_' + es) + '.webp';
    };

    /* ---- L'ENCLOS ---- */
    var g1 = document.createElement('div');
    g1.className = 'swp-g'; g1.textContent = 'Your pets';
    l.appendChild(g1);
    if (!FAMILIERS.length) {
      var v1 = document.createElement('div');
      v1.className = 'swp-v';
      v1.innerHTML = 'No pet yet. Mythic eggs drop from <b>any</b> monster, ' +
                     'about once in 1,200 kills — hatch one at Petworld.';
      l.appendChild(v1);
    }
    FAMILIERS.forEach(function (f) {
      var d = document.createElement('div');
      d.className = 'swm-a';
      d.style.setProperty('--t', '#7CFF9B');
      /* Ce qu'un familier VAUT se lit a sa cadence, pas a son niveau seul :
         le niveau achete de la frequence — soixante secondes au premier,
         trois au centieme. C'est le chiffre qu'un acheteur regarde. */
      var r = f.effet ? (f.effet.recharge >= 10 ? Math.round(f.effet.recharge)
                                                : f.effet.recharge.toFixed(1)) : '?';
      d.innerHTML =
        '<i class="pl" style="background-image:url(' + dessin(f.espece) + ')"></i>' +
        '<div class="nm"><b>' + ech(f.nom) + ' <em>Lv ' + f.niveau + '</em></b>' +
        '<i>' + ech((f.pouvoir && f.pouvoir.nom) || '') + ' \u00b7 every ' + r + 's</i>' +
        '<i class="v">' + (f.actif ? 'out with you' : 'in the pen') + '</i></div>' +
        '<div class="px"><b>' + nb(f.xp, 0) + '</b><i>XP</i></div>';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'swact';
      b.textContent = 'Sell';
      b.addEventListener('click', function () {
        /* On DIT que la vente est definitive avant d'ouvrir le formulaire.
           Un familier qu'on a nourri pendant des semaines ne doit pas partir
           sur un clic mal vise. */
        ouvreVenteAnimal('fam', f.espece, f.nom + ' \u00b7 Lv ' + f.niveau,
                         'Sold for good \u2014 with its ' + nb(f.xp, 0) + ' XP',
                         dessin(f.espece), '#7CFF9B', true);
      });
      d.appendChild(b);
      l.appendChild(d);
    });

    /* ---- LE COFFRE A OEUFS ---- */
    var g2 = document.createElement('div');
    g2.className = 'swp-g'; g2.textContent = 'Egg vault';
    l.appendChild(g2);
    if (!OEUFS_COFFRE.length) {
      var v2 = document.createElement('div');
      v2.className = 'swp-v';
      /* Le texte disait que l'oeuf s'y rangeait TOUT SEUL. C'etait faux : il
         reste dans le sac tant qu'on ne le range pas, et cette page ne
         connait pas le sac — c'est Petworld qui l'a. Un joueur venu ici pour
         VENDRE son oeuf trouvait un coffre vide et aucune explication ; on
         lui dit maintenant ou est la porte. */
      v2.innerHTML = 'Nothing stored. An egg stays in your backpack until you ' +
                     'store it \u2014 open <b>Petworld</b> in the hall and hit ' +
                     'Store. The vault survives death, your backpack does not, ' +
                     'and selling an egg starts from here.';
      l.appendChild(v2);
    }
    OEUFS_COFFRE.forEach(function (o) {
      var d = document.createElement('div');
      d.className = 'swm-a';
      d.style.setProperty('--t', o.espece === 'legendaire' ? '#FFFFFF' : '#FF4655');
      d.innerHTML =
        '<img alt="" src="img/nexus/objets/oeuf_' + o.espece + '.webp" onerror="this.remove()">' +
        '<div class="nm"><b>' + ech(o.nom) + (o.quantite > 1 ? ' <em>x' + o.quantite + '</em>' : '') + '</b>' +
        '<i>' + (o.eclos ? 'you already have this pet \u2014 it cannot hatch again'
                         : 'never hatched \u2014 take it out and open it at Petworld') + '</i>' +
        '<i class="v">in your vault</i></div>';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'swact';
      /* Un oeuf qu'on peut encore ouvrir se REPREND ; un oeuf qu'on ne peut
         plus ouvrir se VEND. Le bouton propose le geste qui a un sens, plutot
         que deux dont un ne sert jamais. */
      b.textContent = o.eclos ? 'Sell' : 'Take out';
      b.addEventListener('click', function () {
        if (o.eclos) {
          ouvreVenteAnimal('oeuf', o.espece, o.nom, 'Mythic egg',
                           'img/nexus/objets/oeuf_' + o.espece + '.webp',
                           o.espece === 'legendaire' ? '#FFFFFF' : '#FF4655', false);
          return;
        }
        b.disabled = true;
        envoie({ type: 'oeufSort', espece: o.espece });
      });
      d.appendChild(b);
      /* Le SECOND geste, pour un oeuf qu'on peut encore ouvrir : le vendre
         quand meme. Il est la, en petit, parce que c'est un choix legitime —
         mais ce n'est pas celui qu'on propose en premier. */
      if (!o.eclos) {
        var b2 = document.createElement('button');
        b2.type = 'button'; b2.className = 'swact';
        b2.style.opacity = '.7';
        b2.textContent = 'Sell';
        b2.addEventListener('click', function () {
          ouvreVenteAnimal('oeuf', o.espece, o.nom, 'Mythic egg',
                           'img/nexus/objets/oeuf_' + o.espece + '.webp',
                           o.espece === 'legendaire' ? '#FFFFFF' : '#FF4655', false);
        });
        d.appendChild(b2);
      }
      l.appendChild(d);
    });
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
        '<span class="sc" style="color:' + lisible(teinte[x.meilleure] || '#8DA0C4') + '">' +
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
  /* ---- L'OUVERTURE DE COFFRE, PRETEE AU NEXUS ----
   *
   * La boutique du Nexus achete les memes caisses par les memes messages ;
   * elle doit donc montrer la meme chose. Recopier la scene la-bas en ferait
   * une seconde version de l'unique moment du site qui produit une emotion —
   * et deux versions divergent. On l'expose, comme le formulaire de
   * connexion. */
  window.swogeCoffre = { ouvre: function (cle) {
    /* L'HABIT DE LA SCENE vit dans `profStyle`, qui n'est appele qu'en
       construisant le tiroir du profil. Sur le Nexus ce tiroir n'est jamais
       ouvert : la scene se montait donc sans une seule regle CSS, c'est-a-
       dire invisible. On s'assure qu'il est pose avant de jouer. */
    try { profStyle(); } catch (e) {}
    joueCoffre(cle); sceneOuvre(cle);
  } };

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

  /* ---- LE SKIN PORTE, AU CENTRE DE L'APERCU ----
   *
   * On l'a paye, on le porte — et jusqu'ici rien ne le montrait nulle part
   * en dehors d'une etiquette « Wearing » enfouie dans l'onglet Skins. La
   * premiere chose qu'on voit en ouvrant son profil doit pouvoir etre le
   * personnage qu'on a choisi, pas seulement des chiffres.
   *
   * Clique dessus, et c'est LA MEME fiche qui s'ouvre que depuis la
   * boutique — meme fonction, meme comportement, meme bouton fermer. Deux
   * facons d'y arriver ne doivent pas ouvrir deux choses differentes. */
  function blocSkinPorte() {
    if (!SKINS || !SKINS.actif) return null;
    var s = (SKINS.catalogue || []).filter(function (x) { return x.id === SKINS.actif; })[0];
    if (!s) return null;
    var d = document.createElement('div');
    d.className = 'swap-skin';
    d.style.setProperty('--t', s.couleur || '#8DA0C4');
    d.innerHTML =
      '<div class="ico"><img alt="" src="img/skins/skin_' + encodeURIComponent(s.id) + '.webp" onerror="this.remove()"></div>' +
      '<i>Wearing</i><b>' + ech(s.nom) + '</b>';
    d.addEventListener('click', function () { ouvreDetailSkin(s); });
    return d;
  }

  function rendApercu() {
    var l = profBoite.querySelector('.swp-l');
    l.innerHTML = '';
    var bs = blocSkinPorte(); if (bs) l.appendChild(bs);
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
    if (!nom && k === 'mk') nom = 'Player market';
    if (!nom && k === 'sk') nom = 'Character skins';
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
    /* Ce qui attend le joueur, tout de suite. C'est la raison pour laquelle il
       vient d'appuyer sur la pastille : la peindre apres un aller-retour
       serveur laisserait une seconde de tiroir sans la reponse a sa question. */
    peintNotifs();
    /* Le prix a pu arriver AVANT que le panneau existe : il n'y avait alors
       aucun endroit ou l'ecrire. On le repose a l'ouverture. */
    posePrixNom();
    // on rafraichit le profil a chaque ouverture : il a pu changer ailleurs
    if (etat.socket && etat.socket.readyState === 1) {
      try { etat.socket.send('{"type":"profile"}'); } catch (e) {}
      /* Le skin porte s'affiche des l'ouverture, au centre de l'apercu — pas
         seulement apres une visite a l'onglet Skins. Sans cette demande ici,
         la vignette resterait vide tant qu'on n'a pas ouvert la boutique au
         moins une fois dans la session. */
      try { etat.socket.send('{"type":"skins"}'); } catch (e) {}
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
    if (k === 'mk') {
      MARCHE_F = 'tout'; MARCHE_Q = '';
      envoie({ type: 'market', season: SAISON });
    }
    if (k === 'sk') {
      /* Aucun `season` dans ce message : un skin ne depend d'aucune saison,
         c'est justement le sens de « rien a voir avec les saisons ». */
      if (etat.socket && etat.socket.readyState === 1) {
        try { etat.socket.send('{"type":"skins"}'); } catch (e) {}
      }
    }
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
    if (profOnglet === 'sh' || profOnglet === 'cl' || profOnglet === 'mk'
        || profOnglet === 'sk' || profOnglet === 'pt') return;
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
          'style="color:#0E7C3E">view on the explorer ↗</a>' : '';
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
    /* L'avatar de la PAGE d'abord : il existe meme quand le notre n'a pas pu
       se poser, et c'est lui qu'on voit sur les six pages principales. */
    peintAvatarPage();
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

  /*
   * ---- L'AVATAR DE LA PAGE PORTE LE MEME VISAGE ----
   *
   * Les six pages principales posent leur propre bouton de compte
   * (`#gxProfil`) et masquent le notre — deux avatars a l'ecran, c'etait le
   * doublon de trop. Mais le leur restait un emoji : la photo, le badge et le
   * cadre de palier vivaient sur celui qu'on ne voit pas. Le joueur avait donc
   * un visage sur une page et un bonhomme gris sur les autres, sans que rien
   * ne l'explique.
   *
   * On peint donc les DEUX, avec la meme matiere. Ce n'est pas un doublon de
   * code : c'est un seul endroit qui peint, et deux boutons qui recoivent.
   */
  function peintAvatarPage() {
    var el = document.getElementById('gxProfil');
    if (!el) return;
    /* ---- LA PASTILLE N'EST PAS DU TEXTE ----
     * Ce bouton porte deux choses : un visage, et le compte de ce qui attend.
     * La seconde est un ELEMENT, pose par `pastilleAmis`. Ecrire `textContent`
     * l'efface — et le tester pour ne pas ecraser revenait a ne plus poser le
     * visage des qu'il y avait une notification. Vu au banc : un bouton qui
     * n'affichait que « 2 », et un autre qui perdait son « 2 » en gagnant sa
     * photo. On la met de cote et on la remet, comme le fait le bouton du
     * tiroir a trois lignes d'ici. */
    var pastille = el.querySelector('.swpn');
    /* ---- IL POSE SES PROPRES REGLES ----
     * Le cadre et l'avatar en image sont dessines par la feuille du tiroir,
     * qui n'est injectee qu'a l'authentification. Un message de PROFIL peut
     * arriver avant : on peignait alors des classes que rien ne dessinait —
     * pas d'erreur, pas de cadre, et rien pour le dire. */
    try { profStyle(); } catch (e) {}
    if (MOI && (MOI.photo || estBadge(MOI.visage))) {
      el.textContent = '';
      el.classList.add('swav-img');
      el.style.backgroundImage = 'url("' +
        (MOI.photo ? urlPhoto(MOI.address) : urlBadge(MOI.visage)) + '")';
    } else {
      el.classList.remove('swav-img');
      el.style.backgroundImage = '';
      el.textContent = (MOI && MOI.visage) || '\uD83D\uDC64';
    }
    if (pastille) el.appendChild(pastille);
    poseCadre(el, (MOI && MOI.niveau !== undefined) ? MOI
      : (NIVEAU ? { niveau: NIVEAU.niveau, palierNo: NIVEAU.palierNo } : null));
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

  /* ====================================================================
   * CE QUI ATTEND LE JOUEUR
   * ====================================================================
   *
   * ---- le defaut qu'on repare ----
   *
   * Un joueur a ecrit : « la pastille affichait 3, j'en ai trouve 2 — deux
   * demandes d'ami — et je n'ai jamais trouve la troisieme. »
   *
   * Il avait raison, et le defaut n'etait pas le compte : c'etait qu'il
   * n'existait AUCUN endroit qui dise ce que la pastille comptait. Le total
   * additionnait six sources — demandes d'ami, transferts non lus, coffre du
   * jour, serie, quetes finies, sans-faute — et chacune se reclamait a un
   * endroit different du site. Un chiffre qui annonce trois choses sans dire
   * lesquelles ne previent pas : il inquiete.
   *
   * ---- la regle qui empeche que ca recommence ----
   *
   * LA PASTILLE COMPTE LES LIGNES DE CETTE LISTE. Elle ne fait plus sa propre
   * somme dans son coin. Tant que les deux se calculaient separement, il
   * suffisait d'ajouter une source d'un cote et de l'oublier de l'autre pour
   * refabriquer exactement le meme probleme — un compteur qui promet quelque
   * chose d'introuvable.
   *
   * ---- une ligne par GENRE, pas par element ----
   *
   * Cinq quetes finies font UNE ligne qui dit cinq, pas cinq lignes. La
   * pastille dit alors « 1 chose a faire » et non « 5 », ce qui est plus
   * proche de la verite : c'est un seul geste. La ligne porte son propre
   * compte, donc rien n'est cache.
   */
  function notifs() {
    var l = [];
    if (EN_ATTENTE > 0) l.push({
      cle: 'amis', ic: '👋',
      t: EN_ATTENTE + ' friend request' + (EN_ATTENTE === 1 ? '' : 's'),
      d: 'Someone wants to add you',
      go: function () { profVa('am'); },
    });
    /* `NON_LUS` et `ATTENTE.transferts` sont le MEME compteur vu de deux
       cotes. Les additionner ferait compter chaque transfert deux fois — le
       defaut que l'ancien calcul evitait deja, et qu'on garde evite ici. */
    var tr = NON_LUS || (ATTENTE && ATTENTE.transferts) || 0;
    if (tr > 0) l.push({
      cle: 'tr', ic: '💸',
      t: tr + ' transfer' + (tr === 1 ? '' : 's') + ' received',
      d: 'Someone sent you $SWOGE',
      go: function () { profVa('hi'); HISTO = 'tr'; profRend(); rendHistoOnglets(); },
    });
    if (ATTENTE && ATTENTE.coffre) l.push({
      cle: 'coffre', ic: '🎁',
      t: 'Your free chest is waiting',
      d: 'One a day — it does not stack up',
      go: function () { profVa('sh'); },
    });
    if (ATTENTE && ATTENTE.serie) l.push({
      cle: 'serie', ic: '🔥',
      t: 'Daily streak reward ready',
      d: SERIE && SERIE.day ? 'Day ' + (SERIE.day + 1) + ' — claim it to keep the streak'
                            : 'Claim it to keep the streak',
      /* ---- ON RECLAME ICI, ON N'Y EMMENE PAS ----
       *
       * La serie se reclamait « sur n'importe quelle table de jeu ». Envoyer
       * quelqu'un chercher un bouton a l'autre bout du site pour un geste qui
       * tient en un message, c'est ajouter trois occasions d'abandonner. Le
       * serveur repond `streakClaimed`, la ligne disparait toute seule. */
      fait: function () { envoie({ type: 'claimStreak' }); },
    });
    var q = (ATTENTE && ATTENTE.quetes) || 0;
    if (q > 0) l.push({
      cle: 'quetes', ic: '✅',
      t: q + ' finished quest' + (q === 1 ? '' : 's') + ' to claim',
      d: 'Rewards waiting',
      fait: function () {
        var pris = 0;
        (MISSIONS || []).forEach(function (x) {
          if (x.done && !x.claimed) { envoie({ type: 'claimQuest', id: x.id }); pris++; }
        });
        /* La liste des quetes n'est pas forcement chargee sur cette page-ci :
           le compte, lui, vient du serveur. On la demande alors, et la
           reponse repeint la ligne — plutot que de ne rien faire en silence. */
        if (!pris) { envoie({ type: 'quests' }); toast('Loading your quests…'); }
      },
    });
    if (ATTENTE && ATTENTE.parfait) l.push({
      cle: 'parfait', ic: '🏆',
      t: 'Perfect day bonus ready',
      d: 'Every quest done today',
      fait: function () { envoie({ type: 'perfectDay' }); },
    });
    return l;
  }

  /* La liste, peinte en TETE du tiroir. Elle disparait entierement quand il
     n'y a rien : une section « 0 notification » occupe la meilleure place de
     l'ecran pour ne rien dire, et apprend a ne plus regarder cet endroit. */
  function peintNotifs() {
    var t = profBoite && profBoite.querySelector('.swp-t');
    if (!t) return;
    var z = t.querySelector('.swp-nz');
    var l = notifs();
    if (!l.length) { if (z) z.remove(); return; }
    if (!z) {
      z = document.createElement('div');
      z.className = 'swp-nz';
      t.insertBefore(z, t.firstChild);
    }
    z.innerHTML = '<div class="swp-g">Waiting for you</div>';
    l.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swp-n' + (o.fait ? ' agir' : '');
      b.dataset.tap = 'notif:' + o.cle;
      b.innerHTML = '<span class="ic">' + o.ic + '</span>' +
        '<span class="tx"><b>' + ech(o.t) + '</b><i>' + ech(o.d) + '</i></span>' +
        '<span class="fl">' + (o.fait ? 'Claim' : '›') + '</span>';
      b.addEventListener('click', function () {
        if (o.fait) {
          /* On coupe le bouton tout de suite. Sans ca, deux appuis rapides
             envoient deux reclamations, et la seconde revient en erreur —
             « already claimed » — pour un geste qui a pourtant marche. */
          b.disabled = true;
          b.querySelector('.fl').textContent = '…';
          o.fait();
        } else { o.go(); }
      });
      z.appendChild(b);
    });
  }

  function pastilleAmis() {
    peintNotifs();
    if (!profBtn) return;
    var p = profBtn.querySelector('.swpn');
    /* LE COMPTE VIENT DE LA LISTE, et de nulle part ailleurs. C'est la seule
       chose qui garantisse qu'on peut toujours trouver ce qu'il annonce. */
    var total = notifs().length;
    /* ---- LA PASTILLE SUIT LA POIGNEE VISIBLE ----
     * Elle vivait sur l'avatar de la barre du bas. La barre est partie, et une
     * pastille posee sur un element absent — ou sur le notre, masque par les
     * pages qui ont leur propre avatar — s'allume sans que personne ne la
     * voie : invisible, donc inutile, et rien ne le signale.
     * On vise donc l'avatar de la PAGE quand elle en a un (`#gxProfil`, sur
     * les six pages principales), et le notre sinon. C'est la meme regle
     * qu'avant, appliquee a ce qui reste. */
    var cible = document.getElementById('gxProfil');
    if (cible && cible.offsetParent === null) cible = null;   // present mais masque
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
    /* ---- UN PANNEAU DE LA PAGE EST EMPRUNTE : ON NE REPEINT PAS ----
     *
     * Chaque section refait `.swp-l` de fond en comble (`innerHTML = ''`).
     * Tant que la liste ne contenait que ce que ce fichier dessine, c etait
     * sans consequence. Depuis qu on y DEPLACE le portefeuille, le depot ou
     * les quetes de la page, un repeint les DETRUIT — et la page ne les
     * retrouve jamais, avec leurs champs et leurs gestionnaires.
     *
     * Signale sur l accueil : on ouvrait « My Wallet », le titre changeait, et
     * le corps montrait le profil. La reponse du profil arrivait apres coup et
     * repeignait la section courante — restee « Overview », puisque emprunter
     * ne change pas d onglet. Le panneau du portefeuille disparaissait de la
     * page au passage. Chaque onglet montrait donc la meme chose.
     *
     * La garde est ICI et non chez les quinze appelants : un appelant qu on
     * oublierait ferait revenir le defaut, et il ne se verrait qu au moment ou
     * une reponse tardive arrive. */
    if (PANNEAU) return;
    if (profOnglet === 'ap') { profEnTete(); return rendApercu(); }
    if (profOnglet === 'am') { profEnTete(); return rendAmis(); }
    if (profOnglet === 'in') { profEnTete(); return rendInvite(); }
    if (profOnglet === 'lb') { profEnTete(); return rendClassement(); }
    if (profOnglet === 'sh') { profEnTete(); return rendBoutique(); }
    if (profOnglet === 'cl') { profEnTete(); return rendClassementFruits(); }
    if (profOnglet === 'mk') { profEnTete(); return rendMarche(); }
    if (profOnglet === 'sk') { profEnTete(); return rendSkins(); }
    if (profOnglet === 'pt') { profEnTete(); return rendAnimaux(); }
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
      /* ---- ELLE SE POSE AU-DESSUS DE LA BARRE, PAS DESSOUS ----
       * `bottom:16px` la mettait a seize pixels du bas de l'ECRAN, c'est-a-dire
       * dans les soixante-deux qu'occupe la barre de navigation. Une bulle de
       * cinquante-six pixels a moitie recouverte, sur toutes les pages du
       * site : on voyait un demi-cercle sortir de la barre, et le clic
       * atteignait la barre. Signale sur le Nexus, ou le demi-cercle se
       * detache sur le jeu, mais le defaut n'a jamais eu de page a lui.
       * `--swbb-h` vaut zero depuis que la barre du bas est retiree, et elle
       * reste publiee : le calcul tient sans changer, et le jour ou une barre
       * revient, la bulle se replace toute seule. C'est exactement ce que `.swtoast` fait vingt
       * lignes plus haut — la lecon etait deja ecrite, elle n'avait pas ete
       * appliquee ici. */
      '.swdb{position:fixed;right:16px;bottom:calc(var(--swbb-h,0px) + 16px);' +
      'z-index:99998;width:56px;height:56px;' +
      'border-radius:50%;cursor:pointer;border:1px solid rgba(27,95,224,.55);' +
      'background:linear-gradient(180deg,rgba(244,247,252,.96),rgba(255,255,255,.98));' +
      'color:#1B5FE0;font-family:inherit;font-size:17px;font-weight:900;letter-spacing:.5px;' +
      'line-height:1;display:flex;align-items:center;' +
      'justify-content:center;box-shadow:0 8px 24px rgba(11,27,54,0.18);' +
      'transition:transform .15s,border-color .15s;}' +
      '.swdb:hover{transform:translateY(-2px);border-color:#FFC53D;}' +
      /* ---- ET LE PORTEFEUILLE, JUSTE AU-DESSUS ----
       * « Rajoute un bouton rond en plus qui ouvre le wallet, comme ca on y a
       *   acces tout le temps sur toutes les pages. »
       * Le meme rond que « VS », pose A SA GAUCHE, sur la meme ligne : meme
       * taille, meme marge, meme calcul avec la barre du bas. A sa gauche et
       * non au-dessus : la bande du bas est deja celle de « VS », que les
       * tiroirs et les panneaux savent eviter ; un rond plus haut recouvrait
       * une rangee du tiroir de profil, et le clic partait vers le
       * portefeuille au lieu d ouvrir la rangee. C est un LIEN, pas un bouton
       * a logique : il mene a la page du portefeuille, ou vivent les deux
       * coffres. Il ne se pose pas sur cette page-la — un bouton qui mene a
       * l endroit ou l on est deja est une invitation a ne pas bouger. */
      '.swwb{position:fixed;right:calc(16px + 56px + 12px);bottom:calc(var(--swbb-h,0px) + 16px);' +
      'z-index:99998;width:56px;height:56px;border-radius:50%;cursor:pointer;' +
      'border:1px solid rgba(27,95,224,.55);text-decoration:none;' +
      'background:linear-gradient(180deg,rgba(244,247,252,.96),rgba(255,255,255,.98));' +
      'font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 8px 24px rgba(11,27,54,0.18);transition:transform .15s,border-color .15s;}' +
      '.swwb:hover{transform:translateY(-2px);border-color:#FFC53D;}' +
      /* ---- LE PORTEFEUILLE S'OUVRE PAR-DESSUS LA PAGE ----
       * « Le bouton a cote de VS ne devait pas faire une redirection au
       *   wallet mais l'ouvrir en grand ecran sur la page, sans la quitter
       *   ni changer d'URL. » Un voile plein ecran porte la page du
       *   portefeuille dans un cadre de notre propre domaine ; la partie en
       *   cours, la socket, le defilement restent derriere, intacts. */
      /* Un TELEPHONE pose en bas a droite, comme le bulletin de la page des
       * paris : la page reste visible et vivante autour, le panneau flotte
       * par-dessus. Il s'arrete au-dessus des deux bulles (84 px = 16 de
       * marge + 56 de bulle + 12 d'ecart), qui restent donc visibles — c'est
       * la bulle qui le range. Z-INDEX sous les bulles, au-dessus du reste. */
      '.swwo{position:fixed;right:16px;bottom:calc(var(--swbb-h,0px) + 84px);z-index:99997;' +
      'width:min(390px,calc(100vw - 32px));height:min(780px,calc(100vh - var(--swbb-h,0px) - 100px));' +
      'border-radius:24px;overflow:hidden;background:#F4F7FC;border:1px solid rgba(27,95,224,.35);' +
      'box-shadow:0 20px 60px rgba(11,27,54,.28);display:none;' +
      'transform:translateY(12px);opacity:0;transition:transform .18s ease-out,opacity .18s ease-out;}' +
      '.swwo.on{display:block;}' +
      '.swwo.vu{transform:translateY(0);opacity:1;}' +
      '.swwo iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#fff;z-index:1;}' +
      /* `pointer-events:auto` en force : certaines pages eteignent les
         evenements de leurs boutons sous un voile, et la croix heritait de
         cette regle — le cadre recevait le clic a sa place. */
      /* ---- ET C'EST LA BULLE QUI LE RANGE ----
       * « Puis on peut le re-ranger dans la bulle. » La bulle ne bouge pas :
       * elle reste sous le panneau, en croix tant qu'il est ouvert. Le meme
       * rond ouvre et referme. */
      'html.swwo-on .swwb{color:#0B1B36;border-color:#FFC53D;pointer-events:auto!important;}' +
      '.swdb .swdn{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;' +
      'border-radius:999px;display:flex;align-items:center;justify-content:center;' +
      'font-family:inherit;font-size:11px;font-weight:900;color:#07101F;background:#16D97F;' +
      'box-shadow:0 0 0 2px rgba(11,27,54,.9);animation:swdPop .3s ease-out;}' +
      '@keyframes swdPop{from{transform:scale(.3);}to{transform:scale(1);}}' +
      '.swdp{position:fixed;left:0;top:0;bottom:0;z-index:99999;width:min(340px,86vw);' +
      'transform:translateX(-102%);transition:transform .22s ease-out;' +
      'background:linear-gradient(180deg,rgba(244,247,252,.99),rgba(244,247,252,.99));' +
      'border-right:1px solid rgba(27,95,224,.35);box-shadow:14px 0 40px rgba(11,27,54,0.18);' +
      'display:flex;flex-direction:column;font-family:inherit;}' +
      '.swdp.on{transform:translateX(0);}' +
      '.swdp h4{margin:0;padding:15px 46px 11px 14px;font-size:12px;letter-spacing:1px;' +
      'text-transform:uppercase;color:#1B5FE0;display:flex;align-items:center;gap:8px;}' +
      '.swdp h4 i{margin-left:auto;font-style:normal;font-size:11px;color:#5F6E88;}' +
      '.swdp .x{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:8px;' +
      'cursor:pointer;border:1px solid rgba(11,27,54,.16);background:rgba(11,27,54,.06);' +
      'color:#0B1B36;font-size:15px;line-height:1;}' +
      '.swdl{flex:1;overflow-y:auto;padding:0 12px 14px;}' +
      '.swdt{display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:8px;' +
      'border-radius:11px;background:rgba(11,27,54,.045);' +
      'border:1px solid rgba(11,27,54,.10);}' +
      '.swdt .ic{flex:0 0 auto;width:34px;height:34px;border-radius:9px;display:flex;' +
      'align-items:center;justify-content:center;font-size:16px;' +
      'background:rgba(27,95,224,.12);border:1px solid rgba(27,95,224,.28);}' +
      '.swdt .w{flex:1;min-width:0;}' +
      '.swdt .w b{display:block;font-size:12.5px;font-weight:800;color:#0B1B36;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swdt .w span{display:block;font-size:10.5px;color:#5F6E88;margin-top:2px;}' +
      /* Meme piege que dans les lignes du profil : « .swdt .w span » l emporte
         sur « .swlv », et la pastille de niveau tombait a la ligne toute seule
         sous le nom. On redit donc ici, a specificite egale, ce qu elle est. */
      '.swdt .w span.swlv,.swdt .w b span.swlv{display:inline-block;width:auto;' +
      'margin-top:0;font-size:10px;}' +
      '.swdt button{flex:0 0 auto;padding:7px 12px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:800;color:#07101F;border:0;' +
      'background:linear-gradient(180deg,#FFE08A,#FFC53D);}' +
      '.swdt.mienne{border-color:rgba(27,95,224,.45);background:rgba(27,95,224,.07);}' +
      '.swdt.mienne button{background:rgba(11,27,54,.10);color:#5F6E88;cursor:default;}' +
      '.swdt button.gh{background:linear-gradient(180deg,#8FD3FF,#3FA9F5);}' +
      /* Le titre de section : les parties en cours ne sont pas des defis a
         relever, il ne faut pas melanger les deux listes. */
      '.swdh{margin:14px 0 8px;font-size:10.5px;letter-spacing:1.1px;font-weight:800;' +
      'text-transform:uppercase;color:#5F6E88;}' +
      /* Le plateau du spectateur. */
      '.swdw{margin:0 0 12px;border-radius:12px;overflow:hidden;' +
      'background:rgba(63,169,245,.07);border:1px solid rgba(63,169,245,.34);}' +
      '.swdw .hd{display:flex;align-items:center;gap:8px;padding:9px 10px;' +
      'border-bottom:1px solid rgba(11,27,54,.08);}' +
      '.swdw .hd b{flex:1;min-width:0;font-size:12px;font-weight:800;color:#0B1B36;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.swdw .hd .x{position:relative;width:24px;height:24px;font-size:13px;flex:0 0 auto;touch-action:manipulation;}' +
      /* La croix mesurait 24 px de cote : on agrandit la ZONE SENSIBLE a 44 sans toucher au dessin, avec un pseudo-element centre. Grossir le bouton lui-meme aurait pousse le titre du tiroir. */
      '.x::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%);}' +
      '.swdw .gr{display:grid;gap:3px;padding:8px;}' +
      '.swdw .c{display:block;width:100%;aspect-ratio:1/1;border-radius:50%;' +
      'background:rgba(11,27,54,.05);border:1px solid rgba(11,27,54,.08);}' +
      '.swdw .gr.jmp .c{border-radius:5px;}' +
      '.swdw .c.sq{background:rgba(11,27,54,.05);}' +
      '.swdw .c.p1{background:linear-gradient(180deg,#FFE08A,#FFC53D);border-color:#FFC53D;}' +
      '.swdw .c.p2{background:linear-gradient(180deg,#8FD3FF,#3FA9F5);border-color:#3FA9F5;}' +
      '.swdw .c.dame{box-shadow:inset 0 0 0 3px rgba(11,27,54,.55);}' +
      '.swdw .c.win{box-shadow:0 0 0 2px #7CE3A0;}' +
      '.swdw .st{padding:8px 10px;border-top:1px solid rgba(11,27,54,.08);' +
      'font-size:11px;font-weight:700;color:#5F6E88;}' +
      '.swdw .st.fin{color:#0E7C3E;}' +
      '.swdv{padding:22px 14px;text-align:center;font-size:12px;line-height:1.7;color:#5F6E88;}' +
      '.swdp .pied{padding:11px 14px;border-top:1px solid rgba(11,27,54,.08);' +
      'font-size:11px;line-height:1.6;color:#5F6E88;}' +
      '.swdp .pied a{color:#1B5FE0;text-decoration:none;}' +
      '@media (max-width:520px){.swdb{width:48px;height:48px;font-size:20px;right:12px;' +
      'bottom:calc(var(--swbb-h,0px) + 12px);}' +
      '.swwb{width:48px;height:48px;font-size:21px;right:calc(12px + 48px + 10px);' +
      'bottom:calc(var(--swbb-h,0px) + 12px);}' +
      /* Sur un telephone, le panneau prend la largeur et s'arrete au-dessus
         des bulles (12 + 48 + 10 = 70 px), comme le bulletin des paris. */
      '.swwo{right:8px;left:8px;width:auto;bottom:calc(var(--swbb-h,0px) + 70px);' +
      'height:auto;top:calc(8px + env(safe-area-inset-top,0px));border-radius:20px;}}';
    document.head.appendChild(c);
  }

  /* ---- DANS UN CADRE, PAS DE BULLES ----
     La page du portefeuille s'ouvre dans un cadre par-dessus la page ou l'on
     joue. Si elle montait ses propres bulles la-dedans, on verrait deux
     « VS » a l'ecran, l'une sur l'autre — et un rond de portefeuille qui
     ouvrirait un portefeuille dans le portefeuille. */
  function enCadre() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }

  /* Le rond du portefeuille, a gauche de « VS ». Voir la note du style. */
  var walletBtn = null, walletVoile = null, walletCadre = null, walletOuvert = false;
  function walletMonte() {
    if (walletBtn || !document.body) return;
    if (/swoge_wallet\.html$/i.test(String(location.pathname || ''))) return;
    if (enCadre()) return;
    walletBtn = document.createElement('button');
    walletBtn.className = 'swwb';
    walletBtn.type = 'button';
    walletBtn.title = 'Open your wallet';
    walletBtn.setAttribute('aria-label', 'Open your wallet');
    walletBtn.setAttribute('aria-expanded', 'false');
    walletBtn.innerHTML = '\uD83D\uDC5B';
    walletBtn.addEventListener('click', function () { walletBascule(); });
    document.body.appendChild(walletBtn);
  }
  /* Le voile et son cadre ne sont fabriques qu'au premier clic : charger la
     page du portefeuille — sa bibliotheque de chaine, ses lectures de solde —
     sur chaque page du site pour un bouton que la plupart n'ouvrent pas
     serait payer a chaque visite ce que l'on n'utilise qu'une fois. Une fois
     ouvert, le cadre RESTE : refermer puis rouvrir ne recharge rien, les
     soldes deja lus sont encore la. */
  function walletVoileMonte() {
    if (walletVoile) return walletVoile;
    walletVoile = document.createElement('div');
    walletVoile.className = 'swwo';
    walletVoile.setAttribute('role', 'dialog');
    walletVoile.setAttribute('aria-label', 'Your wallet');
    walletCadre = document.createElement('iframe');
    walletCadre.title = 'SWOGE Wallet';
    walletCadre.setAttribute('allow', 'clipboard-write; clipboard-read; camera');
    walletVoile.appendChild(walletCadre);
    document.body.appendChild(walletVoile);
    document.addEventListener('keydown', function (e) {
      if (walletOuvert && (e.key === 'Escape' || e.key === 'Esc')) walletBascule(false);
    });
    return walletVoile;
  }
  function walletBascule(v) {
    if (!walletBtn) return;
    walletOuvert = v === undefined ? !walletOuvert : !!v;
    var voile = walletVoileMonte();
    /* L'adresse du cadre n'est posee qu'a l'ouverture, et une seule fois. */
    if (walletOuvert && !walletCadre.getAttribute('src')) walletCadre.src = 'swoge_wallet.html';
    voile.classList.toggle('on', walletOuvert);
    /* Deux temps pour l'animation : `display` d'abord, la transition ensuite. */
    if (walletOuvert) requestAnimationFrame(function () { voile.classList.add('vu'); });
    else voile.classList.remove('vu');
    document.documentElement.classList.toggle('swwo-on', walletOuvert);
    walletBtn.setAttribute('aria-expanded', walletOuvert ? 'true' : 'false');
    walletBtn.innerHTML = walletOuvert ? '\u2715' : '\uD83D\uDC5B';
    walletBtn.title = walletOuvert ? 'Close the wallet' : 'Open your wallet';
    walletBtn.setAttribute('aria-label', walletBtn.title);
    /* Le clavier reste a la page hote : c'est elle qui ecoute Echap. Donner
       le foyer au cadre l'emmenerait dans le portefeuille, et Echap n'y
       fermerait plus rien. */
    if (!walletOuvert) { try { walletBtn.focus(); } catch (e) {} }
  }

  function duelsMonte() {
    if (duelsBtn) return true;
    if (!document.body) return false;
    if (enCadre()) return false;
    duelsStyle();
    duelsBtn = document.createElement('button');
    duelsBtn.className = 'swdb';
    duelsBtn.type = 'button';
    duelsBtn.title = 'Open 1v1 matches';
    duelsBtn.innerHTML = 'VS';
    duelsBtn.addEventListener('click', function () { duelsBascule(); });
    document.body.appendChild(duelsBtn);
    walletMonte();
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
  /* ?open=sh arrive depuis le Nexus (l'etal du marchand, la porte du vault…) :
     un lieu du decor pointe directement sur l'onglet du tiroir qu'il
     represente, au lieu de laisser le joueur le rechercher lui-meme. On
     efface le parametre apres coup, comme `?join=`, pour qu'un partage ou un
     retour arriere ne rouvre pas le tiroir tout seul. */
  function ouvreOngletDepuisURL() {
    var k = null;
    try { k = new URLSearchParams(location.search).get('open'); } catch (e) {}
    if (!k) return;
    try {
      var u = new URL(location.href);
      u.searchParams.delete('open');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
    profOuvre();
    profVa(k);
  }
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
