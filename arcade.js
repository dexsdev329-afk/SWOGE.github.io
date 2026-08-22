/*
 * ARCADE — le moteur du combat un contre un, vu de cote.
 *
 * ---- ce que ce fichier est, et ce qu'il n'est pas ----
 *
 * Il ne dessine RIEN. Pas une image, pas un canvas, pas un ecouteur de
 * clavier, pas une horloge. Il recoit des etats de touches et un pas de
 * temps, il rend un etat et une liste d'evenements. C'est ce qui permet a un
 * essai de jouer six mille combats en une seconde, et c'est aussi ce qui
 * permet de rejouer un combat a l'identique : sans Date.now() ni Math.random()
 * caches, deux simulations parties de la meme graine avec les memes touches
 * finissent sur le meme octet.
 *
 * La page qui affiche ce combat lit `combat.etat` a chaque trame et peint ce
 * qu'elle y trouve. Elle ne DECIDE rien — si elle decidait quoi que ce soit,
 * la moitie des regles vivrait dans le dessin et l'autre ici, et personne ne
 * saurait plus laquelle des deux a tort quand un coup ne touche pas.
 *
 * ---- pourquoi les coups sont une TABLE ----
 *
 * Un coup, c'est neuf nombres : ce qu'il enleve, combien de temps il met a
 * sortir, combien de temps il pique, combien de temps on est fige apres, sa
 * portee, la tranche de hauteur qu'il balaye, le recul qu'il donne, le temps
 * ou l'adversaire ne peut plus rien faire, et ce qu'il remplit de jauge. Ecrits
 * dans une table, on peut les comparer, les afficher, les equilibrer et les
 * verifier. Ecrits dans des `if (coup === 'pied')` au fil du code, on aurait
 * quatre endroits a modifier pour rendre le pied plus lent, on en oublierait
 * un, et le pied serait lent a la sortie mais pas au rangement.
 *
 * Le code qui suit ne connait donc AUCUN nom de coup. Il lit la table. Le
 * projectile lui-meme n'est pas un cas particulier : c'est ce qui arrive a un
 * coup dont la portee est nulle, parce qu'un coup qui ne touche rien de ses
 * propres mains doit bien envoyer quelque chose.
 *
 * ---- pourquoi UN seul entonnoir a degats ----
 *
 * Trois choses infligent des degats : un coup au corps a corps, un projectile,
 * et demain ce qu'on ajoutera. Chacune doit baisser les points de vie, ET
 * remplir les deux jauges, ET pousser, ET figer, ET respecter la garde, ET
 * poser l'evenement. Ecrire ces six gestes a trois endroits, c'est se
 * garantir qu'un jour le projectile ne remplira pas la jauge et que personne
 * ne saura dire depuis quand. Tout passe donc par `_encaisse`, sans exception.
 */
