/*
 * LE NEXUS, MULTIJOUEUR.
 *
 * ---- ce que c'est ----
 *
 * Un hall calme entre les parties : une fontaine au centre, un etal qui mene
 * a la boutique, une porte qui mene au coffre du personnage, un portail qui
 * mene au hall des jeux. Le joueur s'y promene avec le skin qu'il porte
 * deja, et entre dans chaque lieu en marchant dessus — comme dans RotMG, pas
 * en cliquant un bouton. Les autres joueurs presents s'y promenent aussi,
 * sous nos yeux : c'est le sens meme d'un hall — un endroit ou l'on se
 * croise, pas une piece vide qu'on visite seul.
 *
 * ---- comment la position circule ----
 *
 * Le client envoie sa position au clavier, quelques fois par seconde — pas a
 * chaque trame, ca n'apporterait rien de plus au reseau. Le serveur ne fait
 * confiance a AUCUN champ « skin » venu du client : il diffuse celui qu'il
 * connait deja (`skinActif`), pour qu'un joueur ne puisse pas se deguiser en
 * un personnage qu'il ne possede pas aux yeux des autres. En retour, un
 * instantane COMPLET arrive plusieurs fois par seconde — pas des evenements
 * d'entree/sortie a tenir a jour : qui n'y est plus n'apparait simplement
 * plus dans l'instantane suivant.
 *
 * ---- pourquoi on espionne le constructeur WebSocket ----
 *
 * Meme raison qu'entrainement.js : la socket vit dans une variable privee de
 * stakebubble.js, et ce qu'il nous faut — savoir quel skin est actif, envoyer
 * et recevoir les positions — ne justifie pas de modifier ce fichier de trois
 * mille lignes pour l'exposer. On remplace le constructeur avant que la page
 * ne s'en serve, et on ajoute un ecouteur A COTE du sien : si ce fichier ne
 * chargeait pas, le reste du site continuerait de fonctionner a l'identique.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('nxCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ------------------------------------------------------- la socket

  var SOCK = null;
  (function espionne() {
    var Vrai = window.WebSocket;
    if (!Vrai || Vrai.__swEntraine) return;
    function Espion(url, protos) {
      var s = (protos === undefined) ? new Vrai(url) : new Vrai(url, protos);
      SOCK = s;
      try { s.addEventListener('message', ecoute); } catch (e) {}
      return s;
    }
    Espion.prototype = Vrai.prototype;
    Espion.CONNECTING = Vrai.CONNECTING; Espion.OPEN = Vrai.OPEN;
    Espion.CLOSING = Vrai.CLOSING; Espion.CLOSED = Vrai.CLOSED;
    Espion.__swEntraine = true;
    window.WebSocket = Espion;
  })();

  function envoie(o) {
    if (SOCK && SOCK.readyState === 1) { SOCK.send(JSON.stringify(o)); return true; }
    return false;
  }

  var MON_ADRESSE = null;     // la notre, pour se filtrer soi-meme des instantanes recus
  var enLigne = false;        // connecte ET entre dans le Nexus : on peut emettre notre position
  var chronoEnvoi = 0, ENVOI_INTERVAL = 0.12;
  var demande = false;
  function ecoute(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === 'auth' && !demande) {
      demande = true;
      MON_ADRESSE = String(m.address || '').toLowerCase();
      envoie({ type: 'skins' });
      envoie({ type: 'nexusJoin' });
      envoie({ type: 'profile' });
      enLigne = true;
    }
    /* ---- DEUX QUESTIONS DIFFERENTES, DEUX CONDITIONS ----
     *
     * « Faut-il changer de sprites ? » et « faut-il demander la fiche ? » ne
     * se posent pas au meme moment. Elles etaient fondues dans un seul
     * `m.actif !== PERSO`, et ca cassait le cas le plus courant : `PERSO`
     * vaut « andy » par defaut, donc un joueur qui porte JUSTEMENT Andy
     * tombait dans « rien n'a change » — et sa fiche n'etait jamais
     * demandee. Panneau vide, sans une erreur nulle part. */
    if (m.type === 'skins') {
      SKIN_POSSEDE = !!m.actif;
      if (m.actif && PERSONNAGES[m.actif]) {
        if (m.actif !== PERSO) { PERSO = m.actif; assureCharge(PERSO); }
        /* Demande a CHAQUE reponse `skins`, meme si le skin n'a pas bouge :
           c'est aussi ce message qui revient apres un achat ou un changement
           de tenue, et la fiche a pu changer sans que le skin change. */
        envoie({ type: 'personnage', skin: PERSO });
        envoie({ type: 'equipable' });
      } else {
        /* Aucun skin porte : il n'y a pas de fiche a montrer, et c'est une
           reponse legitime — pas une panne. Le panneau le dira. */
        FICHE = null; SAC = [];
      }
      peintPanneau();
    }
    /* Notre nom vient du profil. On le demande une fois : le panneau
       l'affiche en tete, comme la fiche d'origine. */
    if (m.type === 'profile' && m.profile) { MON_NOM = m.profile.name || null; peintPanneau(); }
    if (m.type === 'personnage' && m.etat && m.etat.skin === PERSO) {
      /* Le niveau qui MONTE s'entend. On compare a celui d'avant plutot
         que d'attendre un message dedie : la fiche arrive de toute facon
         et porte deja la reponse. Le PREMIER envoi ne sonne pas — on ne
         « monte » pas au niveau qu'on avait deja en arrivant. */
      var avantNiv = FICHE ? FICHE.niveau : null;
      FICHE = m.etat;
      if (avantNiv !== null && m.etat.niveau > avantNiv) joueSample('niveau', { vol: 0.9 });
      peintPanneau(); if (coffreOuvert) peintCoffreMenu();
    }
    if (m.type === 'equipable') {
      /* Le SAC est ce que le serveur envoie sous `sac` — le butin ramasse —
         et RIEN d'autre. Il contenait auparavant tout ce qu'on possede
         d'equipable, c'est-a-dire le contenu du COFFRE : ca montrait les
         achats a un endroit ou ils ne sont pas, et laissait croire qu'ils
         partaient avec le personnage. */
      SAC = m.sac || [];
      /* Les quatre listes SONT le coffre : ce que la boutique nous a vendu.
         Le panneau n'en montre que le sac ; la salle du coffre, elle, les
         pose au sol. On les garde donc au lieu de les jeter. */
      COFFRE = { fruits: m.fruits || [], armes: m.armes || [],
                 armures: m.armures || [], bagues: m.bagues || [] };
      coffreErreur = m.error || '';
      if (coffreOuvert) peintCoffreMenu();
      peintPanneau();
    }
    /* La reponse de la boutique. `gagne` n'arrive qu'apres une ouverture :
       c'est le seul moment ou l'on a quelque chose a annoncer. */
    if (m.type === 'shop') {
      BOUTIQUE = m;
      if (m.catalogue && m.catalogue.saison) shopSaison = m.catalogue.saison;
      if (m.error) shopMsg = { texte: m.error, ok: false };
      else if (m.gagne && m.gagne.item) {
        /* Le nom LISIBLE de la rarete vit dans le catalogue ; l'objet ne
           porte que sa cle (« mythique »). On traduit ici plutot que
           d'ecrire une seconde table de correspondance. */
        var rar = (m.catalogue && m.catalogue.raretes || [])
          .filter(function (r) { return r.cle === m.gagne.rarete; })[0];
        shopMsg = { texte: '\u2728 ' + (m.gagne.item.nom || 'New item') +
                           (rar ? ' \u2014 ' + rar.nom : '') +
                           ' \u00b7 waiting in your vault', ok: true };
        /* Le coffre vient de changer : on le redemande, sinon le menu du
           coffre montrerait encore l'inventaire d'avant l'achat. */
        if (enLigne) envoie({ type: 'equipable' });
      } else shopMsg = '';
      if (shopOuvert) peintShop();
    }
    if (m.type === 'nexusEtat') majJoueursDistants(m.joueurs || []);
    /* Le solde suit n'importe quel message qui le porte — pas seulement
       `auth` — exactement comme `poseSolde` le fait pour le reste du site :
       un achat de skin ou de coffre depuis le tiroir, ouvert par-dessus le
       Nexus, doit mettre a jour le chiffre affiche ici sans recharger la page. */
    if (m.balance != null) majSolde(m.balance);
  }

  var soldeEl = document.getElementById('nxSolde');
  /* Le solde MIS EN FORME, garde a part : la boutique l'affiche aussi, et
     refaire la mise en forme la-bas donnerait deux facons d'ecrire le meme
     nombre — « 8.97M » d'un cote, « 8 973 000 » de l'autre. */
  var SOLDE_TEXTE = '';
  function majSolde(v) {
    var n = parseFloat(v || 0);
    if (isNaN(n)) return;
    var t = n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(2);
    SOLDE_TEXTE = t + ' $SWOGE';
    if (shopOuvert) peintShop();
    if (!soldeEl) return;
    soldeEl.innerHTML = '<b>' + t + '</b><em>$SWOGE</em>';
    soldeEl.classList.add('on');
  }

  // ================== LE PANNEAU DU PERSONNAGE ==================

  var MON_NOM = null;      // le pseudo du profil
  var FICHE = null;        // la reponse `personnage` du skin porte
  var SAC = [];            // le butin ramasse dans le monde (pas le coffre)
  var SKIN_POSSEDE = true; // faux tant qu'on n'a achete aucun personnage

  var elNom = document.getElementById('nxNom');
  var elVignette = document.getElementById('nxVignette');
  var elLvl = document.getElementById('nxLvl'), elLvlJauge = document.getElementById('nxLvlJauge');
  var elXp = document.getElementById('nxXp');
  var elHp = document.getElementById('nxHp'), elMp = document.getElementById('nxMp');
  var elStats = document.getElementById('nxStats');
  var elEquip = document.getElementById('nxEquip'), elSac = document.getElementById('nxSac');
  var elGens = document.getElementById('nxGens');
  var elVide = document.getElementById('nxVide');
  var enveloppe = document.getElementById('nxWrap');

  /* Replier le panneau. L'etat se garde d'une visite a l'autre : sur
     telephone, quelqu'un qui l'a range ne veut pas le retrouver deplie a
     chaque retour au Nexus. */
  (function poseBascule() {
    var b = document.getElementById('nxBascule');
    if (!b || !enveloppe) return;
    var CLE = 'swogeNexusPanneauReplie';
    try { if (localStorage.getItem(CLE) === '1') enveloppe.classList.add('replie'); } catch (e) {}
    /* `#nxCoffreVoile` vit HORS de `#nxWrap` : un selecteur descendant ne
       l'atteindrait pas. On recopie donc l'etat sur le <body>, qui les
       contient tous les deux. */
    var suitRepli = function () {
      document.body.classList.toggle('nxreplie', enveloppe.classList.contains('replie'));
    };
    suitRepli();
    /* On place le bouton d'apres la largeur MESUREE du panneau, pas d'apres
       la variable CSS : les deux different des qu'une barre de defilement
       s'intercale, et le bouton finissait par recouvrir la premiere lettre de
       chaque stat. Mesurer, c'est etre juste a toutes les tailles d'ecran
       sans avoir de decalage a deviner. */
    var ECART = 10;
    function place() {
      var pan = document.getElementById('nxPanneau');
      if (!pan) return;
      var replie = enveloppe.classList.contains('replie');
      var l = replie ? 0 : pan.getBoundingClientRect().width;
      b.style.right = (l + ECART) + 'px';
    }
    b.addEventListener('click', function () {
      var replie = enveloppe.classList.toggle('replie');
      suitRepli();
      b.setAttribute('aria-label', replie ? 'Show panel' : 'Hide panel');
      try { localStorage.setItem(CLE, replie ? '1' : '0'); } catch (e) {}
      place();
    });
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    place();
    b.setAttribute('aria-label',
      enveloppe.classList.contains('replie') ? 'Show panel' : 'Hide panel');
  })();

  /* Les six attributs de la grille. HP et MP n'y sont pas : ils ont leurs
     barres au-dessus, et les repeter en chiffres ferait dire deux fois la
     meme chose a deux endroits. L'ordre est celui de la fiche d'origine. */
  var ATTRIBUTS = ['att', 'def', 'spd', 'dex', 'vit', 'wis'];
  var NOM_ATTR = { att: 'ATT', def: 'DEF', spd: 'SPD', dex: 'DEX', vit: 'VIT', wis: 'WIS' };
  /* Les quatre emplacements, dans l'ordre de l'image : arme, armure, fruit,
     bague — ce que l'on tient, ce que l'on porte, puis les deux bijoux. */
  var EMPLACEMENTS = ['equipArme', 'equipArmure', 'equipFruit', 'equipBague'];
  var CASES_SAC = 8;

  function ech(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function court(a) { return a ? a.slice(0, 6) : '—'; }

  /** La somme des bonus d'equipement qui visent UNE stat. La fiche rend deja
      le total dans `stats`, mais pas le detail : sans ce calcul on ne pourrait
      pas dire « 80 (+30) », seulement « 80 » — et un objet equipe ne se
      verrait nulle part. */
  /* `bonus` est un OBJET {stat: valeur} : un objet touche plusieurs stats a
     la fois. On somme donc ce que chaque piece donne sur CETTE stat, au lieu
     de ne regarder que sa stat principale — sinon le +130 MP d'un casque
     n'apparaitrait nulle part, alors qu'il compte dans le total. */
  function bonusPour(stat) {
    if (!FICHE) return 0;
    var t = 0;
    EMPLACEMENTS.forEach(function (k) {
      var e = FICHE[k];
      if (e && e.bonus) t += (e.bonus[stat] || 0);
    });
    return t;
  }

  /** Le detail d'un objet, en une ligne — « +14 DEX, +8 SPD ». Sert
      d'infobulle : la case est trop petite pour tout montrer, mais rien ne
      doit rester invisible. */
  function detailBonus(e) {
    if (!e || !e.bonus) return '';
    var out = [];
    for (var s in e.bonus) if (e.bonus[s]) out.push('+' + e.bonus[s] + ' ' + s.toUpperCase());
    if (e.degats) out.push('dmg ' + e.degats[0] + '-' + e.degats[1]);
    return out.join(', ');
  }

  /** La valeur montree sur la case : la PLUS GROSSE du profil. Afficher la
      somme n'aurait pas de sens (10 points de sagesse et 130 de mana ne
      s'ajoutent pas), et afficher la stat principale seule mentirait sur un
      objet dont une autre stat pese davantage en chiffres. */
  function bonusEnTete(e) {
    if (!e || !e.bonus) return 0;
    var max = 0;
    for (var s in e.bonus) if (e.bonus[s] > max) max = e.bonus[s];
    return max;
  }

  /* ================== PRENDRE ET DEPOSER ==================
   *
   * Le menu du coffre avait des boutons « store » et une fleche. Ca marche,
   * mais ce n'est pas le geste : on veut ATTRAPER un objet et le poser ou on
   * le veut — dans le sac, sur un emplacement, dans le coffre.
   *
   * On n'utilise PAS le glisser-deposer natif du navigateur : il ne repond
   * pas au doigt, et la moitie des joueurs sont sur telephone. On suit le
   * POINTEUR, qui couvre les deux d'un seul code.
   *
   * Trois origines et trois destinations, et toutes les combinaisons ne se
   * valent pas :
   *   coffre  -> emplacement : on s'equipe
   *   coffre  -> sac         : on ressort la piece (elle redevient perissable)
   *   sac     -> coffre      : on la met a l'abri
   *   sac     -> emplacement : il faut d'abord la ranger — deux messages,
   *                            dans l'ordre, sur la meme socket
   *   equipe  -> sac         : on la retire PUIS on la ressort
   *   equipe  -> coffre      : on la retire, elle y est deja
   */
  var PRISE = null, elFantome = null;

  function familleDuSlot(k) {
    return { equipFruit: 'equipeFruit', equipArme: 'equipeArme',
             equipArmure: 'equipeArmure', equipBague: 'equipeBague' }[k];
  }
  /** L'emplacement auquel un objet appartient, d'apres sa saison. */
  function slotDeLObjet(id) {
    var t = null;
    ['fruits', 'armes', 'armures', 'bagues'].forEach(function (champ, i) {
      if (t) return;
      if (((COFFRE && COFFRE[champ]) || []).some(function (o) { return o.id === id; })) {
        t = ['equipFruit', 'equipArme', 'equipArmure', 'equipBague'][i];
      }
    });
    if (t) return t;
    // pas au coffre : on cherche dans le sac, par la saison de l'objet
    var o = (SAC || []).filter(function (x) { return x.id === id; })[0];
    if (!o) return null;
    return { 1: 'equipFruit', 2: 'equipArme', 3: 'equipArmure', 4: 'equipBague' }[o.saison] || null;
  }

  function ouEstLePointeur(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el) {
      if (el.id === 'nxSac') return { quoi: 'sac' };
      if (el.id === 'nxEquip' || (el.dataset && el.dataset.slot)) {
        var c = el.closest ? el.closest('[data-slot]') : null;
        return { quoi: 'equip', slot: c ? c.dataset.slot : null };
      }
      if (el.id === 'nxCoffreVoile' || (el.classList && el.classList.contains('nxcf-carte'))) {
        return { quoi: 'coffre' };
      }
      el = el.parentElement;
    }
    return null;
  }

  function lachePrise(x, y) {
    var cible = ouEstLePointeur(x, y);
    var p = PRISE;
    finPrise();
    if (!p || !cible) return;
    var id = p.id;
    if (cible.quoi === 'equip') {
      /* L'objet va dans SA case, pas dans celle qu'on a visee. Viser juste
         n'a aucun interet — un fruit ne peut aller nulle part ailleurs que
         dans l'emplacement fruit — et le serveur refuse de toute facon un
         fruit envoye au slot d'arme. Lacher n'importe ou sur l'equipement
         doit donc suffire. */
      var slot = slotDeLObjet(id) || cible.slot;
      var msg = familleDuSlot(slot);
      if (!msg) return;
      /* Depuis le SAC, il faut ranger d'abord : le serveur ne s'equipe que
         depuis le coffre. Deux messages a la suite sur la meme socket, dans
         l'ordre — ce n'est pas un contournement, c'est la sequence reelle. */
      if (p.de === 'sac') envoie({ type: 'rangeCoffre', item: id });
      envoie({ type: msg, skin: PERSO, item: id });
      clic(true);
    } else if (cible.quoi === 'sac') {
      if (p.de === 'sac') return;
      if (p.de === 'equip') envoie({ type: familleDuSlot(p.slot), skin: PERSO, item: null });
      envoie({ type: 'sortCoffre', item: id });
      clic(true);
    } else if (cible.quoi === 'coffre') {
      if (p.de === 'sac') { envoie({ type: 'rangeCoffre', item: id }); clic(true); }
      else if (p.de === 'equip') { envoie({ type: familleDuSlot(p.slot), skin: PERSO, item: null }); clic(true); }
    }
  }

  function finPrise() {
    if (elFantome) { elFantome.remove(); elFantome = null; }
    PRISE = null;
    document.body.classList.remove('nxdrag');
  }

  function debutPrise(ev, source) {
    PRISE = source;
    document.body.classList.add('nxdrag');
    elFantome = document.createElement('img');
    elFantome.className = 'nxp-fantome';
    elFantome.src = source.src || '';
    document.body.appendChild(elFantome);
    bougePrise(ev.clientX, ev.clientY);
    clic(false);
  }
  function bougePrise(x, y) {
    if (elFantome) { elFantome.style.left = x + 'px'; elFantome.style.top = y + 'px'; }
  }

  /* UN seul couple d'ecouteurs sur le document, pas un par case : les cases
     sont refaites a chaque peinture du panneau, et des ecouteurs poses sur
     elles disparaitraient avec. */
  document.addEventListener('pointerdown', function (ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    var el = ev.target.closest ? ev.target.closest('[data-sac],[data-item],[data-slot]') : null;
    if (!el) return;
    /* Le bouton « reprendre » du menu garde son propre geste : on ne le
       transforme pas en poignee de glissement. */
    if (ev.target.classList && ev.target.classList.contains('nxcf-sortir')) return;
    var img = el.querySelector('img');
    var src = img ? img.getAttribute('src') : '';
    if (el.dataset.sac) {
      debutPrise(ev, { de: 'sac', id: Number(el.dataset.sac), src: src });
    } else if (el.dataset.slot && el.dataset.item) {
      debutPrise(ev, { de: 'equip', slot: el.dataset.slot, id: Number(el.dataset.item), src: src });
    } else if (el.dataset.item && el.classList.contains('nxcf-i')) {
      debutPrise(ev, { de: 'coffre', id: Number(el.dataset.item), src: src });
    } else return;
    ev.preventDefault();
  });
  document.addEventListener('pointermove', function (ev) {
    if (PRISE) { bougePrise(ev.clientX, ev.clientY); ev.preventDefault(); }
  });
  document.addEventListener('pointerup', function (ev) {
    if (PRISE) lachePrise(ev.clientX, ev.clientY);
  });
  document.addEventListener('pointercancel', finPrise);

  function peintPanneau() {
    // ---- le nom et sa vignette
    if (elNom) elNom.textContent = MON_NOM || court(MON_ADRESSE) || '—';
    if (elVignette) {
      elVignette.src = 'img/skins/skin_' + encodeURIComponent(PERSO) + '.webp';
      elVignette.onerror = function () { elVignette.style.visibility = 'hidden'; };
    }

    // ---- les trois barres
    if (FICHE) {
      var plein = FICHE.xpProchain
        ? Math.max(0, Math.min(100, Math.round(
            (FICHE.xp - FICHE.xpNiveau) * 100 / (FICHE.xpProchain - FICHE.xpNiveau))))
        : 100;
      elLvl.textContent = 'Lvl ' + FICHE.niveau;
      elLvlJauge.style.width = plein + '%';
      elXp.textContent = FICHE.xpProchain ? plein + '%' : 'MAX';
      /* La barre lit les PV COURANTS, pas le plafond — le meme nombre que
         le repli automatique. Deux lectures separees finiraient par
         diverger, et on se replierait a un pourcentage que la barre ne
         montre pas. Rien ne fait encore de degats, donc `pv` vaut `max` :
         c'est exact, ce n'est pas un chiffre invente. */
      poseVieMax(FICHE.stats.hp, FICHE.stats.mp);
      elHp.textContent = VIE.pv;
      elMp.textContent = VIE.mp;
    } else {
      elLvl.textContent = 'Lvl —'; elLvlJauge.style.width = '0%';
      elXp.textContent = ''; elHp.textContent = ''; elMp.textContent = '';
    }
    /* Un panneau vide sans raison se lit comme une panne. Celui qui n'a pas
       encore de personnage doit lire ce qui lui manque, et pouvoir y aller
       d'un geste — c'est la seule chose a faire depuis cet ecran-la. */
    if (elVide) {
      /* `display:'block'` explicitement, PAS `''` : la regle de base de
         `.nxp-vide` est `display:none`, donc effacer le style en ligne
         rendrait la main a cette regle-la et le message resterait cache —
         ecrit, mais invisible. */
      if (!SKIN_POSSEDE) {
        elVide.innerHTML = 'No character yet — <a href="games.html?open=sk">pick one</a> to get stats and gear.';
        elVide.style.display = 'block';
      } else if (!FICHE) {
        elVide.textContent = 'Loading your character…';
        elVide.style.display = 'block';
      } else elVide.style.display = 'none';
    }

    // ---- les six attributs
    elStats.innerHTML = ATTRIBUTS.map(function (k) {
      if (!FICHE) return '<div class="nxp-st">' + NOM_ATTR[k] + ' - <b>—</b></div>';
      var b = bonusPour(k);
      return '<div class="nxp-st' + (b ? ' up' : '') + '">' + NOM_ATTR[k] +
        ' - <b>' + FICHE.stats[k] + '</b>' + (b ? ' <u>(+' + b + ')</u>' : '') + '</div>';
    }).join('');

    // ---- les quatre cases d'equipement
    elEquip.innerHTML = EMPLACEMENTS.map(function (k) {
      var e = FICHE && FICHE[k];
      /* La case porte son EMPLACEMENT meme vide : c'est ce qui permet d'y
         lacher une piece, et une case vide est justement celle ou l'on veut
         deposer. */
      if (!e) return '<div class="nxp-c vide" data-slot="' + k + '"></div>';
      return '<div class="nxp-c" data-slot="' + k + '" data-item="' + e.item + '"' +
        ' title="' + ech(e.nom + ' — ' + detailBonus(e)) + '">' +
        '<img alt="" src="img/shop/' + encodeURIComponent(e.cle) + '.webp" ' +
        'onerror="this.style.visibility=\'hidden\'">' +
        '<b>+' + bonusEnTete(e) + '</b></div>';
    }).join('');

    // ---- le sac : le butin ramasse, pas les achats
    var cases = [];
    for (var i = 0; i < CASES_SAC; i++) {
      var o = SAC[i];
      cases.push(o
        ? '<div class="nxp-c" data-sac="' + o.id + '" title="' + ech(o.nom + ' — ' + detailBonus(o)) + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" ' +
          'onerror="this.style.visibility=\'hidden\'">' +
          '<b>+' + bonusEnTete(o) + '</b></div>'
        : '<div class="nxp-c vide"><u>' + (i + 1) + '</u></div>');
    }
    elSac.innerHTML = cases.join('');

    peintGens();
  }

  /** Les joueurs a portee, en bas du panneau. Le nombre ne suffit pas : on
      veut savoir QUI est la, c'est tout l'interet d'un lieu de rencontre. */
  function peintGens() {
    if (!elGens) return;
    var l = Object.keys(DISTANTS).map(function (a) { return DISTANTS[a]; });
    if (!l.length) {
      elGens.innerHTML = '<i class="nxp-seul">Nobody else around.</i>';
      return;
    }
    elGens.innerHTML = l.slice(0, 12).map(function (d) {
      return '<div class="nxp-g" title="' + ech(d.nom || d.addr) + '">' +
        '<img alt="" src="img/skins/skin_' + encodeURIComponent(d.skin) + '.webp" ' +
        'onerror="this.style.visibility=\'hidden\'">' +
        '<span>' + ech(d.nom || court(d.addr)) + '</span></div>';
    }).join('');
  }

  // ------------------------------------------------------- les personnages
  //
  // Cinq sont stockes en bande — vingt-cinq images de 256px cote a cote sur
  // une seule ligne. OG Swoge depasse la largeur maximale d'un WebP une fois
  // mis bout a bout (16384px pour 16383 autorises) et reste donc en grille
  // huit par huit. Les deux formes se lisent avec la meme formule, seul le
  // nombre de colonnes change.

  var PERSONNAGES = {
    andy: { disposition: 'bande', images: 25 },
    claude: { disposition: 'bande', images: 25 },
    brett: { disposition: 'bande', images: 25 },
    landwolf: { disposition: 'bande', images: 25 },
    pepe: { disposition: 'bande', images: 25 },
    ogswoge: { disposition: 'grille', images: 64, colonnes: 8 },
  };
  var CADRE = 256;
  var ANIMS = ['idle', 'run', 'jump'];
  var DIRS = ['up', 'down', 'left', 'right'];

  var PERSO = 'andy';              // notre skin, avant meme la reponse du serveur
  /* Un cache par personnage, pas un seul jeu d'images pour « le » personnage
     affiche : le Nexus montre potentiellement les six a la fois, le notre et
     ceux des joueurs croises. `assureCharge` demarre le chargement au premier
     besoin et le rend telle quelle ensuite — jamais deux fois pour le meme. */
  var SPRITES = {};                // { cle: { images: {anim_dir: Image}, pret: bool } }
  function assureCharge(cle) {
    var s = SPRITES[cle];
    if (s) return s;
    s = SPRITES[cle] = { images: {}, pret: false };
    var restant = ANIMS.length * DIRS.length, echoue = false;
    ANIMS.forEach(function (a) {
      DIRS.forEach(function (d) {
        var img = new Image();
        img.onload = function () {
          restant--;
          /* Toutes les DOUZE a la fois, pas une par une : sinon un
             personnage a moitie charge se dessinerait avec un pied idle et
             un pied qui court, le temps que le reste arrive. */
          if (restant === 0 && !echoue) s.pret = true;
        };
        img.onerror = function () { echoue = true; };
        img.src = 'img/nexus/' + cle + '/' + a + '_' + d + '.webp';
        s.images[a + '_' + d] = img;
      });
    });
    return s;
  }
  assureCharge(PERSO);

  function rectangleCadre(cle, indice) {
    var c = PERSONNAGES[cle];
    if (c.disposition === 'grille') {
      var col = indice % c.colonnes, rangee = Math.floor(indice / c.colonnes);
      return { sx: col * CADRE, sy: rangee * CADRE };
    }
    return { sx: indice * CADRE, sy: 0 };
  }

  // ------------------------------------------------------- le decor

  var TUILE = 128;
  var CARTE = { cols: 20, rows: 15 };            // 2560 x 1920
  var MONDE = { w: CARTE.cols * TUILE, h: CARTE.rows * TUILE };
  var CENTRE = { x: MONDE.w / 2, y: MONDE.h / 2 - 32 };

  var TUILES = { herbe: new Image(), chemin: new Image() };
  TUILES.herbe.src = 'img/nexus/tiles/ground_grass.webp';
  TUILES.chemin.src = 'img/nexus/tiles/ground_path.webp';

  /* Chaque lieu : son image, sa taille affichee, son point d'ancrage (les
     pieds, pas le centre — c'est ce qui permet de le trier avec le joueur),
     et — sauf la fontaine, purement decorative — la destination qu'on
     rejoint en marchant dessus. */
  var LIEUX = [
    { cle: 'fontaine', src: 'img/nexus/tiles/obj_fountain_plaza.webp',
      x: CENTRE.x, y: CENTRE.y, larg: 340, haut: 355, collision: 108 },
    { cle: 'portail', src: 'img/nexus/tiles/obj_portal.webp',
      x: CENTRE.x, y: CENTRE.y - 470, larg: 210, haut: 324,
      rayon: 110, href: 'games.html', nom: 'the game hall' },
    { cle: 'etal', src: 'img/nexus/tiles/obj_market_stall.webp',
      x: CENTRE.x - 620, y: CENTRE.y, larg: 260, haut: 244,
      /* Ouvre sur les coffres, mais la meme feuille porte l'onglet
         « Character skins » juste a cote dans sa barre — le nom dit les
         deux, pour qu'on sache que l'un mene aussi a l'autre. */
      rayon: 120, href: 'games.html?open=sh', nom: 'the shop' },
    { cle: 'coffre', src: 'img/nexus/tiles/obj_vault_door.webp',
      x: CENTRE.x + 620, y: CENTRE.y, larg: 260, haut: 251,
      rayon: 120, href: 'games.html?open=ap', nom: 'your vault' },
  ];
  LIEUX.forEach(function (l) { l.img = new Image(); l.img.src = l.src; l.dwell = 0; });

  /* ---- LE BASSIN DE LA FONTAINE ----
     Un CERCLE de rayon 108 centre sur le point d'ancrage ne collait pas au
     dessin : la fontaine est large et basse, et son bassin est pose SUR
     l'ancre, donc au-dessus d'elle. Le cercle laissait passer par les cotes —
     la ou la pierre est — et bloquait sous le bassin, la ou il n'y a rien.
     Une ellipse mesuree sur le dessin colle. Les tirs s'en servent aussi :
     un pas et un projectile doivent buter sur la MEME pierre. */
  var COL_FONT = { rx: 152, ry: 70, dy: 62 };

  /* ================== LA VIE, ET LE REPLI ==================
   *
   * `VIE.pv` est la SEULE source de verite sur les points de vie : la barre
   * du panneau la lit, le repli automatique la lit. Rien ne fait encore de
   * degats, donc elle vaut toujours le plafond — mais le jour ou un donjon
   * en fera, il n'y aura qu'un endroit a baisser et les deux suivront
   * ensemble. C'est la difference entre une place « prete » et une place
   * REELLE.
   *
   * Le plafond change quand on s'equipe : on garde alors la PROPORTION de
   * vie, pas le nombre. Enfiler un plastron qui donne +170 PV ne doit pas
   * soigner, et en retirer un ne doit pas tuer. */
  var VIE = { pv: 0, max: 0, mp: 0, mpMax: 0 };
  function poseVieMax(hp, mp) {
    hp = hp | 0; mp = mp | 0;
    if (VIE.max <= 0) { VIE.pv = hp; VIE.mp = mp; }
    else {
      if (hp !== VIE.max) VIE.pv = Math.max(1, Math.round(VIE.pv * hp / VIE.max));
      if (mp !== VIE.mpMax && VIE.mpMax > 0) VIE.mp = Math.round(VIE.mp * mp / VIE.mpMax);
    }
    VIE.max = hp; VIE.mpMax = mp;
    VIE.pv = Math.min(VIE.pv, VIE.max);
    VIE.mp = Math.min(VIE.mp, VIE.mpMax);
  }
  function partVie() { return VIE.max > 0 ? VIE.pv / VIE.max : 1; }

  /* ---- LE REPLI VERS LE NEXUS ----
   *
   * Une touche (E par defaut, reassignable) et un seuil automatique en
   * pourcentage de vie. Le seuil ne PROTEGE PAS : entre l'instant ou les
   * points de vie passent sous la barre et celui ou le repli s'execute, il
   * s'ecoule au moins une image — et un coup qui enleve tout d'un seul
   * tenant ne laisse aucune image. C'est vrai dans le jeu d'origine, et ce
   * serait malhonnete de le cacher derriere un reglage qui a l'air d'une
   * assurance. Le texte du panneau le dit.
   *
   * `franchi` retient qu'on est DEJA passe sous la barre : sans lui, le
   * repli se redeclencherait a chaque image tant que la vie reste basse. */
  var REPLI = { actif: false, seuil: 35, franchi: false };
  var CLE_REPLI = 'swogeNexusRepli';
  try {
    var brut = JSON.parse(localStorage.getItem(CLE_REPLI) || 'null');
    if (brut && typeof brut === 'object') {
      REPLI.actif = !!brut.actif;
      REPLI.seuil = Math.max(5, Math.min(95, Number(brut.seuil) || 35));
    }
  } catch (e) {}
  function sauveRepli() {
    try { localStorage.setItem(CLE_REPLI, JSON.stringify({ actif: REPLI.actif, seuil: REPLI.seuil })); } catch (e) {}
  }

  /** Rentrer au Nexus, d'ou qu'on soit. Rend `true` si on a bouge. */
  function retourNexus(raison) {
    if (SCENE === 'coffre') { sortCoffre(); return true; }
    /* Depuis le Nexus lui-meme il n'y a nulle part d'ou revenir. Ce n'est
       pas un echec : c'est la seule reponse juste tant que le monde de
       combat n'existe pas. */
    return false;
  }

  function verifieRepli() {
    if (!REPLI.actif) { REPLI.franchi = false; return; }
    var pct = partVie() * 100;
    if (pct > REPLI.seuil + 1) { REPLI.franchi = false; return; }
    if (REPLI.franchi) return;
    REPLI.franchi = true;
    retourNexus('vie');
  }

  /* ================== L'INTERIEUR DU COFFRE ==================
   *
   * Le coffre etait une PORTE qui renvoyait sur games.html. C'est une salle
   * maintenant : on y entre, on y marche, et on voit poses au sol tous les
   * objets achetes a la boutique. C'est la difference entre une liste et un
   * lieu — et le coffre est justement l'endroit ou l'on va « voir ses
   * affaires », pas consulter un tableau.
   *
   * Les bornes sont mesurees sur le dessin, pas devinees : le dallage
   * jouable occupe la fraction .185-.825 en largeur et .20-.84 en hauteur de
   * l'image, le reste etant mur, etageres et tonneaux. La porte est sur le
   * mur GAUCHE, a mi-hauteur : c'est par la qu'on ressort, comme on est
   * entre.
   *
   * Rien de ce qui est ici ne se joue sur le serveur : le coffre est deja
   * calcule et envoye (message `equipable`), la salle ne fait que le
   * MONTRER. Un joueur qui triche sur sa position n'y gagne donc rien. */
  var SALLE = {
    img: null, src: 'img/nexus/tiles/room_vault.webp',
    w: 1600, h: 1600,
    // la zone ou l'on pose les pieds, en unites de monde
    x0: 1600 * 0.185, x1: 1600 * 0.825,
    y0: 1600 * 0.200, y1: 1600 * 0.840,
    /* ---- LE PORTAIL DE RETOUR ----
     * Sortir se faisait en repassant par la porte du mur gauche. Deux
     * problemes : on APPARAISSAIT dessus — on entrait et on ressortait dans
     * la seconde — et une porte de decor ne se lit pas comme une sortie. Un
     * portail, si : c'est deja par un portail qu'on quitte le Nexus. */
    /* Devant la porte du mur gauche, et LARGE : un cercle de soixante unites
       dans une piece qui en fait mille six cents se rate en marchant. On le
       pose assez pres du mur pour qu'en longeant celui-ci on tombe dedans —
       c'est le geste naturel de quelqu'un qui cherche la sortie. */
    portail: { x: 1600 * 0.225, y: 1600 * 0.470, r: 104, larg: 104, haut: 160 },
    /* Les cinq coffres du mur du bas, releves sur le dessin. UN SEUL est
       ouvrable — celui du milieu, le plus facile a trouver. Les quatre autres
       restent du decor, en attendant qu'on leur donne chacun son role.
       Les faire tous ouvrir le meme menu etait plus simple, mais mentait :
       cinq poignees pour une seule porte laissent croire a cinq rangements
       differents, et le jour ou ils en auront vraiment, le joueur aura pris
       l'habitude qu'ils soient interchangeables. */
    coffres: [0.500].map(function (fx) {
      return { x: 1600 * fx, y: 1600 * 0.842, r: 74 };
    }),
  };
  SALLE.img = new Image(); SALLE.img.src = SALLE.src;

  /* Ou l'on se tenait dans le Nexus avant d'entrer : on ressort exactement
     la, sinon on reapparait au centre de la carte sans savoir pourquoi. */
  var SCENE = 'nexus';
  var RETOUR = null;
  var COFFRE = null;        // les quatre listes du message `equipable`
  var coffreOuvert = false;   // le menu du coffre, au centre de l'ecran
  var coffreFerme = null;     // le coffre qu'on vient de refermer a la main
  var coffreErreur = '';      // le refus du serveur, s'il y en a un

  function scene() { return SCENE === 'coffre' ? SALLE : { w: MONDE.w, h: MONDE.h }; }

  /* ================== LA BOUTIQUE, DANS LE JEU ==================
   *
   * L'etal renvoyait sur games.html : pour acheter un coffre il fallait
   * QUITTER la partie, puis revenir par le menu. C'etait le dernier endroit
   * du Nexus qui faisait sortir du jeu.
   *
   * Rien n'est reecrit du chemin de l'argent : on parle au serveur avec les
   * memes messages que le panneau du hall — `shop` pour lire, `shopOpen`
   * pour ouvrir une caisse. Le prix, les chances et le solde viennent de lui.
   * Un second calcul de prix ici serait une seconde verite sur ce qu'on
   * paie, et c'est exactement ce qu'il ne faut pas dupliquer.
   */
  var BOUTIQUE = null, shopSaison = 2, shopOuvert = false, shopMsg = '';
  var elShopVoile = document.getElementById('nxShopVoile');
  var elShopOng = elShopVoile ? elShopVoile.querySelector('.nxsh-ong') : null;
  var elShopCorps = elShopVoile ? elShopVoile.querySelector('.nxsh-corps') : null;
  var elShopSolde = elShopVoile ? elShopVoile.querySelector('.nxsh-solde b') : null;
  var elShopMsg = elShopVoile ? elShopVoile.querySelector('.nxsh-msg') : null;

  function ouvreShop() {
    if (!elShopVoile) return;
    shopOuvert = true;
    shopMsg = '';
    if (enLigne) envoie({ type: 'shop', season: shopSaison });
    peintShop();
    elShopVoile.classList.add('on');
  }
  function fermeShop() {
    shopOuvert = false;
    if (elShopVoile) elShopVoile.classList.remove('on');
  }
  if (elShopVoile) {
    elShopVoile.addEventListener('click', function (e) {
      var c = e.target.classList;
      if (e.target === elShopVoile || (c && c.contains('nxcf-x'))) fermeShop();
    });
  }

  function peintShop() {
    if (!elShopCorps) return;
    if (elShopSolde) elShopSolde.textContent = SOLDE_TEXTE || '—';
    if (elShopMsg) {
      elShopMsg.textContent = shopMsg ? shopMsg.texte : '';
      elShopMsg.className = 'nxsh-msg' + (shopMsg && shopMsg.ok ? ' ok' : '');
    }
    if (!BOUTIQUE) { elShopCorps.innerHTML = '<div class="nxcf-vide">Opening the shop…</div>'; return; }

    // ---- les saisons
    if (elShopOng) {
      elShopOng.innerHTML = (BOUTIQUE.saisons || []).map(function (s) {
        return '<button type="button" data-s="' + s.n + '"' +
               (s.n === shopSaison ? ' class="on"' : '') + '>' + ech(s.nom) + '</button>';
      }).join('');
      Array.prototype.forEach.call(elShopOng.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          shopSaison = Number(b.getAttribute('data-s'));
          shopMsg = '';
          if (enLigne) envoie({ type: 'shop', season: shopSaison });
        });
      });
    }

    // ---- les caisses
    var C = BOUTIQUE.catalogue || {};
    var solde = Number(BOUTIQUE.balance || 0);
    var coffres = C.coffres || [];
    if (!coffres.length) {
      elShopCorps.innerHTML = '<div class="nxcf-vide">Nothing on sale in this season right now.</div>';
      return;
    }
    elShopCorps.innerHTML = coffres.map(function (c) {
      /* Le DESSIN suit `image` et non `cle` : les caisses d'armes empruntent
         celui des coffres a fruits tant que le leur n'existe pas, et c'est le
         serveur qui le decide — comme dans le panneau du hall. */
      var dessin = c.image || c.cle;
      return '<button type="button" class="nxsh-cof" data-cle="' + ech(c.cle) + '"' +
        (solde >= c.prix ? '' : ' disabled') + '>' +
        '<img alt="" src="img/shop/coffre_' + encodeURIComponent(dessin) + '.webp" onerror="this.remove()">' +
        '<span><span class="n">' + ech(c.nom) + '</span><span class="o">' +
        (c.chances || []).map(function (x) {
          return '<span style="white-space:nowrap"><b style="color:' + ech(x.couleur) + '">' +
                 (Math.round(x.pourcent * 10) / 10) + '%</b> ' + ech(x.nom) + '</span>';
        }).join(' &middot; ') +
        '</span></span><span class="p">' + Math.round(c.prix).toLocaleString('en-US') + ' $SWOGE</span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(elShopCorps.querySelectorAll('.nxsh-cof'), function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        shopMsg = { texte: 'Opening…', ok: false };
        peintShop();
        envoie({ type: 'shopOpen', chest: b.getAttribute('data-cle'), season: shopSaison });
      });
    });
  }

  /* ---- LE MENU DU COFFRE ----
   *
   * Les objets etaient poses au sol : joli, mais il fallait marcher sur
   * chacun pour lire son nom, et rien ne permettait de s'equiper. Ils sont
   * maintenant dans un menu qu'un coffre de la salle ouvre — on va au coffre,
   * on l'ouvre, on change son equipement, comme dans le jeu d'origine.
   *
   * Une seule table pour les quatre categories : `champ` est la cle du
   * message `equipable`, `etat` celle de la fiche du personnage, `msg` celle
   * qu'on renvoie pour s'equiper. Les trois ne peuvent pas se desaccorder. */
  var CATEGORIES = [
    { champ: 'fruits',  etat: 'equipFruit',  msg: 'equipeFruit',  titre: 'Power fruit' },
    { champ: 'armes',   etat: 'equipArme',   msg: 'equipeArme',   titre: 'Weapon' },
    { champ: 'armures', etat: 'equipArmure', msg: 'equipeArmure', titre: 'Armor' },
    { champ: 'bagues',  etat: 'equipBague',  msg: 'equipeBague',  titre: 'Ring' },
  ];
  var elCoffreVoile = document.getElementById('nxCoffreVoile');
  var elCoffreCorps = elCoffreVoile ? elCoffreVoile.querySelector('.nxcf-corps') : null;

  function ouvreCoffreMenu() {
    if (!elCoffreVoile) return;
    coffreOuvert = true;
    if (!COFFRE && enLigne) envoie({ type: 'equipable' });
    peintCoffreMenu();
    elCoffreVoile.classList.add('on');
  }
  function fermeCoffreMenu(parLaMain) {
    coffreOuvert = false;
    /* Fermer a la main marque CE coffre : tant qu'on ne s'en ecarte pas, il
       ne se rouvre plus. Une fermeture automatique (on sort de la salle) ne
       marque rien — il n'y a plus de coffre a retenir. */
    if (parLaMain) coffreFerme = coffreSous;
    if (elCoffreVoile) elCoffreVoile.classList.remove('on');
  }
  var coffreSous = null;      // le coffre sur lequel on se tient
  if (elCoffreVoile) {
    elCoffreVoile.addEventListener('click', function (e) {
      var c = e.target.classList;
      if (e.target === elCoffreVoile || (c && c.contains('nxcf-x'))) fermeCoffreMenu(true);
    });
  }

  function peintCoffreMenu() {
    if (!elCoffreCorps) return;
    if (!COFFRE) { elCoffreCorps.innerHTML = '<div class="nxcf-vide">Opening your vault…</div>'; return; }
    /* Un refus du serveur — « celle-la, tu la portes » — doit se lire. Sans
       ca le joueur tape le bouton et rien ne bouge, ce qui se lit comme une
       panne plutot que comme une regle. */
    var html = coffreErreur
      ? '<div class="nxcf-refus">' + ech(coffreErreur) + '</div>' : '';
    var total = 0;
    CATEGORIES.forEach(function (cat) {
      var liste = COFFRE[cat.champ] || [];
      total += liste.length;
      if (!liste.length) return;
      var porte = FICHE && FICHE[cat.etat];
      html += '<div class="nxcf-grp"><i>' + cat.titre + '</i><div class="nxcf-l">';
      liste.forEach(function (o) {
        var actif = !!(porte && porte.item === o.id);
        html += '<button type="button" class="nxcf-i' + (actif ? ' actif' : '') +
          '" data-msg="' + cat.msg + '" data-item="' + o.id + '"' +
          ' style="--c:' + ech(o.couleur || '#8DA0C4') + '"' +
          ' title="' + ech(o.nom + ' — ' + (detailBonus(o) || 'no bonus')) + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" onerror="this.remove()">' +
          '<span><b>' + ech(o.nom) + '</b><em>' + ech(detailBonus(o) || '—') + '</em></span>' +
          (actif ? '<u>worn</u>'
                 : '<u>' + (o.quantite > 1 ? 'x' + o.quantite : '') +
                   '<b class="nxcf-sortir" data-sortir="' + o.id +
                   '" title="Take it out — it will be lost if you die">&darr;</b></u>') +
          '</button>';
      });
      html += '</div></div>';
    });
    /* ---- LE SAC, A COTE DU COFFRE ----
     *
     * Le sac ne se voyait que dans le panneau lateral, que le menu recouvre
     * sur telephone : on ne pouvait donc pas savoir ce qu'on transportait au
     * moment meme ou l'on range. Il est ici, sous le coffre, avec le geste
     * qui va avec.
     *
     * C'est le SEUL endroit du jeu ou passer de l'un a l'autre est possible,
     * et c'est voulu : le sac part avec le personnage s'il meurt, le coffre
     * survit. Ranger est donc le geste qui met a l'abri, et il doit demander
     * de revenir ici — sinon la mort ne couterait plus rien. */
    var sac = SAC || [];
    html += '<div class="nxcf-grp nxcf-sac"><i>Backpack &mdash; lost if you die</i>';
    if (!sac.length) {
      html += '<div class="nxcf-vide">Empty. Loot you pick up in the world lands here — ' +
              'store it in the vault to keep it for good.</div>';
    } else {
      html += '<div class="nxcf-l">' + sac.map(function (o) {
        return '<button type="button" class="nxcf-i" data-range="' + o.id +
          '" data-sac="' + o.id + '"' +
          ' style="--c:' + ech(o.couleur || '#8DA0C4') + '"' +
          ' title="' + ech(o.nom + ' — store in the vault') + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" onerror="this.remove()">' +
          '<span><b>' + ech(o.nom) + '</b><em>' + ech(detailBonus(o) || '—') + '</em></span>' +
          '<u>' + (o.quantite > 1 ? 'x' + o.quantite + ' &middot; ' : '') + 'store &rarr;</u>' +
          '</button>';
      }).join('') + '</div>';
    }
    html += '</div>';

    elCoffreCorps.innerHTML = total ? html
      : '<div class="nxcf-vide">Your vault is empty. Chests bought at the shop drop their items straight in here.</div>' + html;
    /* Un clic equipe TOUT DE SUITE : le geste EST la confirmation. Retaper la
       piece deja portee la retire — sinon on ne pourrait jamais rien enlever,
       et il faudrait un second bouton sur chaque ligne. */
    Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('.nxcf-i'), function (b) {
      b.addEventListener('click', function () {
        var range = b.getAttribute('data-range');
        if (range) { envoie({ type: 'rangeCoffre', item: Number(range) }); return; }
        var deja = b.classList.contains('actif');
        envoie({ type: b.getAttribute('data-msg'), skin: PERSO,
                 item: deja ? null : Number(b.getAttribute('data-item')) });
      });
    });
    /* Reprendre : le petit bouton du coin, sur les pieces du coffre. Il ne
       s'affiche pas sur celle qu'on PORTE — la sortir desequiperait le
       personnage tout seul, et le serveur la refuserait de toute facon. */
    Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('.nxcf-sortir'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        envoie({ type: 'sortCoffre', item: Number(b.getAttribute('data-sortir')) });
      });
    });
  }

  function entreCoffre() {
    // si le coffre n'est pas encore arrive, on le redemande en entrant
    if (!COFFRE && enLigne) envoie({ type: 'equipable' });
    RETOUR = { x: joueur.x, y: joueur.y };
    SCENE = 'coffre';
    /* On arrive au MILIEU de la piece, pas sur la sortie. La version
       precedente posait le joueur a quarante unites du seuil, dont le rayon
       en fait soixante-dix : il apparaissait DEDANS et ressortait aussitot.
       Un delai de grace masquait le probleme au lieu de le resoudre — il
       suffisait de ne pas bouger pour etre ejecte. */
    joueur.x = (SALLE.x0 + SALLE.x1) / 2;
    joueur.y = (SALLE.y0 + SALLE.y1) / 2 + 70;
    joueur.dir = 'down';
    LIEUX.forEach(function (l) { l.dwell = 0; });
    /* Ceinture ET bretelles : le portail ne mord qu'apres qu'on s'en soit
       ecarte une fois. Meme pose dessus par erreur, on ne repart pas. */
    SALLE.portailArme = false;
    fermeCoffreMenu();
    joueSample('vault', { vol: 0.85 });
  }

  function sortCoffre() {
    SCENE = 'nexus';
    fermeCoffreMenu();
    joueSample('vault', { vol: 0.85 });
    /* Le bandeau garde son dernier texte tant que le lieu proche ne CHANGE
       pas — sinon on ressort du coffre avec le nom d'un objet du coffre
       affiche par-dessus le Nexus. On le vide, et on oublie le dernier lieu
       pour que le prochain se reannonce. */
    indiceActuel = null;
    if (indiceEl) { indiceEl.classList.remove('on'); indiceEl.innerHTML = ''; }
    if (RETOUR) { joueur.x = RETOUR.x; joueur.y = RETOUR.y; }
    joueur.dir = 'down';
    // on se pose HORS du rayon de la porte, sinon on rentre aussitot
    var d = LIEUX.filter(function (l) { return l.cle === 'coffre'; })[0];
    if (d) { joueur.x = d.x; joueur.y = d.y + d.rayon + 50; }
    LIEUX.forEach(function (l) { l.dwell = 0; });
  }

  /* Les couloirs de chemin, en cercles et rectangles du MONDE — pas des
     tuiles listees une par une : a chaque case visible on demande juste
     "es-tu dans un de ces cinq morceaux ?". */
  var CLAIRIERE_R = 260;
  var COULOIRS = [
    { x0: CENTRE.x - 105, y0: CENTRE.y - 470, x1: CENTRE.x + 105, y1: CENTRE.y },
    { x0: CENTRE.x - 620, y0: CENTRE.y - 105, x1: CENTRE.x, y1: CENTRE.y + 105 },
    { x0: CENTRE.x, y0: CENTRE.y - 105, x1: CENTRE.x + 620, y1: CENTRE.y + 105 },
  ];
  function estChemin(px, py) {
    var dx = px - CENTRE.x, dy = py - CENTRE.y;
    if (dx * dx + dy * dy < CLAIRIERE_R * CLAIRIERE_R) return true;
    for (var i = 0; i < COULOIRS.length; i++) {
      var c = COULOIRS[i];
      if (px >= c.x0 && px <= c.x1 && py >= c.y0 && py <= c.y1) return true;
    }
    return false;
  }

  // ------------------------------------------------------- le joueur

  var joueur = { x: CENTRE.x, y: CENTRE.y + 300, vx: 0, vy: 0, dir: 'down', anim: 'idle', cadre: 0, chrono: 0 };
  var VITESSE = 260;               // px/s, en unites du monde
  var FPS_ANIM = 14;

  var saut = { en_cours: false, chrono: 0, cadre: 0, duree: 0 };

  /** Avance le cadre d'anim d'une fiche (le joueur local ou un joueur
      distant) — la meme horloge pour tout le monde, le personnage change
      juste le nombre total de cadres a boucler. */
  function avanceCadre(fiche, cle, dt) {
    var total = PERSONNAGES[cle] ? PERSONNAGES[cle].images : 1;
    fiche.chrono += dt;
    if (fiche.chrono >= 1 / FPS_ANIM) {
      fiche.chrono = 0;
      fiche.cadre = (fiche.cadre + 1) % total;
    }
  }

  // ------------------------------------------------------- les autres joueurs
  //
  // Un instantane COMPLET arrive plusieurs fois par seconde — pas un message
  // par arrivee ou par depart. On fusionne donc a chaque fois avec ce qu'on
  // avait deja : une fiche connue garde son cadre d'animation et sa position
  // AFFICHEE (`rx`/`ry`), qu'on glisse ensuite vers la position RECUE
  // (`x`/`y`) plutot que d'y sauter — sinon chaque instantane ferait un petit
  // bond au lieu d'un mouvement continu. Une fiche absente du dernier
  // instantane est simplement supprimee : c'est ainsi qu'un depart se voit,
  // sans le moindre message dedie.
  var DISTANTS = {};                 // { addr: {x,y,rx,ry,dir,anim,skin,nom,cadre,chrono} }
  var signatureGens = '';
  function majJoueursDistants(liste) {
    var vus = {};
    liste.forEach(function (j) {
      if (!j || !j.addr || j.addr === MON_ADRESSE) return;
      vus[j.addr] = true;
      var d = DISTANTS[j.addr];
      if (!d) d = DISTANTS[j.addr] = { x: j.x, y: j.y, rx: j.x, ry: j.y, cadre: 0, chrono: 0 };
      d.x = j.x; d.y = j.y; d.dir = j.dir; d.anim = j.anim; d.skin = j.skin; d.nom = j.nom;
      assureCharge(j.skin);
    });
    Object.keys(DISTANTS).forEach(function (a) { if (!vus[a]) delete DISTANTS[a]; });

    /* On ne repeint la liste que si sa COMPOSITION a change. Un instantane
       arrive sept fois par seconde ; refabriquer le HTML a chaque fois pour
       les memes noms ferait clignoter la liste et travailler le navigateur
       pour rien — la position, elle, se rejoue sur le canvas, pas ici. */
    var sig = Object.keys(DISTANTS).sort().map(function (a) {
      return a + ':' + DISTANTS[a].skin + ':' + (DISTANTS[a].nom || '');
    }).join('|');
    if (sig !== signatureGens) { signatureGens = sig; peintGens(); }
  }

  // ------------------------------------------------------- le bruit de pas
  //
  // Une seule boucle, posee et retiree selon qu'on avance ou non — pas un
  // coup par cadre d'animation, qui aurait demande de decouper le fichier en
  // un pas exact par cadre. `debloque()` lance puis coupe aussitot le son au
  // tout PREMIER geste (touche ou pave) : c'est le geste qui autorise le
  // navigateur a jouer du son sur cette page, et sans cet appel fait DANS le
  // geste, le tout premier `play()` reel — lui, lance depuis la boucle de
  // jeu — risquerait d'etre refuse.
  var pas = new Audio('img/nexus/pas.mp3');
  /* 0.135 = 0.45 baisse de 70 % : le pas doit se sentir sous le reste, pas
     se faire entendre par-dessus. */
  pas.loop = true; pas.volume = 0.135; pas.preload = 'auto';
  var debloque = false;
  function debloqueSon() {
    if (debloque) return;
    debloque = true;
    pas.play().then(function () { pas.pause(); pas.currentTime = 0; }).catch(function () {});
    contexteSon();   // meme geste, meme autorisation : le tir aussi doit sonner
  }

  /* ================== LE SON DES TIRS ==================
   *
   * SYNTHETISE, pas enregistre. Sept armes voudraient sept fichiers, plus un
   * pour l'impact ; a la cadence des dagues (quatre coups par seconde) on
   * jonglerait avec des lectures qui se chevauchent et se coupent. Web Audio
   * fabrique chaque coup a la demande, sans un octet a telecharger, et donne
   * a chaque coup une hauteur legerement differente — sans quoi un tir
   * repete sonne comme une machine, pas comme une arme.
   *
   * Trois recettes suffisent a couvrir les sept familles :
   *   souffle — du bruit filtre dont la bande DESCEND : une lame qui fend
   *             l'air. Court et clair pour la dague, long et grave pour la
   *             hache.
   *   corde   — un oscillateur qui chute vite : la corde de l'arc.
   *   choc    — une sinusoide grave qui s'effondre : le marteau, le poing.
   *
   * Le contexte n'est cree qu'au premier geste du joueur. Un AudioContext
   * fabrique avant reste « suspended » sur tous les navigateurs recents, et
   * on n'entendrait rien sans jamais savoir pourquoi. */
  var AUDIO = null, BRUIT = null, SORTIE_TIR = null;
  function contexteSon() {
    if (AUDIO) { if (AUDIO.state === 'suspended') AUDIO.resume(); return AUDIO; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AUDIO = new C(); } catch (e) { return null; }
    /* UN seul tampon de bruit, fabrique une fois. En refaire un par coup
       allouerait vingt mille echantillons quatre fois par seconde. */
    var n = Math.floor(AUDIO.sampleRate * 0.4);
    BRUIT = AUDIO.createBuffer(1, n, AUDIO.sampleRate);
    var d = BRUIT.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    SORTIE_TIR = AUDIO.createGain();
    SORTIE_TIR.gain.value = 0.55;
    SORTIE_TIR.connect(AUDIO.destination);
    chargeSamples();
    return AUDIO;
  }

  /* ---- LES SONS ENREGISTRES ----
   *
   * La premiere version SYNTHETISAIT tout : trois recettes, sept armes, zero
   * fichier a telecharger. C'etait defendable tant qu'on n'avait rien ; on a
   * maintenant de vrais enregistrements, et un vrai son bat une imitation.
   *
   * Ils sont decodes UNE fois en memoire, puis rejoues depuis ce tampon. Un
   * <audio> par coup ne tiendrait pas la cadence des dagues — quatre par
   * seconde — parce qu'une lecture relancee se coupe elle-meme ; ici chaque
   * coup a sa propre source et ils se superposent proprement. */
  var SAMPLES = {};
  var A_CHARGER = {
    tir:   'img/nexus/tir.mp3',
    vault: 'img/nexus/vault.mp3',
    clic:  'img/nexus/clic_souris.mp3',
    clic2: 'img/nexus/clic_effet.mp3',
    /* Ces deux-la n'ont encore rien pour les declencher : aucun monstre n'est
       dessine cote client. Ils sont charges d'avance parce que le monde de
       combat est la prochaine chose branchee, et qu'un son qui arrive une
       seconde apres le coup ne sert a rien. */
    degat: 'img/nexus/degat.mp3',
    /* DEUX cris de mort, tires au hasard. Un monstre qui meurt toujours de
       la meme facon devient une machine au bout de dix ; deux suffisent a
       casser la repetition sans qu'on entende la boucle. */
    mort:  'img/nexus/mort.mp3',
    mort2: 'img/nexus/mort2.mp3',
    niveau: 'img/nexus/niveau.mp3',
  };
  function chargeSamples() {
    if (!AUDIO) return;
    Object.keys(A_CHARGER).forEach(function (nom) {
      if (nom in SAMPLES) return;
      SAMPLES[nom] = null;                    // en cours : on ne redemande pas
      fetch(A_CHARGER[nom])
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) {
          return new Promise(function (res, rej) {
            /* Deux formes d'API : la moderne rend une promesse, l'ancienne
               (Safari) prend deux fonctions. On accepte les deux. */
            var p = AUDIO.decodeAudioData(b, res, rej);
            if (p && p.then) p.then(res, rej);
          });
        })
        .then(function (buf) { SAMPLES[nom] = buf; })
        .catch(function () { SAMPLES[nom] = null; });
    });
  }

  /**
   * Joue un echantillon. `hauteur` multiplie la vitesse de lecture : c'est ce
   * qui donne au marteau une voix plus grave qu'aux dagues sans exiger sept
   * fichiers. `duree` coupe la queue — le son de tir dure une seconde et
   * demie, et a quatre coups par seconde on empilerait six copies qui se
   * changeraient en bouillie.
   */
  function joueSample(nom, opts) {
    var ctx = AUDIO;
    if (!ctx || ctx.state !== 'running') return false;
    var buf = SAMPLES[nom];
    if (!buf) return false;
    opts = opts || {};
    var t0 = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, opts.hauteur || 1));
    var g = ctx.createGain();
    var vol = opts.vol === undefined ? 1 : opts.vol;
    g.gain.setValueAtTime(vol, t0);
    var duree = buf.duration / src.playbackRate.value;
    if (opts.duree && opts.duree < duree) {
      /* Une coupure NETTE claquerait. Quatre-vingts millisecondes de descente
         s'entendent comme une fin, pas comme un couac. */
      var fin = Math.max(0.06, opts.duree);
      g.gain.setValueAtTime(vol, t0 + Math.max(0.01, fin - 0.08));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + fin);
      duree = fin;
    }
    src.connect(g); g.connect(SORTIE_TIR);
    src.start(t0);
    src.stop(t0 + duree + 0.03);
    return true;
  }

  /* La VOIX de chaque arme : une hauteur et un volume, sur le meme
     enregistrement. Le marteau parle grave et fort, les dagues aigu et court.
     Chaque famille garde son caractere sans sept prises de son. */
  var VOIX_ARME = {
    lame:    { hauteur: 1.15, vol: 0.85 },
    hache:   { hauteur: 0.82, vol: 1.00 },
    lance:   { hauteur: 1.05, vol: 0.85 },
    arc:     { hauteur: 1.30, vol: 0.75 },
    marteau: { hauteur: 0.68, vol: 1.00 },
    dagues:  { hauteur: 1.55, vol: 0.65 },
    poing:   { hauteur: 1.00, vol: 0.55 },
  };

  function joueSon(famille) {
    var v = VOIX_ARME[famille] || VOIX_ARME.poing;
    var a = ARMES[famille] || ARMES.poing;
    /* +/- 5 % d'une fois a l'autre : deux coups identiques a la milliseconde
       pres sonnent comme une machine, pas comme une arme. */
    var h = v.hauteur * (1 + (Math.random() - 0.5) * 0.1);
    return joueSample('tir', { hauteur: h, vol: v.vol, duree: 1.35 / a.cadence });
  }

  /** Un clic d'interface. Deux sons : le leger pour naviguer, le plein pour
      un geste qui ENGAGE — acheter, s'equiper, ranger. */
  function clic(fort) {
    joueSample(fort ? 'clic2' : 'clic', { vol: fort ? 0.7 : 0.5, duree: 0.35 });
  }

  /* L'impact : le meme choc, plus court et bien plus discret. Il part a
     chaque projectile qui s'arrete, et il y en a plus que de coups tires. */
  /* Le choc sur la PIERRE reste synthetise : on n'a pas d'enregistrement pour
     ca, et emprunter celui du monstre blesse serait faux — un projectile qui
     s'ecrase sur une fontaine ne crie pas. */
  function enveloppeGain(t0, duree, vol) {
    var g = AUDIO.createGain();
    /* Attaque de 6 ms : instantanee a l'oreille, mais pas nulle — un saut sec
       de zero a plein fait un « clic » parasite sur les petits haut-parleurs. */
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
    return g;
  }

  function sonImpact() {
    if (!AUDIO || AUDIO.state !== 'running') return;
    var t0 = AUDIO.currentTime, h = 1 + (Math.random() - 0.5) * 0.3;
    var g = enveloppeGain(t0, 0.12, 0.16);
    g.connect(SORTIE_TIR);
    var src = AUDIO.createBufferSource(); src.buffer = BRUIT;
    var f = AUDIO.createBiquadFilter(); f.type = 'bandpass';
    f.Q.value = 1.0; f.frequency.setValueAtTime(1200 * h, t0);
    f.frequency.exponentialRampToValueAtTime(320 * h, t0 + 0.12);
    src.connect(f); f.connect(g);
    src.start(t0); src.stop(t0 + 0.14);
  }

  // ------------------------------------------------------- les commandes
  //
  // Les fleches marchent TOUJOURS, quoi qu'on reassigne — un repli qui ne
  // peut jamais se perdre en bricolant les reglages. Le reste (par defaut
  // WASD + espace) se reassigne depuis la roue dentee, et se garde d'une
  // visite a l'autre dans le navigateur.

  var TOUCHES = { up: false, down: false, left: false, right: false };
  var CLE_STOCKAGE = 'swogeNexusTouches';
  var DEFAUTS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space',
                  auto: 'KeyI', nexus: 'KeyE' };
  var FLECHES_FIXES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  var ACTIONS = [
    { cle: 'up', nom: 'Move up' }, { cle: 'down', nom: 'Move down' },
    { cle: 'left', nom: 'Move left' }, { cle: 'right', nom: 'Move right' },
    { cle: 'jump', nom: 'Jump' },
    { cle: 'auto', nom: 'Auto-fire' },
    { cle: 'nexus', nom: 'Return to Nexus' },
  ];

  var PERSO_TOUCHES = chargeTouches();
  var CODE_VERS_ACTION = {};
  function reconstruitLookup() {
    CODE_VERS_ACTION = {};
    Object.keys(FLECHES_FIXES).forEach(function (c) { CODE_VERS_ACTION[c] = FLECHES_FIXES[c]; });
    ACTIONS.forEach(function (a) { CODE_VERS_ACTION[PERSO_TOUCHES[a.cle]] = a.cle; });
  }
  function chargeTouches() {
    var t = {};
    try { t = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}') || {}; } catch (e) { t = {}; }
    var o = {};
    ACTIONS.forEach(function (a) { o[a.cle] = (typeof t[a.cle] === 'string' && t[a.cle]) ? t[a.cle] : DEFAUTS[a.cle]; });
    return o;
  }
  function sauveTouches() {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(PERSO_TOUCHES)); } catch (e) {}
    reconstruitLookup();
  }
  reconstruitLookup();

  /** Un nom lisible pour un `KeyboardEvent.code` — « W », « Space », « ↑ »,
      plutot que le nom technique que personne ne reconnait. */
  function nomTouche(code) {
    if (!code) return '—';
    if (code === 'Space') return 'Space';
    if (code === 'ArrowUp') return '↑'; if (code === 'ArrowDown') return '↓';
    if (code === 'ArrowLeft') return '←'; if (code === 'ArrowRight') return '→';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    return code;
  }

  window.addEventListener('keydown', function (ev) {
    if (ecouteRebind) { captureRebind(ev); return; }
    if (panelOuvert) return;         // les reglages sont ouverts : rien ne bouge derriere
    var d = CODE_VERS_ACTION[ev.code];
    if (!d) return;
    debloqueSon(); ev.preventDefault();
    if (d === 'jump') lanceSaut();
    else if (d === 'auto') basculeAuto();
    else if (d === 'nexus') retourNexus('key');
    else TOUCHES[d] = true;
  });
  window.addEventListener('keyup', function (ev) {
    var d = CODE_VERS_ACTION[ev.code];
    if (d && d !== 'jump' && d !== 'auto' && d !== 'nexus') TOUCHES[d] = false;
  });

  function lanceSaut() {
    if (saut.en_cours) return;
    var c = PERSONNAGES[PERSO];
    saut.en_cours = true; saut.chrono = 0; saut.cadre = 0;
    saut.duree = c.images / FPS_ANIM;
  }

  // ======================= LE TIR =======================
  //
  // ---- ce qui existe, et ce qui manque ----
  //
  // Le Nexus est une zone sure : on peut y tirer, rien n'y meurt. C'est aussi
  // le cas dans le jeu d'origine, et ca rend le systeme testable des
  // maintenant — on voit partir les projectiles, on regle la portee et la
  // cadence, sans attendre les monstres.
  //
  // Ce qui manque donc VRAIMENT : les cibles. Le tir automatique vise
  // « l'ennemi le plus proche » ; tant qu'il n'y en a aucun, il tire droit
  // devant. Ce n'est pas un pis-aller, c'est le comportement du Nexus.
  //
  // ---- l'arme decide ----
  //
  // Portee, nombre de projectiles et cadence viennent de la FAMILLE de
  // l'arme equipee, pas d'un reglage global : c'est ce qui fait qu'un arc et
  // un marteau ne se jouent pas pareil. Sans arme, on tire quand meme — a
  // mains nues, court et lent.

  var ARMES = {
    lame:    { portee: 320, tirs: 1, cadence: 3.2, vitesse: 560, teinte: '#cfe8ff' },
    hache:   { portee: 210, tirs: 1, cadence: 1.7, vitesse: 430, teinte: '#ffb06b' },
    lance:   { portee: 420, tirs: 1, cadence: 2.2, vitesse: 640, teinte: '#d8dee9' },
    arc:     { portee: 460, tirs: 2, cadence: 2.6, vitesse: 700, teinte: '#9dff9d' },
    marteau: { portee: 180, tirs: 1, cadence: 1.3, vitesse: 380, teinte: '#ffd76b' },
    dagues:  { portee: 300, tirs: 2, cadence: 4.0, vitesse: 620, teinte: '#c9a0ff' },
    /* Sans arme : court, lent, mais on tire — un joueur qui appuie et ne voit
       rien partir croit que la commande est cassee, pas qu'il lui manque un
       objet. */
    poing:   { portee: 150, tirs: 1, cadence: 1.6, vitesse: 340, teinte: '#8DA0C4' },
  };

  function familleArme() {
    var e = FICHE && FICHE.equipArme;
    return (e && e.famille) || null;
  }
  function armeCourante() {
    return ARMES[familleArme()] || ARMES.poing;
  }

  /* ---- LES DESSINS DE PROJECTILES ----
   *
   * Une bande de quatre images par famille d'arme, chargee a la demande. Une
   * famille sans dessin garde le trace au canvas : on peut donc les livrer
   * une par une sans que les cinq autres cessent de tirer entre-temps.
   *
   * Le dessin regarde vers la DROITE, comme l'angle 0 : `ctx.rotate(angle)`
   * l'oriente donc sans correction a appliquer. */
  var CADRE_TIR = 96;
  var SPRITES_TIR = {};
  function spriteTir(fam) {
    if (!fam) return null;
    if (SPRITES_TIR[fam] !== undefined) return SPRITES_TIR[fam];
    var img = new Image();
    /* `null` des le depart, pas `img` : tant qu'elle n'est pas chargee on
       veut le trace de secours, pas une case vide. */
    SPRITES_TIR[fam] = null;
    img.onload = function () { SPRITES_TIR[fam] = img; };
    img.onerror = function () { SPRITES_TIR[fam] = null; };
    img.src = 'img/nexus/tirs/' + fam + '.webp';
    return null;
  }

  /* De combien un projectile se DESSINE au-dessus de sa position reelle.
     Purement visuel : il part a hauteur de poitrine mais existe, pour la
     collision, la ou le personnage se tient. */
  var DECALAGE_TIR = 40;
  var TIRS = [];              // projectiles en vol
  var IMPACTS = [];           // eclats en cours, au point de contact
  var DUREE_IMPACT = 0.28;
  var viseur = { x: 0, y: 0, actif: false };   // en coordonnees ECRAN
  var tireur = { presse: false, auto: false, recharge: 0 };

  /* ---- VISER ----
   * L'angle part du personnage vers le curseur. On garde le pointeur en
   * coordonnees ECRAN et on le convertit au moment du tir : la camera bouge
   * entre deux images, donc une position monde memorisee serait deja fausse. */
  canvas.addEventListener('mousemove', function (ev) {
    var r = canvas.getBoundingClientRect();
    viseur.x = ev.clientX - r.left; viseur.y = ev.clientY - r.top;
    viseur.actif = true;
  });
  canvas.addEventListener('mouseleave', function () { viseur.actif = false; });

  /* ---- ON TIRE AU CLIC GAUCHE ----
   *
   * Le gauche est le geste par defaut : c'est celui qu'on fait sans y penser,
   * et le seul dont un joueur est sur qu'il existe. Le droit reste accepte
   * pour qui a pris l'habitude — les deux mettent le meme drapeau, donc
   * relacher l'un pendant que l'autre est tenu n'arrete rien de travers.
   * Le menu contextuel du canvas part quand meme : sans ca, le clic droit
   * ouvrirait le menu du navigateur par-dessus le jeu.
   *
   * Rien d'autre ne consomme le clic gauche sur le canvas : la scene ne porte
   * aucun bouton, ils sont tous dans le panneau HTML a cote. */
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  canvas.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0 && ev.button !== 2) return;
    ev.preventDefault(); debloqueSon();
    /* On ne tire pas dans le coffre : c'est une piece fermee, il n'y a rien
       a viser, et les projectiles y chercheraient la fontaine du Nexus. */
    if (SCENE !== 'coffre') tireur.presse = true;
  });
  window.addEventListener('mouseup', function (ev) {
    if (ev.button === 0 || ev.button === 2) tireur.presse = false;
  });

  /* Le tir auto se commande de DEUX endroits — la touche et le bouton des
     reglages — et se montre a un TROISIEME, le temoin sur la scene. Une seule
     fonction les tient d'accord : trois etats a synchroniser a la main
     finiraient par se contredire, et le joueur verrait « OFF » pendant que ca
     tire. L'etat se garde d'une visite a l'autre, comme le repli du panneau. */
  var elAuto = document.getElementById('nxAuto');
  var elAutoBtn = document.getElementById('nxAutoBtn');
  var CLE_AUTO = 'swogeNexusAuto';
  function peintAuto() {
    if (elAuto) elAuto.classList.toggle('on', tireur.auto);
    if (elAutoBtn) {
      elAutoBtn.classList.toggle('on', tireur.auto);
      elAutoBtn.textContent = tireur.auto ? 'ON' : 'OFF';
      elAutoBtn.setAttribute('aria-pressed', tireur.auto ? 'true' : 'false');
    }
  }
  function basculeAuto() {
    tireur.auto = !tireur.auto;
    try { localStorage.setItem(CLE_AUTO, tireur.auto ? '1' : '0'); } catch (e) {}
    peintAuto();
  }
  try { tireur.auto = localStorage.getItem(CLE_AUTO) === '1'; } catch (e) {}
  if (elAutoBtn) elAutoBtn.addEventListener('click', basculeAuto);
  peintAuto();

  /* ---- les commandes de l'auto-Nexus ----
     La bascule et le curseur se peignent ensemble : le curseur grise quand
     la bascule est sur OFF, sinon on croirait regler quelque chose d'actif. */
  var elEscBtn = document.getElementById('nxEscBtn');
  var elEscPct = document.getElementById('nxEscPct');
  var elEscVal = document.getElementById('nxEscVal');
  var elEscLigne = document.getElementById('nxEscLigne');
  function peintRepli() {
    if (elEscBtn) {
      elEscBtn.classList.toggle('on', REPLI.actif);
      elEscBtn.textContent = REPLI.actif ? 'ON' : 'OFF';
      elEscBtn.setAttribute('aria-pressed', REPLI.actif ? 'true' : 'false');
    }
    if (elEscPct) elEscPct.value = String(REPLI.seuil);
    if (elEscVal) elEscVal.textContent = REPLI.seuil + '%';
    if (elEscLigne) elEscLigne.classList.toggle('off', !REPLI.actif);
  }
  if (elEscBtn) elEscBtn.addEventListener('click', function () {
    REPLI.actif = !REPLI.actif;
    /* On repart d'un seuil NON franchi : sinon activer l'option alors qu'on
       est deja sous la barre ne declencherait rien. */
    REPLI.franchi = false;
    sauveRepli(); peintRepli();
  });
  if (elEscPct) elEscPct.addEventListener('input', function () {
    REPLI.seuil = Math.max(5, Math.min(95, Number(elEscPct.value) || 35));
    REPLI.franchi = false;
    sauveRepli(); peintRepli();
  });
  peintRepli();

  /** L'ennemi le plus proche, en coordonnees monde — ou `null`. Il n'y en a
      aucun aujourd'hui : les autres JOUEURS n'en sont pas, on ne se tire pas
      dessus dans une zone sure. La fonction existe pour que le jour ou les
      monstres arrivent, il n'y ait qu'une liste a lui donner. */
  function cibleLaPlusProche() {
    return null;
  }

  /** La direction du tir, en radians. Trois sources, dans cet ordre : la
      cible automatique, le curseur, puis le regard du personnage. */
  function angleDeTir(camX, camY) {
    var c = tireur.auto ? cibleLaPlusProche() : null;
    if (c) return Math.atan2(c.y - joueur.y, c.x - joueur.x);
    if (viseur.actif) {
      /* On vise depuis le point de DESSIN du projectile (les pieds moins le
         decalage visuel), sinon la trajectoire ne partirait pas de la ou on
         la voit naitre. */
      var z = DERNIERE_CAM.z || 1;
      var mx = viseur.x / z + camX, my = viseur.y / z + camY;
      return Math.atan2(my - (joueur.y - DECALAGE_TIR), mx - joueur.x);
    }
    var DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    return DIR_ANGLE[joueur.dir] || 0;
  }

  function tire(angle) {
    var a = armeCourante();
    /* UN son par tir, pas un par projectile : l'arc et les dagues en lancent
       deux d'un coup, et deux sons identiques a la meme milliseconde ne font
       pas « deux fleches », ils font un son deux fois trop fort. */
    joueSon(familleArme() || 'poing');
    /* Plusieurs projectiles partent en EVENTAIL, pas superposes : deux tirs
       exactement confondus se verraient comme un seul et le joueur ne saurait
       pas que son arc en lance deux. */
    var ecart = 0.13;
    for (var i = 0; i < a.tirs; i++) {
      var d = a.tirs === 1 ? 0 : (i - (a.tirs - 1) / 2) * ecart;
      var duree = a.portee / a.vitesse;
      /* Le projectile nait aux PIEDS du joueur, pas a hauteur de poitrine.
         Le `-40` est un decalage de DESSIN : l'appliquer a la position du
         monde le faisait naitre 40px plus pres de ce qu'il vise — donc
         DEJA dans la zone de collision de la fontaine quand on est colle a
         elle, et chaque tir explosait aux pieds du joueur. La position du
         monde doit vivre dans le meme espace que la collision du joueur. */
      TIRS.push({ x: joueur.x, y: joueur.y, a: angle + d,
                  v: a.vitesse, reste: duree, duree: duree,
                  teinte: a.teinte, fam: familleArme() });
    }
  }

  function majTirs(dt, camX, camY) {
    var a = armeCourante();
    tireur.recharge -= dt;
    if ((tireur.presse || tireur.auto) && tireur.recharge <= 0) {
      tire(angleDeTir(camX, camY));
      tireur.recharge = 1 / a.cadence;
    }
    var f = LIEUX[0];   // la fontaine : le seul obstacle solide du Nexus
    for (var i = TIRS.length - 1; i >= 0; i--) {
      var t = TIRS[i];
      t.x += Math.cos(t.a) * t.v * dt;
      t.y += Math.sin(t.a) * t.v * dt;
      t.reste -= dt;

      /* ---- LA PIERRE ARRETE LE TIR ----
       * Les projectiles traversaient la fontaine, ce qu'aucun joueur ne lit
       * comme normal. Elle a deja un rayon de collision — celui qui empeche
       * d'y entrer a pied — et le reutiliser evite d'en inventer un second
       * qui finirait par diverger du premier. */
      var dx = t.x - f.x, dy = t.y - (f.y - COL_FONT.dy);
      var tu = dx / COL_FONT.rx, tv = dy / COL_FONT.ry;
      if (tu * tu + tv * tv < 1) {
        IMPACTS.push({ x: t.x, y: t.y, reste: DUREE_IMPACT });
        sonImpact();
        TIRS.splice(i, 1);
        continue;
      }

      /* La portee EST la duree de vie : un projectile disparait apres avoir
         parcouru la distance de son arme, pas au bord de l'ecran — sinon la
         portee dependrait de la taille de la fenetre. Il s'eteint sans
         eclat : il n'a rien touche. */
      if (t.reste <= 0) TIRS.splice(i, 1);
    }
    for (var j = IMPACTS.length - 1; j >= 0; j--) {
      IMPACTS[j].reste -= dt;
      if (IMPACTS[j].reste <= 0) IMPACTS.splice(j, 1);
    }
  }

  function dessineTirs() {
    for (var i = 0; i < TIRS.length; i++) {
      var t = TIRS[i];
      var img = spriteTir(t.fam);
      ctx.save();
      ctx.translate(t.x, t.y - DECALAGE_TIR); ctx.rotate(t.a);
      if (img) {
        /* Le cadre suit la VIE du projectile, pas une horloge a part : un
           tir court traverse quand meme ses quatre images, et la
           dissipation tombe donc toujours juste avant qu'il disparaisse. */
        var n = Math.floor(img.width / CADRE_TIR) || 1;
        var k = Math.min(n - 1, Math.floor((1 - t.reste / t.duree) * n));
        var taille = 46;
        ctx.drawImage(img, k * CADRE_TIR, 0, CADRE_TIR, CADRE_TIR,
                      -taille / 2, -taille / 2, taille, taille);
      } else {
        /* Pas encore de dessin pour cette famille : une navette allongee
           dans le sens du vol. Seul ce bloc connait la forme d'un
           projectile — livrer une image ne touche a rien d'autre. */
        ctx.fillStyle = t.teinte;
        ctx.shadowColor = t.teinte; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* Les eclats, apres les projectiles pour passer par-dessus. Ils ne
       TOURNENT pas : une explosion n'a pas de sens de vol, et la faire
       pivoter avec l'angle du tir se verrait comme un defaut. */
    var imp = spriteTir('impact');
    if (imp) {
      var nb = Math.floor(imp.width / CADRE_TIR) || 1;
      for (var k = 0; k < IMPACTS.length; k++) {
        var e = IMPACTS[k];
        var c = Math.min(nb - 1, Math.floor((1 - e.reste / DUREE_IMPACT) * nb));
        var t2 = 54;
        ctx.drawImage(imp, c * CADRE_TIR, 0, CADRE_TIR, CADRE_TIR,
                      e.x - t2 / 2, e.y - DECALAGE_TIR - t2 / 2, t2, t2);
      }
    }
  }

  // ------------------------------------------------------- la roue des reglages

  var panelOuvert = false, ecouteRebind = null;
  var captureRebind = function () {};   // remplacee une fois le panneau construit, plus bas
  (function poseReglages() {
    var bouton = document.getElementById('nxReglages');
    var voile = document.getElementById('nxReglagesVoile');
    if (!bouton || !voile) return;
    var carte = voile.querySelector('.nxrp-carte');
    var liste = voile.querySelector('.nxrp-liste');
    var lignes = {};

    ACTIONS.forEach(function (a) {
      var l = document.createElement('div'); l.className = 'nxrp-ligne';
      var nom = document.createElement('span'); nom.className = 'nxrp-nom'; nom.textContent = a.nom;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'nxrp-touche';
      b.addEventListener('click', function () { basculeEcoute(a.cle, b); });
      l.appendChild(nom); l.appendChild(b);
      liste.appendChild(l);
      lignes[a.cle] = b;
    });

    function peint() {
      ACTIONS.forEach(function (a) { lignes[a.cle].textContent = nomTouche(PERSO_TOUCHES[a.cle]); });
    }
    peint();

    function basculeEcoute(cle, b) {
      if (ecouteRebind === cle) { annuleEcoute(); return; }
      annuleEcoute();
      ecouteRebind = cle; b.textContent = 'Press a key…'; b.classList.add('attend');
    }
    function annuleEcoute() {
      if (!ecouteRebind) return;
      var av = ecouteRebind; ecouteRebind = null;
      if (lignes[av]) lignes[av].classList.remove('attend');
      peint();
    }
    /* Remplace la fonction-relais declaree plus haut : une seule liste
       d'ecouteurs `keydown` sur `window`, pas deux qui pourraient se
       marcher dessus selon l'ordre d'attachement. */
    captureRebind = function (ev) {
      var cle = ecouteRebind;
      ev.preventDefault();
      if (ev.code === 'Escape') { annuleEcoute(); return; }
      /* Les fleches restent un repli fixe : les y attacher AUSSI creerait
         une deuxieme entree pour le meme code, ambigue au moment de lire
         quelle action elle declenche. */
      if (FLECHES_FIXES[ev.code]) { annuleEcoute(); return; }
      /* Deux actions ne partagent jamais la meme touche : si celle-ci
         servait deja a une autre, elles echangent leurs touches plutot que
         l'une n'ecrase l'autre en silence. */
      var autre = ACTIONS.filter(function (a) { return a.cle !== cle && PERSO_TOUCHES[a.cle] === ev.code; })[0];
      if (autre) PERSO_TOUCHES[autre.cle] = PERSO_TOUCHES[cle];
      PERSO_TOUCHES[cle] = ev.code;
      sauveTouches();
      ecouteRebind = null;
      lignes[cle].classList.remove('attend');
      peint();
    };

    bouton.addEventListener('click', function () {
      panelOuvert = true; voile.classList.add('on'); peint();
      Object.keys(TOUCHES).forEach(function (k) { TOUCHES[k] = false; });  // une touche deja enfoncee ne continue pas de marcher derriere
    });
    function ferme() {
      annuleEcoute();
      panelOuvert = false; voile.classList.remove('on');
      Object.keys(TOUCHES).forEach(function (k) { TOUCHES[k] = false; });  // rien ne reste enfonce en sortant
    }
    voile.querySelector('.nxrp-x').addEventListener('click', ferme);
    voile.addEventListener('click', function (ev) { if (ev.target === voile) ferme(); });
    voile.querySelector('.nxrp-reset').addEventListener('click', function () {
      ACTIONS.forEach(function (a) { PERSO_TOUCHES[a.cle] = DEFAUTS[a.cle]; });
      sauveTouches(); annuleEcoute(); peint();
    });
  })();

  /* Le pave tactile : mêmes drapeaux TOUCHES, poses au doigt plutot qu'au
     clavier. `pointerdown/up/cancel/leave` couvrent en un seul jeu
     d'ecouteurs la souris et le tactile — pas besoin d'en dupliquer deux. */
  (function poseLePave() {
    var pave = document.getElementById('nxPad');
    if (!pave) return;
    [].forEach.call(pave.querySelectorAll('button'), function (b) {
      var d = b.dataset.dir;
      var pose = function (ev) { debloqueSon(); TOUCHES[d] = true; b.classList.add('on'); ev.preventDefault(); };
      var leve = function () { TOUCHES[d] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', pose);
      b.addEventListener('pointerup', leve);
      b.addEventListener('pointercancel', leve);
      b.addEventListener('pointerleave', leve);
    });
  })();

  // ------------------------------------------------------- la boucle

  var indiceEl = document.getElementById('nxIndice');
  var indiceActuel = null;

  function maj(dt) {
    var dx = (TOUCHES.right ? 1 : 0) - (TOUCHES.left ? 1 : 0);
    var dy = (TOUCHES.down ? 1 : 0) - (TOUCHES.up ? 1 : 0);
    var bouge = dx !== 0 || dy !== 0;
    if (bouge) {
      var n = Math.sqrt(dx * dx + dy * dy);
      joueur.x += (dx / n) * VITESSE * dt;
      joueur.y += (dy / n) * VITESSE * dt;
      if (dx !== 0) joueur.dir = dx > 0 ? 'right' : 'left';
      else joueur.dir = dy > 0 ? 'down' : 'up';
    }
    if (bouge && pas.paused) pas.play().catch(function () {});
    else if (!bouge && !pas.paused) pas.pause();
    joueur.anim = saut.en_cours ? 'jump' : (bouge ? 'run' : 'idle');

    /* ---- DANS LA SALLE DU COFFRE ----
       Bornes du dallage, seuil de sortie, objet le plus proche. On sort tot :
       ni fontaine, ni lieux, ni envoi reseau ici — le serveur ne connait pas
       la salle, et continuer a lui envoyer notre position ferait glisser
       notre avatar a travers le Nexus pendant qu'on est a l'interieur. */
    /* Le repli se verifie a CHAQUE image, dans les deux scenes : on peut
       perdre sa vie n'importe ou, et un controle qui ne tourne que dans un
       lieu serait une protection qui s'eteint sans prevenir. */
    verifieRepli();

    if (SCENE === 'coffre') {
      joueur.x = Math.min(Math.max(joueur.x, SALLE.x0), SALLE.x1);
      joueur.y = Math.min(Math.max(joueur.y, SALLE.y0), SALLE.y1);
      /* Le portail ne mord qu'apres qu'on s'en soit ecarte une fois : sans
         ce verrou, apparaitre a portee suffirait a ressortir. */
      var px = joueur.x - SALLE.portail.x, py = joueur.y - SALLE.portail.y;
      var surPortail = px * px + py * py < SALLE.portail.r * SALLE.portail.r;
      if (!surPortail) SALLE.portailArme = true;
      else if (SALLE.portailArme) { sortCoffre(); return; }

      /* Les coffres : on marche dessus, le menu s'ouvre. On ne le REFERME pas
         en s'en allant — on vient peut-etre d'y changer une piece, le fermer
         sous les doigts serait pire que de le laisser ouvert. */
      var surCoffre = null;
      for (var ci = 0; ci < SALLE.coffres.length; ci++) {
        var cf = SALLE.coffres[ci];
        var cdx = joueur.x - cf.x, cdy = joueur.y - cf.y;
        if (cdx * cdx + cdy * cdy < cf.r * cf.r) { surCoffre = cf; break; }
      }
      /* ON NE ROUVRE PAS CE QU'ON VIENT DE FERMER. Le menu se rouvrait a
         l'image SUIVANTE : on est toujours sur le coffre, donc la condition
         « dessus et pas ouvert » redevenait vraie aussitot. La croix
         marchait — elle etait annulee un seizieme de seconde plus tard, ce
         qui se lit exactement comme un bouton mort. On retient donc le
         coffre qu'on a ferme, et on ne le rouvre qu'apres en etre parti. */
      coffreSous = surCoffre;
      if (surCoffre !== coffreFerme) coffreFerme = null;
      if (surCoffre && !coffreOuvert && surCoffre !== coffreFerme) ouvreCoffreMenu();

      var quoi = surPortail ? 'portail' : (surCoffre ? 'coffre' : 'salle');
      if (quoi !== indiceActuel) {
        indiceActuel = quoi;
        if (indiceEl) {
          indiceEl.innerHTML = quoi === 'portail'
            ? 'Step in to return to the <b>Nexus</b>'
            : quoi === 'coffre' ? 'Your <b>vault</b> is open'
            : 'Walk onto a chest to open your vault &middot; the portal takes you home';
          indiceEl.classList.add('on');
        }
      }
      if (!saut.en_cours) avanceCadre(joueur, PERSO, dt);
      else {
        saut.chrono += dt;
        saut.cadre = Math.min(PERSONNAGES[PERSO].images - 1, Math.floor(saut.chrono * FPS_ANIM));
        if (saut.chrono >= saut.duree) saut.en_cours = false;
      }
      return;
    }

    // bords du monde
    joueur.x = Math.min(Math.max(joueur.x, 40), MONDE.w - 40);
    joueur.y = Math.min(Math.max(joueur.y, 40), MONDE.h - 40);

    // la fontaine ne se traverse pas : on ressort le joueur au bord du cercle
    var f = LIEUX[0];
    var fdx = joueur.x - f.x, fdy = joueur.y - (f.y - COL_FONT.dy);
    var fu = fdx / COL_FONT.rx, fv = fdy / COL_FONT.ry;
    var fdd = fu * fu + fv * fv;
    if (fdd < 1 && fdd > 1e-6) {
      var fk = 1 / Math.sqrt(fdd);       // de combien il faut s'ecarter
      joueur.x = f.x + fdx * fk;
      joueur.y = (f.y - COL_FONT.dy) + fdy * fk;
    }

    // le saut, en cadres, independamment du deplacement
    if (saut.en_cours) {
      saut.chrono += dt;
      saut.cadre = Math.min(PERSONNAGES[PERSO].images - 1, Math.floor(saut.chrono * FPS_ANIM));
      if (saut.chrono >= saut.duree) saut.en_cours = false;
    }

    // l'animation de marche/repos, en boucle — le saut a sa propre pendule plus haut
    if (!saut.en_cours) avanceCadre(joueur, PERSO, dt);

    // notre position part au serveur, au clavier — pas a chaque trame, le
    // reseau n'en tire rien de plus
    chronoEnvoi += dt;
    if (chronoEnvoi >= ENVOI_INTERVAL && enLigne) {
      chronoEnvoi = 0;
      envoie({ type: 'nexusMove', x: Math.round(joueur.x), y: Math.round(joueur.y),
               dir: joueur.dir, anim: joueur.anim });
    }

    // les joueurs croises : leur cadre avance comme le notre, et leur
    // position AFFICHEE glisse vers la derniere recue plutot que d'y sauter
    Object.keys(DISTANTS).forEach(function (a) {
      var d = DISTANTS[a];
      avanceCadre(d, d.skin, dt);
      var t = Math.min(1, dt * 10);
      d.rx += (d.x - d.rx) * t;
      d.ry += (d.y - d.ry) * t;
    });

    // les lieux : proximite, entree apres un court sejour, indice affiche
    var proche = null, plusPresDist = Infinity, entre = false;
    LIEUX.forEach(function (l) {
      /* `return` dans un forEach ne sort que du tour courant. Sans ce verrou,
         entrer dans le coffre deplacerait le joueur dans la salle, et les
         lieux SUIVANTS seraient mesures avec ces coordonnees-la — on
         ressortirait aussitot par une porte qu'on n'a pas prise. */
      if (entre || !l.rayon) return;
      var ddx = joueur.x - l.x, ddy = joueur.y - (l.y - l.haut * 0.15);
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < l.rayon) {
        l.dwell += dt;
        if (l.dwell > 0.45) {
          if (l.cle === 'coffre') { entreCoffre(); entre = true; return; }
          /* L'etal etait le dernier endroit du Nexus qui faisait SORTIR du
             jeu pour acheter. Il ouvre son panneau sur place.
             Le garde-fou compte : le sejour se remet a zero et RECOMMENCE a
             s'accumuler tant qu'on reste dessus. Sans lui, la boutique se
             rouvrait toutes les demi-secondes et chaque reouverture
             redemandait son etat au serveur — ce qui effacait l'annonce du
             coffre qu'on venait d'ouvrir, sous les yeux du joueur. */
          if (l.cle === 'etal') { if (!shopOuvert) ouvreShop(); l.dwell = 0; entre = true; return; }
          location.href = l.href;
        }
      } else l.dwell = 0;
      if (dist < l.rayon * 1.8 && dist < plusPresDist) { plusPresDist = dist; proche = l; }
    });
    if (entre) return;
    if (proche !== indiceActuel) {
      indiceActuel = proche;
      if (indiceEl) {
        if (proche) { indiceEl.innerHTML = 'Walk in to open <b>' + proche.nom + '</b>'; indiceEl.classList.add('on'); }
        else indiceEl.classList.remove('on');
      }
    }
  }

  /* ================== LE ZOOM ==================
   *
   * Le monde etait dessine en 1:1 : sur un grand ecran on voyait donc la
   * carte ENTIERE, minuscule, avec du vide tout autour — et sur un petit
   * ecran, un mouchoir de poche. La taille du personnage dependait du
   * moniteur, ce qu'aucun jeu ne fait.
   *
   * On fixe desormais la HAUTEUR DE MONDE visible et on met a l'echelle
   * pour la faire tenir. Le joueur voit toujours la meme chose, sur un
   * telephone comme sur un ecran large — c'est la regle de RotMG, et c'est
   * aussi la seule qui rende le jeu equitable : sinon un grand ecran verrait
   * arriver les monstres plus tot.
   *
   * On ne descend jamais sous 1 : agrandir des pixels est acceptable, les
   * reduire rend le pixel art sale. */
  var MONDE_VISIBLE_H = 1000;    // unites de monde vues verticalement
  function zoomCourant(vueH) {
    return Math.max(1, Math.min(4, vueH / MONDE_VISIBLE_H));
  }

  function camAxe(pos, vue, monde) {
    if (monde <= vue) return (monde - vue) / 2;
    return Math.min(Math.max(pos - vue / 2, 0), monde - vue);
  }

  /* La largeur que le panneau prend sur la droite. On la LIT plutot que de la
     recopier : elle est definie en CSS (`--nxp`) et change avec la taille de
     l'ecran — deux chiffres a tenir d'accord finiraient par diverger, et le
     personnage se retrouverait a moitie cache derriere le panneau sur une
     seule des trois tailles. */
  function largeurPanneau() {
    var p = document.getElementById('nxPanneau');
    if (!p) return 0;
    var cs = getComputedStyle(p);
    if (cs.display === 'none') return 0;
    /* Replie, il est toujours LA — juste pousse hors de l'ecran par un
       `translateX`. Sa largeur mesuree reste donc la meme, et s'y fier
       laisserait le joueur decale a gauche pour rien. On lit l'etat, pas la
       geometrie. */
    if (enveloppe && enveloppe.classList.contains('replie')) return 0;
    return p.getBoundingClientRect().width || 0;
  }

  function dessine() {
    var vueW = canvas.width / DPR, vueH = canvas.height / DPR;
    var zoom = zoomCourant(vueH);
    /* On centre le joueur sur la partie VISIBLE, pas sur la fenetre : sinon
       il marche sous le panneau, et on avance a l'aveugle vers la droite. */
    /* La largeur libre, convertie en unites de MONDE : c'est en monde que la
       camera se cadre, et melanger les deux mettrait le personnage a cote du
       centre des que le zoom change. */
    var libre = Math.max(120, vueW - largeurPanneau()) / zoom;
    var hauteurMonde = vueH / zoom;
    /* `camAxe` cadre sur la largeur LIBRE : le joueur se retrouve donc au
       milieu de ce qu'on voit. Le canvas, lui, continue de peindre toute la
       fenetre — le surplus passe derriere le panneau, ce qui evite une bande
       vide a sa gauche quand on longe le bord droit de la carte. */
    var lieu = scene();
    var camX = camAxe(joueur.x, libre, lieu.w);
    var camY = camAxe(joueur.y, hauteurMonde, lieu.h);

    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.fillStyle = '#0A1128';
    ctx.fillRect(0, 0, vueW, vueH);
    /* Le pixel art se met a l'echelle SANS lissage : interpole, il devient
       flou et perd exactement ce qui fait son style. */
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    /* ---- LA SALLE DU COFFRE ----
       Un seul dessin, mis a l'echelle de la piece : pas de tuiles a decouper,
       la salle EST une image. On sort tot, le Nexus ne la concerne pas. */
    if (SCENE === 'coffre') {
      if (SALLE.img.complete) ctx.drawImage(SALLE.img, 0, 0, SALLE.w, SALLE.h);
      /* Un halo doux sous chaque coffre : le dessin de la piece en montre
         cinq, mais rien n'y dit qu'on peut marcher dessus. */
      SALLE.coffres.forEach(function (cf) { halo(cf.x, cf.y, cf.r, '#FFC53D', 0.18); });
      var pileC = [{ y: SALLE.portail.y, dessine: dessinePortail }];
      pileC.push({ y: joueur.y, dessine: function () {
        var cadreC = joueur.anim === 'jump' ? saut.cadre : joueur.cadre;
        dessineAvatar(joueur.x, joueur.y, PERSO, joueur.dir, joueur.anim, cadreC);
      } });
      pileC.sort(function (a, b) { return a.y - b.y; });
      pileC.forEach(function (p) { p.dessine(); });
      ctx.restore();
      DERNIERE_CAM.x = camX; DERNIERE_CAM.y = camY; DERNIERE_CAM.z = zoom;
      return;
    }

    // le sol : seulement les tuiles qui touchent l'ecran
    var c0 = Math.max(0, Math.floor(camX / TUILE));
    var c1 = Math.min(CARTE.cols - 1, Math.ceil((camX + libre + TUILE) / TUILE));
    var r0 = Math.max(0, Math.floor(camY / TUILE));
    var r1 = Math.min(CARTE.rows - 1, Math.ceil((camY + hauteurMonde + TUILE) / TUILE));
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var cx = c * TUILE + TUILE / 2, cy = r * TUILE + TUILE / 2;
        var t = estChemin(cx, cy) ? TUILES.chemin : TUILES.herbe;
        if (t.complete) ctx.drawImage(t, c * TUILE, r * TUILE, TUILE, TUILE);
      }
    }

    // les lieux, le joueur et les autres, tries par leurs "pieds" : ce qui
    // est plus bas a l'ecran se dessine par-dessus, comme dans n'importe
    // quelle vue du dessus a la RotMG.
    var pile = LIEUX.map(function (l) { return { y: l.y, dessine: function () {
      if (l.img.complete) ctx.drawImage(l.img, l.x - l.larg / 2, l.y - l.haut, l.larg, l.haut);
    } }; });
    pile.push({ y: joueur.y, dessine: function () {
      var cadre = joueur.anim === 'jump' ? saut.cadre : joueur.cadre;
      dessineAvatar(joueur.x, joueur.y, PERSO, joueur.dir, joueur.anim, cadre);
    } });
    Object.keys(DISTANTS).forEach(function (a) {
      var d = DISTANTS[a];
      pile.push({ y: d.ry, dessine: function () {
        dessineAvatar(d.rx, d.ry, d.skin, d.dir, d.anim, d.cadre);
      } });
    });
    pile.sort(function (a, b) { return a.y - b.y; });
    pile.forEach(function (p) { p.dessine(); });

    /* Les projectiles passent PAR-DESSUS tout le monde : ils volent, ils ne
       marchent pas. Les trier avec les personnages les ferait disparaitre
       derriere une fontaine a mi-course. */
    dessineTirs();

    ctx.restore();
    /* La camera de CETTE image sert a convertir le curseur en coordonnees
       monde au tir suivant. La retenir ici evite de la recalculer, et surtout
       d'en utiliser une autre que celle qu'on vient de peindre. */
    DERNIERE_CAM.x = camX; DERNIERE_CAM.y = camY; DERNIERE_CAM.z = zoom;
  }
  var DERNIERE_CAM = { x: 0, y: 0, z: 1 };

  /** Une tache lumineuse posee au sol : « ici, il se passe quelque chose »,
      sans poser un second dessin par-dessus le decor. */
  function halo(x, y, r, couleur, force) {
    ctx.save();
    ctx.globalAlpha = force;
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* Le portail du coffre : le MEME dessin que celui du Nexus, en plus petit.
     Reutiliser l'image plutot que d'en inventer une seconde fait qu'un joueur
     reconnait la sortie sans qu'on la lui explique. */
  function dessinePortail() {
    var p = SALLE.portail;
    halo(p.x, p.y, p.r, '#8FD4FF', 0.24);
    var img = LIEUX[1] && LIEUX[1].img;
    if (img && img.complete) ctx.drawImage(img, p.x - p.larg / 2, p.y - p.haut, p.larg, p.haut);
  }

  function dessineAvatar(x, y, cle, dir, anim, cadre) {
    var s = SPRITES[cle];
    var img = s && s.pret && s.images[anim + '_' + dir];
    if (!img) {
      // pas encore charge : un jeton simple a la place, pour que la scene
      // reste lisible pendant le prechargement plutot que de rester vide.
      ctx.fillStyle = '#8DA0C4';
      ctx.beginPath(); ctx.ellipse(x, y - 40, 26, 34, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var rc = rectangleCadre(cle, cadre);
    var disp = 150;
    ctx.drawImage(img, rc.sx, rc.sy, CADRE, CADRE, x - disp / 2, y - disp + 20, disp, disp);
  }

  // ------------------------------------------------------- la carte du lieu
  //
  // Le decor ne bouge JAMAIS : on le peint une fois pour toutes sur un canvas
  // garde en memoire, et chaque trame ne recopie que ce fond plus les points
  // qui, eux, se deplacent. Redessiner l'herbe soixante fois par seconde pour
  // qu'elle ne change pas serait le plus gros travail du panneau, pour rien.

  var mini = document.getElementById('nxMini');
  var mctx = mini && mini.getContext('2d');
  var MINI = 120;                       // cotes du canvas, en pixels
  var fondMini = null;

  function construitFondMini() {
    var c = document.createElement('canvas');
    c.width = MINI; c.height = MINI;
    var g = c.getContext('2d');
    /* La carte n'est pas carree (2560 x 1920) : on garde ses proportions et
       on centre, plutot que de l'etirer — une carte deformee ne se
       superpose plus a ce qu'on voit a l'ecran. */
    var e = Math.min(MINI / MONDE.w, MINI / MONDE.h);
    var ox = (MINI - MONDE.w * e) / 2, oy = (MINI - MONDE.h * e) / 2;
    g.fillStyle = '#000'; g.fillRect(0, 0, MINI, MINI);
    g.fillStyle = '#24401c'; g.fillRect(ox, oy, MONDE.w * e, MONDE.h * e);
    // les chemins, echantillonnes a la tuile
    g.fillStyle = '#8f8f88';
    for (var r = 0; r < CARTE.rows; r++) {
      for (var c2 = 0; c2 < CARTE.cols; c2++) {
        var cx = c2 * TUILE + TUILE / 2, cy = r * TUILE + TUILE / 2;
        if (estChemin(cx, cy)) g.fillRect(ox + c2 * TUILE * e, oy + r * TUILE * e,
                                          Math.ceil(TUILE * e), Math.ceil(TUILE * e));
      }
    }
    // les lieux, chacun de sa couleur
    var TEINTE = { fontaine: '#3fa9f5', portail: '#c04ce0', etal: '#e0a33c', coffre: '#d8d8d8' };
    LIEUX.forEach(function (l) {
      g.fillStyle = TEINTE[l.cle] || '#fff';
      var w = Math.max(3, l.larg * e * 0.6), h = Math.max(3, l.haut * e * 0.6);
      g.fillRect(ox + l.x * e - w / 2, oy + l.y * e - h, w, h);
    });
    fondMini = { c: c, e: e, ox: ox, oy: oy };
  }

  function peintMini() {
    /* Dans la salle du coffre, la mini-carte montrerait le Nexus — un plan
       de l'endroit ou l'on n'est PAS. On la remplace par son nom : c'est la
       seule chose vraie qu'on puisse y ecrire. */
    if (SCENE === 'coffre') {
      var gc = mini && mini.getContext ? mini.getContext('2d') : null;
      if (!gc) return;
      gc.clearRect(0, 0, MINI, MINI);
      gc.fillStyle = '#1b1710'; gc.fillRect(0, 0, MINI, MINI);
      gc.fillStyle = '#C8A24A';
      gc.font = '700 11px system-ui, sans-serif';
      gc.textAlign = 'center'; gc.textBaseline = 'middle';
      gc.fillText('VAULT', MINI / 2, MINI / 2);
      return;
    }
    if (!mctx) return;
    if (!fondMini) construitFondMini();
    mctx.clearRect(0, 0, MINI, MINI);
    mctx.drawImage(fondMini.c, 0, 0);
    var e = fondMini.e, ox = fondMini.ox, oy = fondMini.oy;
    // les autres, en vert ; nous, en blanc et un cran plus gros
    mctx.fillStyle = '#63d13f';
    Object.keys(DISTANTS).forEach(function (a) {
      var d = DISTANTS[a];
      mctx.fillRect(ox + d.rx * e - 1.5, oy + d.ry * e - 1.5, 3, 3);
    });
    mctx.fillStyle = '#fff';
    mctx.fillRect(ox + joueur.x * e - 2, oy + joueur.y * e - 2, 4, 4);
  }

  // ------------------------------------------------------- le cadrage

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  function redimensionne() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
  }
  window.addEventListener('resize', redimensionne);
  window.addEventListener('orientationchange', redimensionne);
  redimensionne();

  var dernier = null;
  function boucle(t) {
    if (dernier === null) dernier = t;
    var dt = Math.min((t - dernier) / 1000, 1 / 20);
    dernier = t;
    maj(dt);
    majTirs(dt, DERNIERE_CAM.x, DERNIERE_CAM.y);
    dessine();
    peintMini();
    requestAnimationFrame(boucle);
  }
  requestAnimationFrame(boucle);
  peintPanneau();   // le panneau existe des la premiere image, meme vide
})();
