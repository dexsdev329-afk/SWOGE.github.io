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
      SKINS_C = m.catalogue || SKINS_C;
      if (m.error) shopMsg = { texte: m.error, ok: false };
      else if (m.achete) shopMsg = { texte: '\u2728 ' + m.achete + ' is yours', ok: true };
      if (m.balance != null && BOUTIQUE) BOUTIQUE.balance = m.balance;
      if (shopOuvert) peintShop();
      if (coffreOuvert) peintCoffreMenu();
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
      POTIONS_C = m.potions || POTIONS_C;
      if (m.balance != null && BOUTIQUE) BOUTIQUE.balance = m.balance;
      if (m.achat) shopMsg = { texte: '\u2728 ' + m.achat.livre + ' potion' +
        (m.achat.livre > 1 ? 's' : '') + ' \u2014 ' + m.achat.prix + ' $SWOGE', ok: true };
      if (shopOuvert) peintShop();
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
    if (m.type === 'potionBue') {
      POTIONS_C = m.potions || POTIONS_C;
      if (m.pv !== null && m.pv !== undefined) { VIE.pv = m.pv; moiMonde.pv = m.pv; }
      if (m.mp !== null && m.mp !== undefined) { VIE.mp = m.mp; peintPouvoir(); }
      joueSample('clic2', { vol: 0.55, hauteur: 1.3 });
      flotte('+' + m.soigne + ' ' + (m.quoi === 'hp' ? 'HP' : 'MP'));
      peintPanneau();
    }
    if (m.type === 'realmEntre') entreMonde(m);
    if (m.type === 'realmRefus') {
      if (indiceEl) {
        indiceEl.innerHTML = m.raison === 'no-character'
          ? 'Buy a character first — the wild is no place without one'
          : 'The gate refused you';
        indiceEl.classList.add('on');
      }
    }
    if (m.type === 'realmEtat' && SCENE === 'monde') recoitMonde(m);
    /* ---- LA REPONSE A LA BARRE D'ESPACE ----
     * Elle arrive TOUJOURS, y compris sur un refus : une touche qui ne
     * repond rien se lit comme un bug, pas comme un manque de mana. On le
     * dit avec le meme texte flottant que le reste — au milieu de l'ecran,
     * la ou le joueur regarde, pas dans un coin du panneau. */
    if (m.type === 'realmPouvoir') {
      if (m.refus === 'mana') {
        flotte('Not enough mana');
        joueSample('clic', { vol: 0.3, hauteur: 0.7 });
      } else if (m.refus === 'recharge') {
        flotte('Recharging \u2014 ' + m.reste.toFixed(1) + 's');
      } else if (m.refus === 'aucun') {
        flotte('No fruit equipped');
      } else if (!m.refus) {
        VIE.mp = m.mp;
        POUVOIR_ETAT.recharge = m.recharge || 0;
        if (m.cle === 'rafale') { POUVOIR_ETAT.rafale = m.duree || 0; flotte('RAPID FIRE'); }
        if (m.cle === 'stase') flotte('STASIS \u00b7 ' + (m.figes || []).length);
        if (m.cle === 'foudre') flotte(m.vide ? 'No target in range' : '\u26a1 ' + m.perte);
        effetPouvoir(m);
        joueSample(m.cle === 'stase' ? 'vault' : 'niveau',
                   { vol: m.cle === 'foudre' ? 0.55 : 0.4, hauteur: m.cle === 'stase' ? 0.75 : 1.35,
                     duree: 0.5 });
        majJauges(); peintPouvoir();
      }
    }
    /* ---- CE QU'ON TOUCHE, ET CE QU'ON ENCAISSE ----
     *
     * Un monstre touche pousse le MEME cri que lorsqu'il meurt, en beaucoup
     * plus discret et coupe court : c'est la meme creature qui souffre, et
     * lui donner deux voix sans rapport donnerait l'impression de deux
     * bestioles differentes. La mort se distingue par le volume et par le
     * fait qu'elle va au bout.
     *
     * Nos propres degats gardent `degat.mp3`, franc et grave : ce qui nous
     * arrive ne doit surtout pas ressembler a ce qu'on inflige. */
    if (m.type === 'realmTouche' && SCENE === 'monde') {
      joueSample(Math.random() < 0.5 ? 'mort' : 'mort2',
                 { vol: 0.22, hauteur: 1.15 + Math.random() * 0.2, duree: 0.28 });
    }
    if (m.type === 'realmCoup' && SCENE === 'monde') {
      VIE.pv = m.pv; moiMonde.pv = m.pv;
      joueSample('degat', { vol: 0.75, hauteur: 0.8, duree: 0.8 });
      secousse = 0.16;
      /* ---- LE COUP QUI CLOUE AU SOL ----
       * Perdre le controle sans un mot se lit comme une page qui a plante,
       * pas comme une attaque. On le NOMME, on le fait entendre plus grave
       * que le reste, et le cercle autour des pieds dira le temps qu'il
       * reste. */
      if (m.paralyse > 0) {
        PARALYSE = m.paralyse;
        flotte('PARALYZED');
        joueSample('vault', { vol: 0.5, hauteur: 0.55, duree: 0.7 });
        secousse = 0.3;
      }
      majJauges();
    }
    if (m.type === 'realmKill') {
      /* Deux cris tires au hasard : un monstre qui meurt toujours pareil
         devient une machine au bout de dix. */
      joueSample(Math.random() < 0.5 ? 'mort' : 'mort2', { vol: 0.7 });
      moiMonde.xp = m.total;
      flotte('+' + m.xp + ' XP');
      /* ---- LA BARRE MONTE TOUT DE SUITE ----
       * Elle ne bougeait qu'a la prochaine fiche complete, c'est-a-dire au
       * prochain changement d'equipement : on tuait dix monstres sans rien
       * voir avancer. Le serveur envoie deja le total avec chaque mise a
       * mort — il ne manquait que de le poser.
       *
       * Les BORNES du niveau (debut et fin) ne changent qu'en changeant de
       * niveau. Tant qu'on reste dans le meme, l'XP suffit ; quand il monte,
       * on redemande la fiche parce que les stats bougent avec. */
      if (FICHE) {
        FICHE.xp = m.total;
        if (m.niveau !== FICHE.niveau) { if (enLigne) envoie({ type: 'personnage', skin: PERSO }); }
        else peintPanneau();
      }
      if (m.monte) { joueSample('niveau', { vol: 0.9 }); flotte('LEVEL ' + m.niveau); }
    }
    /* La mort arrive du SERVEUR : c'est lui qui l'a constatee, jamais nous. */
    if (m.type === 'realmMort') {
      SCENE = 'nexus'; MONSTRES_C = {}; TIRS_C = []; DISTANTS_M = {};
      POUVOIR_C = null; EFFETS_P = []; PARALYSE = 0; peintPouvoir();
      var pp = LIEUX[1];
      joueur.x = pp.x; joueur.y = pp.y + pp.rayon + 60;
      VIE.pv = VIE.max;
      if (indiceEl) indiceEl.classList.remove('on');
      joueSample('mort2', { vol: 0.9 });
      montreMort(m);
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
  var elOr = document.getElementById('nxOr');
  var elRepli = document.getElementById('nxRepli');
  var elPotions = document.getElementById('nxPotions');
  var POTIONS_C = [];
  var elHpJauge = document.getElementById('nxHpJauge');
  var elMpJauge = document.getElementById('nxMpJauge');
  if (elRepli) elRepli.addEventListener('click', function () { clic(true); retourNexus('bouton'); });
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

  /* La pastille du coin a ete retiree : un seul chiffre pose sur une case ne
     pouvait pas dire « +21 DEF et +170 HP », et choisir le plus gros des deux
     revenait a en cacher un. C'est la FICHE au survol qui porte l'information
     maintenant, en entier. `bonusEnTete` reste : la mini-carte et le menu du
     coffre s'en servent encore pour trier. */

  /* ================== LA FICHE D'UN OBJET ==================
   *
   * Une case de sac fait vingt pixels de cote : elle ne peut pas dire ce que
   * la piece apporte. La pastille essayait, avec un seul chiffre, et elle
   * mentait des qu'un objet touchait plus d'une stat — « +21 » sur un
   * plastron qui donne aussi 170 points de vie.
   *
   * Le survol ouvre donc la fiche complete. Elle vit sur `document`, en un
   * seul exemplaire : les cases sont refaites a chaque peinture du panneau,
   * et des ecouteurs poses sur elles disparaitraient avec.
   */
  var elFiche = null;

  /** L'objet derriere une case, d'ou qu'elle vienne. Les trois surfaces —
      equipement, sac, coffre — portent la meme forme de donnee, mais pas au
      meme endroit : on les cherche la ou elles sont plutot que de recopier
      l'objet dans le HTML. */
  function objetDeLaCase(el) {
    if (!el || !el.dataset) return null;
    if (el.dataset.slot && el.dataset.item) return FICHE ? FICHE[el.dataset.slot] : null;
    if (el.dataset.sac) {
      /* Par la PLACE et non par l'identifiant : deux exemplaires du meme
         objet occupent deux cases, et chercher par identifiant rendrait
         toujours le premier — juste ici, faux le jour ou les deux
         differeront. */
      var pl = Number(el.dataset.place);
      var parPlace = (SAC || []).filter(function (o) { return o.place === pl; })[0];
      return parPlace || (SAC || []).filter(function (o) { return o.id === Number(el.dataset.sac); })[0] || null;
    }
    if (el.dataset.item && el.classList && el.classList.contains('nxcf-i')) {
      var id = Number(el.dataset.item), t = null;
      ['fruits', 'armes', 'armures', 'bagues'].forEach(function (c) {
        if (t) return;
        t = ((COFFRE && COFFRE[c]) || []).filter(function (o) { return o.id === id; })[0] || null;
      });
      return t;
    }
    return null;
  }

  function montreFiche(o, cible) {
    if (!o) return cacheFiche();
    if (!elFiche) elFiche = document.getElementById('nxFiche');
    if (!elFiche) return;
    var lignes = '';
    for (var k in (o.bonus || {})) {
      if (o.bonus[k]) lignes += '<s>+' + o.bonus[k] + ' ' + k.toUpperCase() + '</s>';
    }
    if (o.degats) lignes += '<i>' + o.degats[0] + '\u2013' + o.degats[1] + ' damage</i>';
    /* Une arme ne donne plus aucune stat : sans ce mot, sa fiche n'aurait
       qu'une ligne de degats et donnerait l'impression d'etre incomplete. */
    /* `degats` n'est pose que sur les armes : c'est donc lui, et pas la
       saison, qui reconnait une arme — la saison n'accompagne pas toutes les
       formes d'objet envoyees par le serveur. */
    if (o.degats) lignes += '<em>Weapons give damage, not stats</em>';
    else if (!lignes) lignes = '<em>No stat bonus</em>';
    elFiche.innerHTML = '<b>' + ech(o.nom || '') + '</b>' + lignes;
    elFiche.style.setProperty('--fc', o.couleur || '#EAF2FF');
    elFiche.classList.add('on');
    poseFiche(cible);
  }

  /** On l'ancre a la CASE, pas au pointeur : une fiche qui suit la souris
      tremble sous le doigt et sort de l'ecran au bord. Le panneau est a
      droite, donc elle s'ouvre a GAUCHE de la case ; si la place manque, elle
      repasse a droite plutot que d'etre coupee. */
  function poseFiche(cible) {
    if (!elFiche || !cible) return;
    var r = cible.getBoundingClientRect();
    var f = elFiche.getBoundingClientRect();
    var x = r.left - f.width - 10;
    if (x < 8) x = Math.min(window.innerWidth - f.width - 8, r.right + 10);
    var y = Math.min(window.innerHeight - f.height - 8, Math.max(8, r.top - 4));
    elFiche.style.left = Math.round(x) + 'px';
    elFiche.style.top = Math.round(y) + 'px';
  }

  function cacheFiche() {
    if (elFiche) elFiche.classList.remove('on');
  }

  /* Le survol a la souris. Sur telephone il n'existe pas : c'est le
     GLISSEMENT qui ouvre la fiche (voir `debutPrise`), ce qui revient au meme
     geste — on prend la piece pour savoir ce qu'elle vaut. */
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    if (PRISE) return;
    var el = ev.target.closest ? ev.target.closest('[data-sac],[data-slot],.nxcf-i') : null;
    if (!el) return cacheFiche();
    montreFiche(objetDeLaCase(el), el);
  });
  document.addEventListener('pointerout', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-sac],[data-slot],.nxcf-i') : null;
    if (el) cacheFiche();
  });

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
    cacheFiche();
    if (elFantome) { elFantome.remove(); elFantome = null; }
    PRISE = null;
    document.body.classList.remove('nxdrag');
  }

  function debutPrise(ev, source) {
    PRISE = source;
    /* Au doigt il n'y a pas de survol : prendre la piece EST le geste par
       lequel on demande « c'est quoi ? ». On ouvre donc la fiche a ce
       moment-la, ancree a la case d'origine. */
    if (source.el) montreFiche(objetDeLaCase(source.el), source.el);
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
      debutPrise(ev, { de: 'sac', id: Number(el.dataset.sac), src: src, el: el });
    } else if (el.dataset.slot && el.dataset.item) {
      debutPrise(ev, { de: 'equip', slot: el.dataset.slot, id: Number(el.dataset.item), src: src, el: el });
    } else if (el.dataset.item && el.classList.contains('nxcf-i')) {
      debutPrise(ev, { de: 'coffre', id: Number(el.dataset.item), src: src, el: el });
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
    /* ---- L'OR ----
     * Deux nombres, pas un : le total DEJA acquis, et ce que le personnage
     * vivant rapportera s'il meurt. Les confondre ferait croire qu'on possede
     * une somme qu'on peut encore perdre — c'est exactement l'inverse, elle
     * n'est versee qu'a la mort. Le second est donc ecrit en retrait. */
    /* Le repli ne s'affiche QUE s'il y a un endroit d'ou revenir. Dans le
       Nexus il ne ferait rien, et un bouton qui ne fait rien apprend au
       joueur a ne plus le regarder. */
    if (elRepli) elRepli.style.display = (SCENE === 'nexus') ? 'none' : '';
    if (elOr && FICHE) {
      var acquis = FICHE.fameCompte || 0, enCours = FICHE.fame || 0;
      elOr.innerHTML = '\uD83C\uDFC6<b>' + acquis.toLocaleString('en-US') + '</b>' +
        (enCours ? '<i>+' + enCours.toLocaleString('en-US') + '</i>' : '');
      elOr.title = 'Gold: ' + acquis.toLocaleString('en-US') + ' banked' +
        (enCours ? ', ' + enCours.toLocaleString('en-US') + ' riding on this character' : '');
    }
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
      /* ---- LA JAUGE SE VIDE ----
       * Elle etait figee a 100 % : le nombre baissait, la barre non. Dans un
       * combat on ne lit pas un nombre, on regarde une longueur — c'est
       * pour ca qu'on en met une. */
      if (elHpJauge) elHpJauge.style.width =
        (VIE.max > 0 ? Math.max(0, Math.min(100, VIE.pv * 100 / VIE.max)) : 100) + '%';
      if (elMpJauge) elMpJauge.style.width =
        (VIE.mpMax > 0 ? Math.max(0, Math.min(100, VIE.mp * 100 / VIE.mpMax)) : 100) + '%';
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
      /* Le FRUIT porte le pouvoir : c'est la seule case qui a un etat de
         recharge. Le voile est pose vide ici et rempli par `majJauges`, dix
         fois par seconde — le reconstruire a chaque image detruirait la piece
         qu'on est peut-etre en train de faire glisser. */
      var cd = (k === 'equipFruit' && POUVOIR_C) ? '<i class="cd"></i>' : '';
      /* Plus de pastille, et plus de `title` : la premiere disait UNE stat
         sur trois sans dire laquelle, le second est l'infobulle du
         navigateur — lente, laide, et impossible a mettre aux couleurs du
         jeu. Le survol ouvre la vraie fiche (voir `montreFiche`). */
      return '<div class="nxp-c" data-slot="' + k + '" data-item="' + e.item + '">' +
        '<img alt="" src="img/shop/' + encodeURIComponent(e.cle) + '.webp" ' +
        'onerror="this.style.visibility=\'hidden\'">' + cd + '</div>';
    }).join('');

    // ---- le sac : le butin ramasse, pas les achats
    var cases = [];
    for (var i = 0; i < CASES_SAC; i++) {
      var o = SAC[i];
      cases.push(o
        ? '<div class="nxp-c" data-sac="' + o.id + '" data-place="' + o.place + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" ' +
          'onerror="this.style.visibility=\'hidden\'"></div>'
        : '<div class="nxp-c vide"><u>' + (i + 1) + '</u></div>');
    }
    elSac.innerHTML = cases.join('');

    /* ---- LES POTIONS ----
       Deux places qui s'empilent, sous le sac. On les BOIT en tapant dessus,
       et seulement dans le monde : ailleurs la potion serait consommee sans
       rien soigner, et le serveur refuse — autant griser le bouton plutot
       que de laisser le joueur decouvrir le refus. */
    if (elPotions) {
      elPotions.innerHTML = (POTIONS_C || []).map(function (p) {
        var vide = !p.quantite;
        return '<button type="button" data-pot="' + ech(p.cle) + '"' +
          (vide || SCENE !== 'monde' ? ' disabled' : '') +
          ' title="' + ech(p.nom + ' — restores ' + p.soigne + ' ' +
            (p.quoi === 'hp' ? 'HP' : 'MP') +
            (SCENE === 'monde' ? '' : ' (only out in the wild)')) + '">' +
          '<img alt="" src="img/nexus/objets/' + encodeURIComponent(p.image) +
          '.webp" onerror="this.remove()"><b>' + p.quantite + '</b></button>';
      }).join('');
      Array.prototype.forEach.call(elPotions.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          clic(true);
          envoie({ type: 'potionBoit', cle: b.getAttribute('data-pot') });
        });
      });
    }

    /* Le panneau vient d'etre reconstruit : le voile de recharge du fruit est
       neuf et vide. On lui redonne son etat, sinon un fruit en pleine
       recharge repasserait en couleur a chaque changement de niveau. */
    majFruit();
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
      rayon: 110, href: 'games.html', nom: 'the wild' },
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
    if (SCENE === 'monde') { quitteMonde(); return true; }
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
    /* DEUX coffres ouvrables sur les cinq du dessin, et ils ne font pas la
       meme chose : celui du milieu porte les objets, celui de gauche les
       personnages. Les trois autres restent du decor en attendant leur role.
       Un coffre par usage plutot qu'un menu a onglets : on va au coffre des
       personnages pour changer de personnage, et le chemin dit deja ce qu'on
       vient faire. */
    coffres: [
      { x: 1600 * 0.500, y: 1600 * 0.842, r: 74, role: 'objets' },
      { x: 1600 * 0.375, y: 1600 * 0.842, r: 70, role: 'skins' },
    ],
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

  function scene() {
    if (SCENE === 'coffre') return SALLE;
    if (SCENE === 'monde' && MONDE_C) return MONDE_C.monde;
    return { w: MONDE.w, h: MONDE.h };
  }

  /* ================== LE MONDE DE COMBAT, COTE CLIENT ==================
   *
   * Le serveur simule tout : les monstres, les degats, les morts, l'XP. Ce
   * qui suit ne fait que DESSINER ce qu'il annonce, et lui renvoyer deux
   * choses — ou l'on est, et dans quelle direction on tire.
   *
   * Consequence directe : rien ici ne doit « decider ». Un monstre a les
   * points de vie que le serveur lui donne, pas ceux qu'on a compte en
   * regardant nos propres tirs. Si les deux divergent, c'est le serveur qui
   * a raison, toujours.
   *
   * Les positions arrivent DIX fois par seconde. A soixante images, un
   * monstre poserait donc six fois le pied au meme endroit puis sauterait.
   * On garde une position AFFICHEE qui glisse vers la derniere recue —
   * exactement ce que fait deja le Nexus pour les autres joueurs.
   */
  var MONDE_C = null;          // la description recue a l'entree
  var MONSTRES_C = {};         // id -> etat interpole
  var TIRS_C = [];             // nos projectiles, tels que le serveur les voit
  var TIRS_M = [];             // ceux des monstres, contre nous
  var DISTANTS_M = {};         // les autres joueurs du monde
  var TUILES_M = {};           // les trois sols, charges a l'entree
  var moiMonde = { pv: 0, pvMax: 1, xp: 0 };

  /* Les sols des trois anneaux. Charges A L'ENTREE et pas au demarrage : un
     joueur qui ne met jamais les pieds dans le monde n'a pas a telecharger
     trois textures de six cents kilos. */
  var FICHIER_SOL = { terre: 'ground_dirt', neige: 'ground_snow', lave: 'ground_lava' };
  function chargeSols() {
    Object.keys(FICHIER_SOL).forEach(function (b) {
      if (TUILES_M[b]) return;
      var i = new Image();
      i.src = 'img/nexus/tiles/' + FICHIER_SOL[b] + '.webp';
      TUILES_M[b] = i;
    });
  }
  var ATLAS_M = {};
  /* Le dessin d'une espece. Le nom du fichier n'est PAS toujours celui de
     l'espece : une creature dont l'image n'existe pas encore emprunte celle
     d'une autre, et c'est le serveur qui le dit (`sprite`, dans la table des
     especes). Le jour ou l'image arrive, on la depose et on retire une ligne
     de donnee cote serveur — aucun code ne change ici. */
  function atlasMonstre(espece) {
    if (ATLAS_M[espece] !== undefined) return ATLAS_M[espece];
    var t = MONDE_C && MONDE_C.especes && MONDE_C.especes[espece];
    var fichier = (t && t.sprite) || espece;
    var i = new Image();
    i.src = 'img/nexus/monstres/' + encodeURIComponent(fichier) + '.webp';
    ATLAS_M[espece] = i;
    return i;
  }

  /** Le biome sous un point. MEME regle que monde.js, avec les rayons que le
      serveur nous a envoyes — on ne recopie pas les nombres, on les recoit. */
  function biomeEn(x, y) {
    if (!MONDE_C) return 'terre';
    var dx = x - MONDE_C.centre.x, dy = y - MONDE_C.centre.y;
    var r = Math.sqrt(dx * dx + dy * dy) / (MONDE_C.monde.w / 2);
    for (var i = 0; i < MONDE_C.anneaux.length; i++) {
      if (r <= MONDE_C.anneaux[i].jusqua) return MONDE_C.anneaux[i].biome;
    }
    return 'terre';
  }

  /* Ce que le serveur voit autour de nous, dix fois par seconde. On ne
     REMPLACE pas nos monstres : on met a jour ceux qu'on connait, on ajoute
     les nouveaux, on retire ceux qui ne sont plus la. Sans ca, chaque
     message repartirait de zero et l'interpolation n'aurait rien a suivre. */
  function recoitMonde(m) {
    var vus = {};
    (m.monstres || []).forEach(function (o) {
      vus[o.i] = 1;
      var e = MONSTRES_C[o.i];
      if (!e) {
        e = MONSTRES_C[o.i] = { espece: o.e, rx: o.x, ry: o.y, cadre: 0, chrono: 0 };
        atlasMonstre(o.e);
      }
      e.x = o.x; e.y = o.y; e.dir = o.d; e.pv = o.pv; e.pvMax = o.pvMax;
      /* La stase, quand le serveur la marque. Sans ce report, cinq secondes
         de monstres immobiles se liraient comme un serveur qui a lache. */
      e.stase = o.st || 0;
    });
    Object.keys(MONSTRES_C).forEach(function (k) { if (!vus[k]) delete MONSTRES_C[k]; });

    TIRS_C = m.tirs || [];
    TIRS_M = m.tirsM || [];

    var vusJ = {};
    (m.joueurs || []).forEach(function (o) {
      vusJ[o.a] = 1;
      var d = DISTANTS_M[o.a];
      if (!d) d = DISTANTS_M[o.a] = { rx: o.x, ry: o.y, cadre: 0, chrono: 0 };
      d.x = o.x; d.y = o.y; d.dir = o.dir; d.anim = o.anim;
      d.skin = o.skin || 'andy'; d.nom = o.nom; d.pv = o.pv; d.pvMax = o.pvMax;
      assureCharge(d.skin);
    });
    Object.keys(DISTANTS_M).forEach(function (k) { if (!vusJ[k]) delete DISTANTS_M[k]; });

    if (m.moi) {
      moiMonde.pv = m.moi.pv; moiMonde.pvMax = m.moi.pvMax; moiMonde.xp = m.moi.xp;
      /* ---- LA VIE ET LE MANA VIENNENT DU SERVEUR, TOUJOURS ----
       * Ils ne descendent plus seulement : ils REMONTENT tout seuls, a la
       * vitalite et a la sagesse. Ne recopier que sur inegalite des points de
       * vie laisserait la barre de mana figee pendant qu'elle se remplit
       * cote serveur — et le bouton du pouvoir resterait eteint alors qu'il
       * est pret. */
      /* ---- ON NE REPEINT PAS TOUT DIX FOIS PAR SECONDE ----
       * La vie et le mana remontent seuls : ils changent en permanence. Passer
       * par `peintPanneau` a ce rythme reconstruirait le HTML de l'equipement
       * et du sac plusieurs fois par seconde — sous le doigt de qui fait
       * glisser une piece. Seules les jauges bougent ici. La structure ne se
       * refait que quand elle change pour de vrai : plafond de vie modifie
       * (un niveau, un objet), fruit different. */
      var structure = (VIE.max !== m.moi.pvMax || VIE.mpMax !== m.moi.mpMax);
      VIE.pv = m.moi.pv; VIE.max = m.moi.pvMax;
      if (m.moi.mp !== undefined) { VIE.mp = m.moi.mp; VIE.mpMax = m.moi.mpMax; }
      if (m.moi.po !== undefined && m.moi.po !== POUVOIR_C) { POUVOIR_C = m.moi.po; structure = true; }
      POUVOIR_ETAT.recharge = m.moi.poR || 0;
      POUVOIR_ETAT.rafale = m.moi.raf || 0;
      /* Le serveur fait foi sur la paralysie : la page decompte entre deux
         messages pour que ce soit fluide, mais elle se recale sur lui a
         chaque image recue. */
      PARALYSE = m.moi.par || 0;
      if (structure) peintPanneau(); else majJauges();
      peintPouvoir();
      /* On ne se TELEPORTE pas sur la position du serveur a chaque message :
         elle a un dixieme de seconde de retard, et le personnage
         reculerait sans arret. On ne recale que si l'ecart est gros — c'est
         alors que le serveur a refuse quelque chose, et il a raison. */
      var ex = m.moi.x - joueur.x, ey = m.moi.y - joueur.y;
      if (ex * ex + ey * ey > 220 * 220) { joueur.x = m.moi.x; joueur.y = m.moi.y; }
    }
  }

  /* Un texte qui monte et s'efface : « +75 XP », « LEVEL 4 ». Il double une
     information deja dans le panneau, mais au moment ou elle se produit et
     a l'endroit ou l'on regarde. */
  var FLOTTANTS = [];
  function flotte(t) { FLOTTANTS.push({ t: t, vie: 1.5, max: 1.5 }); }
  var secousse = 0;             // l'ecran tremble quand on encaisse

  function entreMonde(m) {
    MONDE_C = m;
    MONSTRES_C = {}; TIRS_C = []; DISTANTS_M = {};
    moiMonde = { pv: m.moi.pv, pvMax: m.moi.pvMax, xp: 0 };
    VIE.pv = m.moi.pv; VIE.max = m.moi.pvMax;
    if (m.moi.mpMax !== undefined) { VIE.mp = m.moi.mp; VIE.mpMax = m.moi.mpMax; }
    /* La table des couts arrive AVEC l'entree, jamais ecrite ici : un chiffre
       en dur cote page finirait par ne plus etre celui que le serveur
       preleve, et le bouton mentirait sur le prix. */
    POUVOIRS_C = m.pouvoirs || null;
    POUVOIR_C = m.moi.pouvoir || null;
    POUVOIR_ETAT = { recharge: 0, rafale: 0 };
    PARALYSE = 0;
    EFFETS_P = [];
    joueur.x = m.moi.x; joueur.y = m.moi.y; joueur.dir = 'up';
    SCENE = 'monde';
    chargeSols();
    fermeCoffreMenu(); fermeShop();
    LIEUX.forEach(function (l) { l.dwell = 0; });
    indiceActuel = null;
    if (indiceEl) {
      /* La ligne d'accueil du monde dit les DEUX choses qu'on ne devine pas :
         par ou repartir, et que la barre d'espace fait quelque chose. Le nom
         du pouvoir vient avec — « special attack » n'apprend rien, « Stasis »
         donne envie d'essayer. */
      var nomPo = (POUVOIRS_C && POUVOIR_C && POUVOIRS_C[POUVOIR_C])
        ? POUVOIRS_C[POUVOIR_C].nom : null;
      indiceEl.innerHTML = 'You are in the <b>wild</b> &middot; ' +
        (nomPo ? '<b>' + (nomTouche(PERSO_TOUCHES.pouvoir) || 'Space') + '</b> for ' +
                 ech(nomPo) + ' &middot; ' : '') +
        'press E to run home';
      indiceEl.classList.add('on');
    }
    peintPanneau();
  }

  function quitteMonde() {
    if (SCENE !== 'monde') return false;
    if (enLigne) envoie({ type: 'realmLeave' });
    SCENE = 'nexus';
    MONSTRES_C = {}; TIRS_C = []; DISTANTS_M = {};
    /* On revient AU PIED DU PORTAIL, pas au centre : c'est par la qu'on est
       parti, et reapparaitre ailleurs donne l'impression d'avoir ete
       deplace. Un cran plus bas pour ne pas repartir aussitot. */
    var p = LIEUX[1];
    joueur.x = p.x; joueur.y = p.y + p.rayon + 60;
    joueur.dir = 'down';
    LIEUX.forEach(function (l) { l.dwell = 0; });
    indiceActuel = null;
    if (indiceEl) indiceEl.classList.remove('on');
    /* LA FONTAINE SOIGNE. Rentrer au Nexus rend toute la vie — c'est le
       sens de la place centrale, et c'est ce qui fait qu'on ose repartir. */
    VIE.pv = VIE.max;
    /* La fontaine rend la vie ET le mana : revenir au Nexus avec une reserve
       vide obligerait a attendre trois minutes sur la place avant de
       repartir, ce qui n'est pas du jeu. */
    VIE.mp = VIE.mpMax;
    POUVOIR_C = null; EFFETS_P = []; PARALYSE = 0;
    peintPouvoir();
    joueSample('vault', { vol: 0.6, hauteur: 1.25 });
    peintPanneau();
    return true;
  }

  /* ================== L'ECRAN DE FIN ==================
   *
   * Mourir est definitif : l'equipement porte est detruit, le sac part, le
   * niveau retombe a zero. Renvoyer le joueur au Nexus sans un mot lui ferait
   * croire a une panne — il verrait ses stats changer sans explication.
   *
   * On montre donc les trois choses qu'il vient chercher : ce qu'il a gagne
   * (l'experience et l'or), ce qu'il a perdu (nommement), et ce qui reste.
   * Le troisieme point compte autant que les deux autres : perdre son
   * equipement et croire qu'on a perdu ses personnages, ce n'est pas la meme
   * partie.
   *
   * L'or, c'est la FAME du serveur. Le mot « fame » ne dit rien a qui n'a
   * jamais joue a RotMG ; « gold » se lit tout seul. Le champ garde son nom
   * cote serveur — renommer un protocole pour une etiquette serait payer
   * cher une question de vocabulaire.
   */
  var elMortVoile = document.getElementById('nxMortVoile');
  var skinChoisi = null;

  function nbCourt(v) {
    var n = Number(v) || 0;
    return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
         : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  }

  function montreMort(m) {
    if (!elMortVoile) return;
    var q = function (c) { return elMortVoile.querySelector(c); };
    q('.nxmt-par').textContent = m.par
      ? 'Killed by a ' + String(m.par).replace(/^./, function (c) { return c.toUpperCase(); })
      : 'Your run is over.';
    q('.nxmt-xp').textContent = nbCourt(m.xp);
    q('.nxmt-or').textContent = '+' + nbCourt(m.fameGagnee);
    q('.nxmt-ort').textContent = nbCourt(m.fameTotale);

    /* Ce qu'on a perdu, NOMMEMENT. « Vous avez perdu votre equipement » ne
       dit pas si la piece mythique y etait ; la liste, si. */
    var bouts = [];
    if (m.perdus && m.perdus.length) {
      bouts.push('Destroyed: <b>' + m.perdus.map(function (o) {
        return ech(o.nom || 'an item'); }).join('</b>, <b>') + '</b>');
    }
    if (m.sacPerdu) {
      bouts.push('Backpack: <b>' + m.sacPerdu + ' item' + (m.sacPerdu > 1 ? 's' : '') + '</b> lost');
    }
    q('.nxmt-perdu').innerHTML = bouts.length ? bouts.join('<br>')
      : 'You were carrying nothing. Nothing was lost.';


    /* Choisir avec QUI repartir. Les skins survivent toujours — c'est ce qui
       permet de relancer tout de suite au lieu de racheter un personnage. */
    var dispo = (m.skins && m.skins.length) ? m.skins : (PERSO ? [PERSO] : []);
    skinChoisi = dispo.indexOf(PERSO) >= 0 ? PERSO : dispo[0] || null;
    q('.nxmt-skins').innerHTML = dispo.map(function (id) {
      return '<button type="button" data-skin="' + ech(id) + '"' +
        (id === skinChoisi ? ' class="on"' : '') + '>' +
        '<img alt="" src="img/skins/skin_' + encodeURIComponent(id) + '.webp"' +
        ' onerror="this.style.visibility=\'hidden\'">' + ech(id) + '</button>';
    }).join('');
    Array.prototype.forEach.call(q('.nxmt-skins').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        skinChoisi = b.getAttribute('data-skin');
        Array.prototype.forEach.call(q('.nxmt-skins').querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x === b);
        });
        clic(false);
      });
    });
    elMortVoile.classList.add('on');

    /* Le sac du panneau se vide TOUT DE SUITE. Le serveur vient de nous dire
       qu'il est perdu ; attendre le message d'inventaire pour le croire
       laisserait le joueur voir son butin intact derriere l'ecran qui lui
       annonce qu'il l'a perdu.
       APRES avoir montre l'ecran, jamais avant : une erreur dans le repeint
       du panneau ne doit pas empecher le bilan de s'afficher. C'est ce qui
       s'est passe a mon premier essai — l'ecran restait a moitie construit,
       sans la liste des personnages. */
    SAC = [];
    try { peintPanneau(); } catch (e) {}
  }

  if (elMortVoile) {
    elMortVoile.querySelector('.nxmt-go').addEventListener('click', function () {
      clic(true);
      /* On change de personnage AVANT de repartir : le serveur repondra
         `skins`, qui redemande la fiche et l'inventaire. Rien a recharger. */
      if (skinChoisi && skinChoisi !== PERSO) envoie({ type: 'skinChoisi', id: skinChoisi });
      else { envoie({ type: 'skins' }); envoie({ type: 'equipable' }); }
      elMortVoile.classList.remove('on');
    });
  }

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
  var BOUTIQUE = null, shopSaison = 2, shopOuvert = false, shopMsg = '', shopLot = 1;
  var SKINS_C = [];            // le catalogue des personnages
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

  /* Les fleches remplacent la barre de defilement : une barre est laide, et
     sur telephone elle n'existe meme pas — on ne devine pas qu'il y a
     quelque chose a droite. Elles s'effacent quand tout tient a l'ecran. */
  function majFleches() {
    if (!elShopOng) return;
    var g = elShopVoile.querySelector('.nxsh-fg'), d = elShopVoile.querySelector('.nxsh-fd');
    if (!g || !d) return;
    var deborde = elShopOng.scrollWidth > elShopOng.clientWidth + 2;
    g.style.display = deborde ? '' : 'none';
    d.style.display = deborde ? '' : 'none';
    g.classList.toggle('off', elShopOng.scrollLeft <= 2);
    d.classList.toggle('off',
      elShopOng.scrollLeft >= elShopOng.scrollWidth - elShopOng.clientWidth - 2);
  }
  if (elShopOng) elShopOng.addEventListener('scroll', majFleches);
  if (elShopVoile) {
    ['fg', 'fd'].forEach(function (c) {
      var b = elShopVoile.querySelector('.nxsh-' + c);
      if (!b) return;
      b.addEventListener('click', function () {
        elShopOng.scrollBy({ left: (c === 'fg' ? -1 : 1) * elShopOng.clientWidth * 0.7,
                             behavior: 'smooth' });
        clic(false);
      });
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
      /* « Season 2 — Weapons » sur quatre onglets deborde de tous les
         telephones. Le numero et le SUJET suffisent : on sait ce qu'on
         ouvre, et les quatre tiennent enfin cote a cote. */
      var SUJET = { fruit: 'Fruits', weapon: 'Weapons', armor: 'Armor', ring: 'Rings' };
      elShopOng.innerHTML = (BOUTIQUE.saisons || []).map(function (s) {
        var court = SUJET[s.sujet] || String(s.nom).split('—').pop().trim();
        return '<button type="button" data-s="' + s.n + '"' +
               (s.n === shopSaison ? ' class="on"' : '') +
               '><b>S' + s.n + '</b> ' + ech(court) + '</button>';
      }).join('') +
      /* Les potions ne sont pas une saison : pas de tirage, pas de plafond,
         prix fixe. Elles ont donc leur onglet a part, apres les quatre —
         les glisser dans la liste des saisons aurait fait croire a une
         cinquieme collection. */
      '<button type="button" data-s="pot"' + (shopSaison === 'pot' ? ' class="on"' : '') +
      '>&#129514; Potions</button>' +
      '<button type="button" data-s="skin"' + (shopSaison === 'skin' ? ' class="on"' : '') +
      '>&#127917; Characters</button>';
      majFleches();
      Array.prototype.forEach.call(elShopOng.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-s');
          shopSaison = (v === 'pot' || v === 'skin') ? v : Number(v);
          shopMsg = '';
          clic(false);
          if (shopSaison === 'pot') peintShop();
          else if (shopSaison === 'skin') { if (enLigne) envoie({ type: 'skins' }); peintShop(); }
          else if (enLigne) envoie({ type: 'shop', season: shopSaison });
        });
      });
    }

    // ---- le rayon des potions
    if (shopSaison === 'pot') {
      var soldeP = Number(BOUTIQUE.balance || 0);
      elShopCorps.innerHTML = (POTIONS_C || []).map(function (p) {
        var reste = p.max - p.quantite;
        return '<button type="button" class="nxsh-cof" data-pot="' + ech(p.cle) + '"' +
          (soldeP >= p.prix && reste > 0 ? '' : ' disabled') + '>' +
          '<img alt="" src="img/nexus/objets/' + encodeURIComponent(p.image) +
          '.webp" onerror="this.remove()">' +
          '<span><span class="n">' + ech(p.nom) + '</span><span class="o">Restores <b>' +
          p.soigne + '</b> ' + (p.quoi === 'hp' ? 'HP' : 'MP') +
          ' &middot; you carry <b>' + p.quantite + '</b> of ' + p.max +
          '</span></span><span class="p">' + p.prix + ' $SWOGE</span></button>';
      }).join('') +
      /* Dix par dix : personne n'achete des potions une par une, et taper
         dix fois le meme bouton n'a jamais amuse personne. */
      '<div class="nxsh-lots">' + [1, 10, 25].map(function (q) {
        return '<button type="button" data-lot="' + q + '">Buy x' + q + '</button>';
      }).join('') + '</div>';

      var lot = shopLot || 1;
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-lot]'), function (b) {
        b.classList.toggle('on', Number(b.getAttribute('data-lot')) === lot);
        b.addEventListener('click', function () {
          shopLot = Number(b.getAttribute('data-lot'));
          clic(false); peintShop();
        });
      });
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-pot]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          clic(true);
          envoie({ type: 'potionAchat', cle: b.getAttribute('data-pot'), qte: shopLot || 1 });
        });
      });
      return;
    }

    /* ---- LE RAYON DES PERSONNAGES ----
       Rien a voir avec les saisons : pas de tirage, pas de plafond, pas de
       rarete. Un catalogue fixe, un prix, et on l'a ou on ne l'a pas. Celui
       qu'on possede deja se PORTE au lieu de s'acheter — c'est le meme
       bouton, et c'est ce qu'on veut en tapant dessus. */
    if (shopSaison === 'skin') {
      var soldeS = Number(BOUTIQUE.balance || 0);
      elShopCorps.innerHTML = (SKINS_C || []).map(function (k) {
        var a = k.id === PERSO;
        return '<button type="button" class="nxsh-cof" data-skin="' + ech(k.id) + '"' +
          ' data-a="' + (k.possede ? (a ? 'porte' : 'porter') : 'acheter') + '"' +
          (k.possede || soldeS >= k.prix ? '' : ' disabled') + (a ? ' class="nxsh-cof on"' : '') + '>' +
          '<img alt="" src="img/skins/skin_' + encodeURIComponent(k.id) +
          '.webp" onerror="this.remove()">' +
          '<span><span class="n">' + ech(k.nom) + '</span><span class="o">' +
          ech(k.pouvoir || '') + '</span></span><span class="p">' +
          (k.possede ? (a ? 'worn' : 'wear') : Math.round(k.prix).toLocaleString('en-US') + ' $SWOGE') +
          '</span></button>';
      }).join('');
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-skin]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          var quoi = b.getAttribute('data-a');
          if (quoi === 'porte') return;
          clic(true);
          envoie(quoi === 'acheter'
            ? { type: 'skinBuy', id: b.getAttribute('data-skin') }
            : { type: 'skinChoisi', id: b.getAttribute('data-skin') });
        });
      });
      return;
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
      return '<button type="button" class="nxsh-cof" data-cle="' + ech(c.cle) +
        '" data-dessin="' + ech(dessin) + '"' +
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
        /* L'animation part au CLIC, pas a la reponse du serveur. Attendre
           l'aller-retour ferait un decalage de plusieurs dixiemes entre le
           doigt et le coffre qui s'ouvre, et c'est precisement ce qui fait
           qu'une interface parait molle. C'est la scene de stakebubble.js,
           pas une copie : le meme achat doit montrer la meme chose ici et
           dans le hall. */
        try {
          if (window.swogeCoffre && window.swogeCoffre.ouvre) {
            window.swogeCoffre.ouvre(b.getAttribute('data-dessin') || b.getAttribute('data-cle'));
          }
        } catch (e) {}
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

  var coffreRole = 'objets';
  function ouvreCoffreMenu(role) {
    if (!elCoffreVoile) return;
    coffreOuvert = true;
    coffreRole = role || 'objets';
    if (coffreRole === 'skins') { if (enLigne) envoie({ type: 'skins' }); }
    else if (!COFFRE && enLigne) envoie({ type: 'equipable' });
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
    var titre = elCoffreVoile.querySelector('.nxcf-titre');
    var sous = elCoffreVoile.querySelector('.nxcf-sous');
    /* ---- LE COFFRE AUX PERSONNAGES ----
       On CHANGE de personnage, on n'en achete pas ici : la boutique est a
       l'autre bout du Nexus et c'est sa place. Celui qu'on ne possede pas
       s'affiche quand meme, grise — savoir ce qui existe fait partie de ce
       qu'un coffre montre. */
    if (coffreRole === 'skins') {
      if (titre) titre.innerHTML = '\uD83C\uDFAD Your characters';
      if (sous) sous.textContent = 'Tap one to play it. Buy new ones at the shop.';
      var liste = SKINS_C || [];
      elCoffreCorps.innerHTML = liste.length
        ? '<div class="nxcf-l">' + liste.map(function (k) {
            var a = k.id === PERSO;
            return '<button type="button" class="nxcf-i' + (a ? ' actif' : '') +
              '" data-perso="' + ech(k.id) + '"' + (k.possede ? '' : ' disabled') +
              ' style="--c:' + ech(k.couleur || '#8DA0C4') + '"' +
              ' title="' + ech(k.nom + ' — ' + (k.pouvoir || '')) + '">' +
              '<img alt="" src="img/skins/skin_' + encodeURIComponent(k.id) +
              '.webp" onerror="this.remove()">' +
              '<span><b>' + ech(k.nom) + '</b><em>' +
              (k.possede ? (a ? 'playing' : 'ready') : 'not owned') + '</em></span>' +
              (a ? '<u>worn</u>' : '') + '</button>';
          }).join('') + '</div>'
        : '<div class="nxcf-vide">Loading your characters…</div>';
      Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('[data-perso]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled || b.classList.contains('actif')) return;
          clic(true);
          envoie({ type: 'skinChoisi', id: b.getAttribute('data-perso') });
        });
      });
      return;
    }
    if (titre) titre.innerHTML = '\uD83E\uDDFA Your vault';
    if (sous) sous.textContent = 'Everything you bought from the shop. Tap an item to wear it.';
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
    html += '<div class="nxcf-grp nxcf-sac"><i>Backpack &mdash; ' + sac.length +
            '/8 slots &middot; lost if you die</i>';
    if (!sac.length) {
      html += '<div class="nxcf-vide">Empty. Loot you pick up in the world lands here — ' +
              'store it in the vault to keep it for good.</div>';
    } else {
      html += '<div class="nxcf-l">' + sac.map(function (o) {
        /* Deux exemplaires identiques sont DEUX boutons : le sac compte des
           places, pas des lignes. */
        return '<button type="button" class="nxcf-i" data-range="' + o.id +
          '" data-sac="' + o.id + '" data-place="' + o.place + '"' +
          ' style="--c:' + ech(o.couleur || '#8DA0C4') + '"' +
          ' title="' + ech(o.nom + ' — store in the vault') + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" onerror="this.remove()">' +
          '<span><b>' + ech(o.nom) + '</b><em>' + ech(detailBonus(o) || '—') + '</em></span>' +
          '<u>store &rarr;</u>' +
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
    /* ---- LE TIR, BAISSE DE 70 % ----
     * Il couvrait tout le reste — les pas, l'impact, l'or qui tombe — et a
     * quatre coups par seconde il devenait fatigant. Un bruit qu'on entend
     * cent fois par minute doit se tenir SOUS le reste, pas devant. */
    return joueSample('tir', { hauteur: h, vol: v.vol * 0.3, duree: 1.35 / a.cadence });
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
  /* ---- LA BARRE D'ESPACE CHANGE DE METIER ----
   * Elle lancait le saut, une animation decorative du Nexus. Elle lance
   * maintenant le POUVOIR du fruit, qui coute du mana et decide d'un combat.
   * Le saut recule sur F : entre une figure et une attaque speciale, c'est
   * l'attaque qui merite la touche que tout le monde trouve sans chercher. */
  var DEFAUTS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
                  pouvoir: 'Space', jump: 'KeyF',
                  auto: 'KeyI', nexus: 'KeyE' };
  var FLECHES_FIXES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  var ACTIONS = [
    { cle: 'up', nom: 'Move up' }, { cle: 'down', nom: 'Move down' },
    { cle: 'left', nom: 'Move left' }, { cle: 'right', nom: 'Move right' },
    { cle: 'pouvoir', nom: 'Special attack' },
    { cle: 'jump', nom: 'Jump' },
    { cle: 'auto', nom: 'Auto-fire' },
    { cle: 'nexus', nom: 'Return to Nexus' },
  ];

  var PERSO_TOUCHES = chargeTouches();
  var CODE_VERS_ACTION = {};
  function reconstruitLookup() {
    CODE_VERS_ACTION = {};
    Object.keys(FLECHES_FIXES).forEach(function (c) { CODE_VERS_ACTION[c] = FLECHES_FIXES[c]; });
    ACTIONS.forEach(function (a) {
      if (PERSO_TOUCHES[a.cle]) CODE_VERS_ACTION[PERSO_TOUCHES[a.cle]] = a.cle;
    });
  }
  function chargeTouches() {
    var t = {};
    try { t = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}') || {}; } catch (e) { t = {}; }
    /* Un joueur qui a deja joue a « Space » enregistre pour le SAUT. Le
       laisser tel quel donnerait deux actions sur la meme touche, et c'est
       la derniere ecrite qui gagnerait — un joueur perdrait son pouvoir sans
       comprendre pourquoi. On le renvoie donc au nouveau defaut du saut. */
    if (t.jump === 'Space') t.jump = DEFAUTS.jump;
    var o = {}, pris = {};
    ACTIONS.forEach(function (a) {
      var c = (typeof t[a.cle] === 'string' && t[a.cle]) ? t[a.cle] : DEFAUTS[a.cle];
      /* Deux actions sur la meme touche : la seconde retombe sur son propre
         defaut, et si celui-la est pris aussi elle reste sans touche plutot
         que de voler celle d'une autre. Mieux vaut une action a rebinder
         qu'une action qui en ecrase une autre en silence. */
      if (pris[c]) c = pris[DEFAUTS[a.cle]] ? '' : DEFAUTS[a.cle];
      if (c) pris[c] = a.cle;
      o[a.cle] = c;
    });
    return o;
  }
  function sauveTouches() {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(PERSO_TOUCHES)); } catch (e) {}
    reconstruitLookup();
    /* Le bouton du pouvoir affiche la touche : la reassigner sans le repeindre
       laisserait « Space » ecrit sur un bouton qui repond a autre chose. */
    if (typeof peintPouvoir === 'function') peintPouvoir();
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
    else if (d === 'pouvoir') lancePouvoir();
    else if (d === 'auto') basculeAuto();
    else if (d === 'nexus') retourNexus('key');
    else TOUCHES[d] = true;
  });
  window.addEventListener('keyup', function (ev) {
    var d = CODE_VERS_ACTION[ev.code];
    if (d && d !== 'jump' && d !== 'pouvoir' && d !== 'auto' && d !== 'nexus') TOUCHES[d] = false;
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

  /* ================== LE POUVOIR DU FRUIT ==================
   *
   * ---- ce que le client decide, et ce qu'il ne decide pas ----
   *
   * Il decide QUAND on appuie. C'est tout. Quelle cible, combien de degats,
   * combien de mana, si la recharge est passee : le serveur tranche, comme
   * pour les tirs. Ce fichier n'a meme pas la table des couts en dur — elle
   * arrive dans `realmEntre`. Un chiffre ecrit ici finirait par diverger de
   * celui du serveur, et le bouton mentirait sur le prix.
   *
   * ---- ce qu'on montre quand meme sans attendre le serveur ----
   *
   * L'etat du bouton (pret / pas assez de mana / en recharge) se calcule ici,
   * a partir du mana et de la recharge que `realmEtat` envoie dix fois par
   * seconde. On ne veut pas d'un aller-retour pour savoir si le bouton doit
   * s'allumer : il doit s'eteindre a la seconde ou le mana descend.
   */
  var POUVOIRS_C = null;          // la table des pouvoirs, envoyee a l'entree
  var POUVOIR_C = null;           // le pouvoir du fruit porte, ou null
  var POUVOIR_ETAT = { recharge: 0, rafale: 0 };
  /* ---- LA PARALYSIE ----
   * Ce qu'il en reste, en secondes, tel que le serveur nous le dit. La page
   * n'en decide RIEN : elle cesse d'obeir aux touches parce que le serveur
   * refuse deja le deplacement, et continuer a avancer localement ferait
   * glisser le personnage puis le ramenerait d'un coup — le pire des deux
   * mondes. Elle obeit tout de suite pour que ce soit franc. */
  var PARALYSE = 0;
  var elPow = document.getElementById('nxPow');
  var elPowNom = document.getElementById('nxPowNom');
  var elPowCout = document.getElementById('nxPowCout');
  var elPowTouche = document.getElementById('nxPowTouche');
  var elPowJauge = document.getElementById('nxPowJauge');

  /* ================== CE QUI BOUGE EN CONTINU ==================
   *
   * La vie et le mana remontent tout seuls : ils changent plusieurs fois par
   * seconde. Repeindre TOUT le panneau a ce rythme reconstruirait a chaque
   * fois le HTML de l'equipement, du sac et des potions — c'est-a-dire
   * detruirait sous le doigt la piece qu'on est en train de faire glisser, et
   * ferait clignoter des images qui n'ont pas change.
   *
   * On separe donc : `peintPanneau` refait la structure quand elle change
   * vraiment (un objet equipe, un niveau gagne), et cette fonction-ci ne
   * touche qu'aux trois choses qui bougent seules — les deux jauges et le
   * voile de recharge du fruit.
   */
  function majJauges() {
    if (!FICHE) return;
    if (elHp) elHp.textContent = VIE.pv;
    if (elMp) elMp.textContent = VIE.mp;
    if (elHpJauge) elHpJauge.style.width =
      (VIE.max > 0 ? Math.max(0, Math.min(100, VIE.pv * 100 / VIE.max)) : 100) + '%';
    if (elMpJauge) elMpJauge.style.width =
      (VIE.mpMax > 0 ? Math.max(0, Math.min(100, VIE.mp * 100 / VIE.mpMax)) : 100) + '%';
    majFruit();
  }

  /* Le fruit se grise pendant sa recharge et revient en couleur des qu'il est
     pret. On ne touche qu'aux classes et a une hauteur : aucun HTML n'est
     reconstruit, donc rien ne clignote et rien ne se detache du doigt. */
  function majFruit() {
    if (!elEquip) return;
    var c = elEquip.querySelector('[data-slot="equipFruit"]');
    if (!c) return;
    var P = (POUVOIRS_C && POUVOIR_C) ? POUVOIRS_C[POUVOIR_C] : null;
    /* Hors du monde de combat, le pouvoir ne se lance pas : on n'affiche donc
       ni grisement ni liseré — un fruit grise dans le Nexus se lirait comme
       un objet casse. */
    if (!P || SCENE !== 'monde') {
      c.classList.remove('froid'); c.classList.remove('chaud');
      var v0 = c.querySelector('.cd'); if (v0) v0.style.height = '0%';
      return;
    }
    var reste = POUVOIR_ETAT.recharge || 0;
    /* « Pret » veut dire les DEUX : la recharge passee ET assez de mana. Un
       fruit en couleur qu'on ne peut pas lancer faute de mana serait un
       mensonge de la meme famille que le bouton grise et muet. */
    var pret = reste <= 0 && VIE.mp >= P.cout;
    c.classList.toggle('froid', !pret);
    c.classList.toggle('chaud', pret);
    var v = c.querySelector('.cd');
    if (v) v.style.height = reste > 0
      ? Math.max(0, Math.min(100, reste / P.recharge * 100)) + '%'
      : '0%';
  }

  function peintPouvoir() {
    if (!elPow) return;
    var actif = SCENE === 'monde' && POUVOIR_C && POUVOIRS_C && POUVOIRS_C[POUVOIR_C];
    elPow.classList.toggle('on', !!actif);
    if (!actif) return;
    var P = POUVOIRS_C[POUVOIR_C];
    var assez = VIE.mp >= P.cout;
    var prete = POUVOIR_ETAT.recharge <= 0;
    elPowNom.textContent = P.nom || POUVOIR_C;
    elPowCout.textContent = P.cout + ' MP';
    elPowTouche.textContent = nomTouche(PERSO_TOUCHES.pouvoir) || '—';
    elPow.classList.toggle('pret', assez && prete);
    elPow.classList.toggle('vide', !assez || !prete);
    /* Le fruit dit la MEME chose que le bouton, toujours : deux etats a tenir
       d'accord a la main finiraient par se contredire. */
    majFruit();
    /* La jauge se REMPLIT pendant la recharge plutot que de se vider : on lit
       « ce qui reste a attendre » plus vite sur une barre qui avance. */
    elPowJauge.style.width = prete ? '0%'
      : Math.max(0, Math.min(100, (1 - POUVOIR_ETAT.recharge / P.recharge) * 100)) + '%';
  }

  /** Appuyer. On envoie, on ne devine rien : meme le prelevement de mana
      attend la reponse du serveur. Afficher un mana deja depense qui
      reviendrait ensuite serait pire qu'un dixieme de seconde d'attente. */
  function lancePouvoir() {
    if (SCENE !== 'monde') return;
    if (!POUVOIR_C) {
      flotte('No fruit equipped');
      return;
    }
    if (enLigne) envoie({ type: 'realmPouvoir' });
  }

  if (elPow) {
    elPow.addEventListener('click', function (ev) {
      ev.preventDefault(); debloqueSon(); lancePouvoir();
    });
    /* Sur telephone, `click` arrive avec trois cents millisecondes de retard
       apres le doigt. Pour une attaque, c'est visible. */
    elPow.addEventListener('touchstart', function (ev) {
      ev.preventDefault(); debloqueSon(); lancePouvoir();
    }, { passive: false });
  }

  /* ---- CE QUE LE POUVOIR LAISSE A L'ECRAN ----
   *
   * Un pouvoir qui coute soixante mana et ne se voit pas se lit comme une
   * touche cassee. Trois traces, une par pouvoir :
   *   - la FOUDRE laisse un eclair brise entre nous et la cible, quelques
   *     dixiemes de seconde ;
   *   - la STASE laisse un cercle qui se retracte, plus un anneau autour de
   *     chaque monstre fige (dessine ailleurs, avec le monstre) ;
   *   - la RAFALE ne laisse rien ici : elle se voit au rythme des tirs, et
   *     un effet permanent par-dessus quatre secondes de tir serait du
   *     brouillard.
   */
  var EFFETS_P = [];
  function effetPouvoir(m) {
    if (m.cle === 'foudre' && !m.vide) {
      EFFETS_P.push({ cle: 'foudre', x1: joueur.x, y1: joueur.y, x2: m.cx, y2: m.cy,
                      vie: 0.32, max: 0.32, graine: Math.random() * 1000 });
    } else if (m.cle === 'stase') {
      EFFETS_P.push({ cle: 'stase', x: m.x, y: m.y, r: m.rayon, vie: 0.55, max: 0.55 });
    }
  }

  function peintEffetsPouvoir(dt) {
    for (var i = EFFETS_P.length - 1; i >= 0; i--) {
      var e = EFFETS_P[i];
      e.vie -= dt;
      if (e.vie <= 0) { EFFETS_P.splice(i, 1); continue; }
      var t = e.vie / e.max;
      ctx.save();
      if (e.cle === 'foudre') {
        /* Un trait BRISE, pas une droite : une droite se lit comme un rayon
           laser, et l'eclair doit se lire comme un eclair. Les cassures sont
           tirees d'une graine fixee a la naissance de l'effet, sinon elles
           danseraient a chaque image. */
        var a = { x: e.x1, y: e.y1 }, b = { x: e.x2, y: e.y2 };
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (var passe = 0; passe < 2; passe++) {
          ctx.strokeStyle = passe === 0 ? 'rgba(190,140,255,.55)' : '#FFFFFF';
          ctx.lineWidth = passe === 0 ? 13 : 4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          var seg = 6;
          for (var k = 1; k < seg; k++) {
            var p = k / seg;
            var px = a.x + (b.x - a.x) * p, py = a.y + (b.y - a.y) * p;
            /* Le decalage perpendiculaire au trait, pseudo-aleatoire mais
               STABLE : sin(graine + k) rend le meme nombre a chaque image. */
            var d = Math.sin(e.graine + k * 2.7) * 22 * Math.sin(p * Math.PI);
            var nx = -(b.y - a.y), ny = (b.x - a.x);
            var n = Math.sqrt(nx * nx + ny * ny) || 1;
            ctx.lineTo(px + nx / n * d, py + ny / n * d);
          }
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        /* L'impact : un halo qui s'ouvre a l'arrivee. */
        ctx.globalAlpha = t * 0.8;
        ctx.fillStyle = '#E6D2FF';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10 + (1 - t) * 34, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.cle === 'stase') {
        var c = { x: e.x, y: e.y };
        ctx.globalAlpha = t * 0.75;
        ctx.strokeStyle = '#9DE8FF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        /* Le cercle se RETRACTE vers le lanceur : une onde qui s'etend
           voudrait dire « ca part de moi et ca s'en va », alors que la stase
           ramene tout le monde a l'arret. */
        ctx.arc(c.x, c.y, e.r * (0.55 + t * 0.45), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

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
    /* Dans le Nexus il n'y a rien a viser — c'est une zone sure, et c'est
       voulu. Dans le monde, on prend le plus proche, tout simplement : viser
       le plus faible ou le plus dangereux demanderait au joueur de deviner
       la regle, et il n'y en aurait aucune bonne. */
    if (SCENE !== 'monde') return null;
    var mieux = null, d2 = Infinity;
    for (var k in MONSTRES_C) {
      var e = MONSTRES_C[k];
      var dx = e.rx - joueur.x, dy = (e.ry - 30) - joueur.y;
      var q = dx * dx + dy * dy;
      if (q < d2) { d2 = q; mieux = e; }
    }
    /* Hors de portee de l'arme, on ne vise pas : le tir partirait dans une
       direction ou rien ne peut arriver, et le joueur croirait que la visee
       est cassee alors qu'il est simplement trop loin. */
    var a = ARMES[familleArme() || 'poing'] || ARMES.poing;
    var maxi = a.portee * 1.15;
    if (!mieux || d2 > maxi * maxi) return null;
    return { x: mieux.rx, y: mieux.ry - 30 };
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
    if (PARALYSE > 0) PARALYSE = Math.max(0, PARALYSE - dt);
    var dx = (TOUCHES.right ? 1 : 0) - (TOUCHES.left ? 1 : 0);
    var dy = (TOUCHES.down ? 1 : 0) - (TOUCHES.up ? 1 : 0);
    /* ---- CLOUE AU SOL ----
     * On garde la DIRECTION du regard : se retourner n'est pas se deplacer,
     * et un personnage fige qui tire dans le dos de ce qu'il vise serait
     * absurde. Le tir, lui, n'est pas touche du tout — c'est toute la
     * difference entre paralyser et etourdir, et c'est ce qui laisse une
     * reponse au joueur au lieu de le faire regarder mourir. */
    if (PARALYSE > 0) {
      if (dx !== 0) joueur.dir = dx > 0 ? 'right' : 'left';
      else if (dy !== 0) joueur.dir = dy > 0 ? 'down' : 'up';
      dx = 0; dy = 0;
    }
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

    /* ---- DANS LE MONDE ----
       Les bornes sont celles de la carte, la position part au serveur, et on
       tire vers ce qu'on vise. Rien d'autre : les degats, les morts et l'XP
       arrivent par messages, on ne les calcule pas. */
    if (SCENE === 'monde' && MONDE_C) {
      joueur.x = Math.min(Math.max(joueur.x, 40), MONDE_C.monde.w - 40);
      joueur.y = Math.min(Math.max(joueur.y, 40), MONDE_C.monde.h - 40);

      Object.keys(MONSTRES_C).forEach(function (k) {
        var e = MONSTRES_C[k];
        var t = Math.min(1, dt * 9);
        e.rx += (e.x - e.rx) * t; e.ry += (e.y - e.ry) * t;
        /* Le cadre avance avec la DISTANCE parcourue et non avec le temps :
           un monstre arrete ne doit pas pedaler sur place. */
        e.chrono += dt;
        if (e.chrono > 0.14) { e.chrono = 0; e.cadre = (e.cadre + 1) % 4; }
      });
      Object.keys(DISTANTS_M).forEach(function (k) {
        var d = DISTANTS_M[k];
        avanceCadre(d, d.skin, dt);
        var t = Math.min(1, dt * 10);
        d.rx += (d.x - d.rx) * t; d.ry += (d.y - d.ry) * t;
      });

      for (var fi = FLOTTANTS.length - 1; fi >= 0; fi--) {
        FLOTTANTS[fi].vie -= dt;
        if (FLOTTANTS[fi].vie <= 0) FLOTTANTS.splice(fi, 1);
      }
      if (secousse > 0) secousse -= dt;

      /* On TIRE : le serveur applique la cadence, donc envoyer a chaque image
         ne donne pas plus de projectiles — seulement du trafic. On s'aligne
         sur la cadence de l'arme portee. */
      var aM = armeCourante();
      tireur.recharge -= dt;
      if ((tireur.presse || tireur.auto) && tireur.recharge <= 0) {
        envoie({ type: 'realmTir', a: angleDeTir(DERNIERE_CAM.x, DERNIERE_CAM.y) });
        /* Le son part ICI et non a la reponse du serveur : le projectile
           met un dixieme de seconde a revenir, et un tir qu'on entend apres
           l'avoir vu partir se lit comme un decalage, pas comme un tir. */
        joueSon(familleArme() || 'poing');
        tireur.recharge = 1 / aM.cadence;
      }

      chronoEnvoi += dt;
      if (chronoEnvoi >= ENVOI_INTERVAL && enLigne) {
        chronoEnvoi = 0;
        envoie({ type: 'realmMove', x: Math.round(joueur.x), y: Math.round(joueur.y),
                 dir: joueur.dir, anim: joueur.anim });
      }
      if (!saut.en_cours) avanceCadre(joueur, PERSO, dt);
      else {
        saut.chrono += dt;
        saut.cadre = Math.min(PERSONNAGES[PERSO].images - 1, Math.floor(saut.chrono * FPS_ANIM));
        if (saut.chrono >= saut.duree) saut.en_cours = false;
      }
      return;
    }

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
      if (surCoffre && !coffreOuvert && surCoffre !== coffreFerme) ouvreCoffreMenu(surCoffre.role);

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
          /* Le portail menait au hall des jeux. Il mene au MONDE : c'est ce
             qu'un portail au milieu d'un nexus promet, et le hall a deja son
             bouton dans l'en-tete du panneau. */
          if (l.cle === 'portail') { if (enLigne) envoie({ type: 'realmJoin' }); l.dwell = 0; entre = true; return; }
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

  function dessine(dt) {
    dt = dt || 0;
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

    /* ---- LE MONDE DE COMBAT ----
       Le sol par anneaux, les monstres, les autres, et nos projectiles. Tout
       vient du serveur ; on ne fait que le poser a l'ecran. */
    if (SCENE === 'monde' && MONDE_C) {
      var TM = MONDE_C.monde.tuile || 128;
      var mc0 = Math.max(0, Math.floor(camX / TM));
      var mc1 = Math.floor((camX + libre + TM) / TM);
      var mr0 = Math.max(0, Math.floor(camY / TM));
      var mr1 = Math.floor((camY + hauteurMonde + TM) / TM);
      for (var mr = mr0; mr <= mr1; mr++) {
        for (var mc = mc0; mc <= mc1; mc++) {
          var b = biomeEn(mc * TM + TM / 2, mr * TM + TM / 2);
          var img = TUILES_M[b];
          if (img && img.complete) ctx.drawImage(img, mc * TM, mr * TM, TM, TM);
        }
      }

      /* Tout ce qui marche se trie par les PIEDS : ce qui est plus bas passe
         devant, comme dans le Nexus. */
      var pileM = [];
      Object.keys(MONSTRES_C).forEach(function (k) {
        var e = MONSTRES_C[k];
        pileM.push({ y: e.ry, dessine: function () { dessineMonstre(e); } });
      });
      Object.keys(DISTANTS_M).forEach(function (k) {
        var d = DISTANTS_M[k];
        pileM.push({ y: d.ry, dessine: function () {
          dessineAvatar(d.rx, d.ry, d.skin, d.dir, d.anim, d.cadre);
          barreVie(d.rx, d.ry, d.pv, d.pvMax, 44);
        } });
      });
      pileM.push({ y: joueur.y, dessine: function () {
        /* ---- CLOUE AU SOL, ET CA SE VOIT ----
         * Un anneau sous les pieds qui se REFERME : il dit a la fois « tu ne
         * bouges pas » et « encore combien de temps ». Sans le second, on
         * appuie sur les touches au hasard en croyant a un blocage du jeu.
         * Il est dessine AVANT le personnage, au sol : par-dessus, il
         * cacherait justement ce qu'on regarde. */
        if (PARALYSE > 0 && MONDE_C && MONDE_C.paralysie) {
          var part = Math.max(0, Math.min(1, PARALYSE / MONDE_C.paralysie.duree));
          ctx.save();
          ctx.strokeStyle = '#C07BFF';
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.ellipse(joueur.x, joueur.y + 4, 34, 15, 0, -Math.PI / 2,
                      -Math.PI / 2 + part * Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = '#C07BFF';
          ctx.beginPath();
          ctx.ellipse(joueur.x, joueur.y + 4, 34, 15, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        var cM = joueur.anim === 'jump' ? saut.cadre : joueur.cadre;
        dessineAvatar(joueur.x, joueur.y, PERSO, joueur.dir, joueur.anim, cM);
      } });
      pileM.sort(function (a, b) { return a.y - b.y; });
      pileM.forEach(function (p) { p.dessine(); });

      dessineTirsMonde();
      /* Les traces des pouvoirs par-dessus tout, mais AVANT `restore` : elles
         sont posees en coordonnees du monde comme le reste de la scene. */
      peintEffetsPouvoir(dt);
      ctx.restore();
      DERNIERE_CAM.x = camX; DERNIERE_CAM.y = camY; DERNIERE_CAM.z = zoom;
      peintFlottants();
      return;
    }

    /* ---- LA SALLE DU COFFRE ----
       Un seul dessin, mis a l'echelle de la piece : pas de tuiles a decouper,
       la salle EST une image. On sort tot, le Nexus ne la concerne pas. */
    if (SCENE === 'coffre') {
      if (SALLE.img.complete) ctx.drawImage(SALLE.img, 0, 0, SALLE.w, SALLE.h);
      /* Un halo doux sous chaque coffre : le dessin de la piece en montre
         cinq, mais rien n'y dit qu'on peut marcher dessus. */
      /* Deux couleurs pour deux usages : l'or pour les objets, le violet pour
         les personnages. Le meme halo partout ferait croire a deux portes
         vers la meme piece. */
      SALLE.coffres.forEach(function (cf) {
        halo(cf.x, cf.y, cf.r, cf.role === 'skins' ? '#C07BFF' : '#FFC53D', 0.18);
      });
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

  /* Un monstre : la rangee de l'atlas EST sa direction, l'index sa marche.
     C'est le decoupage qui l'a garanti, pas une table ici. */
  var DIRS_M = { up: 0, down: 1, left: 2, right: 3 };
  var CADRE_M = 128, TAILLE_M = 118;
  /* Le canevas de teinte, cree UNE fois et reutilise. En creer un par
     monstre et par image ferait naitre des dizaines de canevas par seconde,
     que le ramasse-miettes paierait au pire moment — pendant un combat. */
  var GEL = null;
  function gel() {
    if (!GEL) {
      var el = document.createElement('canvas');
      el.width = CADRE_M; el.height = CADRE_M;
      GEL = { el: el, ctx: el.getContext('2d') };
      GEL.ctx.imageSmoothingEnabled = false;
    }
    return GEL;
  }

  function dessineMonstre(e) {
    var img = ATLAS_M[e.espece];
    if (!img || !img.complete || !img.naturalWidth) return;
    var r = DIRS_M[e.dir] === undefined ? 1 : DIRS_M[e.dir];
    /* ---- UN MONSTRE FIGE SE VOIT ----
     * Deux marques, parce qu'une seule ne suffit pas : un ANNEAU au sol dit
     * « celui-la est pris », et le sprite vire au bleu glace. L'anneau seul se
     * perdrait dans une melee a dix monstres ; la teinte seule passerait
     * inapercue sur un revenant des glaces, qui est deja bleu. */
    var fige = e.stase > 0;
    if (fige) {
      ctx.save();
      ctx.strokeStyle = 'rgba(157,232,255,.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(e.rx, e.ry + 4, TAILLE_M * 0.36, TAILLE_M * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    var sx = e.rx - TAILLE_M / 2, sy = e.ry - TAILLE_M + 14;
    /* ---- LA MEDUSE EMPRUNTE UN DESSIN, PAS UNE IDENTITE ----
     * Elle porte pour l'instant l'image du revenant de glace. Deux creatures
     * identiques a l'ecran dont une seule paralyse, c'est un piege : le
     * joueur apprendrait « ce monstre-la paralyse parfois », ce qui est faux
     * et impossible a jouer. On la teinte donc en violet, la couleur des
     * effets dans ce jeu, et on lui pose une aura : elle se reconnait du
     * premier coup d'oeil, avant meme d'avoir tire.
     * Le jour ou son propre dessin arrive, ces lignes sautent. */
    var empruntee = (MONDE_C && MONDE_C.especes && MONDE_C.especes[e.espece]
                     && MONDE_C.especes[e.espece].sprite) ? true : false;
    if (empruntee) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#C07BFF';
      ctx.beginPath();
      ctx.ellipse(e.rx, e.ry + 4, TAILLE_M * 0.34, TAILLE_M * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (fige) {
      /* La teinte passe par un CANEVAS A PART. Teinter directement sur la
         scene avec `source-atop` toucherait aussi le sol : a cet endroit le
         decor est deja peint, donc « la ou il y a quelque chose » ne veut pas
         dire « la ou il y a le monstre ». Sur un canevas vide qui ne contient
         que le sprite, la question a la bonne reponse. */
      var g = gel();
      g.ctx.clearRect(0, 0, CADRE_M, CADRE_M);
      g.ctx.globalCompositeOperation = 'source-over';
      g.ctx.globalAlpha = 1;
      g.ctx.drawImage(img, e.cadre * CADRE_M, r * CADRE_M, CADRE_M, CADRE_M,
                      0, 0, CADRE_M, CADRE_M);
      g.ctx.globalCompositeOperation = 'source-atop';
      g.ctx.globalAlpha = 0.38;
      g.ctx.fillStyle = '#9DE8FF';
      g.ctx.fillRect(0, 0, CADRE_M, CADRE_M);
      ctx.drawImage(g.el, 0, 0, CADRE_M, CADRE_M, sx, sy, TAILLE_M, TAILLE_M);
    } else if (empruntee) {
      var g2 = gel();
      g2.ctx.clearRect(0, 0, CADRE_M, CADRE_M);
      g2.ctx.globalCompositeOperation = 'source-over';
      g2.ctx.globalAlpha = 1;
      g2.ctx.drawImage(img, e.cadre * CADRE_M, r * CADRE_M, CADRE_M, CADRE_M,
                       0, 0, CADRE_M, CADRE_M);
      g2.ctx.globalCompositeOperation = 'source-atop';
      g2.ctx.globalAlpha = 0.45;
      g2.ctx.fillStyle = '#C07BFF';
      g2.ctx.fillRect(0, 0, CADRE_M, CADRE_M);
      ctx.drawImage(g2.el, 0, 0, CADRE_M, CADRE_M, sx, sy, TAILLE_M, TAILLE_M);
    } else {
      ctx.drawImage(img, e.cadre * CADRE_M, r * CADRE_M, CADRE_M, CADRE_M,
                    sx, sy, TAILLE_M, TAILLE_M);
    }
    barreVie(e.rx, e.ry, e.pv, e.pvMax, TAILLE_M * 0.46);
  }

  /* La barre de vie ne s'affiche QUE si la creature est blessee : cinquante
     barres pleines a l'ecran cachent le decor et n'apprennent rien. */
  function barreVie(x, y, pv, pvMax, larg) {
    if (!pvMax || pv >= pvMax) return;
    var h = 5, p = Math.max(0, Math.min(1, pv / pvMax));
    var gx = x - larg / 2, gy = y + 6;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(gx - 1, gy - 1, larg + 2, h + 2);
    ctx.fillStyle = p > 0.5 ? '#7CFF9B' : p > 0.25 ? '#FFC53D' : '#F2685E';
    ctx.fillRect(gx, gy, larg * p, h);
  }

  /* Les projectiles du monde viennent du SERVEUR : on ne connait ni leur
     duree ni leur portee, seulement ou ils sont. On reutilise les memes
     dessins que le Nexus — un tir de lame doit se ressembler partout. */
  function dessineTirsMonde() {
    /* Les DEUX listes, la notre et la leur. Elles se dessinent pareil — un
       projectile est un projectile — mais elles restent separees parce que
       le serveur les separe : melanger ici reintroduirait la question « a
       qui est-ce ? » qu'on a justement supprimee la-bas. */
    var tout = TIRS_C.concat(TIRS_M);
    for (var i = 0; i < tout.length; i++) {
      var t = tout[i];
      var sp = spriteTir(t.f);
      ctx.save();
      ctx.translate(t.x, t.y - DECALAGE_TIR);
      ctx.rotate(t.a);
      if (sp && sp.complete && sp.naturalWidth) {
        ctx.drawImage(sp, 0, 0, CADRE_TIR, CADRE_TIR,
                      -CADRE_TIR / 2, -CADRE_TIR / 2, CADRE_TIR, CADRE_TIR);
      } else {
        var a = ARMES[t.f] || ARMES.poing;
        ctx.fillStyle = a.teinte;
        ctx.fillRect(-14, -3, 28, 6);
      }
      ctx.restore();
    }
  }

  /* Les textes qui montent : en coordonnees ECRAN, pas monde. Ils parlent au
     joueur, pas au decor — les accrocher a une position les ferait sortir du
     cadre au premier pas. */
  function peintFlottants() {
    if (!FLOTTANTS.length) return;
    ctx.save();
    ctx.scale(DPR, DPR);
    var vw = canvas.width / DPR, vh = canvas.height / DPR;
    var libreF = Math.max(120, vw - largeurPanneau());
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < FLOTTANTS.length; i++) {
      var f = FLOTTANTS[i];
      var k = 1 - f.vie / f.max;
      ctx.globalAlpha = Math.min(1, f.vie * 2.2);
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      var y = vh * 0.34 - k * 52 - i * 26;
      ctx.strokeText(f.t, libreF / 2, y);
      ctx.fillStyle = '#FFD97A';
      ctx.fillText(f.t, libreF / 2, y);
    }
    ctx.restore();
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
    /* ---- LA CARTE DU MONDE ----
     * Elle montrait le NEXUS pendant qu'on se battait ailleurs — le plan de
     * l'endroit ou l'on n'est pas. Elle montre maintenant le monde : ses
     * trois anneaux, les ennemis en rouge, les autres joueurs en vert, et
     * nous en blanc. C'est la seule chose qui dise « le coeur est par la »
     * sans qu'on ait a marcher pour le decouvrir. */
    if (SCENE === 'monde' && MONDE_C && mctx) {
      var W = MONDE_C.monde.w, H = MONDE_C.monde.h;
      var e = Math.min(MINI / W, MINI / H);
      var ox = (MINI - W * e) / 2, oy = (MINI - H * e) / 2;
      mctx.clearRect(0, 0, MINI, MINI);
      /* Les anneaux, du plus large au plus etroit : dessines dans cet ordre,
         chacun recouvre le precedent et on obtient les trois couronnes sans
         calculer une seule intersection. */
      var COUL = { terre: '#4a3a2c', neige: '#c9dcea', lave: '#8a2418' };
      var cx = ox + MONDE_C.centre.x * e, cy = oy + MONDE_C.centre.y * e;
      mctx.fillStyle = COUL.terre;
      mctx.fillRect(ox, oy, W * e, H * e);
      for (var ai = MONDE_C.anneaux.length - 1; ai >= 0; ai--) {
        var an = MONDE_C.anneaux[ai];
        if (!isFinite(an.jusqua)) continue;
        mctx.fillStyle = COUL[an.biome] || '#444';
        mctx.beginPath();
        mctx.arc(cx, cy, an.jusqua * (W / 2) * e, 0, Math.PI * 2);
        mctx.fill();
      }
      /* Les ennemis en ROUGE, les autres joueurs en VERT. On ne montre que
         ce qu'on VOIT — le serveur ne nous envoie que les alentours, et
         afficher toute la carte peuplee serait une carte de triche. */
      mctx.fillStyle = '#F2685E';
      Object.keys(MONSTRES_C).forEach(function (k) {
        var mm = MONSTRES_C[k];
        mctx.fillRect(ox + mm.rx * e - 1.5, oy + mm.ry * e - 1.5, 3, 3);
      });
      mctx.fillStyle = '#7CFF9B';
      Object.keys(DISTANTS_M).forEach(function (k) {
        var dd = DISTANTS_M[k];
        mctx.fillRect(ox + dd.rx * e - 1.5, oy + dd.ry * e - 1.5, 3, 3);
      });
      mctx.fillStyle = '#fff';
      mctx.fillRect(ox + joueur.x * e - 2, oy + joueur.y * e - 2, 4, 4);
      return;
    }
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
    dessine(dt);
    peintMini();
    requestAnimationFrame(boucle);
  }
  requestAnimationFrame(boucle);
  peintPanneau();   // le panneau existe des la premiere image, meme vide
})();