(function () {
  'use strict';

  // =====================================================================
  //                              L ARENE
  // =====================================================================

  /* Les murs bornent le CENTRE du combattant, pas son dessin. Un mur qui
     bornerait le bord du dessin demanderait de connaitre la largeur du corps
     a chaque comparaison, y compris dans le recul et dans la separation des
     deux corps — trois occasions de se tromper de demi-largeur. Ici la regle
     tient en une ligne : x reste entre murG et murD, point. */
  var ARENE = { larg: 720, murG: 40, murD: 680, sol: 0 };

  /* Le milieu et les places de depart se DEDUISENT des murs. Ecrits en dur,
     ils cesseraient d'etre au milieu le jour ou l'arene changerait de large. */
  var CENTRE = (ARENE.murG + ARENE.murD) / 2;
  var ECART_DEPART = 130;          // du milieu vers chaque cote

  /* Le corps sert a trois choses, et c'est pour ca qu'il est ici et pas
     recopie ailleurs : il dit a quelle distance deux combattants se touchent,
     jusqu'ou monte une cible debout, et jusqu'ou monte une cible accroupie.
     `haut` est aussi la hauteur que couvre une garde debout, et `accroupi`
     celle que couvre une garde basse — voir plus bas pourquoi ca suffit a
     tout regler. */
  var CORPS = { larg: 90, haut: 150, accroupi: 90 };

  // =====================================================================
  //                             LES COUPS
  // =====================================================================

  /*
   * ---- comment se lit une ligne ----
   *
   *   degats  ce que ca enleve quand ca passe
   *   depart  secondes avant que ca pique (le temps de sortir le bras)
   *   actif   secondes pendant lesquelles ca pique
   *   fin     secondes de rangement, pendant lesquelles on ne peut rien faire
   *   portee  du centre de l'attaquant jusqu'au bout de la zone qui pique ;
   *           une portee de 0 veut dire que le coup ne touche pas lui-meme,
   *           il envoie un projectile
   *   bas/haut  la tranche de hauteur balayee, comptee depuis les PIEDS de
   *           l'attaquant — donc elle monte avec lui quand il saute
   *   recul   de combien d'unites d'arene recule celui qui encaisse ; c'est
   *           une DISTANCE et pas une vitesse, parce qu'une vitesse ne dit
   *           rien tant qu'on ne sait pas par quel frottement elle s'eteint,
   *           et c'est la distance qui fait le jeu : elle decide si le
   *           prochain coup portera encore
   *   gel     secondes pendant lesquelles celui qui encaisse ne peut rien
   *   super   ce que ca remplit de jauge
   *
   * ---- l'equilibre, en une phrase par coup ----
   *
   * Le POING sort en cinq centiemes de seconde et ne fait presque rien. Surtout, il
   * rend la main a l'adversaire AVANT de la rendre a celui qui l'a lance :
   * `actif + fin` (0,17 s) est plus long que le `gel` qu'il impose (0,14 s).
   * C'est la seule chose qui empeche de gagner en martelant une touche — et
   * c'est ecrit dans les nombres, pas dans une regle a part.
   *
   * Le PIED est l'inverse : long a sortir, il se fait punir s'il rate, mais
   * `gel` (0,34 s) depasse son propre rangement (0,31 s), donc celui qui le
   * place garde l'initiative. Il porte aussi 28 unites plus loin, ce qui lui
   * laisse une distance ou lui seul touche.
   *
   * Le coup SAUTE monte a 165, c'est-a-dire plus haut que le corps entier
   * (150). Ce n'est pas un detail de dessin : c'est ce qui le rend
   * IMBLOCABLE, debout comme accroupi, sans une seule ligne de code qui
   * connaisse son nom. Il descend aussi sous les pieds de l'attaquant (-60)
   * parce qu'un coup lance du haut d'un saut doit atteindre quelqu'un qui
   * s'est baisse, sinon s'accroupir serait une esquive gratuite.
   *
   * Le SPECIAL n'a pas de portee : il paie 50 de jauge et lache un projectile.
   * Sa tranche part a 95, c'est-a-dire AU-DESSUS des 90 d'un combattant
   * accroupi : on passe dessous en se baissant. Elle s'arrete a 140, donc
   * sous les 150 d'une garde debout, qui l'arrete. Se baisser ou garder :
   * deux reponses, et le choix se paie, puisque baisse on prend les poings et
   * que garder cloue sur place.
   */
  var COUPS = {
    poing:   { degats:  3, depart: 0.05, actif: 0.05, fin: 0.12, portee: 130, bas:  60, haut: 120, recul: 34, gel: 0.14, super:  6 },
    pied:    { degats:  6, depart: 0.15, actif: 0.07, fin: 0.24, portee: 158, bas:  15, haut:  88, recul: 78, gel: 0.34, super: 10 },
    saute:   { degats:  5, depart: 0.08, actif: 0.18, fin: 0.10, portee: 150, bas: -60, haut: 165, recul: 60, gel: 0.30, super:  8 },
    special: { degats: 10, depart: 0.18, actif: 0.06, fin: 0.34, portee:   0, bas:  95, haut: 140, recul:100, gel: 0.45, super:  0, cout: 50 },
  };

  var MANCHES = 2;                 // manches a gagner pour emporter le combat
  var DUREE = 60;                  // secondes par manche

  /* Une suite de manches nulles pourrait ne jamais finir : deux combattants
     immobiles font 60 secondes de rien, personne ne marque, et on recommence.
     Le combat s'arrete donc au bout d'un nombre de manches borne, sur le
     score acquis. Sans ce garde-fou la page attendrait un vainqueur qui
     n'arriverait jamais. */
  var MANCHES_MAX = MANCHES * 2 + 1;

  var PV_MAX = 100;
  var JAUGE_MAX = 100;

  // =====================================================================
  //                            LA PHYSIQUE
  // =====================================================================

  /*
   * Un saut monte a v0^2 / (2g) = 106 unites et dure 0,69 s. Les trois
   * nombres se tiennent :
   *
   *   - 106 passe AU-DESSUS de la tranche du pied (88) : au sommet d'un saut
   *     on est hors d'atteinte d'un coup bas. C'est ce qui donne un interet a
   *     sauter autre chose que le fait de se deplacer.
   *   - 106 reste sous les 120 du poing : on ne saute pas impunement, il
   *     suffit d'un poing pour cueillir quelqu'un en l'air.
   *   - 0,69 s est long. Un saut rate se paie, parce qu'on ne redescend pas
   *     plus vite en le regrettant.
   */
  var PHYS = {
    gravite: 1800,
    saut: 620,
    vitesse: 200,                  // en avancant
    vitesseArr: 145,               // en reculant : reculer coute du terrain
    frein: 9,                      // ce qui eteint le recul au sol
    dtMax: 1 / 30,                 // voir plus bas
  };

  /*
   * Un pas de temps est BORNE. Une page qui perd la main une seconde entiere
   * (onglet en arriere-plan, garbage collector) rappellerait `pas(1)` et
   * ferait traverser un mur a un combattant en une seule integration. On
   * simule au plus 1/30 de seconde a la fois : le combat ralentit
   * visiblement, ce qui est desagreable mais reparable, plutot que de sortir
   * de l'arene, ce qui ne l'est pas.
   */
  var DT_MAX = PHYS.dtMax;

  /*
   * La garde n'annule pas tout a fait : ce qui passe a travers vaut `reduit`
   * de la frappe, arrondi. L'arrondi n'est pas un detail — il decide quels
   * coups grignotent une garde et lesquels non, et il le decide a partir des
   * DEGATS du coup, sans table supplementaire. Un poing (3) ne passe rien du
   * tout, un pied (6) et un special (10) passent 1. C'est exactement le
   * partage qu'on veut : marteler le petit coup contre une garde ne mene
   * nulle part, mais rester derriere sa garde ne met pas non plus a l'abri de
   * ce qui frappe fort.
   *
   * `recul` et `gel` sont les parts de poussee et d'immobilisation qui
   * restent quand on a bloque. Elles ne tombent pas a zero : sans recul, un
   * combattant colle au mur derriere sa garde ne bougerait plus jamais, et
   * son adversaire pourrait frapper au meme rythme indefiniment.
   */
  var GARDE = { reduit: 0.12, recul: 0.5, gel: 0.55 };

  /*
   * ---- pourquoi le recul est LA regle anti-martelage ----
   *
   * Un coup qui touche ECARTE. C'est ce qui empeche de tenir quelqu'un sous
   * une pluie de poings sans jamais bouger : chaque poing repousse sa cible
   * de 34 unites, la portee du poing est de 130, et les corps ne se
   * rapprochent pas tout seuls. Celui qui martele doit donc AVANCER entre
   * deux coups — et avancer, c'est arriver desarme sur quelqu'un qui vient de
   * recuperer.
   *
   * Sans cela, le recul ne servirait a rien : une vitesse de 34 eteinte par
   * un frottement de 9 par seconde deplace en tout moins de quatre unites,
   * soit un vingtieme d'un corps. La table donne donc une distance, et la
   * vitesse de depart s'en deduit — l'integrale de v0.e^(-kt) vaut v0/k, donc
   * v0 = distance x frottement.
   */
  function vitesseDeRecul(distance) { return distance * PHYS.frein; }

  /* L'impact fige TOUT le monde deux ou trois trames. C'est ce qui fait la
     difference entre un coup et un contact : sans ce blanc, l'oeil ne voit
     pas ce qui vient de se passer. Il ne mange pas la pendule, parce qu'une
     manche pleine de coups ne doit pas durer plus longtemps qu'une manche
     ou personne ne touche. */
  var TEMPS = { annonce: 1.5, finManche: 2.0, impact: 0.05 };

  /* Le projectile part devant l'attaquant, pas de son nombril : sinon il
     naitrait DANS l'adversaire colle a lui, et toucherait avant d'exister. */
  var PROJ = { vitesse: 340, rayon: 22, avance: 55 };

  /* Le temps de reaction de l'ordinateur. Il ne relit le terrain qu'apres ce
     delai et garde ses touches enfoncees en attendant : c'est ce qui
     l'empeche de garder a la trame pres, donc d'etre imbattable, et ca ne
     coute pas une seule ligne de « rater expres ». */
  var IA = { reactionMin: 0.14, reactionMax: 0.26, garde: 0.72, special: 0.5, saut: 0.06 };

  // =====================================================================
  //                             OUTILLAGE
  // =====================================================================

  function borne(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /*
   * Le tirage. Il vient de la graine et de rien d'autre — pas de Math.random,
   * pas d'horloge. Deux combats de meme graine qui recoivent les memes touches
   * sont le meme combat, ce qui rend une partie rejouable, un bogue
   * reproductible et un essai fiable. mulberry32 : trente-deux bits d'etat,
   * une periode largement au-dela d'un combat, et surtout le meme resultat
   * dans tous les navigateurs parce qu'il ne passe que par des entiers.
   */
  function graineur(g) {
    var a = (g >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function entreeVide() {
    return { x: 0, bas: false, saut: false, poing: false, pied: false, garde: false };
  }

  /* La hauteur qu'occupe une cible. Elle ne se baisse qu'au sol : accroupi en
     l'air n'existe pas, et sans cette condition un saut avec `bas` enfonce
     ferait passer les coups au-dessus de la tete d'un combattant qui, a
     l'ecran, est bien droit dans les airs. */
  function hauteurDe(c) {
    return (c.y <= ARENE.sol && c._ent.bas) ? CORPS.accroupi : CORPS.haut;
  }

  /* Garder demande d'etre au sol, de ne pas etre deja en train d'encaisser et
     de ne pas etre en train de frapper. Sans la derniere condition, on
     frapperait et bloquerait en meme temps, et il n'y aurait plus aucune
     raison de ne pas attaquer sans arret. */
  function garde(c) {
    return c._ent.garde && c.y <= ARENE.sol && c._stun <= 0 && !c._atk && c.pv > 0;
  }

  /*
   * Ce qu'une garde couvre, et pourquoi ca suffit.
   *
   * Debout on protege tout le corps (150), accroupi on protege ce qui reste
   * de soi une fois baisse (90). Un coup est bloque si le HAUT de sa tranche
   * tient sous cette hauteur. Trois regles de jeu tombent de cette seule
   * comparaison, sans qu'aucune ne soit ecrite :
   *
   *   - le coup saute monte a 165 : il ne passe sous aucune des deux gardes,
   *     jamais, quelle que soit la hauteur de celui qui le lance ;
   *   - le poing monte a 120 : il est arrete debout mais passe par-dessus une
   *     garde basse, donc rester accroupi n'est pas une reponse a tout ;
   *   - le pied s'arrete a 88 et le projectile a 85 : les deux gardes les
   *     arretent.
   *
   * Il n'y a PAS de condition « faire face au coup » ici, et c'est volontaire :
   * deux corps ne se traversent jamais et un combattant libre se retourne
   * tout seul vers l'autre, donc aucun coup ne peut arriver dans le dos de
   * quelqu'un qui est en etat de garder. Une condition de plus serait une
   * condition qu'aucun essai ne pourrait faire tomber — donc une condition
   * dont personne ne saurait dire si elle marche.
   */
  function bloque(cible, hautAbsolu) {
    if (!garde(cible)) return false;
    return hautAbsolu <= (cible._ent.bas ? CORPS.accroupi : CORPS.haut);
  }

  // =====================================================================
  //                             LE COMBAT
  // =====================================================================

  /**
   * `graine` fixe tout le hasard du combat (l'ordinateur, et rien d'autre).
   * `skins` sont recopies tels quels dans l'etat : le moteur ne sait pas ce
   * qu'est un skin, c'est le dessin qui le sait.
   */
  function Combat(opts) {
    opts = opts || {};
    var skins = opts.skins || ['andy', 'pepe'];
    this._alea = graineur(opts.graine === undefined ? 1 : opts.graine);
    this._evs = [];
    this._attente = false;
    this._iaEtat = [{ reste: 0, ordre: entreeVide(), relache: false },
                    { reste: 0, ordre: entreeVide(), relache: false }];

    this.etat = {
      temps: DUREE,
      manche: 0,                   // _nouvelleManche l'amene a 1
      scores: [0, 0],
      fini: false,
      vainqueur: null,
      message: '',
      gel: 0,
      combattants: [creeCombattant(skins[0] || 'andy'), creeCombattant(skins[1] || 'pepe')],
      projectiles: [],
    };
    this._nouvelleManche();
  }

  /*
   * Les champs sans souligne sont le CONTRAT avec le dessin : il lit ceux-la
   * et pas d'autres. Ceux qui commencent par un souligne sont la mecanique
   * interne. Ils vivent sur le meme objet plutot que dans un tableau parallele
   * parce qu'un tableau parallele voudrait dire recopier x, y et pv a chaque
   * trame — donc deux verites pour une position, et un jour l'une des deux en
   * retard d'une trame.
   */
  function creeCombattant(skin) {
    return {
      skin: skin,
      x: 0, y: ARENE.sol, face: 1,
      pv: PV_MAX, pvMax: PV_MAX,
      jauge: 0,
      anim: 'idle', t: 0,
      bloque: false,
      _vx: 0, _vy: 0,
      _stun: 0,
      _atk: null,
      _ent: entreeVide(),
      _prec: entreeVide(),
      _reset: false,
    };
  }

  // ------------------------------------------------------------- entrees

  /**
   * Etat des touches du cote `i`. Ce sont des touches MAINTENUES : le moteur
   * detecte lui-meme le front montant.
   *
   * C'est le seul decoupage qui marche avec un clavier. Le dessin ne sait pas
   * ce que le moteur a deja consomme ; s'il devait envoyer des impulsions, il
   * lui faudrait retenir quelles touches il a deja annoncees, et deux
   * comptabilites du meme clavier finiraient par diverger — une touche
   * relachee pendant un gel, et le coup part deux fois ou pas du tout.
   */
  Combat.prototype.entree = function (i, o) {
    var c = this.etat.combattants[i];
    if (!c) return;
    var e = c._ent;
    o = o || {};
    e.x = o.x ? (o.x > 0 ? 1 : -1) : 0;
    e.bas = !!o.bas;
    e.saut = !!o.saut;
    e.poing = !!o.poing;
    e.pied = !!o.pied;
    e.garde = !!o.garde;
  };

  /* Recopier les touches du pas ecoule. Ca se fait AUSSI pendant un gel :
     sinon une touche tenue pendant l'annonce « ROUND 1 » compterait comme un
     appui neuf au gong, et le combat commencerait par un coup que personne
     n'a demande a cet instant. */
  Combat.prototype._souvient = function () {
    for (var i = 0; i < 2; i++) {
      var c = this.etat.combattants[i], e = c._ent, p = c._prec;
      p.x = e.x; p.bas = e.bas; p.saut = e.saut;
      p.poing = e.poing; p.pied = e.pied; p.garde = e.garde;
    }
  };

  // ------------------------------------------------------------ le pas

  /**
   * Avance la simulation de `dt` secondes et rend les evenements du pas.
   */
  Combat.prototype.pas = function (dt) {
    var evs = [];
    this._evs = evs;
    var e = this.etat, f = e.combattants, i;

    dt = borne(dt || 0, 0, DT_MAX);
    if (!dt) return evs;

    /* Rien ne bouge pendant un gel : ni les corps, ni les projectiles, ni la
       pendule, ni meme le compteur d'animation. Le dessin s'en sert pour les
       annonces et pour l'impact, et une pose qui continuerait de s'animer
       n'en serait pas une. */
    if (e.gel > 0) {
      e.gel = Math.max(0, e.gel - dt);
      if (e.gel === 0) this._reprise();
      this._souvient();
      return evs;
    }
    if (e.fini) { this._souvient(); return evs; }

    for (i = 0; i < 2; i++) this._iaEtat[i].reste -= dt;
    for (i = 0; i < 2; i++) this._agit(f[i], f[1 - i], dt);
    for (i = 0; i < 2; i++) this._deplace(f[i], dt);
    this._separe();
    for (i = 0; i < 2; i++) this._frappe(f[i], f[1 - i], dt);
    this._projectiles(dt);

    for (i = 0; i < 2; i++) {
      var c = f[i];
      if (c._stun > 0) {
        c._stun -= dt;
        if (c._stun <= 0) { c._stun = 0; c.bloque = false; }
      }
    }

    e.temps = Math.max(0, e.temps - dt);
    this._verdict();
    for (i = 0; i < 2; i++) majAnim(f[i], dt);
    this._souvient();
    return evs;
  };

  // ------------------------------------------------------- les decisions

  Combat.prototype._agit = function (c, o, dt) {
    var auSol = c.y <= ARENE.sol;
    var libre = c._stun <= 0 && !c._atk && c.pv > 0;

    /* Se retourner quand l'adversaire passe de l'autre cote. On ne se
       retourne pas au milieu d'un coup ni en encaissant : un coup qui
       changerait de sens en cours de route toucherait derriere lui. */
    if (libre && auSol) {
      if (o.x > c.x) c.face = 1;
      else if (o.x < c.x) c.face = -1;
    }

    var e = c._ent, p = c._prec;
    var frontPoing = e.poing && !p.poing;
    var frontPied = e.pied && !p.pied;
    var frontSaut = e.saut && !p.saut;

    if (libre) {
      if (frontPoing || frontPied) {
        /* Les deux poings ensemble, au sol, font le special. Il n'y a pas de
           touche « special » dans les entrees, et il ne peut pas y en avoir :
           le clavier annonce ce qui est enfonce, pas ce que le joueur voulait
           dire. C'est donc une COMBINAISON, et c'est `_lance` — le seul
           endroit qui sait ce que coute un coup — qui repond s'il part ou
           non. Quand la jauge manque, il ne part pas, et le coup simple sort
           a la place : appuyer sur deux touches ne doit jamais rendre muet. */
        if (!(auSol && e.poing && e.pied && this._lance(c, 'special'))) {
          if (!auSol) this._lance(c, 'saute');
          else this._lance(c, frontPoing ? 'poing' : 'pied');
        }
      } else if (frontSaut && auSol) {
        /* La direction est figee au decollage. Un saut qu'on pilote en l'air
           permettrait d'avancer, de reculer et de revenir sans jamais
           s'engager — le saut ne serait plus un pari. */
        c._vy = PHYS.saut;
        c._vx = e.x * PHYS.vitesse;
      }
    }

    /* La marche. Garder immobilise : c'est le prix de la garde, et la seule
       raison pour laquelle avancer reste un choix. S'accroupir immobilise
       aussi, sinon on se deplacerait en permanence sous les poings. */
    c._marche = 0;
    if (libre && auSol && !c._atk && !e.garde && !e.bas && e.x) {
      c._marche = (e.x === c.face ? PHYS.vitesse : PHYS.vitesseArr) * e.x;
    }
  };

  /**
   * Demarrer un coup. Rend faux si le coup ne peut pas sortir, pour que
   * l'appelant n'ait pas a savoir une deuxieme fois ce qu'un coup coute.
   *
   * La jauge se paie ICI et pas a l'impact : un special paye seulement quand
   * il touche serait gratuit a tenter.
   */
  Combat.prototype._lance = function (c, cle) {
    var k = COUPS[cle];
    if (k.cout) {
      if (c.jauge < k.cout) return false;
      c.jauge -= k.cout;
      this._evs.push({ type: 'special', cote: this.etat.combattants.indexOf(c) });
    }
    c._atk = { cle: cle, t: 0, fait: false };
    c._reset = true;
    return true;
  };

  // ------------------------------------------------------- les corps

  Combat.prototype._deplace = function (c, dt) {
    var auSol = c.y <= ARENE.sol;

    if (!auSol || c._vy > 0) {
      c._vy -= PHYS.gravite * dt;
      c.y += c._vy * dt;
      if (c.y <= ARENE.sol) {
        /* On repose le pied EXACTEMENT au sol. Laisser y a -1,7 parce que le
           pas de temps est tombe entre deux trames suffirait a faire vibrer
           le dessin d'un pixel a chaque atterrissage, et a rendre faux tout
           test d'altitude. */
        c.y = ARENE.sol;
        c._vy = 0;
        c._vx = 0;
        /* Un coup saute qui survit a l'atterrissage se prolongerait au sol,
           ou il serait imblocable — c'est justement ce qui le distingue. */
        if (c._atk && COUPS[c._atk.cle].haut > CORPS.haut) c._atk = null;
      }
    }

    c.x += (c._marche + c._vx) * dt;
    if (c.y <= ARENE.sol && c._vx) {
      c._vx -= c._vx * Math.min(1, PHYS.frein * dt);
      if (Math.abs(c._vx) < 1) c._vx = 0;
    }
    c.x = borne(c.x, ARENE.murG, ARENE.murD);
  };

  /*
   * Deux corps ne se traversent pas — ni au sol ni en l'air. Sauter par-dessus
   * l'adversaire demanderait une deuxieme regle (a quelle hauteur passe-t-on ?
   * que se passe-t-il si on retombe dedans ?) pour un gain de jeu nul a cette
   * echelle.
   *
   * On repousse d'abord a parts egales, puis on redonne le dernier mot aux
   * murs, puis on repousse ce qui reste sur celui qui n'est PAS contre le mur.
   * Sans ce troisieme temps, un combattant coince dans un coin se ferait
   * pousser dans le mur, et les deux dessins se chevaucheraient a l'endroit
   * exact ou l'on regarde le plus.
   */
  Combat.prototype._separe = function () {
    var f = this.etat.combattants;
    var d = f[1].x - f[0].x;
    if (Math.abs(d) >= CORPS.larg) return;
    var signe = d >= 0 ? 1 : -1;
    var manque = CORPS.larg - Math.abs(d);
    f[0].x = borne(f[0].x - signe * manque / 2, ARENE.murG, ARENE.murD);
    f[1].x = borne(f[1].x + signe * manque / 2, ARENE.murG, ARENE.murD);
    d = f[1].x - f[0].x;
    manque = CORPS.larg - Math.abs(d);
    if (manque <= 0) return;
    var contreMur = (f[0].x <= ARENE.murG || f[0].x >= ARENE.murD);
    if (contreMur) f[1].x = borne(f[1].x + signe * manque, ARENE.murG, ARENE.murD);
    else f[0].x = borne(f[0].x - signe * manque, ARENE.murG, ARENE.murD);
  };

  // ------------------------------------------------------ les attaques

  Combat.prototype._frappe = function (c, o, dt) {
    if (!c._atk) return;
    var a = c._atk, k = COUPS[a.cle];
    a.t += dt;

    var actif = a.t >= k.depart && a.t < k.depart + k.actif;
    if (actif && !a.fait) {
      if (k.portee > 0) {
        if (porte(c, o, k)) {
          /* Une seule touche par utilisation, marquee des qu'elle passe. La
             fenetre active dure plusieurs trames : sans ce drapeau, un pied
             qui reste actif 0,07 s enleverait ses degats quatre fois de
             suite, et un seul coup viderait la moitie d'une barre. */
          a.fait = true;
          this._encaisse(o, k.degats, bloque(o, c.y + k.haut), a.cle, this.etat.combattants.indexOf(c));
        }
      } else {
        a.fait = true;
        this._tire(c);
      }
    }
    if (a.t >= k.depart + k.actif + k.fin) c._atk = null;
  };

  /* La zone qui pique : devant soi, pas plus loin que la portee, et dans la
     bonne tranche de hauteur. Les trois conditions comptent — sans la
     hauteur, un pied toucherait quelqu'un au sommet de son saut. */
  function porte(att, cib, k) {
    var dx = cib.x - att.x;
    if (dx * att.face < 0) return false;
    if (Math.abs(dx) > k.portee) return false;
    var bas = att.y + k.bas, haut = att.y + k.haut;
    return bas <= cib.y + hauteurDe(cib) && haut >= cib.y;
  }

  // ---------------------------------------------------- les projectiles

  Combat.prototype._tire = function (c) {
    var k = COUPS.special;
    this.etat.projectiles.push({
      x: c.x + c.face * PROJ.avance,
      /* L'altitude du projectile est le MILIEU de la tranche du coup, et son
         epaisseur en est la moitie. Ecrire une altitude a part reviendrait a
         pouvoir descendre la tranche sans descendre le dessin. */
      y: (k.bas + k.haut) / 2,
      vx: c.face * PROJ.vitesse,
      cote: this.etat.combattants.indexOf(c),
    });
  };

  Combat.prototype._projectiles = function (dt) {
    var k = COUPS.special;
    var demi = (k.haut - k.bas) / 2;
    var liste = this.etat.projectiles;
    for (var n = liste.length - 1; n >= 0; n--) {
      var p = liste[n];
      p.x += p.vx * dt;
      /* Un projectile qui sortirait de l'arene continuerait a exister,
         invisible, et reviendrait toucher si on inversait sa vitesse un jour.
         On l'efface au mur. */
      if (p.x < ARENE.murG || p.x > ARENE.murD) { liste.splice(n, 1); continue; }

      var cib = this.etat.combattants[1 - p.cote];
      var proche = Math.abs(p.x - cib.x) <= PROJ.rayon + CORPS.larg / 2;
      var croise = p.y - demi <= cib.y + hauteurDe(cib) && p.y + demi >= cib.y;
      if (proche && croise) {
        this._encaisse(cib, k.degats, bloque(cib, p.y + demi), 'special', p.cote);
        /* Il disparait a l'impact, bloque ou non. Un projectile qui traverse
           l'adversaire retoucherait a chaque trame — c'est le meme probleme
           que la fenetre active d'un pied, et il se regle au meme endroit. */
        liste.splice(n, 1);
      }
    }
  };

  // ==================================================================
  //          L ENTONNOIR : tout ce qui fait mal passe par ici
  // ==================================================================

  /**
   * `c` encaisse `degats` bruts, `bloque` dit si la garde a tenu.
   *
   * TOUT ce qui fait mal passe par ici : le corps a corps et le projectile
   * aujourd'hui, ce qu'on ajoutera demain. Six choses arrivent a chaque coup
   * recu — les points de vie, la part que laisse passer la garde, les deux
   * jauges, le recul, le gel, l'evenement — et les ecrire a deux endroits
   * reviendrait a en oublier une des deux fois, en silence, le jour ou l'on
   * en ajoute une septieme.
   *
   * Les deux derniers arguments ne changent pas la nature de la fonction :
   * `cle` nomme le coup pour aller chercher recul, gel et jauge dans la table
   * (les recopier dans les appels reviendrait a avoir deux tables), et
   * `tireur` dit qui encaisse la jauge et de quel cote pousser. `degats`
   * reste un argument parce qu'un chiffre de degats peut venir d'ailleurs que
   * de la table un jour ; les appels, eux, ne passent jamais autre chose que
   * `COUPS[cle].degats`, jamais un nombre ecrit a la main.
   */
  Combat.prototype._encaisse = function (c, degats, bloque, cle, tireur) {
    /* On n'acheve pas un corps. Le cas se produit vraiment : dans une meme
       trame, un coup au corps a corps peut mettre a zero quelqu'un qu'un
       projectile deja en vol atteint juste apres — le verdict, lui, n'est
       rendu qu'a la fin de la trame. Sans cette ligne, le dessin recevrait
       deux touches sur un combattant deja tombe. */
    if (c.pv <= 0) return;
    var k = COUPS[cle];
    var e = this.etat;
    var i = e.combattants.indexOf(c);
    var att = e.combattants[tireur];

    var d = bloque ? Math.round(degats * GARDE.reduit) : degats;
    c.pv = Math.max(0, c.pv - d);
    c.bloque = bloque;

    /* La jauge monte des deux cotes : celui qui place le coup gagne le plein
       tarif, celui qui le prend en gagne la moitie. Une jauge qui ne
       monterait que pour l'attaquant condamnerait celui qui perd a perdre
       davantage — le super sert justement a renverser une manche. Un coup
       bloque ne rapporte que la moitie a l'attaquant : autrement, taper dans
       une garde serait une facon sure de charger. */
    att.jauge = Math.min(JAUGE_MAX, att.jauge + (bloque ? Math.round(k.super / 2) : k.super));
    c.jauge = Math.min(JAUGE_MAX, c.jauge + Math.round(k.super / 2));

    var dir = c.x >= att.x ? 1 : -1;
    c._vx = vitesseDeRecul(k.recul) * dir * (bloque ? GARDE.recul : 1);
    c._stun = bloque ? k.gel * GARDE.gel : k.gel;
    /* Se faire toucher interrompt ce qu'on faisait. Sans ca, deux coups
       partis en meme temps sortiraient tous les deux, et la vitesse de
       sortie ne servirait plus a rien. */
    c._atk = null;
    c._reset = true;

    e.gel = Math.max(e.gel, TEMPS.impact);
    this._evs.push({ type: 'touche', cible: i, degats: d, bloque: bloque, coup: cle });
  };

  // ------------------------------------------------- manches et combat

  Combat.prototype._verdict = function () {
    var e = this.etat, f = e.combattants;
    var ko = f[0].pv <= 0 || f[1].pv <= 0;
    if (ko) {
      for (var i = 0; i < 2; i++) if (f[i].pv <= 0) this._evs.push({ type: 'ko', perdant: i });
      this._finManche('K.O.');
    } else if (e.temps <= 0) {
      this._finManche('TEMPS');
    }
  };

  /*
   * Qui gagne la manche ? Celui a qui il reste le plus de points de vie. Cette
   * seule phrase couvre le K.O. (le survivant en a forcement plus), le temps
   * ecoule, et le double K.O. — qui rend l'egalite, donc personne ne marque.
   * Trois regles separees auraient fini par se contredire sur le cas ou les
   * deux barres tombent a zero dans le meme pas.
   */
  Combat.prototype._finManche = function (message) {
    var e = this.etat, f = e.combattants;
    var g = f[0].pv > f[1].pv ? 0 : (f[1].pv > f[0].pv ? 1 : null);
    if (g !== null) e.scores[g]++;
    /* Le score part en copie : un evenement est une photo de l'instant, et
       un tableau partage se serait mis a jour tout seul dans les mains de
       celui qui l'a garde. */
    this._evs.push({ type: 'manche', gagnant: g, scores: [e.scores[0], e.scores[1]] });
    e.message = message;
    e.gel = TEMPS.finManche;
    e.projectiles.length = 0;

    var assez = g !== null && e.scores[g] >= MANCHES;
    var bout = e.manche >= MANCHES_MAX;
    if (assez || bout) {
      e.fini = true;
      e.vainqueur = e.scores[0] > e.scores[1] ? 0 : (e.scores[1] > e.scores[0] ? 1 : null);
      this._evs.push({ type: 'fin', vainqueur: e.vainqueur });
    } else {
      this._attente = true;
    }
  };

  /* Ce qui arrive quand un gel s'acheve. La manche suivante ne demarre pas au
     K.O. mais a la fin de l'annonce : sinon le dessin afficherait « K.O. »
     par-dessus deux combattants deja repartis. */
  Combat.prototype._reprise = function () {
    if (this._attente) { this._attente = false; this._nouvelleManche(); return; }
    this.etat.message = this.etat.fini ? 'FIN' : '';
  };

  Combat.prototype._nouvelleManche = function () {
    var e = this.etat;
    e.manche++;
    e.temps = DUREE;
    e.projectiles.length = 0;
    for (var i = 0; i < 2; i++) {
      var c = e.combattants[i];
      /* Les points de vie repartent au plein, la JAUGE non. Une manche
         disputee doit laisser quelque chose a celui qui l'a perdue de peu,
         sinon la deuxieme manche recommence exactement comme la premiere et
         se joue de la meme facon. */
      c.pv = c.pvMax;
      c.x = CENTRE + (i === 0 ? -ECART_DEPART : ECART_DEPART);
      c.y = ARENE.sol;
      c.face = i === 0 ? 1 : -1;
      c._vx = 0; c._vy = 0; c._stun = 0; c._atk = null; c._marche = 0;
      c.bloque = false;
      c.anim = 'idle'; c.t = 0; c._reset = false;
    }
    e.message = 'ROUND ' + e.manche;
    e.gel = TEMPS.annonce;
  };

  // -------------------------------------------------------- animations

  /*
   * Le nom de l'animation est DEDUIT de l'etat, jamais pose a la main quelque
   * part dans le code. Un `c.anim = 'saut'` ecrit au moment du decollage
   * obligerait a penser a l'effacer a l'atterrissage, dans le recul, au K.O.
   * et a la fin de la manche — quatre endroits, donc un oubli.
   *
   * L'ordre des questions est l'ordre des priorites : mort, puis touche, puis
   * en train de frapper, puis en l'air, puis ce qu'on tient au clavier.
   */
  function nomAnim(c) {
    if (c.pv <= 0) return 'ko';
    if (c._stun > 0) return 'touche';
    if (c._atk) return c._atk.cle;
    if (c.y > ARENE.sol) return 'saut';
    if (c._ent.garde) return 'garde';
    if (c._ent.bas) return 'accroupi';
    if (c._ent.x) return c._ent.x === c.face ? 'marche' : 'recule';
    return 'idle';
  }

  /* `t` repart de zero a chaque changement — le dessin s'en sert pour choisir
     l'image, donc une horloge qui continuerait de courir ferait commencer un
     coup au milieu de son animation. Le drapeau `_reset` sert au cas ou le
     nom ne change PAS alors que la chose recommence : deux coups de poing
     d'affilee, ou deux touches coup sur coup. */
  function majAnim(c, dt) {
    var n = nomAnim(c);
    if (n !== c.anim || c._reset) { c.anim = n; c.t = 0; c._reset = false; }
    else c.t += dt;
  }

  // =====================================================================
  //                            L ORDINATEUR
  // =====================================================================

  /**
   * Fait jouer le cote `i` par l'ordinateur : decide, puis appelle entree().
   *
   * Le point important est qu'il ne decide PAS a chaque trame. Il relit le
   * terrain quand son delai de reaction est ecoule, et garde ses touches
   * enfoncees en attendant. C'est ce qui lui donne ses trous : il ne peut pas
   * garder un coup parti apres sa derniere decision, exactement comme un
   * humain surpris. Un ordinateur qui deciderait a chaque trame bloquerait
   * tout, pour toujours, et il n'y aurait plus de jeu.
   */
  Combat.prototype.ia = function (i) {
    var m = this._iaEtat[i];
    if (!m) return;
    if (m.reste <= 0) {
      m.ordre = this._iaDecide(i);
      m.reste = IA.reactionMin + this._alea() * (IA.reactionMax - IA.reactionMin);
      m.relache = true;
    }
    /* Une trame les boutons relaches avant chaque nouvelle decision. Le
       moteur ne voit que les fronts montants : un ordinateur qui deciderait
       « poing » deux fois de suite garderait la touche enfoncee et ne
       frapperait qu'UNE fois — il passerait la moitie du combat a appuyer sur
       une touche deja appuyee, ce qui ressemble a s'y meprendre a une
       intelligence trop lente. La direction et la garde, elles, restent :
       ce sont des etats, pas des declenchements. */
    if (m.relache) {
      m.relache = false;
      this.entree(i, { x: m.ordre.x, bas: m.ordre.bas, garde: m.ordre.garde });
      return;
    }
    this.entree(i, m.ordre);
  };

  /*
   * Chaque question a son PROPRE tirage. Un seul tirage reutilise de question
   * en question les rend dependantes : « je ne garde pas » (tirage haut)
   * entrainerait mecaniquement « je n'attaque pas non plus » (meme tirage
   * haut, meme cote de tous les seuils), et l'ordinateur se contenterait de
   * marcher dans les coups sans jamais frapper. Le defaut ne se voit pas en
   * lisant la fonction — il se voit en comptant ses decisions.
   */
  Combat.prototype._iaDecide = function (i) {
    var c = this.etat.combattants[i], o = this.etat.combattants[1 - i];
    var ordre = entreeVide();
    var d = Math.abs(o.x - c.x);
    var vers = o.x > c.x ? 1 : -1;

    /* Garder quand l'adversaire a lance quelque chose, ou qu'un projectile
       arrive. Le tirage laisse passer une fois sur quatre : une garde
       systematique serait un mur, et un mur ne se bat pas. */
    var menace = (o._atk && d <= COUPS.pied.portee + 30) || this._venant(i);
    if (menace && this._alea() < IA.garde) {
      ordre.garde = true;
      if (this._alea() < 0.35) ordre.bas = true;
      return ordre;
    }

    /* Le special part de loin : c'est un projectile, il n'a rien a gagner a
       etre lache dans le nez de quelqu'un qui peut encore frapper. */
    if (c.jauge >= COUPS.special.cout && d > COUPS.pied.portee && this._alea() < IA.special) {
      ordre.poing = true; ordre.pied = true;
      return ordre;
    }

    var r = this._alea();
    if (d <= COUPS.poing.portee) {
      if (r < 0.46) ordre.poing = true;
      else if (r < 0.86) ordre.pied = true;
      else { ordre.x = -vers; ordre.garde = this._alea() < 0.4; }
    } else if (d <= COUPS.pied.portee) {
      if (r < 0.62) ordre.pied = true;
      else if (r < 0.76) ordre.poing = true;
      else ordre.x = vers;
    } else {
      ordre.x = vers;
      if (r < IA.saut) ordre.saut = true;
    }
    return ordre;
  };

  /* Un projectile qui vient vers nous et qui n'est pas encore passe. */
  Combat.prototype._venant = function (i) {
    var c = this.etat.combattants[i], l = this.etat.projectiles;
    for (var n = 0; n < l.length; n++) {
      if (l[n].cote === i) continue;
      if ((l[n].x - c.x) * l[n].vx < 0) return true;
    }
    return false;
  };

  // =====================================================================

  var Arcade = {
    ARENE: ARENE, CORPS: CORPS, COUPS: COUPS,
    MANCHES: MANCHES, DUREE: DUREE, MANCHES_MAX: MANCHES_MAX,
    PV_MAX: PV_MAX, JAUGE_MAX: JAUGE_MAX,
    PHYS: PHYS, GARDE: GARDE, TEMPS: TEMPS, PROJ: PROJ, IA: IA,
    CENTRE: CENTRE, ECART_DEPART: ECART_DEPART,
    Combat: Combat,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Arcade;
  if (typeof window !== 'undefined') window.Arcade = Arcade;
})();
