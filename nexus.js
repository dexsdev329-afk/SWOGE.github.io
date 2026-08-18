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
      enLigne = true;
    }
    if (m.type === 'skins' && m.actif && PERSONNAGES[m.actif] && m.actif !== PERSO) {
      PERSO = m.actif;
      assureCharge(PERSO);
    }
    if (m.type === 'nexusEtat') majJoueursDistants(m.joueurs || []);
    /* Le solde suit n'importe quel message qui le porte — pas seulement
       `auth` — exactement comme `poseSolde` le fait pour le reste du site :
       un achat de skin ou de coffre depuis le tiroir, ouvert par-dessus le
       Nexus, doit mettre a jour le chiffre affiche ici sans recharger la page. */
    if (m.balance != null) majSolde(m.balance);
  }

  var soldeEl = document.getElementById('nxSolde');
  function majSolde(v) {
    var n = parseFloat(v || 0);
    if (isNaN(n) || !soldeEl) return;
    var t = n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(2);
    soldeEl.innerHTML = '<b>' + t + '</b><em>$SWOGE</em>';
    soldeEl.classList.add('on');
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
      rayon: 120, href: 'games.html?open=sh', nom: 'the shop — chests & skins' },
    { cle: 'coffre', src: 'img/nexus/tiles/obj_vault_door.webp',
      x: CENTRE.x + 620, y: CENTRE.y, larg: 260, haut: 251,
      rayon: 120, href: 'games.html?open=ap', nom: 'your vault' },
  ];
  LIEUX.forEach(function (l) { l.img = new Image(); l.img.src = l.src; l.dwell = 0; });

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
  var DISTANTS = {};                 // { addr: {x,y,rx,ry,dir,anim,skin,cadre,chrono} }
  var quiEl = document.getElementById('nxQui'), nbAffiche = -1;
  function majJoueursDistants(liste) {
    var vus = {};
    liste.forEach(function (j) {
      if (!j || !j.addr || j.addr === MON_ADRESSE) return;
      vus[j.addr] = true;
      var d = DISTANTS[j.addr];
      if (!d) d = DISTANTS[j.addr] = { x: j.x, y: j.y, rx: j.x, ry: j.y, cadre: 0, chrono: 0 };
      d.x = j.x; d.y = j.y; d.dir = j.dir; d.anim = j.anim; d.skin = j.skin;
      assureCharge(j.skin);
    });
    Object.keys(DISTANTS).forEach(function (a) { if (!vus[a]) delete DISTANTS[a]; });

    var nb = Object.keys(DISTANTS).length;
    if (nb !== nbAffiche && quiEl) {
      nbAffiche = nb;
      if (nb > 0) {
        quiEl.textContent = '👥 ' + nb + (nb > 1 ? ' players nearby' : ' player nearby');
        quiEl.classList.add('on');
      } else quiEl.classList.remove('on');
    }
  }

  // ------------------------------------------------------- les commandes

  var TOUCHES = { up: false, down: false, left: false, right: false };
  var TOUCHE_CLE = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };
  window.addEventListener('keydown', function (ev) {
    var d = TOUCHE_CLE[ev.code];
    if (d) { TOUCHES[d] = true; ev.preventDefault(); }
    if (ev.code === 'Space') lanceSaut();
  });
  window.addEventListener('keyup', function (ev) {
    var d = TOUCHE_CLE[ev.code];
    if (d) TOUCHES[d] = false;
  });

  function lanceSaut() {
    if (saut.en_cours) return;
    var c = PERSONNAGES[PERSO];
    saut.en_cours = true; saut.chrono = 0; saut.cadre = 0;
    saut.duree = c.images / FPS_ANIM;
  }

  /* Le pave tactile : mêmes drapeaux TOUCHES, poses au doigt plutot qu'au
     clavier. `pointerdown/up/cancel/leave` couvrent en un seul jeu
     d'ecouteurs la souris et le tactile — pas besoin d'en dupliquer deux. */
  (function poseLePave() {
    var pave = document.getElementById('nxPad');
    if (!pave) return;
    [].forEach.call(pave.querySelectorAll('button'), function (b) {
      var d = b.dataset.dir;
      var pose = function (ev) { TOUCHES[d] = true; b.classList.add('on'); ev.preventDefault(); };
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
    joueur.anim = saut.en_cours ? 'jump' : (bouge ? 'run' : 'idle');

    // bords du monde
    joueur.x = Math.min(Math.max(joueur.x, 40), MONDE.w - 40);
    joueur.y = Math.min(Math.max(joueur.y, 40), MONDE.h - 40);

    // la fontaine ne se traverse pas : on ressort le joueur au bord du cercle
    var f = LIEUX[0];
    var fdx = joueur.x - f.x, fdy = joueur.y - f.y;
    var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
    if (fdist < f.collision && fdist > 0.001) {
      joueur.x = f.x + (fdx / fdist) * f.collision;
      joueur.y = f.y + (fdy / fdist) * f.collision;
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
    var proche = null, plusPresDist = Infinity;
    LIEUX.forEach(function (l) {
      if (!l.rayon) return;
      var ddx = joueur.x - l.x, ddy = joueur.y - (l.y - l.haut * 0.15);
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < l.rayon) {
        l.dwell += dt;
        if (l.dwell > 0.45) { location.href = l.href; }
      } else l.dwell = 0;
      if (dist < l.rayon * 1.8 && dist < plusPresDist) { plusPresDist = dist; proche = l; }
    });
    if (proche !== indiceActuel) {
      indiceActuel = proche;
      if (indiceEl) {
        if (proche) { indiceEl.innerHTML = 'Walk in to open <b>' + proche.nom + '</b>'; indiceEl.classList.add('on'); }
        else indiceEl.classList.remove('on');
      }
    }
  }

  function camAxe(pos, vue, monde) {
    if (monde <= vue) return (monde - vue) / 2;
    return Math.min(Math.max(pos - vue / 2, 0), monde - vue);
  }

  function dessine() {
    var vueW = canvas.width / DPR, vueH = canvas.height / DPR;
    var camX = camAxe(joueur.x, vueW, MONDE.w);
    var camY = camAxe(joueur.y, vueH, MONDE.h);

    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.fillStyle = '#0A1128';
    ctx.fillRect(0, 0, vueW, vueH);
    ctx.translate(-camX, -camY);

    // le sol : seulement les tuiles qui touchent l'ecran
    var c0 = Math.max(0, Math.floor(camX / TUILE));
    var c1 = Math.min(CARTE.cols - 1, Math.ceil((camX + vueW) / TUILE));
    var r0 = Math.max(0, Math.floor(camY / TUILE));
    var r1 = Math.min(CARTE.rows - 1, Math.ceil((camY + vueH) / TUILE));
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
    dessine();
    requestAnimationFrame(boucle);
  }
  requestAnimationFrame(boucle);
})();
